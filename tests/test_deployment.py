import tempfile
import unittest
from pathlib import Path
from cryptography.fernet import Fernet
from app import create_app
from catalyst_storage import SnapshotConnection, StorageConflict
import sqlite3
import gzip
import io
import json
from unittest.mock import patch

class MemoryStore:
    def __init__(self, template): self.revision=0;self.data=template
    def load(self,template): return self.revision,self.data
    def commit(self,revision,data):
        if revision!=self.revision: raise StorageConflict('conflict')
        self.revision+=1;self.data=data;return self.revision

class TransactionTests(unittest.TestCase):
    def test_concurrent_credit_spend_cannot_overwrite(self):
        conn=sqlite3.connect(':memory:');conn.execute('CREATE TABLE balance(value INTEGER)');conn.execute('INSERT INTO balance VALUES (100)');conn.commit()
        template=conn.serialize();conn.close();store=MemoryStore(template)
        a=SnapshotConnection(store,template);b=SnapshotConnection(store,template)
        with a: a.execute('UPDATE balance SET value=value-80')
        with self.assertRaises(StorageConflict):
            with b: b.execute('UPDATE balance SET value=value-70')
        fresh=SnapshotConnection(store,template)
        self.assertEqual(fresh.execute('SELECT value FROM balance').fetchone()[0],20)
        a.close();b.close();fresh.close()
    def test_additive_feature_migration_preserves_existing_snapshot(self):
        conn=sqlite3.connect(':memory:')
        conn.execute('CREATE TABLE pp_accounts(viewer TEXT,preferences TEXT,draft TEXT,referral_code TEXT)')
        conn.execute("INSERT INTO pp_accounts VALUES ('existing','{}','{\"keep\":true}','code')")
        conn.execute('CREATE TABLE pp_invites(followup_id TEXT,viewer TEXT,text TEXT,audio TEXT,answered_at TEXT)')
        conn.commit();template=conn.serialize();conn.close();store=MemoryStore(template)
        upgraded=SnapshotConnection(store,template)
        self.assertEqual(upgraded.execute('SELECT draft FROM pp_accounts').fetchone()[0],'{"keep":true}')
        self.assertIn('audio_origin',{r[1] for r in upgraded.execute('PRAGMA table_info(pp_invites)')})
        self.assertEqual(store.revision,1)
        reopened=SnapshotConnection(store,template);self.assertEqual(store.revision,1)
        upgraded.close();reopened.close()

    def test_rollback_never_publishes_revision(self):
        conn=sqlite3.connect(':memory:');conn.execute('CREATE TABLE entries(value INTEGER)');conn.commit()
        template=conn.serialize();conn.close();store=MemoryStore(template);db=SnapshotConnection(store,template)
        with self.assertRaises(ValueError):
            with db:
                db.execute('INSERT INTO entries VALUES (1)');raise ValueError()
        self.assertEqual(store.revision,0)
        with db: db.execute('INSERT INTO entries VALUES (2)')
        fresh=SnapshotConnection(store,template)
        self.assertEqual(fresh.execute('SELECT value FROM entries').fetchone()[0],2)
        db.close();fresh.close()

    def test_ai_result_survives_concurrent_writes_without_repeating_provider(self):
        from flask import Flask, session
        from ai_runtime import AIRuntime
        from meta_ai import AIError
        app=Flask(__name__);app.secret_key='qa';cipher=Fernet(Fernet.generate_key())
        seed=sqlite3.connect(':memory:');seed.row_factory=sqlite3.Row
        runtime=AIRuntime(app,lambda:seed,cipher,AIError);runtime.initialize()
        seed.execute('CREATE TABLE edits(value TEXT)');seed.commit()
        template=seed.serialize();seed.close();store=MemoryStore(template)
        connection=SnapshotConnection(store,template);runtime.db=lambda:connection
        calls=[]
        def provider():
            concurrent=SnapshotConnection(store,template)
            with concurrent: concurrent.execute("INSERT INTO edits VALUES ('autosave')")
            concurrent.close()
            calls.append('one paid call')
            return {'boxes':[{'x':.1}]},{'cost':.0025}
        # Force another conflicting transaction between result reload and CAS.
        original_commit=store.commit;collision=[False]
        def collide(revision,data):
            if calls and not collision[0]:
                collision[0]=True
                peer=SnapshotConnection(store,template)
                with peer: peer.execute("INSERT INTO edits VALUES ('another user')")
                peer.close()
            return original_commit(revision,data)
        store.commit=collide
        with app.test_request_context('/'):
            session['viewer']='qa'
            result=runtime.run('segmentation',{'prompt':'notebook'},'qa-key',.0025,provider)
            self.assertEqual(result['boxes'][0]['x'],.1)
            cached=runtime.run('segmentation',{'prompt':'notebook'},'qa-key',.0025,provider)
            self.assertEqual(cached,result)
        self.assertEqual(len(calls),1)
        fresh=SnapshotConnection(store,template)
        self.assertEqual(fresh.execute('SELECT COUNT(*) FROM edits').fetchone()[0],2)
        self.assertEqual([r[0] for r in fresh.execute('SELECT state FROM ai_calls ORDER BY started')],['complete','cache'])
        connection.close();fresh.close()

class AdminTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();base=Path(self.tmp.name)
        self.app=create_app(dict(TESTING=True,SECRET_KEY='test-only',AI_VAULT_KEY=Fernet.generate_key().decode(),DATABASE=str(base/'test.db'),UPLOAD_FOLDER=str(base/'uploads'),PLATFORM_MODE=True,TEST_PLATFORM_USER={'user_id':'one','email_id':'person@example.com','is_confirmed':True}))
        self.client=self.app.test_client()
    def tearDown(self): self.tmp.cleanup()
    def test_regular_user_cannot_read_or_change_provider_settings(self):
        state=self.client.get('/api/community/state').json
        self.assertFalse(state['admin'])
        for path in ['/api/admin/settings','/api/ai/connections','/api/cloudflare/settings']:
            self.assertEqual(self.client.get(path).status_code,403,path)
        self.assertEqual(self.client.post('/api/admin/settings',json={'meta_key':'test-key'},headers={'X-CSRF-Token':state['csrf']}).status_code,403)
    def test_admin_key_is_encrypted_and_never_returned(self):
        self.app.config['TEST_PLATFORM_USER']['email_id']='jayachandranpm2001@gmail.com'
        state=self.client.get('/api/community/state').json
        value='example-test-secret-1234'
        response=self.client.post('/api/admin/settings',json={'meta_key':value},headers={'X-CSRF-Token':state['csrf']})
        self.assertEqual(response.status_code,200)
        self.assertTrue(response.json['meta_configured']);self.assertNotIn(value,response.get_data(as_text=True))
        self.assertNotIn(value.encode(),Path(self.app.config['DATABASE']).read_bytes())
    def test_malformed_admin_forms_fail_without_changing_saved_settings(self):
        self.app.config['TEST_PLATFORM_USER']['email_id']='jayachandranpm2001@gmail.com'
        csrf=self.client.get('/api/community/state').json['csrf']
        headers={'X-CSRF-Token':csrf}
        before=self.client.get('/api/admin/settings').json
        for data in [None, [], ['meta_key'], 'meta_key', 42, {}, {'unknown':True}]:
            response=self.client.post('/api/admin/settings',data=json.dumps(data),content_type='application/json',headers=headers)
            self.assertEqual(response.status_code,400,(data,response.json))
        self.assertEqual(self.client.get('/api/admin/settings').json,before)

    def test_unconfirmed_admin_is_rejected(self):
        self.app.config['TEST_PLATFORM_USER'].update(email_id='jayachandranpm2001@gmail.com',is_confirmed=False)
        self.assertEqual(self.client.get('/api/admin/settings').status_code,403)

    def test_encrypted_voice_deployment_config_stays_private_and_usable(self):
        token='deployment-test-voice-token-1234567890'
        config={'account_id':'a'*32,'token':token}
        cipher=Fernet(self.app.config['AI_VAULT_KEY'].encode())
        self.app.config['VOICE_CONFIG_ENCRYPTED']=cipher.encrypt(json.dumps(config).encode()).decode()
        catalog=self.client.get('/api/cloudflare/voices')
        self.assertTrue(catalog.json['configured'])
        self.assertNotIn(token,catalog.text)
        self.assertNotIn(config['account_id'],catalog.text)
        self.assertEqual(self.client.get('/api/cloudflare/settings').status_code,403)
        csrf=self.client.get('/api/community/state').json['csrf']
        with patch('cloudflare_integration.transport',return_value=io.BytesIO(b'ID3'+b'\0'*100)) as provider:
            result=self.client.post('/api/cloudflare/speech',json={'text':'My poll answer.','speaker':'luna'},headers={'X-CSRF-Token':csrf})
        self.assertEqual(result.status_code,200,result.json)
        self.assertEqual(result.json['audio_origin'],'generated')
        self.assertEqual(provider.call_args.args[0].get_header('Authorization'),'Bearer '+token)
        self.assertNotIn(token,result.text)

    def test_admin_voice_rotation_and_removal_override_deployment_default(self):
        cipher=Fernet(self.app.config['AI_VAULT_KEY'].encode())
        original={'account_id':'a'*32,'token':'deployment-test-voice-token-original'}
        self.app.config['VOICE_CONFIG_ENCRYPTED']=cipher.encrypt(json.dumps(original).encode()).decode()
        self.app.config['TEST_PLATFORM_USER']['email_id']='jayachandranpm2001@gmail.com'
        csrf=self.client.get('/api/community/state').json['csrf']
        headers={'X-CSRF-Token':csrf}
        replacement={'account_id':'b'*32,'token':'deployment-test-voice-token-replaced'}
        saved=self.client.post('/api/cloudflare/voice',json=replacement,headers=headers)
        self.assertEqual(saved.status_code,200,saved.json)
        self.assertEqual(saved.json['voice']['account_id'],replacement['account_id'])
        self.assertNotIn(replacement['token'],saved.text)
        removed=self.client.post('/api/cloudflare/voice',json={'remove':True},headers=headers)
        self.assertEqual(removed.status_code,200,removed.json)
        self.assertFalse(self.client.get('/api/cloudflare/voices').json['configured'])
        # Neither a new request nor the still-present deployment config restores it.
        self.assertFalse(self.client.get('/api/cloudflare/settings').json['voice']['configured'])
        self.assertNotIn(replacement['token'].encode(),Path(self.app.config['DATABASE']).read_bytes())

    def test_invalid_encrypted_voice_deployment_config_fails_closed(self):
        for value in ['not-encrypted',Fernet(Fernet.generate_key()).encrypt(b'{}').decode(),Fernet(self.app.config['AI_VAULT_KEY'].encode()).encrypt(b'{"account_id":"bad"}').decode()]:
            self.app.config['VOICE_CONFIG_ENCRYPTED']=value
            response=self.client.get('/api/cloudflare/voices')
            self.assertEqual(response.status_code,503)
            self.assertNotIn(value,response.text)
        self.app.config['TEST_PLATFORM_USER']['email_id']='jayachandranpm2001@gmail.com'
        csrf=self.client.get('/api/community/state').json['csrf']
        repaired=self.client.post('/api/cloudflare/voice',json={'account_id':'a'*32,'token':'replacement-test-voice-token-12345'},headers={'X-CSRF-Token':csrf})
        self.assertEqual(repaired.status_code,200,repaired.json)
        self.assertTrue(self.client.get('/api/cloudflare/voices').json['configured'])
    def test_legacy_money_and_speech_routes_are_closed(self):
        for path in ['/api/community/redeem','/api/ai/speech']:
            self.assertEqual(self.client.post(path,json={}).status_code,410,path)

    def test_simulated_credits_are_explicit_and_forbidden_in_live_mode(self):
        token=self.client.get('/api/community/state').json['csrf']
        result=self.client.post('/api/community/credits',json={'amount':250,'idempotency_key':'simulation-check-123'},headers={'X-CSRF-Token':token})
        self.assertEqual(result.status_code,200,result.json)
        self.assertTrue(result.json['simulated'])
        self.app.config['PAYMENTS_MODE']='live'
        self.assertEqual(self.client.post('/api/community/credits',json={}).status_code,410)

    def test_public_bundles_are_cached_and_compressed_without_session_cookies(self):
        build=Path(self.app.root_path)/'prototype'/'dist'/'client'/'assets'
        bundle=next(build.glob('deck-*.js')).name
        url='/assets/'+bundle
        response=self.client.get(url,headers={'Accept-Encoding':'gzip'})
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.headers['Cache-Control'],'public, max-age=31536000, immutable')
        self.assertEqual(response.headers['Content-Encoding'],'gzip')
        self.assertEqual(gzip.decompress(response.data),(build/bundle).read_bytes())
        self.assertNotIn('Set-Cookie',response.headers)
        plain=self.client.get(url,headers={'Accept-Encoding':'gzip;q=0'})
        self.assertNotIn('Content-Encoding',plain.headers)
        self.assertEqual(plain.data,(build/bundle).read_bytes());plain.close()
        cached=self.client.get(url,headers={'If-None-Match':response.headers['ETag']})
        self.assertEqual(cached.status_code,304)
        response.close();cached.close()
        self.assertIn('no-store',self.client.get('/api/community/state').headers['Cache-Control'])

    def test_platform_turnstile_is_encrypted_activated_and_required(self):
        self.app.config['TEST_PLATFORM_USER']['email_id']='jayachandranpm2001@gmail.com'
        csrf=self.client.get('/api/community/state').json['csrf']
        headers={'X-CSRF-Token':csrf}
        secret='unit-test-secret-not-a-real-credential'
        saved=self.client.post('/api/cloudflare/turnstile',headers=headers,json={'site_key':'test-site-key-123456','secret_key':secret,'hostname':'app.example.com'})
        self.assertEqual(saved.status_code,200)
        self.assertNotIn(secret,saved.text)
        self.assertNotIn(secret.encode(),Path(self.app.config['DATABASE']).read_bytes())
        valid={'success':True,'hostname':'app.example.com','action':'poll_setup'}
        with patch('urllib.request.urlopen',return_value=io.BytesIO(json.dumps(valid).encode())):
            activated=self.client.post('/api/cloudflare/turnstile/activate',json={},headers={**headers,'X-Turnstile-Token':'setup-token'})
        self.assertTrue(activated.json['security']['turnstile_enabled'])
        self.assertEqual(self.client.post('/api/community/preferences',json={'tagline':'A thoughtful perspective.'},headers=headers).status_code,200)
        payload={}
        self.assertEqual(self.client.post('/api/cloudflare/verify',json=payload,headers=headers).status_code,403)
        for invalid in [dict(valid,action='poll_setup'),dict(valid,action='poll_write',hostname='other.example'),{'success':False,'error-codes':['timeout-or-duplicate']}]:
            with patch('urllib.request.urlopen',return_value=io.BytesIO(json.dumps(invalid).encode())):
                self.assertEqual(self.client.post('/api/cloudflare/verify',json=payload,headers={**headers,'X-Turnstile-Token':'invalid-token'}).status_code,403)
        with patch('urllib.request.urlopen',return_value=io.BytesIO(json.dumps(dict(valid,action='poll_write')).encode())):
            self.assertEqual(self.client.post('/api/cloudflare/verify',json=payload,headers={**headers,'X-Turnstile-Token':'valid-token'}).status_code,200)

if __name__=='__main__': unittest.main()
