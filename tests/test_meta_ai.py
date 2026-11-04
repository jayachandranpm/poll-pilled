from contextlib import closing
import base64
import io
import json
import os
import sqlite3
import tempfile
import unittest
import urllib.error
import wave
from pathlib import Path
from unittest.mock import patch
from PIL import Image
from app import create_app

class MetaTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.env=patch.dict(os.environ,{'MODEL_API_KEY':'','WIT_AI_TOKEN':''});self.env.start()
        self.config=dict(TESTING=True,SECRET_KEY='isolated-meta-test',DATABASE=str(Path(self.tmp.name)/'db'),UPLOAD_FOLDER=str(Path(self.tmp.name)/'uploads'))
        self.app=create_app(self.config);self.c=self.app.test_client();self.csrf=self.c.get('/api/bootstrap').json['csrf']
    def tearDown(self):self.env.stop();self.tmp.cleanup()
    def post(self,path,data,client=None,csrf=None):return (client or self.c).post(path,json=data,headers={'X-CSRF-Token':csrf or self.csrf})
    def key(self,provider='meta'):return self.post('/api/ai/connections',dict(provider=provider,key='private-test-token'))
    def mock(self,result):return patch('meta_ai.transport',side_effect=lambda *a,**k:io.BytesIO(json.dumps(result).encode()))
    def upload_image(self):
        output=io.BytesIO();Image.new('RGB',(32,32),'blue').save(output,'PNG');output.seek(0)
        return self.c.post('/api/upload',data={'kind':'image','file':(output,'choice.png')},headers={'X-CSRF-Token':self.csrf}).json['url']
    def poll(self,**extra):
        data=dict(title='Which of these images works best?',options=['A','B'],category='Design',mode='text',hours=24,data_use_accepted=True)
        data.update(extra);return self.post('/api/polls',data)
    def test_keys_encrypted_scoped_persisted_and_never_exported(self):
        self.assertEqual(self.key().status_code,200)
        for url in ['/api/ai/connections','/api/bootstrap','/api/account/export']:
            self.assertNotIn('private-test-token',self.c.get(url).text)
        with closing(sqlite3.connect(self.config['DATABASE'])) as db:
            encrypted=db.execute('SELECT token FROM ai_connections').fetchone()[0]
            self.assertNotIn(b'private-test-token',encrypted)
        other=self.app.test_client();self.assertFalse(other.get('/api/bootstrap').json['ai_available'])
        with self.mock({'choices':[{'message':{'content':'Ready'}}]}) as call:
            r=self.post('/api/ai/connections/test',{'provider':'meta'})
            self.assertEqual(r.status_code,200);self.assertTrue(r.json['connections']['meta']['checked_at'])
            self.assertEqual(call.call_args.args[0].get_header('Authorization'),'Bearer private-test-token')
        self.assertEqual(self.post('/api/ai/connections',{'provider':'meta','remove':True}).status_code,200)
        self.assertFalse(self.c.get('/api/bootstrap').json['ai_available'])
    def test_key_validation_csrf_and_missing_connections(self):
        self.assertEqual(self.c.post('/api/ai/connections',json={'provider':'meta','key':'a-valid-token'}).status_code,403)
        for value in ['',123,'two words token']:
            self.assertEqual(self.post('/api/ai/connections',{'provider':'meta','key':value}).status_code,400)
        for path,data in [('/api/ai',{'prompt':'workweek'}),('/api/ai/image',{'prompt':'A quiet city'}),('/api/ai/speech',{'text':'Hello'})]:
            self.assertEqual(self.post(path,data).status_code,503)
        for path in ['/api/ai/connections','/api/ai/connections/test','/api/ai/image','/api/ai/vision','/api/ai/transcribe','/api/ai/speech']:
            self.assertEqual(self.post(path,['not an object']).status_code,400)
    def test_provider_errors_never_echo_secrets(self):
        self.key()
        for error,expected in [(urllib.error.HTTPError('https://api.meta.ai',401,'private-test-token',{},None),502),(TimeoutError('private-test-token'),502),(urllib.error.HTTPError('https://api.meta.ai',429,'limit',{},None),503)]:
            with patch('meta_ai.transport',side_effect=error):
                r=self.post('/api/ai',dict(task='rephrase',prompt='Can we try a shorter workweek?'))
                self.assertEqual(r.status_code,expected);self.assertNotIn('private-test-token',r.text)
    def test_vision_uses_only_owned_images_and_meta_chat(self):
        self.key();url=self.upload_image()
        with self.mock({'choices':[{'message':{'content':'A blue square.'}}]}) as call:
            r=self.post('/api/ai/vision',dict(images=[url]));self.assertEqual(r.status_code,200)
            payload=json.loads(call.call_args.args[0].data)
            self.assertEqual(payload['model'],'muse-spark-1.3')
            self.assertTrue(payload['messages'][1]['content'][1]['image_url']['url'].startswith('data:image/jpeg;base64,'))
        other=self.app.test_client();csrf=other.get('/api/bootstrap').json['csrf']
        self.assertEqual(self.post('/api/ai/vision',dict(images=[url]),other,csrf).status_code,400)
        self.assertEqual(self.post('/api/ai/vision',dict(images=['https://example.com/file.png'])).status_code,400)

    def test_meta_draft_accepts_image_region_format(self):
        self.key()
        draft={'title':'Which object catches your eye?','description':'Choose an object.','options':['Notebook','Pencil'],'category':'Design'}
        with self.mock({'choices':[{'message':{'content':json.dumps(draft)}}]}):
            result=self.post('/api/ai',{'task':'draft','format':'regions','prompt':'Compare two objects on a desk.'})
            self.assertEqual(result.status_code,200,result.json)
            self.assertEqual(result.json['draft']['format'],'regions')
            self.assertEqual(result.json['draft']['text_origin'],'generated')
    def test_generated_image_validated_saved_owned_and_label_enforced(self):
        self.key();output=io.BytesIO();Image.new('RGB',(32,32),'green').save(output,'PNG')
        with self.mock({'data':[{'b64_json':base64.b64encode(output.getvalue()).decode()}]}) as call:
            r=self.post('/api/ai/image',dict(prompt='A green square'));self.assertEqual(r.status_code,200)
            self.assertEqual(json.loads(call.call_args.args[0].data)['model'],'muse-image-1.0')
        url=r.json['url']
        with self.c.get(url) as media:self.assertEqual(media.status_code,200)
        poll=self.poll(mode='image',images=[url,url],image_origin='human')
        self.assertEqual(poll.status_code,201);self.assertEqual(poll.json['poll']['image_origin'],'generated')
        with self.mock({'data':[{'b64_json':base64.b64encode(b'not an image').decode()}]}):
            self.assertEqual(self.post('/api/ai/image',dict(prompt='A square')).status_code,502)
    def test_speech_uses_separate_wit_token_and_generated_provenance(self):
        self.key('wit')
        with patch('meta_ai.transport',return_value=io.BytesIO(b'ID3'+b'\x00'*100)) as call:
            r=self.post('/api/ai/speech',dict(text='A question worth asking?'));self.assertEqual(r.status_code,200)
            req=call.call_args.args[0];self.assertEqual(req.full_url,'https://api.wit.ai/synthesize?v=20250213')
            self.assertEqual(req.get_header('Accept'),'audio/mpeg');self.assertEqual(json.loads(req.data)['voice'],'Charlie')
        poll=self.poll(mode='voice',audio_url=r.json['url'],audio_origin='human')
        self.assertEqual(poll.json['poll']['audio_origin'],'generated')
        self.post('/api/polls/four-day-week/vote',dict(option_id='four-day-week-0'))
        take=self.post('/api/polls/four-day-week/takes',dict(audio_url=r.json['url'],text='Generated reading'))
        self.assertEqual(take.status_code,201);self.assertEqual(take.json['earned_points'],0)
        with self.mock({'error':'bad'}):self.assertEqual(self.post('/api/ai/speech',dict(text='Hello')).status_code,502)
        self.assertEqual(self.post('/api/ai/speech',dict(text='x'*281)).status_code,400)
    def test_transcription_converts_to_mono_24k_pcm_and_handles_no_speech(self):
        self.key();clip=io.BytesIO()
        with wave.open(clip,'wb') as f:f.setnchannels(2);f.setsampwidth(2);f.setframerate(8000);f.writeframes(b'\x00'*3200)
        url=self.c.post('/api/upload',data={'kind':'audio','file':(io.BytesIO(clip.getvalue()),'clip.wav')},headers={'X-CSRF-Token':self.csrf}).json['url']
        with self.mock({'transcript':'What do you think?'}) as call:
            r=self.post('/api/ai/transcribe',dict(url=url));self.assertEqual(r.json['transcript'],'What do you think?')
            req=call.call_args.args[0];self.assertEqual(req.full_url,'https://api.meta.ai/v1/asr/transcribe')
            self.assertIn(b'"audioEncoding": "WAV"',req.data)
            start=req.data.index(b'RIFF');end=req.data.rfind(b'\r\n--')
            with wave.open(io.BytesIO(req.data[start:end]),'rb') as f:self.assertEqual((f.getnchannels(),f.getframerate(),f.getsampwidth()),(1,24000,2))
        self.post('/api/ai/cache/clear',{})
        with self.mock({'transcript':''}):self.assertEqual(self.post('/api/ai/transcribe',dict(url=url)).status_code,502)
        with patch('meta_ai.shutil.which',return_value=None):self.assertEqual(self.post('/api/ai/transcribe',dict(url=url)).status_code,503)
    def test_generated_question_cannot_lose_label_when_posted_unchanged(self):
        self.key();draft=dict(title='What should our ideal workweek look like?',options=['Four days','Five days'])
        with self.mock({'choices':[{'message':{'content':json.dumps(draft)}}]}):
            self.assertEqual(self.post('/api/ai',dict(task='draft',prompt='Workweek')).status_code,200)
        poll=self.poll(title=draft['title'],text_origin='human');self.assertEqual(poll.json['poll']['text_origin'],'generated')
        revised='How many days would make your ideal workweek?'
        with self.mock({'choices':[{'message':{'content':revised}}]}):
            r=self.post('/api/ai',dict(task='rephrase',prompt=draft['title']));self.assertEqual(r.json['text_origin'],'generated')
        self.assertEqual(self.poll(title=revised,text_origin='human').json['poll']['text_origin'],'generated')
        with self.mock({'choices':[{'message':{'content':'What is your favorite kind of weekend?'}}]}):
            r=self.post('/api/ai',dict(task='rephrase',prompt='How do you spend a weekend?'));self.assertEqual(r.json['text_origin'],'rephrased')
    def test_environment_key_is_a_fallback_after_workspace_removal(self):
        with patch.dict(os.environ,{'MODEL_API_KEY':'environment-test'}):
            self.key();self.post('/api/ai/connections',dict(provider='meta',remove=True))
            state=self.c.get('/api/ai/connections').json['connections']['meta'];self.assertTrue(state['configured']);self.assertEqual(state['source'],'environment')
    def test_redirect_handler_will_not_forward_authorization(self):
        from meta_ai import NoRedirect
        self.assertIsNone(NoRedirect().redirect_request(None,None,302,'',{},'https://elsewhere.example'))
