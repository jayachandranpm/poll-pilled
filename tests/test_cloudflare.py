import io
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from contextlib import closing
from app import create_app
from cloudflare_store import read_settings

class CloudflareTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.path=Path(self.tmp.name)
        self.app=create_app({'TESTING':True,'SECRET_KEY':'test-cf','DATABASE':str(self.path/'test.db'),'UPLOAD_FOLDER':str(self.path/'uploads')})
        self.c=self.app.test_client();self.csrf=self.c.get('/api/ai/session').json['csrf']
    def tearDown(self):self.tmp.cleanup()
    def post(self,path,data,token=None):
        headers={'X-CSRF-Token':self.csrf}
        if token:headers['X-Turnstile-Token']=token
        return self.c.post('/api/cloudflare/'+path,json=data,headers=headers)
    def test_voice_credentials_encrypted_never_returned_or_cross_session(self):
        token='test-workers-token-1234567890'
        self.assertEqual(self.post('voice',{'account_id':'a'*32,'token':token}).status_code,200)
        r=self.c.get('/api/cloudflare/settings');self.assertNotIn(token,r.text);self.assertTrue(r.json['voice']['configured'])
        with closing(sqlite3.connect(self.path/'test.db')) as db: encrypted=db.execute('SELECT data FROM cf_voice_connections').fetchone()[0]
        self.assertNotIn(token.encode(),encrypted)
        other=self.app.test_client();self.assertFalse(other.get('/api/cloudflare/settings').json['voice']['configured'])
        self.assertEqual(self.c.post('/api/cloudflare/voice',json={}).status_code,403)
    def test_turnstile_staged_then_verified_and_enforced_on_every_write(self):
        secret='test-secret-key-' + '0' * 10
        r=self.post('turnstile',{'site_key':'test-site-key-123456','secret_key':secret,'hostname':'localhost'})
        self.assertEqual(r.status_code,200);self.assertFalse(r.json['security']['turnstile_enabled']);self.assertNotIn(secret,r.text)
        self.assertNotIn(secret.encode(),(self.path/'.cloudflare-settings.enc').read_bytes())
        bad={'success':True,'hostname':'wrong.example','action':'poll_setup'}
        with patch('urllib.request.urlopen',return_value=io.BytesIO(json.dumps(bad).encode())):
            self.assertEqual(self.post('turnstile/activate',{},'token-1').status_code,403)
        valid={'success':True,'hostname':'localhost','action':'poll_setup'}
        with patch('urllib.request.urlopen',return_value=io.BytesIO(json.dumps(valid).encode())):
            self.assertEqual(self.post('turnstile/activate',{},'token-2').status_code,200)
        self.assertTrue(self.c.get('/api/ai/session').json['security']['turnstile_enabled'])
        self.assertEqual(self.post('verify',{}).status_code,403)
        with patch('urllib.request.urlopen',return_value=io.BytesIO(json.dumps({**valid,'action':'poll_write'}).encode())):
            self.assertEqual(self.post('verify',{},'token-3').status_code,200)
    def test_speech_cache_budget_provenance_and_errors(self):
        self.assertEqual(self.post('speech',{'text':'Hello there','speaker':'luna'}).status_code,503)
        self.post('voice',{'account_id':'a'*32,'token':'test-workers-token-1234567890'})
        with patch('cloudflare_integration.transport',return_value=io.BytesIO(b'ID3'+b'\0'*100)) as provider:
            one=self.post('speech',{'text':'This is my answer.','speaker':'luna'});self.assertEqual(one.status_code,200,one.json)
            two=self.post('speech',{'text':'This is my answer.','speaker':'luna'});self.assertEqual(two.status_code,200);self.assertEqual(provider.call_count,1)
        self.assertEqual(one.json['url'],two.json['url']);self.assertTrue(two.json['ai_usage']['cached']);self.assertEqual(one.json['audio_origin'],'generated')
        with closing(sqlite3.connect(self.path/'test.db')) as db:self.assertEqual(db.execute('SELECT kind FROM ai_assets').fetchone()[0],'audio')
        self.assertEqual(self.post('speech',{'text':'x'*601,'speaker':'luna'}).status_code,400)
        self.assertEqual(self.post('speech',{'text':'Valid words','speaker':[]}).status_code,400)
        self.assertEqual(self.post('speech',[]).status_code,400)
        with patch('cloudflare_integration.transport',return_value=io.BytesIO(b'{"error":"invalid audio"}')):
            self.assertEqual(self.post('speech',{'text':'Different answer.','speaker':'luna'}).status_code,502)
    def test_credential_routes_reject_remote_unverified_users(self):
        self.app.testing=False
        r=self.c.get('/api/cloudflare/settings',base_url='https://evil.example',environ_overrides={'REMOTE_ADDR':'198.51.100.1'})
        self.assertEqual(r.status_code,403)
    def test_ip_limit_survives_new_sessions_and_spoofed_forwarding(self):
        import time,hmac,hashlib
        subject=hmac.new(b'test-cf',b'127.0.0.1',hashlib.sha256).hexdigest()
        with closing(sqlite3.connect(self.path/'test.db')) as db:
            db.executemany('INSERT INTO security_limits VALUES (?,?)',[(subject,time.time())]*120);db.commit()
        r=self.c.post('/api/cloudflare/verify',json={},headers={'X-CSRF-Token':self.csrf,'X-Forwarded-For':'8.8.8.8'})
        self.assertEqual(r.status_code,429);self.assertEqual(r.headers['Retry-After'],'60')
