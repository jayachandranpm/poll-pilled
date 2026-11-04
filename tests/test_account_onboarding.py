import hashlib
import hmac
import io
import json
import time
import unittest
from pathlib import Path
from unittest.mock import patch
from werkzeug.security import check_password_hash
from tests import test_custom_auth as auth_fixture

PASSWORD='silent mangoes orbit violet planets'
class AccountOnboardingTests(unittest.TestCase):
    setUp=auth_fixture.CustomAuthenticationTests.setUp
    tearDown=auth_fixture.CustomAuthenticationTests.tearDown
    post=auth_fixture.CustomAuthenticationTests.post
    def key(self,email):
        return 'auth_account:'+hmac.new(b'test-auth',email.encode(),hashlib.sha256).hexdigest()
    def signup(self,email='person@example.com'):
        r=self.post('register',{'email':email,'password':PASSWORD,'role':'admin'})
        self.assertEqual(r.status_code,200,r.json)
        r=self.post('verify-code',{'challenge_id':r.json['challenge_id'],'code':self.sent[-1][1],'role':'admin'})
        self.assertEqual(r.status_code,200,r.json)
        self.assertEqual(r.json['redirect'],'/welcome')
        state=self.client.get('/api/community/state').json;self.csrf=state['csrf'];return state
    def auth_boot(self,client=None):
        r=(client or self.client).get('/api/auth/session');return r.json['csrf']
    def community(self,data,path='/api/community/onboarding'):
        with patch('urllib.request.urlopen',return_value=io.BytesIO(json.dumps({'success':True,'hostname':'localhost','action':'poll_write'}).encode())):
            return self.client.post(path,json=data,headers={'X-CSRF-Token':self.csrf,'X-Turnstile-Token':'test-token'})
    def expire_cooldown(self):
        with self.app.app_context():
            db=self.app.extensions['platform_db']()
            with db:db.execute("DELETE FROM platform_settings WHERE name LIKE 'auth_rate:%'")
    def test_signup_requires_verification_and_hashes_password_without_privilege(self):
        r=self.post('register',{'email':' Person@Example.com ','password':PASSWORD,'role':'admin'})
        with self.app.app_context():
            self.assertIsNone(self.app.extensions['platform_read'](self.key('person@example.com')))
            pending=self.app.extensions['platform_read']('auth_code:'+r.json['challenge_id'])
            self.assertTrue(pending['password_hash'].startswith('scrypt:32768:8:3$'))
            self.assertTrue(check_password_hash(pending['password_hash'],PASSWORD))
        self.assertEqual(self.client.get('/api/community/state').status_code,401)
        r=self.post('verify-code',{'challenge_id':r.json['challenge_id'],'code':self.sent[-1][1]})
        self.assertTrue(r.json['created']);state=self.client.get('/api/community/state').json
        self.assertFalse(state['admin']);self.assertTrue(state['onboarding']['required'])
        self.assertEqual(self.client.get('/api/admin/settings').status_code,403)
        self.assertNotIn('person@example.com',json.dumps(state));self.assertNotIn('password_hash',json.dumps(state))
        raw=Path(self.app.config['DATABASE']).read_bytes();self.assertNotIn(PASSWORD.encode(),raw);self.assertNotIn(b'person@example.com',raw)
    def test_password_login_preserves_identity_and_logout_revokes(self):
        before=self.signup();self.post('logout',{});self.csrf=self.auth_boot()
        r=self.post('login',{'email':'PERSON@example.com','password':PASSWORD,'role':'admin'});self.assertEqual(r.status_code,200,r.json)
        after=self.client.get('/api/community/state').json;self.csrf=after['csrf']
        self.assertEqual(before['identity'],after['identity']);self.assertFalse(after['admin'])
        self.post('logout',{});self.assertEqual(self.client.get('/api/community/state').status_code,401)
    def test_duplicate_signup_does_not_replace_password_or_send_code(self):
        before=self.signup();self.post('logout',{});self.csrf=self.auth_boot();self.expire_cooldown();sent=len(self.sent)
        r=self.post('register',{'email':'person@example.com','password':'an attacker supplied different passphrase'})
        self.assertEqual(r.status_code,200);self.assertEqual(len(self.sent),sent)
        with self.app.app_context():
            account=self.app.extensions['platform_read'](self.key('person@example.com'))
            self.assertTrue(check_password_hash(account['password_hash'],PASSWORD))
        self.assertEqual(self.post('login',{'email':'person@example.com','password':PASSWORD}).status_code,200)
        self.assertEqual(self.client.get('/api/community/state').json['identity'],before['identity'])
    def test_unknown_email_codes_do_not_create_an_account(self):
        r=self.post('request-code',{'email':'missing@example.com'});self.assertEqual(r.status_code,200);self.assertEqual(self.sent,[])
        self.assertEqual(self.post('verify-code',{'challenge_id':r.json['challenge_id'],'code':'123456'}).status_code,403)
        self.assertEqual(self.client.get('/api/community/state').status_code,401)
    def test_password_policy_and_unicode_no_silent_truncation(self):
        for value in ['short','a'*30,'password123456789',None,'z'*129]:
            self.assertEqual(self.post('register',{'email':'person@example.com','password':value}).status_code,400)
        value='நிலா violet river! '*4
        r=self.post('register',{'email':'person@example.com','password':value})
        self.post('verify-code',{'challenge_id':r.json['challenge_id'],'code':self.sent[-1][1]})
        self.csrf=self.client.get('/api/community/state').json['csrf'];self.post('logout',{});self.csrf=self.auth_boot()
        self.assertEqual(self.post('login',{'email':'person@example.com','password':value}).status_code,200)
    def test_auth_mutations_require_csrf_and_turnstile(self):
        for path,payload in [('register',{'email':'a@example.com','password':PASSWORD}),('login',{'email':'a@example.com','password':PASSWORD}),('request-code',{'email':'a@example.com','purpose':'reset'}),('verify-code',{'challenge_id':'a'*32,'code':'123456'}),('reset-password',{'password':PASSWORD}),('resend-code',{'challenge_id':'a'*32})]:
            self.assertEqual(self.client.post('/api/auth/'+path,json=payload).status_code,403)
            self.assertEqual(self.post(path,payload,valid=False).status_code,403)
        self.assertEqual(self.sent,[])
    def test_password_attempt_limits_persist_and_failures_are_generic(self):
        self.signup();self.post('logout',{});self.csrf=self.auth_boot()
        existing=self.post('login',{'email':'person@example.com','password':'incorrect'});unknown=self.post('login',{'email':'unknown@example.com','password':'incorrect'})
        self.assertEqual(existing.status_code,unknown.status_code);self.assertEqual(existing.json,unknown.json)
        for _ in range(9):self.assertEqual(self.post('login',{'email':'person@example.com','password':'incorrect'}).status_code,403)
        self.assertEqual(self.post('login',{'email':'person@example.com','password':PASSWORD}).status_code,429)
    def test_resend_is_browser_bound_invalidates_old_code_and_keeps_hash(self):
        r=self.post('register',{'email':'person@example.com','password':PASSWORD});old=r.json['challenge_id'];oldcode=self.sent[-1][1]
        self.assertEqual(self.post('resend-code',{'challenge_id':old}).status_code,429)
        other=self.app.test_client();othercsrf=self.auth_boot(other)
        self.assertEqual(self.post('resend-code',{'challenge_id':old},other,othercsrf).status_code,403)
        self.expire_cooldown();r=self.post('resend-code',{'challenge_id':old});self.assertEqual(r.status_code,200,r.json)
        self.assertEqual(self.post('verify-code',{'challenge_id':old,'code':oldcode}).status_code,403)
        self.assertEqual(self.post('verify-code',{'challenge_id':r.json['challenge_id'],'code':self.sent[-1][1]}).status_code,200)
        with self.app.app_context():self.assertTrue(check_password_hash(self.app.extensions['platform_read'](self.key('person@example.com'))['password_hash'],PASSWORD))
    def test_recovery_requires_verified_email_then_revokes_other_sessions(self):
        original=self.signup();other=self.app.test_client();othercsrf=self.auth_boot(other)
        self.assertEqual(self.post('login',{'email':'person@example.com','password':PASSWORD},other,othercsrf).status_code,200)
        self.post('logout',{});self.csrf=self.auth_boot();self.expire_cooldown()
        new='orchid sunrise paper boats serenade'
        self.assertEqual(self.post('reset-password',{'password':new}).status_code,403)
        r=self.post('request-code',{'email':'person@example.com','purpose':'reset'});r=self.post('verify-code',{'challenge_id':r.json['challenge_id'],'code':self.sent[-1][1]})
        self.assertTrue(r.json['reset_required']);self.assertEqual(self.client.get('/api/community/state').status_code,401)
        self.assertEqual(other.get('/api/community/state').status_code,200)
        r=self.post('reset-password',{'password':new});self.assertEqual(r.status_code,200,r.json)
        self.assertEqual(other.get('/api/community/state').status_code,401)
        after=self.client.get('/api/community/state').json;self.csrf=after['csrf'];self.assertEqual(original['identity'],after['identity'])
        self.assertEqual(self.post('reset-password',{'password':PASSWORD}).status_code,403)
        self.post('logout',{});self.csrf=self.auth_boot()
        self.assertEqual(self.post('login',{'email':'person@example.com','password':PASSWORD}).status_code,403)
        self.assertEqual(self.post('login',{'email':'person@example.com','password':new}).status_code,200)
    def test_legacy_passwordless_account_can_sign_in_and_set_password(self):
        with self.app.app_context():self.app.extensions['platform_write'](self.key('legacy@example.com'),{'user_id':'legacy-person','created':time.time()})
        r=self.post('request-code',{'email':'legacy@example.com'});self.assertEqual(r.status_code,200)
        self.assertEqual(self.post('verify-code',{'challenge_id':r.json['challenge_id'],'code':self.sent[-1][1]}).status_code,200)
        state=self.client.get('/api/community/state').json;self.csrf=state['csrf'];self.assertTrue(state['onboarding']['required'])
        self.expire_cooldown();self.auth_boot();r=self.post('request-code',{'email':'legacy@example.com','purpose':'reset'})
        self.post('verify-code',{'challenge_id':r.json['challenge_id'],'code':self.sent[-1][1]})
        self.assertEqual(self.post('reset-password',{'password':PASSWORD}).status_code,200)
        self.assertEqual(self.client.get('/api/community/state').json['identity'],state['identity'])
    def test_deleted_account_cannot_login_or_register_again(self):
        self.signup();self.assertEqual(self.community({'confirmation':'DELETE'},'/api/community/account/delete').status_code,200)
        self.csrf=self.auth_boot();self.expire_cooldown();count=len(self.sent)
        self.assertEqual(self.post('login',{'email':'person@example.com','password':PASSWORD}).status_code,403)
        self.assertEqual(self.post('register',{'email':'person@example.com','password':PASSWORD}).status_code,200)
        self.assertEqual(len(self.sent),count)
    def test_onboarding_resumes_and_preserves_identity_balances_and_choices(self):
        before=self.signup()
        with self.client.get('/welcome') as r:self.assertEqual(r.status_code,200)
        payloads=[{'intent':'create'},{'interests':['technology','food'],'languages':['Tamil']},{'formats':['visual','rank'],'generated_images':False,'generated_polls':False,'generated_audio':False,'generated_video':False},{'avatar':'river','tagline':'Curious about everyday choices','notifications':False}]
        for i,p in enumerate(payloads):
            r=self.community({'step':i,'preferences':p,'action':'complete' if i==3 else 'save'});self.assertEqual(r.status_code,200,r.json)
            resume=self.client.get('/api/community/onboarding').json
            self.assertEqual(resume['onboarding']['step'],min(i+1,3));self.assertEqual(resume['identity']['id'],before['identity']['id'])
        self.assertEqual(r.json['redirect'],'/#create')
        after=self.client.get('/api/community/state').json
        self.assertFalse(after['onboarding']['required']);self.assertTrue(after['onboarding']['complete']);self.assertFalse(after['admin'])
        self.assertEqual(after['wallet'],before['wallet']);self.assertEqual(after['identity']['author'],before['identity']['author'])
        self.assertEqual(after['preferences']['interests'],['technology','food']);self.assertEqual(after['preferences']['formats'],['visual','rank'])
        self.assertEqual(after['preferences']['avatar'],'river');self.assertFalse(after['preferences']['generated_images'])
    def test_onboarding_rejects_invalid_or_privileged_changes_atomically(self):
        before=self.signup()
        for payload in [{'step':True,'preferences':{}},{'step':1,'preferences':{'interests':[],'languages':['English']}},{'step':2,'preferences':{'formats':['not-a-poll']}},{'step':3,'preferences':{'tagline':'Hi','avatar':'unknown'}},{'step':1,'preferences':{'role':'admin'}},{'step':0,'preferences':{'intent':['admin']}},{'step':0,'preferences':{'intent':'answer'},'action':'complete'}]:
            r=self.community(payload);self.assertEqual(r.status_code,400,r.json)
        after=self.client.get('/api/community/state').json;self.assertEqual(before['preferences'],after['preferences']);self.assertFalse(after['admin'])
    def test_skip_is_persistent_and_regular_preferences_cannot_complete_setup(self):
        self.signup();self.community({'onboarding_complete':True,'role':'admin'},'/api/community/preferences')
        self.assertTrue(self.client.get('/api/community/state').json['onboarding']['required'])
        r=self.community({'action':'skip'});self.assertEqual(r.status_code,200)
        self.assertFalse(self.client.get('/api/community/state').json['onboarding']['required'])
        self.assertEqual(self.client.get('/api/community/onboarding').json['onboarding']['complete'],True)
    def test_onboarding_private_routes_require_signin(self):
        self.assertEqual(self.client.get('/welcome').status_code,302)
        self.assertEqual(self.client.get('/api/community/onboarding').status_code,401)
        self.assertEqual(self.client.post('/api/community/onboarding',json={'action':'skip'}).status_code,401)
        with self.client.get('/create-account') as r:self.assertEqual(r.status_code,200)
