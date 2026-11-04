import hashlib
import hmac
import io
import json
import time
import unittest
from unittest.mock import patch
from tests import test_custom_auth as auth_fixture


class OnboardingSecurityTests(unittest.TestCase):
    setUp=auth_fixture.CustomAuthenticationTests.setUp
    tearDown=auth_fixture.CustomAuthenticationTests.tearDown
    post=auth_fixture.CustomAuthenticationTests.post
    request=auth_fixture.CustomAuthenticationTests.request

    def login(self):
        cid,code=self.request()
        self.post('verify-code',{'challenge_id':cid,'code':code})
        state=self.client.get('/api/community/onboarding').json
        self.csrf=state['csrf']
        return state

    def save(self,data,token=None,csrf=True):
        headers={'X-CSRF-Token':self.csrf} if csrf else {}
        if token:headers['X-Turnstile-Token']=token
        return self.client.post('/api/community/onboarding',json=data,headers=headers)

    def age_session(self):
        with self.client.session_transaction() as session:token=session['auth_session']
        name='auth_session:'+hmac.new(b'test-auth',token.encode(),hashlib.sha256).hexdigest()
        with self.app.app_context():
            record=self.app.extensions['platform_read'](name)
            record['created']=time.time()-3600
            self.app.extensions['platform_write'](name,record)

    def test_all_steps_back_and_completed_preferences_never_repeat_captcha(self):
        state=self.login();self.age_session()
        self.assertIn('/api/community/onboarding',state['security']['captcha_policy']['free_posts'])
        steps=[{'intent':'both'},{'interests':['design','food'],'languages':['English']},
               {'formats':['classic','visual'],'generated_images':False},
               {'avatar':'otter','tagline':'Here for a good question.','notifications':True}]
        with patch('cloudflare_integration.check_token',side_effect=AssertionError('Unexpected onboarding CAPTCHA')):
            for step,pref in enumerate(steps):
                result=self.save({'action':'save' if step<3 else 'complete','step':step,'preferences':pref})
                self.assertEqual(result.status_code,200,result.json)
                if step==1:
                    self.assertEqual(self.save({'action':'save','step':0,'preferences':{'intent':'answer'}}).status_code,200)
            self.assertEqual(self.save({'action':'skip'}).status_code,200)
        self.assertTrue(result.json['onboarding']['complete'])

    def test_expired_session_requires_signin_not_an_onboarding_captcha(self):
        self.login()
        with self.client.session_transaction() as session: token=session['auth_session']
        key='auth_session:'+hmac.new(b'test-auth',token.encode(),hashlib.sha256).hexdigest()
        with self.app.app_context():
            record=self.app.extensions['platform_read'](key);record['expires']=time.time()-1
            self.app.extensions['platform_write'](key,record)
        result=self.save({'action':'skip'})
        self.assertEqual(result.status_code,401);self.assertTrue(result.json['login_required'])

    def test_onboarding_still_requires_auth_csrf_and_protects_sensitive_actions(self):
        self.login()
        self.assertEqual(self.save({'action':'skip'},csrf=False).status_code,403)
        other=self.app.test_client()
        self.assertEqual(other.post('/api/community/onboarding',json={'action':'skip','onboarding_expires_at':time.time()+9000}).status_code,401)
        for path in ['/api/community/publish','/api/ai/new-tool','/api/community/account/delete']:
            result=self.client.post(path,json={'onboarding_expires_at':time.time()+9000},headers={'X-CSRF-Token':self.csrf})
            self.assertEqual(result.status_code,403,(path,result.json))

    def test_onboarding_cannot_grant_roles_credits_or_an_unrestricted_policy(self):
        self.login()
        result=self.save({'action':'save','step':0,'preferences':{'intent':'both','role':'admin','credits':5000}})
        self.assertEqual(result.status_code,400)
        self.assertEqual(self.save({'action':'skip'}).status_code,200)
        state=self.client.get('/api/community/state').json
        self.assertFalse(state['admin'])
        self.assertNotIn('/api/community/publish',state['security']['captcha_policy']['free_posts'])
