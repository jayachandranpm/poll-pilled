import io
import json
import os
import time
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from cloudflare_integration import check_token
from media_tools import validate_clip
from meta_ai import AIError
from tests import test_custom_auth as auth_fixture


class AuthReliabilityTests(unittest.TestCase):
    setUp = auth_fixture.CustomAuthenticationTests.setUp
    tearDown = auth_fixture.CustomAuthenticationTests.tearDown
    post = auth_fixture.CustomAuthenticationTests.post
    request = auth_fixture.CustomAuthenticationTests.request

    def continue_flow(self, path, data, csrf=None):
        return self.client.post('/api/auth/'+path,json=data,
                                headers={'X-CSRF-Token':csrf or self.csrf})

    def test_verified_email_flow_and_routine_preferences_do_not_repeat_captcha(self):
        cid,code=self.request()
        with patch('urllib.request.urlopen',side_effect=AssertionError('Unexpected second CAPTCHA')):
            result=self.continue_flow('verify-code',{'challenge_id':cid,'code':code})
        self.assertEqual(result.status_code,200,result.json)
        state=self.client.get('/api/community/state').json
        self.assertFalse(state['admin'])
        blocked=self.client.post('/api/community/preferences',json={'theme':'light'},
                                 headers={'X-CSRF-Token':state['csrf']})
        self.assertEqual(blocked.status_code,200)
        self.assertEqual(self.client.get('/api/admin/settings').status_code,403)

    def test_continuation_still_requires_csrf_and_locks_after_five_guesses(self):
        cid,code=self.request();data={'challenge_id':cid,'code':code}
        self.assertEqual(self.client.post('/api/auth/verify-code',json=data).status_code,403)
        wrong='111111' if code!='111111' else '222222'
        for _ in range(5):
            self.assertEqual(self.continue_flow('verify-code',{'challenge_id':cid,'code':wrong}).status_code,403)
        self.assertEqual(self.continue_flow('verify-code',data).status_code,403)

    def test_other_browser_cannot_borrow_server_verified_continuation(self):
        cid,code=self.request();other=self.app.test_client()
        csrf=other.get('/api/auth/session').json['csrf']
        result=other.post('/api/auth/verify-code',json={'challenge_id':cid,'code':code,'bot_verified_at':time.time()},headers={'X-CSRF-Token':csrf})
        self.assertEqual(result.status_code,403)
        self.assertEqual(self.continue_flow('verify-code',{'challenge_id':cid,'code':code}).status_code,200)

    def test_legacy_or_expired_proof_requires_a_fresh_provider_token(self):
        cid,code=self.request()
        with self.app.app_context():
            record=self.app.extensions['platform_read']('auth_code:'+cid)
            record['bot_verified_at']=time.time()-601
            self.app.extensions['platform_write']('auth_code:'+cid,record)
        data={'challenge_id':cid,'code':code,'bot_verified_at':time.time()}
        self.assertEqual(self.continue_flow('verify-code',data).status_code,403)
        self.assertEqual(self.post('verify-code',data).status_code,200)

    def test_password_recovery_is_a_single_verified_flow(self):
        cid,code=self.request();self.continue_flow('verify-code',{'challenge_id':cid,'code':code})
        state=self.client.get('/api/community/state').json
        self.continue_flow('logout',{},state['csrf'])
        self.csrf=self.client.get('/api/auth/session').json['csrf']
        with self.app.app_context():
            db=self.app.extensions['platform_db']()
            with db:db.execute("DELETE FROM platform_settings WHERE name LIKE 'auth_rate:%'")
        result=self.post('request-code',{'email':'person@example.com','purpose':'reset'})
        self.assertFalse(result.json['verification_security_required'])
        with patch('urllib.request.urlopen',side_effect=AssertionError('Unexpected repeated CAPTCHA')):
            result=self.continue_flow('verify-code',{'challenge_id':result.json['challenge_id'],'code':self.sent[-1][1]})
            self.assertTrue(result.json['reset_required'])
            self.assertFalse(result.json['verification_security_required'])
            result=self.continue_flow('reset-password',{'password':'a fresh violet galaxy passphrase'})
        self.assertEqual(result.status_code,200,result.json)

    def test_missing_audio_binary_never_blocks_admin_startup_or_reports_key_lost(self):
        cid,code=self.request('jayachandranpm2001@gmail.com')
        self.continue_flow('verify-code',{'challenge_id':cid,'code':code})
        with self.app.app_context():self.app.extensions['platform_write']('meta_key','private-fixture-meta-key')
        unavailable=SimpleNamespace(get_ffmpeg_exe=Mock(side_effect=RuntimeError('Missing executable')))
        with patch.dict(os.environ,{'BUNDLED_FFMPEG':'true'}),patch('media_tools.shutil.which',return_value=None),patch.dict('sys.modules',{'imageio_ffmpeg':unavailable}):
            for path in ['/api/session','/api/ai/session','/api/community/state','/api/admin/settings','/health']:
                response=self.client.get(path)
                self.assertEqual(response.status_code,200,(path,response.json))
                self.assertNotIn('private-fixture-meta-key',response.text)
            self.assertFalse(self.client.get('/api/ai/session').json['connections']['audio_conversion'])
            self.assertTrue(self.client.get('/api/admin/settings').json['meta_configured'])
            with self.assertRaisesRegex(ValueError,'validation is unavailable'):validate_clip('/unused.wav','audio')

    def test_generic_bootstrap_is_authenticated_and_does_not_check_ai(self):
        self.assertEqual(self.client.get('/api/session').status_code,401)
        cid,code=self.request();self.continue_flow('verify-code',{'challenge_id':cid,'code':code})
        with patch('meta_ai.ffmpeg_binary',side_effect=AssertionError('Must not inspect AI during bootstrap')):
            result=self.client.get('/api/session')
        self.assertEqual(result.status_code,200,result.json)
        self.assertTrue(result.json['csrf']);self.assertTrue(result.json['security']['turnstile_enabled'])
        self.assertNotIn('connections',result.json)


class ProviderVerificationTests(unittest.TestCase):
    config={'secret_key':'fixture-secret','hostname':'poll.example'}
    valid={'success':True,'hostname':'poll.example','action':'poll_login'}

    def test_transport_retry_reuses_idempotency_key_and_remains_bounded(self):
        with patch('urllib.request.urlopen',side_effect=[TimeoutError(),io.BytesIO(json.dumps(self.valid).encode())]) as call:
            check_token(self.config,'fixture-token','poll_login')
        self.assertEqual(call.call_count,2)
        bodies=[json.loads(c.args[0].data) for c in call.call_args_list]
        self.assertEqual(bodies[0],bodies[1]);self.assertTrue(bodies[0]['idempotency_key'])
        self.assertEqual([c.kwargs['timeout'] for c in call.call_args_list],[4,4])
        with patch('urllib.request.urlopen',side_effect=TimeoutError()) as call:
            with self.assertRaisesRegex(AIError,'verify-network'):check_token(self.config,'fixture-token','poll_login')
        self.assertEqual(call.call_count,2)

    def test_provider_rejection_never_retries_or_blames_extensions(self):
        for payload,reference in [({'success':False,'error-codes':['timeout-or-duplicate']},'verify-expired'),
                                  ({**self.valid,'hostname':'wrong.example'},'verify-hostname'),
                                  ({**self.valid,'action':'poll_write'},'verify-action')]:
            with patch('urllib.request.urlopen',return_value=io.BytesIO(json.dumps(payload).encode())) as call:
                with self.assertRaisesRegex(AIError,reference):check_token(self.config,'fixture-token','poll_login')
            self.assertEqual(call.call_count,1)
