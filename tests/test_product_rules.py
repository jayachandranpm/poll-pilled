import io
import json
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch
import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from app import create_app
from poll_rules import quote

class ProductTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.config={'TESTING':True,'SECRET_KEY':'product-test','DATABASE':str(Path(self.tmp.name)/'db'),'UPLOAD_FOLDER':str(Path(self.tmp.name)/'uploads')}
        self.app=create_app(self.config);self.client=self.app.test_client();self.csrf=self.client.get('/api/bootstrap').json['csrf']
    def tearDown(self):self.tmp.cleanup()
    def post(self,path,data,client=None,csrf=None):return (client or self.client).post(path,json=data,headers={'X-CSRF-Token':csrf or self.csrf})
    def create(self,**extra):
        data=dict(title='How much structure should a weekend have?',options=['None','A little','A lot'],mode='interactive',category='Culture',hours=24,data_use_accepted=True)
        data.update(extra);return self.post('/api/polls',data)
    def test_public_identity_is_consistent_and_no_private_ids_escape(self):
        self.post('/api/profile',{'name':'Private Person','bio':'A curious neighbour'})
        p=self.create().json['poll'];self.assertNotIn('owner',p);self.assertNotIn('Private Person',json.dumps(p))
        self.post('/api/polls/'+p['id']+'/takes',{'text':'Some room for surprises.'})
        take=self.client.get('/api/polls/'+p['id']).json['poll']['takes'][0]
        self.assertNotIn('viewer',take);self.assertEqual(take['author'],p['author']);self.assertEqual(take['tagline'],'A curious neighbour')
        self.assertEqual(self.client.get('/api/bootstrap').json['profile']['name'],'Private Person')
    def test_rephrase_unlabelled_generated_components_labelled(self):
        self.assertFalse(self.create(text_origin='rephrased').json['poll']['ai_generated'])
        self.assertTrue(self.create(text_origin='generated').json['poll']['ai_generated'])
        self.assertEqual(self.create(text_origin='random').status_code,400)
    def test_preferences_filter_discover_but_preserve_saved_direct_and_own(self):
        p=self.create(text_origin='generated').json['poll']
        self.post('/api/polls/'+p['id']+'/save',{})
        self.post('/api/preferences',{'generated_content':'hide','poll_formats':['text']})
        self.assertNotIn(p['id'],[p['id'] for p in self.client.get('/api/polls').json['polls']])
        self.assertIn(p['id'],[p['id'] for p in self.client.get('/api/polls?view=saved').json['polls']])
        self.assertEqual(self.client.get('/api/polls/'+p['id']).status_code,200)
        self.assertEqual(self.post('/api/preferences',{'poll_formats':[]}).status_code,400)
    def test_data_terms_required_and_platform_reuse_only_free(self):
        self.assertEqual(self.create(data_use_accepted=False).status_code,400)
        self.assertEqual(self.create().json['poll']['platform_usage'],1)
        self.post('/api/credits/topup',{'credits':250,'idempotency_key':uuid.uuid4().hex})
        paid=self.create(funding='publisher',response_cap=2).json['poll']
        self.assertEqual(paid['platform_usage'],0)
        self.assertEqual(self.client.get('/api/polls/four-day-week').json['poll']['policy_version'],'legacy')
    def test_effort_price_reserved_awarded_once_and_unused_budget_refunded(self):
        self.post('/api/credits/topup',{'credits':250,'idempotency_key':uuid.uuid4().hex})
        p=self.create(funding='publisher',response_cap=2).json['poll']
        expected=quote(dict(title=p['title'],description=p['description'],mode=p['mode'],options=[x['label'] for x in p['options']]))
        self.assertGreater(expected['vote_points'],200)
        other=self.app.test_client();token=other.get('/api/bootstrap').json['csrf']
        for elapsed,reward in [(99999,expected['vote_points']),(1,0)]:
            r=self.post('/api/polls/'+p['id']+'/vote',{'option_id':p['options'][0]['id'],'elapsed_seconds':elapsed},other,token)
            self.assertEqual(r.json['earned_points'],reward)
        self.post('/api/campaigns/'+p['id']+'/status',{'status':'ended'})
        m=self.client.get('/api/marketplace').json['marketplace']
        self.assertEqual(m['credits'],250-expected['vote_points']//100-2)
        export=other.get('/api/account/export').json
        self.assertEqual(export['poll_events'][0]['elapsed_seconds'],3600)
        self.assertNotIn('viewer',export['poll_events'][0])
    def test_audio_ownership_validation(self):
        self.assertEqual(self.create(mode='voice',audio_url='/uploads/not-yours.wav').status_code,400)
    def test_audio_and_visual_provenance_with_owned_uploads(self):
        import wave
        from PIL import Image
        audio=io.BytesIO()
        with wave.open(audio,'wb') as f:
            f.setnchannels(1);f.setsampwidth(2);f.setframerate(8000);f.writeframes(b'\x00\x00'*800)
        url=self.client.post('/api/upload',data={'kind':'audio','file':(io.BytesIO(audio.getvalue()),'test.wav')},headers={'X-CSRF-Token':self.csrf}).json['url']
        p=self.create(mode='voice',audio_url=url,audio_origin='generated').json['poll']
        self.assertEqual(p['audio_url'],url);self.assertTrue(p['ai_generated'])
        images=[]
        for color in ['red','blue','green']:
            output=io.BytesIO();Image.new('RGB',(20,20),color).save(output,'PNG');output.seek(0)
            images.append(self.client.post('/api/upload',data={'kind':'image','file':(output,'choice.png')},headers={'X-CSRF-Token':self.csrf}).json['url'])
        visual=self.create(mode='image',images=images,image_origin='generated').json['poll']
        self.assertTrue(visual['ai_generated']);self.assertEqual(len(visual['options']),3)
        refined=self.create(mode='image',images=images,image_origin='rephrased').json['poll']
        self.assertFalse(refined['ai_generated'])
        self.assertFalse(self.create(mode='voice',audio_origin='generated').json['poll']['ai_generated'])

    def test_rephrase_and_generation_model_contract(self):
        with patch.dict('os.environ',{'MODEL_API_KEY':'test'}):
            with patch('meta_ai.transport',return_value=io.BytesIO(json.dumps({'choices':[{'message':{'content':'How much structure does your ideal weekend need?'}}]}).encode())):
                r=self.post('/api/ai',{'task':'rephrase','prompt':'How structured should my weekend be?'})
                self.assertEqual(r.json['text_origin'],'rephrased')
            draft=dict(title='How much structure should weekends have?',options=['None','Some'])
            with patch('meta_ai.transport',return_value=io.BytesIO(json.dumps({'choices':[{'message':{'content':json.dumps(draft)}}]}).encode())):
                self.assertEqual(self.post('/api/ai',{'task':'draft','prompt':'Weekends'}).json['draft']['text_origin'],'generated')
    def test_turnstile_missing_failure_hostname_action_and_success(self):
        a=create_app({**self.config,'TURNSTILE_SITE_KEY':'public','TURNSTILE_SECRET_KEY':'secret','TURNSTILE_HOSTNAME':'poll.example'})
        c=a.test_client();csrf=c.get('/api/bootstrap').json['csrf'];h={'X-CSRF-Token':csrf,'X-Turnstile-Token':'test-token'}
        self.assertEqual(c.post('/api/profile',json={'name':'Test'},headers={'X-CSRF-Token':csrf}).status_code,403)
        for result,code in [({'success':False},403),({'success':True,'hostname':'other','action':'poll_write'},403),({'success':True,'hostname':'poll.example','action':'login'},403),({'success':True,'hostname':'poll.example','action':'poll_write'},200)]:
            with patch('security.urllib.request.urlopen',return_value=io.BytesIO(json.dumps(result).encode())):
                self.assertEqual(c.post('/api/profile',json={'name':'Test'},headers=h).status_code,code)
        with patch('security.urllib.request.urlopen',side_effect=TimeoutError):
            self.assertEqual(c.post('/api/profile',json={'name':'Test'},headers=h).status_code,503)
        self.assertNotIn('secret',json.dumps(c.get('/api/bootstrap').json))
    def test_access_requires_verified_identity_audience_and_signature(self):
        import time
        private=rsa.generate_private_key(public_exponent=65537,key_size=2048)
        a=create_app({**self.config,'CF_ACCESS_TEAM_DOMAIN':'https://test.cloudflareaccess.com','CF_ACCESS_AUD':'poll-aud'})
        c=a.test_client();claims={'sub':'person-1','iss':'https://test.cloudflareaccess.com','aud':'poll-aud','iat':int(time.time()),'exp':int(time.time())+300}
        with patch('jwt.PyJWKClient.get_signing_key_from_jwt') as key:
            key.return_value.key=private.public_key()
            self.assertEqual(c.get('/api/bootstrap').status_code,401)
            token=jwt.encode(claims,private,algorithm='RS256')
            good=c.get('/api/bootstrap',headers={'Cf-Access-Jwt-Assertion':token})
            self.assertEqual(good.status_code,200)
            self.assertNotIn('person-1',json.dumps(good.json))
            bad=jwt.encode({**claims,'aud':'wrong'},private,algorithm='RS256')
            self.assertEqual(c.get('/api/bootstrap',headers={'Cf-Access-Jwt-Assertion':bad}).status_code,401)
            forged=jwt.encode(claims,rsa.generate_private_key(public_exponent=65537,key_size=2048),algorithm='RS256')
            self.assertEqual(c.get('/api/bootstrap',headers={'Cf-Access-Jwt-Assertion':forged}).status_code,401)
    def test_incomplete_security_configuration_fails_closed(self):
        with self.assertRaises(ValueError):create_app({**self.config,'TURNSTILE_SITE_KEY':'only-key'})
        with self.assertRaises(ValueError):create_app({**self.config,'CF_ACCESS_AUD':'only-aud'})
