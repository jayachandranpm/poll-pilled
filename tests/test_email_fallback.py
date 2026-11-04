"""Managed-browser email authentication: no real CAPTCHA, SMTP or user accounts."""
import hashlib
import hmac
import time
import unittest
from unittest.mock import patch
from tests import test_custom_auth as auth_fixture


class EmailFallbackTests(unittest.TestCase):
    setUp = auth_fixture.CustomAuthenticationTests.setUp
    tearDown = auth_fixture.CustomAuthenticationTests.tearDown
    post = auth_fixture.CustomAuthenticationTests.post
    request = auth_fixture.CustomAuthenticationTests.request

    def fallback(self,path,data,client=None,csrf=None,headers=None):
        with patch('custom_auth.check_token',side_effect=AssertionError('Fallback must not call Turnstile')):
            return (client or self.client).post('/api/auth/email-fallback/'+path,json=data,
                headers={'X-CSRF-Token':csrf or self.csrf,**(headers or {})})

    def digest(self,value):
        return hmac.new(b'test-auth',value.encode(),hashlib.sha256).hexdigest()

    def stored(self,name):
        with self.app.app_context(): return self.app.extensions['platform_read'](name)

    def save(self,name,value):
        with self.app.app_context(): self.app.extensions['platform_write'](name,value)

    def new_browser(self):
        client=self.app.test_client()
        return client,client.get('/api/auth/session').json['csrf']

    def account(self,email='person@example.com'):
        self.save('auth_account:'+self.digest(email),{'user_id':'existing-person','created':time.time()})
        return email

    def start(self,email=None,kind='request-code',**kwargs):
        email=email or self.account()
        data={'email':email}
        if kind=='register':data['password']='a violet otter enjoys the sky'
        result=self.fallback(kind,data,**kwargs)
        self.assertEqual(result.status_code,200,result.json)
        return result.json['challenge_id'],self.sent[-1][1]

    def test_signin_works_without_provider_and_does_not_claim_bot_verification(self):
        self.assertTrue(self.client.get('/api/auth/session').json['email_fallback_enabled'])
        cid,code=self.start()
        record=self.stored('auth_code:'+cid)
        self.assertEqual(record['method'],'email_fallback');self.assertNotIn('bot_verified_at',record)
        self.assertNotEqual(record['code'],code)
        self.assertEqual(self.client.get('/api/community/state').status_code,401)
        result=self.fallback('verify-code',{'challenge_id':cid,'code':code})
        self.assertEqual(result.status_code,200,result.json)
        state=self.client.get('/api/community/state').json
        self.assertFalse(state['admin']);self.assertEqual(self.client.get('/api/admin/settings').status_code,403)
        self.assertEqual(self.fallback('verify-code',{'challenge_id':cid,'code':code},csrf=state['csrf']).status_code,403)

    def test_signup_waits_for_verified_email_and_does_not_accept_admin_role(self):
        email='new@example.com'
        response=self.fallback('register',{'email':email,'password':'short','role':'admin'})
        self.assertEqual(response.status_code,400);self.assertEqual(self.sent,[])
        cid,code=self.start(email,'register')
        self.assertIsNone(self.stored('auth_account:'+self.digest(email)))
        response=self.fallback('verify-code',{'challenge_id':cid,'code':code,'role':'admin'})
        self.assertEqual(response.json['redirect'],'/welcome');self.assertTrue(response.json['created'])
        self.assertFalse(self.client.get('/api/community/state').json['admin'])
        account=self.stored('auth_account:'+self.digest(email))
        self.assertTrue(account['password_hash'].startswith('scrypt:'))
        self.assertNotIn('password_hash',self.stored('auth_code:'+cid))

    def test_existing_owner_identity_is_preserved(self):
        email='jayachandranpm2001@gmail.com';self.account(email)
        cid,code=self.start(email)
        self.assertEqual(self.fallback('verify-code',{'challenge_id':cid,'code':code}).status_code,200)
        self.assertTrue(self.client.get('/api/community/state').json['admin'])
        self.assertEqual(self.stored('auth_account:'+self.digest(email))['user_id'],'existing-person')

    def test_expired_code_and_five_guesses_fail_closed(self):
        cid,code=self.start();wrong='000000' if code!='000000' else '111111'
        for _ in range(5): self.assertEqual(self.fallback('verify-code',{'challenge_id':cid,'code':wrong}).status_code,403)
        self.assertEqual(self.stored('auth_code:'+cid)['attempts'],5)
        self.assertEqual(self.fallback('verify-code',{'challenge_id':cid,'code':code}).status_code,403)
        record=self.stored('auth_code:'+cid);record.update(attempts=0,expires=time.time()-1);self.save('auth_code:'+cid,record)
        self.assertEqual(self.fallback('verify-code',{'challenge_id':cid,'code':code}).status_code,403)
        self.assertEqual(self.client.get('/api/community/state').status_code,401)

    def test_csrf_origin_and_browser_binding_remain_required(self):
        data={'email':'new@example.com'}
        self.assertEqual(self.client.post('/api/auth/email-fallback/request-code',json=data).status_code,403)
        self.assertEqual(self.fallback('request-code',data,headers={'Origin':'https://evil.test'}).status_code,403)
        self.assertEqual(self.sent,[])
        cid,code=self.start();other,csrf=self.new_browser()
        self.assertEqual(self.fallback('verify-code',{'challenge_id':cid,'code':code},other,csrf).status_code,403)
        self.assertEqual(self.fallback('resend-code',{'challenge_id':cid},other,csrf).status_code,403)
        self.assertEqual(self.fallback('verify-code',{'challenge_id':cid,'code':code}).status_code,200)

    def test_methods_are_bound_in_storage_and_client_flags_do_not_bypass_turnstile(self):
        cid,code=self.start()
        self.assertEqual(self.post('verify-code',{'challenge_id':cid,'code':code,'method':'turnstile'}).status_code,403)
        self.assertEqual(self.post('resend-code',{'challenge_id':cid}).status_code,403)
        # Every ordinary route still rejects a missing or failed CAPTCHA.
        for path,data in [('login',{'email':'person@example.com','password':'any password'}),
                          ('request-code',{'email':'person@example.com'}),
                          ('register',{'email':'new@example.com','password':'a long safe test passphrase'})]:
            data.update(method='email_fallback',skip_captcha=True)
            self.assertEqual(self.client.post('/api/auth/'+path,json=data,headers={'X-CSRF-Token':self.csrf}).status_code,403)
        normal_id,normal_code=self.request('normal@example.com')
        self.assertEqual(self.fallback('verify-code',{'challenge_id':normal_id,'code':normal_code}).status_code,403)
        self.assertEqual(self.fallback('resend-code',{'challenge_id':normal_id}).status_code,403)

    def test_resend_rotates_code_preserves_pending_signup_and_obeys_cooldown(self):
        cid,code=self.start('signup@example.com','register')
        self.assertEqual(self.fallback('resend-code',{'challenge_id':cid}).status_code,429)
        with patch('custom_auth.time.time',return_value=time.time()+61):
            result=self.fallback('resend-code',{'challenge_id':cid})
        self.assertEqual(result.status_code,200,result.json);replacement=result.json['challenge_id']
        self.assertIsNone(self.stored('auth_code:'+cid))
        self.assertTrue(self.stored('auth_code:'+replacement)['password_hash'])
        self.assertEqual(self.fallback('verify-code',{'challenge_id':cid,'code':code}).status_code,403)
        self.assertEqual(self.fallback('verify-code',{'challenge_id':replacement,'code':self.sent[-1][1]}).status_code,200)

    def test_password_reset_uses_same_method_and_revokes_old_sessions(self):
        cid,code=self.start()
        self.fallback('verify-code',{'challenge_id':cid,'code':code})
        state=self.client.get('/api/community/state').json
        other,csrf=self.new_browser()
        with patch('custom_auth.time.time',return_value=time.time()+61):
            r=self.fallback('request-code',{'email':'person@example.com','purpose':'reset'},other,csrf)
        cid=r.json['challenge_id'];code=self.sent[-1][1]
        self.assertEqual(self.fallback('reset-password',{'password':'a new violet balcony passphrase'},other,csrf).status_code,403)
        result=self.fallback('verify-code',{'challenge_id':cid,'code':code},other,csrf)
        self.assertTrue(result.json['reset_required'])
        self.assertEqual(self.post('reset-password',{'password':'a new violet balcony passphrase'},other,csrf).status_code,403)
        result=self.fallback('reset-password',{'password':'a new violet balcony passphrase'},other,csrf)
        self.assertEqual(result.status_code,200,result.json)
        self.assertEqual(self.client.get('/api/community/state').status_code,401)
        self.assertEqual(other.get('/api/community/state').status_code,200)
        csrf=other.get('/api/auth/session').json['csrf']
        self.assertEqual(self.fallback('reset-password',{'password':'another violet balcony passphrase'},other,csrf).status_code,403)

    def test_fallback_can_be_disabled_without_affecting_normal_flow(self):
        cid,code=self.start();self.app.config['EMAIL_AUTH_FALLBACK_ENABLED']=False
        self.assertFalse(self.client.get('/api/auth/session').json['email_fallback_enabled'])
        self.assertEqual(self.fallback('request-code',{'email':'person@example.com'}).status_code,503)
        self.assertEqual(self.fallback('verify-code',{'challenge_id':cid,'code':code}).status_code,503)
        cid,code=self.request('normal@example.com')
        self.assertEqual(self.post('verify-code',{'challenge_id':cid,'code':code}).status_code,200)

    def test_unknown_disabled_and_existing_accounts_have_the_same_public_response(self):
        self.account('active@example.com')
        self.save('auth_account:'+self.digest('disabled@example.com'),{'user_id':'disabled','disabled':True})
        responses=[]
        for email in ['active@example.com','missing@example.com','disabled@example.com']:
            r=self.fallback('request-code',{'email':email});self.assertEqual(r.status_code,200)
            body=r.json;body.pop('challenge_id');responses.append(body)
        self.assertEqual(responses[0],responses[1]);self.assertEqual(responses[1],responses[2])
        self.assertEqual(len(self.sent),1)

    def test_account_send_quota_survives_cookie_rotation(self):
        self.account();start=time.time()
        for i in range(4):
            client,csrf=self.new_browser()
            with patch('custom_auth.time.time',return_value=start+61*i):
                r=self.fallback('request-code',{'email':'person@example.com'},client,csrf)
            self.assertEqual(r.status_code,200 if i<3 else 429,r.json)
        self.assertEqual(len(self.sent),3)

    def test_global_and_peer_limits_cannot_be_evaded_with_forwarding_headers(self):
        self.save('auth_rate:fallback:send:peer:'+self.digest('127.0.0.1'),[time.time()]*60)
        client,csrf=self.new_browser()
        response=self.fallback('request-code',{'email':'unique@example.com'},client,csrf,
                              headers={'X-Forwarded-For':'1.2.3.4','CF-Connecting-IP':'2.3.4.5'})
        self.assertEqual(response.status_code,429);self.assertEqual(self.sent,[])
        self.save('auth_rate:fallback:send:peer:'+self.digest('127.0.0.1'),[])
        self.save('auth_rate:fallback:send:global',[time.time()]*100)
        self.assertEqual(self.fallback('request-code',{'email':'new@example.com'}).status_code,429)

    def test_account_verification_quota_is_shared_across_challenges_and_browsers(self):
        self.account();start=time.time();flows=[]
        for i in range(3):
            client,csrf=self.new_browser()
            with patch('custom_auth.time.time',return_value=start+61*i):
                cid,code=self.start('person@example.com',client=client,csrf=csrf)
            flows.append((client,csrf,cid,code))
        for client,csrf,cid,code in flows[:2]:
            wrong='111111' if code!='111111' else '222222'
            for _ in range(5):self.assertEqual(self.fallback('verify-code',{'challenge_id':cid,'code':wrong},client,csrf).status_code,403)
        client,csrf,cid,code=flows[2]
        self.assertEqual(self.fallback('verify-code',{'challenge_id':cid,'code':code},client,csrf).status_code,429)

    def test_smtp_failure_is_not_retried_or_granted_a_session(self):
        self.account()
        with patch.dict(self.app.extensions,{'auth_send':lambda *args:(_ for _ in ()).throw(RuntimeError('SMTP failed'))}):
            r=self.fallback('request-code',{'email':'person@example.com'})
        self.assertEqual(r.status_code,503);self.assertEqual(self.client.get('/api/community/state').status_code,401)
        self.assertEqual(self.fallback('request-code',{'email':'person@example.com'}).status_code,429)

    def test_cleanup_removes_expired_secrets_without_touching_accounts_or_active_sessions(self):
        now=time.time();email=self.account()
        self.save('auth_code:expired',{'expires':now-7200,'password_hash':'expired-pending-secret'})
        self.save('auth_latest:expired','expired')
        self.save('auth_reset:expired',{'expires':now-1})
        self.save('auth_session:active',{'email':email,'expires':now+600})
        self.save('auth_rate:fallback:send:old',[now-90000])
        self.start(email)
        for key in ['auth_code:expired','auth_latest:expired','auth_reset:expired','auth_rate:fallback:send:old']:
            self.assertIsNone(self.stored(key))
        self.assertEqual(self.stored('auth_session:active')['email'],email)
        self.assertEqual(self.stored('auth_account:'+self.digest(email))['user_id'],'existing-person')

    def test_fallback_does_not_depend_on_widget_configuration(self):
        self.save('cloudflare',{})
        session=self.client.get('/api/auth/session').json
        self.assertFalse(session['ready']);self.assertTrue(session['email_fallback_enabled'])
        cid,code=self.start()
        self.assertEqual(self.fallback('verify-code',{'challenge_id':cid,'code':code}).status_code,200)

if __name__=='__main__':unittest.main()
