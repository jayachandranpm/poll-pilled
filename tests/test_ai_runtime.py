"""Contract, confidentiality, cost and concurrency checks; never calls Meta."""
import base64
from contextlib import closing
from concurrent.futures import ThreadPoolExecutor
import hashlib
import io
import json
import math
import os
from pathlib import Path
import sqlite3
import stat
import threading
import unittest
from unittest.mock import patch
from cryptography.fernet import Fernet, InvalidToken
from PIL import Image
import test_meta_ai as helpers
from app import create_app

class AILiveTests(unittest.TestCase):
    setUp=helpers.MetaTests.setUp
    tearDown=helpers.MetaTests.tearDown
    post=helpers.MetaTests.post
    key=helpers.MetaTests.key
    mock=helpers.MetaTests.mock
    upload_image=helpers.MetaTests.upload_image

    def completion(self,text='A clearer question?',usage=None):
        return {'choices':[{'message':{'content':text},'finish_reason':'stop'}],**({'usage':usage} if usage else {})}
    def status(self):return self.c.get('/api/ai/connections').json['connections']
    def image_result(self):
        out=io.BytesIO();Image.new('RGB',(32,32),'green').save(out,'PNG')
        return {'data':[{'b64_json':base64.b64encode(out.getvalue()).decode()}]}

    def test_independent_vault_and_file_permissions(self):
        self.key()
        keyfile=Path(self.tmp.name)/'.ai-vault-key'
        self.assertEqual(stat.S_IMODE(keyfile.stat().st_mode),0o600)
        self.assertEqual(stat.S_IMODE(Path(self.config['DATABASE']).stat().st_mode),0o600)
        with closing(sqlite3.connect(self.config['DATABASE'])) as db: encrypted=db.execute('SELECT token FROM ai_connections').fetchone()[0]
        legacy=Fernet(base64.urlsafe_b64encode(hashlib.sha256(b'pollpilled-ai-credentials:isolated-meta-test').digest()))
        with self.assertRaises(InvalidToken):legacy.decrypt(encrypted)
        create_app({**self.config,'SECRET_KEY':'different-cookie-key'})
        self.assertEqual(Fernet(keyfile.read_bytes()).decrypt(encrypted),b'private-test-token')

    def test_session_endpoint_no_key_and_csrf_enforced(self):
        self.key();state=self.c.get('/api/ai/session')
        self.assertEqual(state.json['csrf'],self.csrf)
        self.assertNotIn('private-test-token',state.text)
        self.assertEqual(state.headers['Cache-Control'],'no-store')
        for path in ['/api/ai/preferences','/api/ai/cache/clear','/api/ai/insights']:
            self.assertEqual(self.c.post(path,json={}).status_code,403)

    def test_local_service_rejects_untrusted_hosts(self):
        app=create_app({**self.config,'TESTING':False})
        self.assertEqual(app.test_client().get('/api/ai/connections',base_url='http://evil.example').status_code,403)

    def test_cache_prevents_duplicate_billing_and_encrypts_results(self):
        self.key();payload=dict(task='rephrase',prompt='What is the most useful part of this design?')
        with self.mock(self.completion(usage={'prompt_tokens':200,'completion_tokens':50,'prompt_tokens_details':{'cached_tokens':100}})) as call:
            a=self.post('/api/ai',payload);b=self.post('/api/ai',payload)
            self.assertEqual(a.status_code,200);self.assertTrue(b.json['ai_usage']['cached']);self.assertEqual(call.call_count,1)
            params=json.loads(call.call_args.args[0].data)
            self.assertEqual(params['reasoning_effort'],'minimal');self.assertEqual(params['max_completion_tokens'],700);self.assertFalse(params['store'])
        usage=self.status()['usage'];self.assertEqual(usage['cache_hits'],1);self.assertEqual(usage['cached_input_tokens'],100)
        self.assertAlmostEqual(usage['spent_usd'],.000353,places=6)
        with closing(sqlite3.connect(self.config['DATABASE'])) as db:
            blob=db.execute('SELECT result FROM ai_cache').fetchone()[0]
            self.assertNotIn(b'A clearer question?',blob)
            self.assertNotIn('useful',str(db.execute('SELECT * FROM ai_calls').fetchall()))

    def test_cache_is_session_and_key_scoped(self):
        self.key();data=dict(task='rephrase',prompt='What should we improve this week?')
        with self.mock(self.completion()) as call:
            self.post('/api/ai',data)
            other=self.app.test_client();csrf=other.get('/api/ai/session').json['csrf']
            self.post('/api/ai/connections',dict(provider='meta',key='second-private-key'),other,csrf)
            self.post('/api/ai',data,other,csrf)
            self.post('/api/ai/connections',dict(provider='meta',key='replacement-test-key'))
            self.post('/api/ai',data)
            self.assertEqual(call.call_count,3)

    def test_budget_pause_validation_and_removal(self):
        self.key()
        for limit in [0,-1,101,'1',True,float('inf'),float('nan')]:
            self.assertEqual(self.post('/api/ai/preferences',{'daily_limit':limit}).status_code,400)
        self.post('/api/ai/preferences',dict(daily_limit=.01))
        with self.mock(self.image_result()) as call:
            self.assertEqual(self.post('/api/ai/image',dict(prompt='A first design')).status_code,200)
            self.assertEqual(self.post('/api/ai/image',dict(prompt='A second design')).status_code,429)
            self.assertTrue(self.post('/api/ai/image',dict(prompt='A first design')).json['ai_usage']['cached'])
            self.assertEqual(call.call_count,1)
        self.post('/api/ai/preferences',dict(enabled=False))
        self.assertEqual(self.post('/api/ai/image',dict(prompt='A first design')).status_code,409)
        self.post('/api/ai/connections',dict(provider='meta',remove=True))
        self.assertFalse(self.status()['meta']['configured'])
        with closing(sqlite3.connect(self.config['DATABASE'])) as db:self.assertEqual(db.execute('SELECT COUNT(*) FROM ai_cache').fetchone()[0],0)

    def test_concurrent_duplicate_and_budget_reservations(self):
        self.key();self.post('/api/ai/preferences',dict(daily_limit=.01))
        other=self.app.test_client();other.set_cookie('session',self.c.get_cookie('session').value)
        started=threading.Event();release=threading.Event()
        def provider(*a,**k):started.set();release.wait(5);return self.image_result()
        with patch('meta_ai.provider_request',side_effect=provider),ThreadPoolExecutor(max_workers=2) as pool:
            future=pool.submit(self.post,'/api/ai/image',dict(prompt='A shared design'))
            self.assertTrue(started.wait(3))
            try:
                self.assertEqual(self.post('/api/ai/image',dict(prompt='A shared design'),other,self.csrf).status_code,409)
                self.assertEqual(self.post('/api/ai/image',dict(prompt='A different design'),other,self.csrf).status_code,429)
            finally:release.set()
            self.assertEqual(future.result().status_code,200)

    def test_failures_are_not_cached_or_retried(self):
        self.key()
        with patch('meta_ai.transport',side_effect=TimeoutError('private-test-token')) as call:
            response=self.post('/api/ai',dict(task='rephrase',prompt='Can this question be clearer?'))
            self.assertEqual(response.status_code,502);self.assertEqual(call.call_count,1);self.assertNotIn('private-test-token',response.text)
        self.assertGreater(self.status()['usage']['spent_usd'],0)
        with closing(sqlite3.connect(self.config['DATABASE'])) as db:self.assertEqual(db.execute('SELECT COUNT(*) FROM ai_cache').fetchone()[0],0)

    def test_draft_honors_slider_format_and_provenance(self):
        self.key();draft=dict(title='How useful would this idea be?',description='',options=['Not useful','A little','Somewhat','Very','Essential'],category='Design')
        with self.mock(self.completion(json.dumps(draft))) as call:
            result=self.post('/api/ai',dict(task='draft',prompt='Test usefulness of a new backpack.',format='slider'))
            self.assertEqual(result.status_code,200);self.assertEqual(result.json['draft']['format'],'slider');self.assertEqual(result.json['draft']['text_origin'],'generated')
            self.assertEqual(json.loads(call.call_args.args[0].data)['response_format']['type'],'json_schema')

    def test_insights_validate_evidence_and_cache_changes(self):
        self.key();rows=[dict(id='one',answer=0,text='I carry books.'),dict(id='two',answer=1,text='I want a zip.')]
        brief=dict(themes=[dict(title='Room for books',summary='One person carries books.',sources=['one'])],disagreements=[])
        with self.mock(self.completion(json.dumps(brief))) as call:
            data=dict(question='Which bag would you choose?',responses=rows)
            self.assertEqual(self.post('/api/ai/insights',data).status_code,200)
            self.assertTrue(self.post('/api/ai/insights',data).json['ai_usage']['cached'])
            rows[1]['text']='A zip matters on the train.'
            self.assertEqual(self.post('/api/ai/insights',data).status_code,200);self.assertEqual(call.call_count,2)
        self.post('/api/ai/cache/clear',{})
        brief['themes'][0]['sources']=['invented']
        with self.mock(self.completion(json.dumps(brief))):self.assertEqual(self.post('/api/ai/insights',data).status_code,502)

    def test_segmentation_stream_parsing_and_ownership(self):
        self.key();url=self.upload_image()
        events='data: '+json.dumps(dict(type='response.output_text.delta',delta='<0f>3<|box;x1=2;y1=4;x2=20;y2=24;w=32;h=32|><|mask;x=0;y=0;data=1,1,!test|>'))+'\n\ndata: '+json.dumps(dict(type='response.completed'))+'\n\n'
        with patch('meta_ai.transport',return_value=io.BytesIO(events.encode())) as call:
            result=self.post('/api/ai/segment',dict(url=url,prompt='bag'))
            self.assertEqual(result.status_code,200);self.assertEqual(result.json['boxes'][0]['id'],3);self.assertEqual(result.json['boxes'][0]['x'],2/32)
            self.assertEqual(json.loads(call.call_args.args[0].data)['model'],'sam-3.1')
        self.assertEqual(self.post('/api/ai/segment',dict(url='https://example.com/a.png',prompt='bag')).status_code,400)

    def test_assistant_suggestions_and_tts_capability_are_honest(self):
        self.key();self.assertFalse(self.status()['capabilities']['speech'])
        with self.mock(self.completion('What would make this easier?')) as call:
            self.assertEqual(self.post('/api/ai/assist',dict(task='followup',prompt='Choosing a bag for commuting')).status_code,200)
            self.assertEqual(call.call_count,1)
        self.assertEqual(self.post('/api/ai/assist',dict(task='invented',prompt='Something')).status_code,400)

    def test_malformed_segmentation_coordinates_fail_without_server_error(self):
        self.key();url=self.upload_image()
        events='data: '+json.dumps(dict(type='response.output_text.delta',delta='1<|box;invalid-field|>'))+'\n\ndata: '+json.dumps(dict(type='response.completed'))+'\n\n'
        with patch('meta_ai.transport',return_value=io.BytesIO(events.encode())):
            result=self.post('/api/ai/segment',dict(url=url,prompt='notebook'))
            self.assertEqual(result.status_code,502)
            self.assertIn('unreadable object coordinates',result.json['error'])

if __name__=='__main__':unittest.main()
