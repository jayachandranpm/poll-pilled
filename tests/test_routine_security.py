import hashlib
import hmac
import io
import base64
import json
import time
import unittest
import wave
from unittest.mock import patch
from PIL import Image
from security import ROUTINE_POST_ROUTES, AI_TOOL_POST_ROUTES
from tests import test_custom_auth as auth_fixture


class RoutineSecurityTests(unittest.TestCase):
    setUp = auth_fixture.CustomAuthenticationTests.setUp
    tearDown = auth_fixture.CustomAuthenticationTests.tearDown
    post = auth_fixture.CustomAuthenticationTests.post
    request = auth_fixture.CustomAuthenticationTests.request

    def login(self):
        cid, code = self.request()
        self.post('verify-code', {'challenge_id': cid, 'code': code})
        state = self.client.get('/api/community/state').json
        self.csrf = state['csrf']
        return state

    def save(self, path, data=None, **kw):
        return self.client.post(path, json=data or {}, headers={'X-CSRF-Token': self.csrf}, **kw)

    def test_routine_workflow_never_calls_provider_and_policy_matches_real_routes(self):
        state = self.login()
        routes = {r.rule for r in self.app.url_map.iter_rules() if 'POST' in r.methods}
        self.assertLessEqual(ROUTINE_POST_ROUTES, routes)
        self.assertEqual(set(state['security']['captcha_policy']['free_posts']), ROUTINE_POST_ROUTES)
        poll = next(p for p in state['polls'] if p['eligible'])
        # A real second account is required; sample poll publishers are not followable.
        publisher = self.app.test_client()
        publisher_csrf = publisher.get('/api/auth/session').json['csrf']
        registered = self.post('register', {'email': 'publisher@example.com', 'password': 'a different safe passphrase'}, publisher, publisher_csrf)
        # The latest challenge is browser-bound to the publisher.
        challenge = registered.json['challenge_id']
        self.post('verify-code', {'challenge_id': challenge, 'code': self.sent[-1][1]}, publisher, publisher_csrf)
        publisher_id = publisher.get('/api/community/state').json['identity']['id']
        quote = dict(title='Which is best?', format='classic', circle='design', responses=20, reach='Community')
        actions = [
            ('/api/community/preferences', {'theme': 'dark', 'motion': False, 'interests': ['design']}),
            ('/api/community/draft', {'draft': {'title': 'A private work in progress'}}),
            ('/api/community/notifications/read', {'ids': []}),
            ('/api/community/audience-preview', {'tags': ['design']}),
            ('/api/community/quote', quote),
            (f"/api/community/polls/{poll['id']}/save", {'saved': True}),
            (f"/api/community/polls/{poll['id']}/report", {'reason': 'Misleading'}),
            (f"/api/community/polls/{poll['id']}/claim", {}),
            (f"/api/community/people/{publisher_id}/follow", {'following': True}),
            (f"/api/community/people/{publisher_id}/alerts", {'notify': False}),
        ]
        with patch('cloudflare_integration.check_token', side_effect=AssertionError('Unnecessary CAPTCHA')):
            for path, data in actions:
                result = self.save(path, data)
                self.assertEqual(result.status_code, 200, (path, result.json))
        after = self.client.get('/api/community/state').json
        self.assertEqual(after['preferences']['theme'], 'dark')
        self.assertEqual(after['draft']['title'], 'A private work in progress')
        self.assertEqual(after['wallet'], state['wallet'])

    def test_answers_need_no_captcha_and_reactions_stay_locked_until_answering(self):
        state = self.login()
        poll = next(p for p in state['polls'] if p['eligible'] and p['format'] == 'classic')
        base = f"/api/community/polls/{poll['id']}"
        with patch('cloudflare_integration.check_token') as check:
            locked = self.save(base+'/react', {'reaction': 'helpful'})
            self.assertEqual(locked.status_code, 403)
            self.assertIn('Answer this poll', locked.json['error'])
            self.assertEqual(self.save(base+'/claim').status_code, 200)
            check.assert_not_called()
        with patch('cloudflare_integration.check_token', side_effect=AssertionError('Repeated submission CAPTCHA')):
            result = self.save(base+'/answer', {'answer': 0})
            self.assertEqual(result.status_code, 200, result.json)
            self.assertTrue(result.json['poll']['results_unlocked'])
            duplicate = self.save(base+'/answer', {'answer': 0})
            self.assertEqual(duplicate.json['response']['id'], result.json['response']['id'])
            self.assertEqual(duplicate.json['wallet'], result.json['wallet'])
            self.assertEqual(self.save(base+'/react', {'reaction': 'helpful'}).status_code, 200)

    def test_submission_limit_and_invitation_ownership_still_apply(self):
        self.login()
        with patch('cloudflare_integration.check_token', side_effect=AssertionError('Submission CAPTCHA')):
            self.assertEqual(self.save('/api/community/followups/other/answer', {'text':'A detailed answer.'}).status_code,404)
            with self.client.session_transaction() as session: viewer=session['viewer']
            subject=hmac.new(b'test-auth',viewer.encode(),hashlib.sha256).hexdigest()
            with self.app.app_context():
                db=self.app.extensions['platform_db']()
                with db: db.executemany('INSERT INTO security_limits VALUES (?,?)',[(subject+':submission',time.time())]*20)
            limited=self.save('/api/community/polls/home/answer',{'answer':0})
            self.assertEqual(limited.status_code,429)
            self.assertEqual(limited.headers['Retry-After'],'60')
            self.assertEqual(self.save('/api/community/preferences',{'theme':'dark'}).status_code,200)

    def test_routine_routes_keep_authentication_csrf_and_account_boundaries(self):
        state = self.login()
        other = self.app.test_client()
        other_csrf = other.get('/api/auth/session').json['csrf']
        for rule in ROUTINE_POST_ROUTES:
            path = rule.replace('<pid>', 'home').replace('<rid>', 'other').replace('<fid>', 'other').replace('<public_id>', 'other').replace('<poll_id>', 'home')
            self.assertEqual(other.post(path, json={'viewer': 'forged', 'theme': 'dark'}, headers={'X-CSRF-Token': other_csrf}).status_code, 401, path)
            # Legacy routes are deliberately unavailable in the deployed app.
            if path in {'/api/profile', '/api/polls/quote', '/api/polls/home/save'}: continue
            self.assertEqual(self.client.post(path, json={}).status_code, 403, path)
        self.assertEqual(self.save('/api/community/preferences', {'theme': 'dark', 'role': 'admin', 'credits': 999999, 'viewer': 'someone-else'}).status_code, 200)
        after = self.client.get('/api/community/state').json
        self.assertFalse(after['admin']); self.assertEqual(after['wallet'], state['wallet'])
        self.assertEqual(self.save('/api/community/sessions/revoke', {'id': 'someone-elses-session'}).status_code, 404)
        self.assertEqual(self.save('/api/community/responses/other/appeal', {'reason': 'Please review again'}).status_code, 404)

    def test_sensitive_and_unknown_writes_cannot_borrow_routine_policy(self):
        self.login()
        for path in ['/api/community/publish', '/api/community/polls/home/answer/extra', '/api/community/polls/home/boost',
                     '/api/community/polls/home/followups', '/api/ai/new-feature', '/api/ai/image/extra',
                     '/api/community/account/delete', '/api/community/preferences/extra', '/api/community/new-feature']:
            result = self.save(path, {'skip_captcha': True, 'captcha_policy': {'free_posts': [path]}})
            self.assertEqual(result.status_code, 403, (path, result.json))
        self.assertEqual(self.client.put('/api/community/preferences', json={}, headers={'X-CSRF-Token': self.csrf}).status_code, 403)

    def test_every_ai_tool_uses_session_protection_without_calling_turnstile(self):
        self.login()
        with patch('cloudflare_integration.check_token', side_effect=AssertionError('Repeated AI CAPTCHA')):
            for rule in AI_TOOL_POST_ROUTES:
                path=rule.replace('<pid>','home').replace('<rid>','missing-response')
                # Invalid inputs still reach the handler's own validation and
                # ownership checks; exemptions do not make invalid input valid.
                result=self.save(path,{})
                self.assertIn(result.status_code,[400,403,404,503],(path,result.json))
                self.assertNotIn('security check',result.json['error'].lower())

    def test_image_studio_rewrite_transcription_and_voice_work_without_another_captcha(self):
        self.login()
        with self.app.test_request_context('/api/admin/settings'):
            self.app.extensions['platform_write']('meta_key','test-meta-only')
            self.app.extensions['platform_write']('voice',{'account_id':'a'*32,'token':'test-cloudflare-only'})
        image=io.BytesIO();Image.new('RGB',(16,16),'skyblue').save(image,format='PNG')
        proposal=dict(title='Which feature matters most to you?',format='rank',options=['Search','Offline access','Export'],rationale='Ranking shows priorities.',instructions='Move your favourite to the top.',tags=['technology'],image_prompts=[],transcript='')
        outputs=[
            {'data':[{'b64_json':base64.b64encode(image.getvalue()).decode()}]},
            {'choices':[{'message':{'content':json.dumps(proposal)}}]},
            {'choices':[{'message':{'content':'Which feature should we improve first?'}}]},
            {'transcript':'Which option would you choose?'},
        ]
        audio=io.BytesIO()
        with wave.open(audio,'wb') as wav:
            wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(24000);wav.writeframes(b'\0'*48000)
        uploaded=self.client.post('/api/upload',data={'kind':'audio','file':(io.BytesIO(audio.getvalue()),'voice.wav')},headers={'X-CSRF-Token':self.csrf})
        self.assertEqual(uploaded.status_code,201,uploaded.json)
        with patch('cloudflare_integration.check_token',side_effect=AssertionError('Repeated AI CAPTCHA')), patch('meta_ai.provider_request',side_effect=outputs) as provider:
            generated=self.save('/api/ai/image',{'prompt':'A blue notebook on a desk'})
            self.assertEqual(generated.status_code,200,generated.json)
            self.assertEqual(generated.json['image_origin'],'generated')
            cached=self.save('/api/ai/image',{'prompt':'A blue notebook on a desk'})
            self.assertEqual(cached.json['url'],generated.json['url'])
            self.assertTrue(cached.json['ai_usage']['cached'])
            studio=self.save('/api/ai/studio',{'brief':'Help prioritize app features','format':'rank'})
            self.assertEqual(studio.status_code,200,studio.json)
            self.assertEqual(studio.json['proposal']['text_origin'],'generated')
            rephrased=self.save('/api/ai',{'task':'rephrase','prompt':'Which feature do you want improved first?','text_origin':'human'})
            self.assertEqual(rephrased.status_code,200,rephrased.json)
            self.assertEqual(rephrased.json['text_origin'],'rephrased')
            transcribed=self.save('/api/ai/transcribe',{'url':uploaded.json['url']})
            self.assertEqual(transcribed.status_code,200,transcribed.json)
            self.assertEqual(transcribed.json['transcript'],'Which option would you choose?')
            self.assertEqual(provider.call_count,4)
            with patch('cloudflare_integration.transport',return_value=io.BytesIO(b'ID3'+b'\0'*100)) as voice_provider:
                voice=self.save('/api/cloudflare/speech',{'text':'This is my answer.','speaker':'luna'})
                self.assertEqual(voice.status_code,200,voice.json)
                self.assertEqual(voice.json['audio_origin'],'generated')
                repeated=self.save('/api/cloudflare/speech',{'text':'This is my answer.','speaker':'luna'})
                self.assertEqual(repeated.json['url'],voice.json['url'])
                self.assertTrue(repeated.json['ai_usage']['cached'])
                self.assertEqual(voice_provider.call_count,1)

    def test_ai_budget_and_feature_limits_still_stop_provider_calls(self):
        self.login()
        with self.app.test_request_context('/api/admin/settings'):
            self.app.extensions['platform_write']('meta_key','test-meta-only')
        cases=[({'image':0},429),({'daily_usd':.001},429),({'platform_daily_usd':.001},429),({'enabled':False},409)]
        with patch('cloudflare_integration.check_token',side_effect=AssertionError('Repeated AI CAPTCHA')), patch('meta_ai.provider_request') as provider:
            for limits,status in cases:
                with self.app.test_request_context('/api/admin/settings'):
                    self.app.extensions['platform_write']('ai_limits',limits)
                result=self.save('/api/ai/image',{'prompt':'A new notebook design'})
                self.assertEqual(result.status_code,status,result.json)
            provider.assert_not_called()

    def test_uploads_are_captcha_free_but_size_type_and_request_limits_remain(self):
        self.login()
        def upload(data, filename):
            return self.client.post('/api/upload', data={'kind': 'image', 'file': (io.BytesIO(data), filename)}, headers={'X-CSRF-Token': self.csrf})
        image = io.BytesIO(); Image.new('RGB', (4, 4)).save(image, format='PNG')
        with patch('cloudflare_integration.check_token', side_effect=AssertionError('Upload CAPTCHA')):
            result = upload(image.getvalue(), 'image.png')
            self.assertEqual(result.status_code, 201, result.json)
            self.assertEqual(upload(b'not an image', 'bad.png').status_code, 400)
            original_limit=self.app.config['MAX_CONTENT_LENGTH']
            self.app.config['MAX_CONTENT_LENGTH']=128
            try: self.assertEqual(upload(b'x'*512, 'large.png').status_code, 413)
            finally: self.app.config['MAX_CONTENT_LENGTH']=original_limit
        with self.client.session_transaction() as session: viewer = session['viewer']
        subject = hmac.new(b'test-auth', viewer.encode(), hashlib.sha256).hexdigest()
        with self.app.app_context():
            db = self.app.extensions['platform_db']()
            with db: db.executemany('INSERT INTO security_limits VALUES (?,?)', [(subject+':upload', time.time())]*10)
        limited = upload(image.getvalue(), 'image.png')
        self.assertEqual(limited.status_code, 429); self.assertEqual(limited.headers['Retry-After'], '60')
        self.assertEqual(self.save('/api/community/preferences', {'theme': 'light'}).status_code, 200)

    def test_unsigned_local_identity_does_not_qualify_for_routine_exemption(self):
        with self.app.app_context(): self.app.extensions['platform_write']('auth_config', {'enabled': False})
        self.app.config.pop('TEST_PLATFORM_USER')
        state = self.client.get('/api/session').json
        self.csrf = state['csrf']
        self.assertEqual(state['security']['captcha_policy']['free_posts'], [])
        self.assertEqual(self.save('/api/community/preferences', {'theme': 'dark'}).status_code, 403)
