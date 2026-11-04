import io
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from contextlib import closing
from app import create_app
from PIL import Image

class CreatorStudioTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        self.app=create_app(dict(TESTING=True,SECRET_KEY='studio-test',DATABASE=str(self.root/'test.db'),UPLOAD_FOLDER=str(self.root/'uploads'),PLATFORM_MODE=True,TEST_PLATFORM_USER=dict(user_id='admin',email_id='jayachandranpm2001@gmail.com',is_confirmed=True)))
        self.c=self.app.test_client();self.csrf=self.c.get('/api/community/state').json['csrf']
        self.post('/api/admin/settings',{'meta_key':'test-meta-key-only'})
    def tearDown(self): self.tmp.cleanup()
    def post(self,path,body):return self.c.post(path,json=body,headers={'X-CSRF-Token':self.csrf})
    def model(self,value):return patch('meta_ai.transport',side_effect=lambda *a,**kw:io.BytesIO(json.dumps({'choices':[{'message':{'content':json.dumps(value)}}]}).encode()))
    def proposal(self,**extra):
        return dict(title='Which feature should we build next?',format='rank',options=['Search','Offline access','Export'],rationale='Ranking shows relative priorities.',instructions='Move the most useful feature to the top.',tags=['technology'],image_prompts=[],transcript='',**extra)
    def connect_voice(self):return self.post('/api/cloudflare/voice',{'account_id':'a'*32,'token':'test-worker-token-only-12345'})
    def test_proposal_cached_strict_and_provenance_survives_rephrase(self):
        p=self.proposal()
        with self.model(p) as provider:
            r=self.post('/api/ai/studio',{'brief':'Help prioritize features for our app.'});self.assertEqual(r.status_code,200,r.json)
            self.assertEqual(r.json['proposal']['text_origin'],'generated')
            self.assertTrue(self.post('/api/ai/studio',{'brief':'Help prioritize features for our app.'}).json['ai_usage']['cached'])
            self.assertEqual(provider.call_count,1)
        with patch('meta_ai.transport',return_value=io.BytesIO(json.dumps({'choices':[{'message':{'content':'Which app feature matters most to you?'}}]}).encode())):
            r=self.post('/api/ai',{'task':'rephrase','prompt':p['title']});self.assertEqual(r.json['text_origin'],'generated')
        with patch('meta_ai.transport',return_value=io.BytesIO(json.dumps({'choices':[{'message':{'content':'How do you spend your weekend?'}}]}).encode())):
            r=self.post('/api/ai',{'task':'rephrase','prompt':'What do you do on weekends?'});self.assertEqual(r.json['text_origin'],'rephrased')
        with patch('meta_ai.transport',return_value=io.BytesIO(json.dumps({'choices':[{'message':{'content':'Which edited feature is most useful?'}}]}).encode())):
            r=self.post('/api/ai',{'task':'rephrase','prompt':'A manually edited AI-generated question?', 'text_origin':'generated'});self.assertEqual(r.json['text_origin'],'generated')
    def test_invalid_model_output_cannot_become_a_poll(self):
        for change in [{'options':['Same','Same']},{'format':'javascript'},{'format':'slider'},{'tags':['secret']},{'image_prompts':['Unexpected image']},{'title':'x'}]:
            with self.model({**self.proposal(),**change}):
                self.assertEqual(self.post('/api/ai/studio',{'brief':'Prioritize features','format':'auto'}).status_code,502,change)
        with self.model(self.proposal()):
            self.assertEqual(self.post('/api/ai/studio',{'brief':'Prioritize features','format':'classic'}).status_code,502)
        with patch('meta_ai.transport') as provider:
            for d in [[],{'brief':'x'},{'brief':'Valid words','language':'not-real'},{'brief':'Valid words','images':['https://example.com/private.png']}]:
                self.assertEqual(self.post('/api/ai/studio',d).status_code,400)
            provider.assert_not_called()
    def test_visual_proposal_uses_owned_image_and_consistent_prompt_plan(self):
        out=io.BytesIO();Image.new('RGB',(20,20),'blue').save(out,'PNG');out.seek(0)
        url=self.c.post('/api/upload',data={'kind':'image','file':(out,'ref.png')},headers={'X-CSRF-Token':self.csrf}).json['url']
        p={**self.proposal(),'format':'ab','options':['Blue packaging','Green packaging'],'image_prompts':['Blue box on a white desk, front view.','Green box on a white desk, front view.']}
        with self.model(p) as provider:
            r=self.post('/api/ai/studio',{'brief':'Compare packaging colors','format':'ab','images':[url]});self.assertEqual(r.status_code,200,r.json)
            payload=json.loads(provider.call_args.args[0].data)
            self.assertTrue(payload['messages'][1]['content'][1]['image_url']['url'].startswith('data:image/jpeg;base64,'))
            self.assertFalse(any(u.startswith('/uploads/') for u in r.json['proposal']['image_prompts']))
        self.app.config['TEST_PLATFORM_USER']={'user_id':'other','email_id':'other@example.com'}
        self.csrf=self.c.get('/api/community/state').json['csrf']
        self.assertEqual(self.post('/api/ai/studio',{'brief':'Compare packaging','images':[url]}).status_code,400)
    def test_review_never_changes_authorship_or_saved_draft(self):
        review={'summary':'Clear question. Consider a broader answer set.','findings':[{'issue':'Missing alternative','suggestion':'Offer a none-of-these choice.'}]}
        with self.model(review):
            r=self.post('/api/ai/studio/review',{'title':'Which feature matters most?','options':['Search','Export'],'format':'classic'});self.assertEqual(r.json['review'],review)
        with closing(sqlite3.connect(self.root/'test.db')) as db:self.assertEqual(db.execute('SELECT COUNT(*) FROM ai_drafts').fetchone()[0],0)
    def test_voice_admin_secret_shared_service_not_shared_private_audio(self):
        self.assertEqual(self.connect_voice().status_code,200)
        self.assertNotIn('test-worker-token',self.c.get('/api/cloudflare/settings').text)
        self.assertNotIn(b'test-worker-token',(self.root/'test.db').read_bytes())
        self.app.config['TEST_PLATFORM_USER']={'user_id':'person','email_id':'person@example.com'}
        self.csrf=self.c.get('/api/community/state').json['csrf']
        voices=self.c.get('/api/cloudflare/voices');self.assertTrue(voices.json['configured']);self.assertEqual(len(voices.json['voices']),12)
        self.assertNotIn('account_id',voices.text);self.assertNotIn('token',voices.text)
        self.assertEqual(self.post('/api/cloudflare/voice',{'remove':True}).status_code,403)
        self.assertEqual(self.c.get('/api/cloudflare/settings').status_code,403)
        with patch('cloudflare_integration.transport',return_value=io.BytesIO(b'ID3'+b'\0'*100)) as provider, patch('cloudflare_integration.persist_media') as storage:
            r=self.post('/api/cloudflare/speech',{'text':'This is my personal answer.','speaker':'iris'});self.assertEqual(r.status_code,200,r.json)
            again=self.post('/api/cloudflare/speech',{'text':'This is my personal answer.','speaker':'iris'})
            self.assertTrue(again.json['ai_usage']['cached']);self.assertEqual(provider.call_count,1);self.assertEqual(storage.call_count,1)
            self.assertEqual(r.json['audio_origin'],'generated')
        self.app.config['TEST_PLATFORM_USER']={'user_id':'other','email_id':'other@example.com'}
        self.csrf=self.c.get('/api/community/state').json['csrf']
        self.assertNotEqual(self.c.get(r.json['url']).status_code,200)
    def test_voice_daily_limit_and_failed_storage_no_orphan_record(self):
        self.connect_voice()
        with self.app.app_context():self.app.extensions['platform_write']('ai_limits',{'speech':0})
        with patch('cloudflare_integration.transport') as provider:
            self.assertEqual(self.post('/api/cloudflare/speech',{'text':'Say this sentence','speaker':'luna'}).status_code,429);provider.assert_not_called()
        with self.app.app_context():self.app.extensions['platform_write']('ai_limits',{'speech':10})
        from catalyst_storage import StorageUnavailable
        with patch('cloudflare_integration.transport',return_value=io.BytesIO(b'ID3'+b'\0'*100)),patch('cloudflare_integration.persist_media',side_effect=StorageUnavailable('Storage unavailable')):
            self.assertEqual(self.post('/api/cloudflare/speech',{'text':'Say this sentence','speaker':'luna'}).status_code,503)
        with closing(sqlite3.connect(self.root/'test.db')) as db:self.assertEqual(db.execute('SELECT COUNT(*) FROM ai_assets').fetchone()[0],0)
        self.assertEqual(list((self.root/'uploads').glob('*.mp3')),[])

    def test_generated_voice_cannot_be_mislabeled_in_a_poll_or_response(self):
        self.connect_voice()
        with patch('cloudflare_integration.transport',return_value=io.BytesIO(b'ID3'+b'\0'*100)):
            audio=self.post('/api/cloudflare/speech',{'text':'Listen to this question.','speaker':'luna'}).json['url']
        poll=dict(title='Which feature should come first?',format='audio',circle='design',options=['Search','Export'],audio=audio,transcript='Listen to this question.',audio_origin='human',reach='Community',responses=2,data_use_accepted=True,idempotency_key='publish-audio-test')
        with patch('community.validate_clip'):
            result=self.post('/api/community/publish',poll);self.assertEqual(result.status_code,200,result.json)
        pid=result.json['id'];published=self.c.get(f'/api/community/polls/{pid}/details').json['poll']
        self.assertEqual(published['audio_origin'],'generated');self.assertTrue(published['ai'])
        self.app.config['TEST_PLATFORM_USER']={'user_id':'person','email_id':'person@example.com'}
        self.csrf=self.c.get('/api/community/state').json['csrf']
        with patch('cloudflare_integration.transport',return_value=io.BytesIO(b'ID3'+b'\0'*100)):
            audio=self.post('/api/cloudflare/speech',{'text':'Here is my opinion.','speaker':'iris'}).json['url']
        self.assertEqual(self.post(f'/api/community/polls/{pid}/claim',{}).status_code,200)
        with patch('community.validate_clip'):
            result=self.post(f'/api/community/polls/{pid}/answer',dict(answer=0,audio=audio,audio_origin='human',text='My perspective',idempotency_key='answer-audio-test'))
        self.assertEqual(result.status_code,200,result.json);self.assertEqual(result.json['response']['audio_origin'],'generated')
