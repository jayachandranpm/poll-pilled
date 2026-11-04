import io
import wave
import json
import sqlite3
import tempfile
import unittest
import uuid
from contextlib import closing
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch
from PIL import Image
from app import create_app

class CommunityTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.path=str(Path(self.tmp.name)/'test.sqlite3')
        self.app=create_app({'TESTING':True,'SECRET_KEY':'test','DATABASE':self.path,'UPLOAD_FOLDER':str(Path(self.tmp.name)/'uploads'),'COMMUNITY_MODERATOR_TOKEN':'test-moderator'})
        self.owner=self.client();self.person=self.client()
    def tearDown(self):self.tmp.cleanup()
    def client(self):
        c=self.app.test_client();c.token=c.get('/api/community/state').json['csrf'];return c
    def post(self,c,path,data=None,key=None):
        return c.post('/api/community'+path,json={**(data or {}),'idempotency_key':key or uuid.uuid4().hex},headers={'X-CSRF-Token':c.token})
    def state(self,c):return c.get('/api/community/state').json
    def sql(self,query,args=()):
        with closing(sqlite3.connect(self.path)) as db:
            result=db.execute(query,args).fetchall();db.commit();return result
    def create(self,**kw):
        data=dict(title='Which idea should we build first?',name='Decision',format='classic',circle='design',options=['A better editor','A simpler wallet'],images=[],reach='Community',responses=2,data_use_accepted=True)
        data.update(kw);r=self.post(self.owner,'/publish',data);self.assertEqual(r.status_code,200,r.json);return r.json['id']
    def answer(self,pid,client=None,**kw):
        c=client or self.person
        self.assertEqual(self.post(c,f'/polls/{pid}/claim').status_code,200)
        data=dict(answer=0,text='A clearer editor would save time.',consent=True);data.update(kw)
        r=self.post(c,f'/polls/{pid}/answer',data);self.assertEqual(r.status_code,200,r.json);return r.json['response']['id']
    def accept(self,rid):
        r=self.post(self.owner,f'/responses/{rid}/review',{'action':'accept'});self.assertEqual(r.status_code,200,r.json)
    def topup(self,amount=250):self.assertEqual(self.post(self.owner,'/credits',{'amount':amount}).status_code,200)
    def test_persistence_and_public_identity(self):
        self.post(self.person,'/preferences',{'tagline':'Thoughtfully curious','formats':['classic'],'followups':True})
        self.post(self.person,'/draft',{'draft':{'title':'A persistent question'}})
        s=self.state(self.person);self.assertEqual(s['preferences']['tagline'],'Thoughtfully curious');self.assertEqual(s['draft']['title'],'A persistent question')
        self.assertNotIn('owner',s['polls'][0]);self.assertNotIn('viewer',s['polls'][0]);self.assertNotIn('key',s['ai']['meta'])
    def test_optional_tagline_preserves_identity_and_validates_input(self):
        before=self.state(self.person)['identity']
        self.assertEqual(before['tagline'],'')
        self.assertEqual(self.post(self.person,'/preferences',{'tagline':'A useful idea.','avatar':'river'}).status_code,200)
        self.assertEqual(self.post(self.person,'/preferences',{'tagline':'  '}).status_code,200)
        after=self.state(self.person)['identity']
        self.assertEqual(after['author'],before['author'])
        self.assertEqual(after['tagline'],'')
        self.assertEqual(after['avatar'],'river')
        for invalid in ['x'*71,True,['invalid'],None]:
            self.assertEqual(self.post(self.person,'/preferences',{'tagline':invalid}).status_code,400)
        self.assertEqual(self.state(self.person)['preferences']['tagline'],'')
    def test_rewards_pending_accepted_and_no_self_vote(self):
        pid=self.create();self.assertEqual(self.post(self.owner,f'/polls/{pid}/claim').status_code,409)
        rid=self.answer(pid);self.assertEqual(self.state(self.person)['wallet']['points'],0);self.assertGreater(self.state(self.person)['wallet']['pending'],0)
        self.accept(rid);s=self.state(self.person);self.assertEqual(s['wallet']['pending'],0);self.assertEqual(s['wallet']['points'],200)
        self.post(self.person,f'/polls/{pid}/answer',{'answer':1});self.assertEqual(self.state(self.person)['wallet']['points'],200)
        self.assertEqual(self.post(self.owner,f'/responses/{rid}/review',{'action':'accept'}).status_code,409)
    def test_claim_capacity_concurrent_and_expiration(self):
        pid=self.create(responses=1);other=self.client()
        with ThreadPoolExecutor(2) as pool:
            statuses=list(pool.map(lambda c:self.post(c,f'/polls/{pid}/claim').status_code,[self.person,other]))
        self.assertEqual(sorted(statuses),[200,409])
        self.sql("UPDATE pp_claims SET expires_at='2000-01-01' WHERE poll_id=?",(pid,))
        self.assertEqual(self.post(other,f'/polls/{pid}/claim').status_code,200)
        self.assertEqual(self.post(self.person,f'/polls/{pid}/answer',{'answer':0}).status_code,409)
    def test_full_ranking_and_invalid_answers(self):
        pid=self.create(format='rank',options=['First','Second','Third'])
        self.post(self.person,f'/polls/{pid}/claim')
        for value in [[1,1,0],[0,1],True,[0,1,9]]:self.assertEqual(self.post(self.person,f'/polls/{pid}/answer',{'answer':value}).status_code,400)
        rid=self.answer(pid,answer=[2,0,1]);self.accept(rid)
        p=self.person.get(f'/api/community/polls/{pid}/details').json['poll'];self.assertEqual(p['positions'],[2.0,3.0,1.0]);self.assertEqual(p['totals'],[0,0,1])
    def test_credits_publish_retry_and_unused_refund(self):
        self.topup();pid=self.create(reach='Boost',responses=3);self.assertEqual(self.state(self.owner)['wallet']['credits'],238)
        self.answer(pid);self.post(self.owner,f'/polls/{pid}/status',{'status':'ended'})
        self.assertEqual(self.state(self.owner)['wallet']['credits'],246)
        self.assertEqual(self.post(self.owner,f'/polls/{pid}/status',{'status':'ended'}).status_code,409)
        self.assertEqual(self.state(self.owner)['wallet']['credits'],246)
    def test_idempotency_topup_and_redemption(self):
        key='same-request-1234'
        for _ in range(2):self.assertEqual(self.post(self.owner,'/credits',{'amount':250},key).status_code,200)
        self.assertEqual(self.state(self.owner)['wallet']['credits'],250)
        self.assertEqual(self.post(self.owner,'/credits',{'amount':750},key).status_code,409)
        for pid in ['home','bag']:self.answer(pid)
        for _ in range(2):self.assertEqual(self.post(self.person,'/redeem',{'points':500},'redeem-same-key').status_code,200)
        wallet=self.state(self.person)['wallet'];self.assertEqual(wallet['points'],100);self.assertEqual(wallet['redemptions'][0]['net'],475)
        self.assertEqual(self.post(self.person,'/redeem',{'points':500}).status_code,400)
    def test_access_control_and_review_appeals(self):
        pid=self.create();rid=self.answer(pid);other=self.client()
        self.assertEqual(self.post(other,f'/responses/{rid}/review',{'action':'accept'}).status_code,403)
        self.assertEqual(self.post(other,f'/polls/{pid}/outcome',{'text':'We decided to test this.'}).status_code,403)
        self.post(self.owner,f'/responses/{rid}/review',{'action':'reject','reason':'This response appears unrelated to the question.'})
        self.assertEqual(self.post(other,f'/responses/{rid}/appeal',{'reason':'Please look at this again.'}).status_code,404)
        self.assertEqual(self.post(self.person,f'/responses/{rid}/appeal',{'reason':'My response explains my choice clearly.'}).status_code,200)
        self.assertEqual(self.post(self.person,f'/moderation/{rid}',{'action':'accept','reason':'Response answers the question correctly.'}).status_code,403)
        r=self.owner.post(f'/api/community/moderation/{rid}',json={'action':'accept','reason':'Response answers the question correctly.'},headers={'X-CSRF-Token':self.owner.token,'X-Moderator-Token':'test-moderator'})
        self.assertEqual(r.status_code,200,r.json);self.assertEqual(self.state(self.person)['wallet']['points'],200)
    def test_pending_automatic_release_and_expired_refunds(self):
        self.topup();pid=self.create(reach='Boost',responses=3);self.answer(pid)
        self.sql("UPDATE pp_responses SET created_at='2000-01-01' WHERE poll_id=?",(pid,))
        self.sql("UPDATE pp_polls SET closes_at='2000-01-01' WHERE id=?",(pid,))
        self.assertEqual(self.state(self.person)['wallet']['points'],200)
        self.assertEqual(self.state(self.owner)['wallet']['credits'],246)
    def test_followups_consent_payment_idempotence_refund(self):
        self.topup();pid=self.create();rid=self.answer(pid);self.accept(rid)
        self.assertEqual(self.post(self.owner,f'/polls/{pid}/followups',{'question':'What would you change first?','response_ids':[rid]}).status_code,400)
        self.post(self.person,'/preferences',{'followups':True})
        data={'question':'What would you change first?','response_ids':[rid]}
        result=self.post(self.owner,f'/polls/{pid}/followups',data,'followup-request');self.assertEqual(result.status_code,200,result.json);fid=result.json['id']
        self.post(self.owner,f'/polls/{pid}/followups',data,'followup-request');self.assertEqual(self.state(self.owner)['wallet']['credits'],248)
        self.assertEqual(self.post(self.client(),f'/followups/{fid}/answer',{'text':'More clarity in the controls.'}).status_code,404)
        for _ in range(2):self.post(self.person,f'/followups/{fid}/answer',{'text':'More clarity in the controls.'})
        self.assertEqual(self.state(self.person)['wallet']['points'],300)
        self.post(self.owner,f'/followups/{fid}/close');self.assertEqual(self.state(self.owner)['wallet']['credits'],248)
        fid=self.post(self.owner,f'/polls/{pid}/followups',data).json['id'];self.post(self.owner,f'/followups/{fid}/close');self.assertEqual(self.state(self.owner)['wallet']['credits'],248)
    def test_audio_ownership_and_private_response(self):
        pid=self.create();self.post(self.person,f'/polls/{pid}/claim')
        self.assertEqual(self.post(self.person,f'/polls/{pid}/answer',{'answer':0,'audio':'https://example.com/test.mp3'}).status_code,400)
        audio=io.BytesIO()
        with wave.open(audio,'wb') as wav:
            wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(8000);wav.writeframes(b'\0'*16000)
        audio.seek(0)
        r=self.person.post('/api/upload',data={'file':(audio,'test.wav'),'kind':'audio'},headers={'X-CSRF-Token':self.person.token})
        url=r.json['url'];rid=self.answer(pid,audio=url,public_audio=False);self.accept(rid)
        stranger=self.client();detail=stranger.get(f'/api/community/polls/{pid}/details').json
        self.assertEqual(detail['responses'],[])
        self.assertEqual(self.owner.get(f'/api/community/polls/{pid}/details').json['responses'][0]['audio'],url)
    def test_reuse_provenance_and_preferences_validation(self):
        self.assertEqual(self.post(self.person,'/preferences',{'formats':[]}).status_code,400)
        self.assertEqual(self.post(self.person,'/preferences',{'followups':'true'}).status_code,400)
        pid=self.create(text_origin='rephrased');p=self.owner.get(f'/api/community/polls/{pid}/details').json['poll'];self.assertFalse(p['ai']);self.assertTrue(p['platform_usage'])
        pid=self.create(text_origin='generated');self.assertTrue(self.owner.get(f'/api/community/polls/{pid}/details').json['poll']['ai'])
    def test_insights_evidence_validation(self):
        self.assertEqual(self.post(self.owner,'/polls/home/insights').status_code,403)
        pid=self.create();r1=self.answer(pid);self.accept(r1);r2=self.answer(pid,self.client(),answer=1,text='Wallet clarity matters more to me.');self.accept(r2)
        valid={'themes':[{'title':'Clarity','summary':'Both value clarity.','sources':[r1,r2]}],'disagreements':[{'title':'Different priorities','summary':'One values the editor, another the wallet.','sources':[r1,r2]}]}
        with patch('meta_ai.provider_request',return_value={'choices':[{'message':{'content':json.dumps(valid)}}]}) as provider,patch.dict('os.environ',{'MODEL_API_KEY':'test-token'}):
            self.assertEqual(self.post(self.owner,f'/polls/{pid}/insights').status_code,200)
            self.owner.post('/api/ai/cache/clear',json={},headers={'X-CSRF-Token':self.owner.token})
            valid['themes'][0]['sources']=['invented']
            provider.return_value={'choices':[{'message':{'content':json.dumps(valid)}}]}
            self.assertEqual(self.post(self.owner,f'/polls/{pid}/insights').status_code,502)
    def test_boost_preserves_community_escrow(self):
        pid=self.create(responses=3);rid=self.answer(pid);pool_before=self.state(self.owner)['pool'];self.topup()
        self.assertEqual(self.post(self.owner,f'/polls/{pid}/boost',{'responses':4}).status_code,200)
        self.assertEqual(self.state(self.owner)['pool'],pool_before+400)
        self.post(self.owner,f'/polls/{pid}/status',{'status':'ended'})
        self.assertEqual(self.state(self.owner)['wallet']['credits'],250)
        self.accept(rid);self.assertEqual(self.state(self.person)['wallet']['points'],200)
    def test_outcomes_export_csrf_and_referral_guard(self):
        pid=self.create();self.answer(pid);self.post(self.owner,f'/polls/{pid}/outcome',{'text':'We are improving the editor based on your feedback.'})
        self.assertEqual(len(self.state(self.person)['updates']),1)
        self.assertEqual(len(self.state(self.client())['updates']),0)
        self.assertEqual(self.person.post('/api/community/preferences',json={}).status_code,403)
        self.assertEqual(self.owner.get('/api/community/export').json['responses'],[])
        new=self.client();code=self.state(self.owner)['referral']['code'];self.post(new,'/referral',{'code':code})
        for pid in ['home','bag','week']:self.answer(pid,new)
        self.assertEqual(self.state(self.owner)['referral']['qualified'],0)
    def test_invalid_publish_rolls_back_pool(self):
        before=self.state(self.owner)['pool'];r=self.post(self.owner,'/publish',dict(title='A question for everyone?',format='classic',circle='design',options=['One','Two'],reach='Community',responses=2,hours=0,data_use_accepted=True))
        self.assertEqual(r.status_code,400);self.assertEqual(self.state(self.owner)['pool'],before)

    def test_publish_idempotency_and_claim_restore(self):
        data=dict(title='A durable funded community question?',format='classic',circle='design',options=['Yes','No'],reach='Community',responses=1,data_use_accepted=True)
        before=self.state(self.owner)['pool']
        first=self.post(self.owner,'/publish',data,'publish-retry-123').json
        second=self.post(self.owner,'/publish',data,'publish-retry-123').json
        self.assertEqual(first,second);self.assertEqual(self.state(self.owner)['pool'],before-200)
        pid=first['id'];self.post(self.person,f'/polls/{pid}/claim')
        p=self.person.get(f'/api/community/polls/{pid}/details').json['poll']
        self.assertEqual(p['remaining'],0);self.assertIsNotNone(p['claim'])
        self.assertEqual(self.post(self.person,'/quote',{'options':None}).status_code,400)

    def test_declined_community_slot_then_boost_refund(self):
        pid=self.create(responses=3);rid=self.answer(pid)
        self.post(self.owner,f'/responses/{rid}/review',{'action':'reject','reason':'This is a specific objective quality concern.'})
        result=self.app.test_cli_runner().invoke(args=['community-review',rid,'--decision','decline','--reason','Independent evidence confirms this response is invalid.'])
        self.assertEqual(result.exit_code,0,result.output)
        self.topup();self.post(self.owner,f'/polls/{pid}/boost',{'responses':4})
        self.post(self.owner,f'/polls/{pid}/status',{'status':'ended'})
        self.assertEqual(self.state(self.owner)['wallet']['credits'],250)

    def test_known_generated_images_cannot_lose_label(self):
        pid=self.create(format='visual',images=['/assets/tote.png','/assets/crossbody.png'],image_origin='human')
        p=self.owner.get(f'/api/community/polls/{pid}/details').json['poll']
        self.assertEqual(p['image_origin'],'generated');self.assertTrue(p['ai'])

    def test_ai_transcript_privacy_and_brief_persistence(self):
        pid=self.create();rid=self.answer(pid);self.accept(rid)
        # Isolate provider behavior; the uploaded media ownership/decoder path has a separate test.
        self.sql("UPDATE pp_responses SET audio='/uploads/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.wav' WHERE id=?",(rid,))
        stranger=self.client()
        self.assertEqual(self.post(stranger,f'/responses/{rid}/transcribe').status_code,403)
        clip=io.BytesIO()
        with wave.open(clip,'wb') as wav:
            wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(24000);wav.writeframes(b'\0'*4800)
        with patch('meta_ai.wav_audio',return_value=clip.getvalue()),patch('meta_ai.provider_request',return_value={'transcript':'A private voice explanation.'}),patch.dict('os.environ',{'MODEL_API_KEY':'test-token'}):
            self.assertEqual(self.post(self.owner,f'/responses/{rid}/transcribe').status_code,200)
        self.assertEqual(stranger.get(f'/api/community/polls/{pid}/details').json['responses'],[])
        self.assertEqual(self.owner.get(f'/api/community/polls/{pid}/details').json['responses'][0]['transcript'],'A private voice explanation.')

    def test_poll_results_are_locked_until_answer_and_reactions_require_participation(self):
        pid=self.create();rid=self.answer(pid);self.accept(rid)
        stranger=self.client()
        p=stranger.get(f'/api/community/polls/{pid}/details').json
        self.assertFalse(p['poll']['results_unlocked']);self.assertEqual(p['poll']['totals'],[]);self.assertEqual(p['poll']['responses'],0);self.assertEqual(p['responses'],[])
        self.assertEqual(self.post(stranger,f'/polls/{pid}/react',{'reaction':'helpful'}).status_code,403)
        self.assertEqual(self.post(self.person,f'/polls/{pid}/react',{'reaction':'helpful'}).status_code,200)
        self.post(self.person,f'/polls/{pid}/react',{'reaction':'helpful'})
        p=self.person.get(f'/api/community/polls/{pid}/details').json['poll'];self.assertEqual(p['totals'],[1,0]);self.assertEqual(p['reactions'],{'helpful':1})
        self.post(self.person,f'/polls/{pid}/react',{'reaction':'surprising'})
        self.assertEqual(self.person.get(f'/api/community/polls/{pid}/details').json['poll']['reactions'],{'surprising':1})
        self.assertEqual(self.post(self.person,f'/polls/{pid}/comments',{'text':'No comments'}).status_code,410)
    def test_allocation_requires_100_points_and_reports_are_private_idempotent(self):
        pid=self.create(format='allocation',options=['Focus','Collaboration','Rest'],tags=['work','wellbeing'])
        self.post(self.person,f'/polls/{pid}/claim')
        for value in [[50,20,20],[50,True,49],[-10,50,60],[100],0]:
            self.assertEqual(self.post(self.person,f'/polls/{pid}/answer',{'answer':value}).status_code,400)
        rid=self.answer(pid,answer=[60,20,20]);self.accept(rid)
        p=self.person.get(f'/api/community/polls/{pid}/details').json['poll'];self.assertEqual(p['totals'],[60,20,20]);self.assertEqual(p['responses'],1);self.assertEqual(p['tags'],['work','wellbeing'])
        for _ in range(2):self.assertEqual(self.post(self.person,f'/polls/{pid}/report',{'reason':'Misleading','detail':'Please review the question.'}).status_code,200)
        self.assertEqual(self.sql('SELECT COUNT(*) FROM pp_reports WHERE poll_id=?',(pid,))[0][0],1)
        self.assertTrue(self.person.get(f'/api/community/polls/{pid}/details').json['poll']['reported'])
        self.assertFalse(self.owner.get(f'/api/community/polls/{pid}/details').json['poll']['reported'])
    def test_known_generated_answer_audio_cannot_remove_ai_label(self):
        pid=self.create();audio=io.BytesIO()
        with wave.open(audio,'wb') as wav:
            wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(8000);wav.writeframes(b'\0'*16000)
        audio.seek(0)
        url=self.person.post('/api/upload',data={'file':(audio,'generated.wav'),'kind':'audio'},headers={'X-CSRF-Token':self.person.token}).json['url']
        filename=url.split('/')[-1];who=self.sql('SELECT viewer FROM uploads WHERE filename=?',(filename,))[0][0]
        self.sql('INSERT INTO ai_assets VALUES (?,?,?)',(filename,who,'audio'))
        self.assertEqual(self.person.get(url,buffered=True).status_code,200)
        self.assertEqual(self.owner.get(url).status_code,404)
        self.answer(pid,audio=url,audio_origin='human')
        self.assertEqual(self.person.get(f'/api/community/polls/{pid}/details').json['poll']['my_response']['audio_origin'],'generated')
        self.assertEqual(self.owner.get(url,buffered=True).status_code,200)
        self.assertEqual(self.client().get(url).status_code,404)
        self.assertEqual(self.person.get(url,buffered=True).headers['Cache-Control'],'private, no-store')

    def test_video_validation_ownership_and_public_question_audio(self):
        clip=Path(__file__).resolve().parents[1]/'prototype/public/assets/poll-preview-a.mp4'
        r=self.owner.post('/api/upload',data={'file':(io.BytesIO(clip.read_bytes()),'clip.mp4'),'kind':'video'},headers={'X-CSRF-Token':self.owner.token})
        self.assertEqual(r.status_code,201,r.json);url=r.json['url']
        pid=self.create(format='video',videos=[url,url],video_descriptions=['First animation','Second animation'],video_origin='generated')
        self.assertEqual(self.person.get(f'/api/community/polls/{pid}/details').json['poll']['video_origin'],'generated')
        bad=self.owner.post('/api/upload',data={'file':(io.BytesIO(b'not a movie'),'bad.mp4'),'kind':'video'},headers={'X-CSRF-Token':self.owner.token})
        self.assertEqual(bad.status_code,400)
        with patch('subprocess.run') as probe:
            probe.return_value.stdout=json.dumps({'format':{'duration':'61'},'streams':[{'codec_type':'video'}]})
            long=self.owner.post('/api/upload',data={'file':(io.BytesIO(clip.read_bytes()),'long.mp4'),'kind':'video'},headers={'X-CSRF-Token':self.owner.token})
            self.assertEqual(long.status_code,400)
        data=dict(title='Which clip do you prefer?',format='video',circle='design',options=['A','B'],videos=[url,url],video_descriptions=['A description','B description'],reach='Community',responses=2,data_use_accepted=True)
        self.assertEqual(self.post(self.person,'/publish',data).status_code,403)
        self.assertEqual(self.post(self.owner,'/publish',{**data,'video_descriptions':['A description','']}).status_code,400)
        audio=io.BytesIO()
        with wave.open(audio,'wb') as wav:
            wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(8000);wav.writeframes(b'\0'*16000)
        audio.seek(0)
        audio_url=self.owner.post('/api/upload',data={'file':(audio,'question.wav'),'kind':'audio'},headers={'X-CSRF-Token':self.owner.token}).json['url']
        self.assertEqual(self.person.get(audio_url).status_code,404)
        self.create(format='audio',audio=audio_url,transcript='Which idea should we build first?')
        self.assertEqual(self.person.get(audio_url,buffered=True).status_code,200)

if __name__=='__main__':unittest.main()
