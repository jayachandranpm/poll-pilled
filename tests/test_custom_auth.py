import hashlib
import hmac
import io
import json
import secrets
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from cryptography.fernet import Fernet
from app import create_app

class CustomAuthenticationTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();base=Path(self.tmp.name)
        self.app=create_app(dict(TESTING=True,PLATFORM_MODE=True,SECRET_KEY='test-auth',AI_VAULT_KEY=Fernet.generate_key().decode(),DATABASE=str(base/'test.db'),UPLOAD_FOLDER=str(base/'uploads'),TEST_PLATFORM_USER={'user_id':'existing-user','email_id':'jayachandranpm2001@gmail.com','is_confirmed':True}))
        self.client=self.app.test_client();self.sent=[]
        self.app.extensions['auth_send']=lambda email,code:self.sent.append((email,code))
        with self.app.app_context():
            self.app.extensions['platform_write']('auth_config',{'sender':'signin@example.com','enabled':True})
            self.app.extensions['platform_write']('cloudflare',{'active':{'site_key':'test-site-key','secret_key':'test-secret-key','hostname':'localhost'}})
        self.csrf=self.client.get('/api/auth/session').json['csrf']
    def tearDown(self):self.tmp.cleanup()
    def post(self,path,data,client=None,csrf=None,valid=True):
        result={'success':valid,'hostname':'localhost','action':'poll_login'}
        with patch('urllib.request.urlopen',return_value=io.BytesIO(json.dumps(result).encode())):
            return (client or self.client).post('/api/auth/'+path,json=data,headers={'X-CSRF-Token':csrf or self.csrf,'X-Turnstile-Token':'test-token'})
    def request(self,email='person@example.com'):
        with self.app.app_context():
            key='auth_account:'+hmac.new(b'test-auth',email.encode(),hashlib.sha256).hexdigest()
            exists=bool(self.app.extensions['platform_read'](key))
        result=self.post('request-code' if exists else 'register',{'email':email,'password':'correct horse violet balcony'});self.assertEqual(result.status_code,200,result.json)
        return result.json['challenge_id'],self.sent[-1][1]
    def test_session_listing_does_not_expose_email_or_token_and_delete_revokes(self):
        cid,code=self.request();self.post('verify-code',{'challenge_id':cid,'code':code})
        state=self.client.get('/api/community/state').json
        listing=self.client.get('/api/community/sessions')
        self.assertEqual(listing.status_code,200);self.assertEqual(len(listing.json['sessions']),1)
        self.assertTrue(listing.json['sessions'][0]['current']);self.assertNotIn('person@example.com',listing.get_data(as_text=True))
        # Stub the bot verifier for this unit-level privacy mutation only.
        with patch('cloudflare_integration.check_token'):
            with self.client.session_transaction() as sess: sess['cloudflare_verified_at']=9999999999
            headers={'X-CSRF-Token':state['csrf'],'X-Turnstile-Token':'test-token'}
            with patch('urllib.request.urlopen',return_value=io.BytesIO(json.dumps({'success':True,'hostname':'localhost','action':'poll_write'}).encode())):
                result=self.client.post('/api/community/account/delete',json={'confirmation':'DELETE'},headers=headers)
        self.assertEqual(result.status_code,200,result.json)
        self.assertEqual(self.client.get('/api/community/state').status_code,401)

    def test_hosted_identity_cannot_bypass_custom_login(self):
        self.assertEqual(self.client.get('/api/community/state').status_code,401)
        self.assertEqual(self.client.get('/api/admin/settings').status_code,401)
        self.assertEqual(self.client.get('/').headers['Location'],'/sign-in')

    def test_standalone_diagnostic_is_read_only_and_cannot_grant_account_access(self):
        page=self.client.get('/security-check')
        self.assertEqual(page.status_code,200)
        self.assertEqual(page.headers['Cache-Control'],'no-store')
        self.assertIn(b'Share this result',page.data)
        self.assertEqual(self.client.post('/security-check',json={'token':'anything'}).status_code,405)
        self.assertEqual(self.client.get('/api/community/state').status_code,401)
        self.assertEqual(self.client.get('/api/admin/settings').status_code,401)
        self.assertEqual(self.sent,[])
    def test_bot_check_precedes_email_and_cannot_be_skipped(self):
        self.assertEqual(self.post('request-code',{'email':'person@example.com'},valid=False).status_code,403)
        self.assertEqual(self.sent,[])
        self.assertEqual(self.client.post('/api/auth/request-code',json={'email':'person@example.com'},headers={'X-CSRF-Token':self.csrf}).status_code,403)
        with self.app.app_context():
            self.assertIsNone(self.app.extensions['platform_read']('auth_rate:global'))
    def test_code_is_single_use_and_creates_revocable_session(self):
        cid,code=self.request()
        self.assertEqual(self.post('verify-code',{'challenge_id':cid,'code':code}).status_code,200)
        state=self.client.get('/api/community/state');self.assertEqual(state.status_code,200,state.json)
        self.assertFalse(state.json['admin']);self.assertEqual(self.client.get('/api/admin/settings').status_code,403)
        self.csrf=state.json['csrf']
        self.assertEqual(self.post('verify-code',{'challenge_id':cid,'code':code}).status_code,403)
        self.assertEqual(self.post('logout',{}).status_code,200)
        self.assertEqual(self.client.get('/api/community/state').status_code,401)
    def test_code_cannot_be_used_in_another_browser(self):
        cid,code=self.request();other=self.app.test_client();csrf=other.get('/api/auth/session').json['csrf']
        self.assertEqual(self.post('verify-code',{'challenge_id':cid,'code':code},other,csrf).status_code,403)
        self.assertEqual(self.post('verify-code',{'challenge_id':cid,'code':code}).status_code,200)
    def test_lockout_after_five_wrong_codes(self):
        cid,code=self.request();wrong='111111' if code!='111111' else '222222'
        for _ in range(5): self.assertEqual(self.post('verify-code',{'challenge_id':cid,'code':wrong}).status_code,403)
        self.assertEqual(self.post('verify-code',{'challenge_id':cid,'code':code}).status_code,403)
    def test_expired_code_and_cross_origin_are_rejected(self):
        cid,code=self.request()
        with patch('custom_auth.time.time',return_value=9999999999):
            self.assertEqual(self.post('verify-code',{'challenge_id':cid,'code':code}).status_code,403)
        self.assertEqual(self.client.post('/api/auth/request-code',json={'email':'person@example.com'},headers={'X-CSRF-Token':self.csrf,'Origin':'https://another.example'}).status_code,403)
    def test_delivery_failure_never_grants_a_session(self):
        def fail(*args):raise RuntimeError('SMTP failure')
        self.app.extensions['auth_send']=fail
        self.assertEqual(self.post('register',{'email':'person@example.com','password':'correct horse violet balcony'}).status_code,503)
        self.assertEqual(self.client.get('/api/community/state').status_code,401)
    def test_resend_is_limited_and_otp_is_not_plaintext(self):
        cid,code=self.request();self.assertEqual(self.post('request-code',{'email':'person@example.com'}).status_code,429)
        with self.app.app_context():
            record=self.app.extensions['platform_read']('auth_code:'+cid)
            self.assertNotEqual(record['code'],code)
        self.assertNotIn(b'person@example.com',Path(self.app.config['DATABASE']).read_bytes())
    def test_admin_email_requires_valid_code_not_submitted_role(self):
        cid,code=self.request('jayachandranpm2001@gmail.com')
        self.assertEqual(self.post('verify-code',{'challenge_id':cid,'code':code,'role':'admin'}).status_code,200)
        self.assertTrue(self.client.get('/api/community/state').json['admin'])
    def test_activation_requires_admin_code_and_preserves_existing_identity(self):
        with self.app.app_context():
            self.app.extensions['platform_write']('auth_config',{'sender':'signin@example.com','enabled':False})
        previous=self.client.get('/api/community/state').json
        def configure(payload):
            csrf=self.client.get('/api/community/state').json['csrf']
            with patch('urllib.request.urlopen',return_value=io.BytesIO(json.dumps({'success':True,'hostname':'localhost','action':'poll_write'}).encode())):
                return self.client.post('/api/admin/auth',json=payload,headers={'X-CSRF-Token':csrf,'X-Turnstile-Token':'test-token'})
        self.assertEqual(configure({'enabled':True}).status_code,409)
        self.assertEqual(configure({'sender':'signin@example.com'}).status_code,200)
        self.csrf=self.client.get('/api/auth/session').json['csrf']
        cid,code=self.request('jayachandranpm2001@gmail.com')
        self.assertEqual(self.post('verify-code',{'challenge_id':cid,'code':code}).status_code,200)
        self.assertEqual(configure({'enabled':True}).status_code,200)
        current=self.client.get('/api/community/state').json
        self.assertTrue(current['admin'])
        self.assertEqual(current['identity'],previous['identity'])
        self.assertEqual(self.app.test_client().get('/api/community/state').status_code,401)

if __name__=='__main__':unittest.main()
