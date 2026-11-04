import io
import tempfile
import unittest
import uuid
import wave
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from app import create_app

class MarketplaceTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.app=create_app({'TESTING':True,'SECRET_KEY':'market-test','DATABASE':str(Path(self.tmp.name)/'test.sqlite3'),'UPLOAD_FOLDER':str(Path(self.tmp.name)/'uploads')})
        self.client,self.csrf=self.person()
    def tearDown(self): self.tmp.cleanup()
    def person(self):
        c=self.app.test_client()
        return c,c.get('/api/bootstrap').json['csrf']
    def post(self,path,data=None,person=None):
        c,token=person or (self.client,self.csrf)
        return c.post(path,json=data or {},headers={'X-CSRF-Token':token})
    def market(self,c=None): return (c or self.client).get('/api/marketplace').json['marketplace']
    def vote(self,pid='four-day-week',person=None,choice=0):
        return self.post('/api/polls/'+pid+'/vote',{'option_id':pid+'-'+str(choice)},person)
    def topup(self,credits=250,key=None): return self.post('/api/credits/topup',{'credits':credits,'idempotency_key':key or uuid.uuid4().hex})
    def publish(self,**extra):
        data={'title':'How should our community spend its time?','description':'Please share your perspective.','options':['More conversations','More quiet time'],'mode':'text','category':'Culture','hours':24,'data_use_accepted':True}
        data.update(extra)
        return self.post('/api/polls',data)
    def audio(self,person=None):
        content=io.BytesIO()
        with wave.open(content,'wb') as f:
            f.setnchannels(1);f.setsampwidth(2);f.setframerate(8000);f.writeframes(b'\x00\x00'*800)
        c,token=person or (self.client,self.csrf)
        return c.post('/api/upload',data={'kind':'audio','file':(io.BytesIO(content.getvalue()),'voice.wav')},headers={'X-CSRF-Token':token}).json['url']
    def test_every_seed_poll_funded_without_minting_example_votes(self):
        m=self.market()
        self.assertTrue(m['demo']);self.assertEqual(m['points'],0)
        for p in self.client.get('/api/polls').json['polls']:
            self.assertEqual(p['reward']['points'],200)
            self.assertTrue(p['reward']['eligible'])
            self.assertEqual(p['reward']['remaining'],50)
    def test_vote_switch_and_repeat_earn_once(self):
        self.assertEqual(self.vote().json['earned_points'],200)
        self.assertEqual(self.vote().json['earned_points'],0)
        self.assertEqual(self.vote(choice=1).json['earned_points'],0)
        self.assertEqual(self.market()['points'],200)
        self.assertEqual(self.market()['rewarded_responses'],1)
    def test_voice_bonus_requires_rewarded_vote_and_is_unique(self):
        audio=self.audio()
        data={'text':'Here is my view.','audio_url':audio}
        self.assertEqual(self.post('/api/polls/four-day-week/takes',data).json['earned_points'],0)
        self.assertEqual(self.vote().json['earned_points'],300)
        self.assertEqual(self.post('/api/polls/four-day-week/takes',data).json['earned_points'],0)
        self.assertEqual(self.market()['points'],300)
    def test_voice_after_vote_earns_bonus_once(self):
        self.vote();audio=self.audio()
        data={'audio_url':audio}
        self.assertEqual(self.post('/api/polls/four-day-week/takes',data).json['earned_points'],100)
        self.assertEqual(self.post('/api/polls/four-day-week/takes',data).json['earned_points'],0)
    def test_credit_topup_is_idempotent_and_private(self):
        key=uuid.uuid4().hex
        self.assertEqual(self.topup(key=key).status_code,200)
        self.topup(key=key)
        self.assertEqual(self.market()['credits'],250)
        self.assertEqual(self.topup(500,key).status_code,400)
        other,_=self.person()
        self.assertEqual(self.market(other)['credits'],0)
        self.assertEqual(self.market(other)['credit_history'],[])
    def test_unfunded_campaign_rolls_back_poll_and_options(self):
        r=self.publish(funding='publisher',response_cap=50)
        self.assertEqual(r.status_code,400)
        self.assertEqual(self.client.get('/api/polls?view=mine').json['polls'],[])
        self.assertEqual(len(self.client.get('/api/polls').json['polls']),6)
    def test_target_audience_self_exclusion_and_capacity(self):
        self.topup()
        p=self.publish(funding='publisher',response_cap=1,audience='Design').json['poll']
        self.assertEqual(self.market()['credits'],245)
        self.assertEqual(self.vote(p['id']).json['earned_points'],0)
        a=self.person()
        self.assertEqual(self.vote(p['id'],a).json['earned_points'],0)
        self.post('/api/participant/interests',{'topics':['Design']},a)
        self.assertEqual(self.vote(p['id'],a).json['earned_points'],200)
        b=self.person();self.post('/api/participant/interests',{'topics':['Design']},b)
        self.assertEqual(self.vote(p['id'],b).json['earned_points'],0)
        self.assertEqual(self.market()['campaigns'][0]['completed'],1)
        self.assertEqual(self.market()['points'],0)
    def test_pause_owner_scope_and_refund(self):
        self.topup();p=self.publish(funding='publisher',response_cap=3).json['poll'];pid=p['id']
        other=self.person()
        self.assertEqual(self.post('/api/campaigns/'+pid+'/status',{'status':'ended'},other).status_code,404)
        self.post('/api/campaigns/'+pid+'/status',{'status':'paused'})
        self.assertEqual(self.vote(pid,other).status_code,409)
        self.post('/api/campaigns/'+pid+'/status',{'status':'active'})
        self.assertEqual(self.vote(pid,other).json['earned_points'],200)
        end=self.post('/api/campaigns/'+pid+'/status',{'status':'ended'})
        self.assertEqual(end.json['marketplace']['credits'],246) # 2 reward + 2 fee; unused voice refunded
        self.assertEqual(self.market(other[0])['points'],200)
        self.post('/api/campaigns/'+pid+'/status',{'status':'ended'})
        self.assertEqual(self.market()['credits'],246)
        self.assertEqual(self.post('/api/campaigns/'+pid+'/status',{'status':'active'}).status_code,400)
    def test_redemption_fee_net_and_retry_do_not_double_spend(self):
        for pid in ['four-day-week','ai-best-friend','dream-desk']:self.vote(pid)
        key=uuid.uuid4().hex
        data={'points':500,'idempotency_key':key}
        r=self.post('/api/rewards/redeem',data)
        self.assertEqual(r.status_code,201)
        self.assertEqual(r.json['redemption']['fee'],25)
        self.assertEqual(r.json['redemption']['net'],475)
        self.assertEqual(r.json['redemption']['status'],'simulated')
        self.assertEqual(r.json['marketplace']['points'],100)
        self.post('/api/rewards/redeem',data)
        self.assertEqual(self.market()['points'],100)
        data['idempotency_key']=uuid.uuid4().hex
        self.assertEqual(self.post('/api/rewards/redeem',data).status_code,400)
        self.assertEqual(len(self.market()['redemptions']),1)
    def test_last_reward_place_is_atomic(self):
        self.topup();p=self.publish(funding='publisher',response_cap=1).json['poll']
        people=[self.person(),self.person()]
        with ThreadPoolExecutor(max_workers=2) as pool:
            amounts=list(pool.map(lambda person:self.vote(p['id'],person).json['earned_points'],people))
        self.assertEqual(sorted(amounts),[0,200])
        self.assertEqual(self.market()['campaigns'][0]['completed'],1)
    def test_input_validation_and_csrf(self):
        self.assertEqual(self.client.post('/api/credits/topup',json={'credits':250}).status_code,403)
        for data in [{'credits':-1,'idempotency_key':'test-request-key'},{'credits':250},{'credits':True,'idempotency_key':'test-request-key'}]:
            self.assertEqual(self.post('/api/credits/topup',data).status_code,400)
        self.assertEqual(self.post('/api/participant/interests',{'topics':['Not a topic']}).status_code,400)
        self.assertEqual(self.publish(response_cap=51).status_code,400)
    def test_restart_preserves_balances_and_does_not_mint_twice(self):
        self.vote();self.topup()
        second=create_app(self.app.config)
        with second.test_client() as c:
            with self.client.session_transaction() as original:
                viewer=original['viewer'];csrf=original['csrf']
            with c.session_transaction() as copied:copied['viewer']=viewer;copied['csrf']=csrf
            m=c.get('/api/marketplace').json['marketplace']
            self.assertEqual(m['points'],200);self.assertEqual(m['credits'],250)
