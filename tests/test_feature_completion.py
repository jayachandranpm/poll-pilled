import json
import unittest
from unittest.mock import patch
import test_community as helpers
from community_rules import preference_statistics, pairwise_result, validate_regions

class FeatureCompletionTests(unittest.TestCase):
    setUp=helpers.CommunityTests.setUp
    tearDown=helpers.CommunityTests.tearDown
    client=helpers.CommunityTests.client
    post=helpers.CommunityTests.post
    state=helpers.CommunityTests.state
    sql=helpers.CommunityTests.sql
    create=helpers.CommunityTests.create
    answer=helpers.CommunityTests.answer
    accept=helpers.CommunityTests.accept
    topup=helpers.CommunityTests.topup
    def test_settlement_endpoint_requires_scoped_secret(self):
        from deployment import settlement_key
        self.assertEqual(self.owner.post('/internal/settlement').status_code,404)
        self.assertEqual(self.owner.get('/internal/settlement').status_code,404)
        r=self.owner.post('/internal/settlement',headers={'X-Settlement-Key':settlement_key(self.app)})
        self.assertEqual(r.status_code,200,r.json)

    def test_publishing_removes_only_its_own_draft(self):
        self.post(self.owner,'/draft',{'draft':{'deck_drafts':[{'id':'a','title':'Keep this draft'},{'id':'b','title':'Publish this draft'}]}})
        self.create(draft_id='b')
        self.assertEqual(self.state(self.owner)['draft']['deck_drafts'],[{'id':'a','title':'Keep this draft'}])
    def test_tags_and_granular_preferences_and_avatar(self):
        self.post(self.person,'/preferences',{'interests':['technology'],'avatar':'river','generated_images':False,'country':'India','age_band':'25–34'})
        pid=self.create(circle='technology',tags=['technology','travel'])
        state=self.state(self.person);self.assertEqual(state['polls'][0]['id'],pid)
        self.assertEqual(state['identity']['avatar'],'river');self.assertFalse(state['preferences']['generated_images'])
        self.assertEqual(self.post(self.person,'/preferences',{'avatar':'../../private'}).status_code,400)
    def test_pairwise_round_validation_and_locked_results(self):
        pid=self.create(format='pairwise',options=['A','B','C'])
        rounds=[dict(a=0,b=1,winner=1),dict(a=0,b=2,winner=2),dict(a=1,b=2,winner=1)]
        self.post(self.person,f'/polls/{pid}/claim')
        self.assertEqual(self.post(self.person,f'/polls/{pid}/answer',{'answer':{'rounds':rounds[:-1]}}).status_code,400)
        rid=self.answer(pid,answer={'rounds':rounds});self.accept(rid)
        self.assertEqual(self.owner.get(f'/api/community/polls/{pid}/details').json['poll']['totals'],[0,2,1])
        self.assertEqual(self.client().get(f'/api/community/polls/{pid}/details').json['poll']['totals'],[])
    def test_region_validation_and_answer(self):
        regions=[dict(x=.1,y=.1,width=.3,height=.3),dict(x=.5,y=.5,width=.3,height=.3)]
        pid=self.create(format='regions',images=['/assets/tote.png'],regions=regions)
        rid=self.answer(pid,answer=1);self.accept(rid)
        self.assertEqual(self.person.get(f'/api/community/polls/{pid}/details').json['poll']['totals'],[0,1])
        with self.assertRaises(ValueError):validate_regions([{**regions[0],'x':.99},regions[1]],2)
    def test_ab_assignment_statistics_and_exposure_privacy(self):
        pid=self.create(format='ab',images=['/assets/tote.png','/assets/crossbody.png'])
        p=self.person.get(f'/api/community/polls/{pid}/details').json['poll'];self.assertIsNone(p['ab_statistics']);self.assertEqual(p['ab_exposures'],{})
        order=p['presentation_order'];self.post(self.person,f'/polls/{pid}/claim')
        self.assertEqual(self.person.get(f'/api/community/polls/{pid}/details').json['poll']['presentation_order'],order)
        rid=self.answer(pid);self.accept(rid)
        p=self.owner.get(f'/api/community/polls/{pid}/details').json['poll'];self.assertEqual(p['ab_statistics']['n'],1);self.assertEqual(sum(p['ab_exposures'].values()),1)
        self.assertFalse(p['ab_statistics']['clear_preference']);self.assertTrue(preference_statistics([40,0])['clear_preference'])
    def test_targeting_enforced_before_claim_and_forecast(self):
        pid=self.create(targeting={'country':['India'],'age_band':['25–34']})
        self.assertEqual(self.post(self.person,f'/polls/{pid}/claim').status_code,409)
        self.post(self.person,'/preferences',{'country':'India','age_band':'25–34'})
        self.assertEqual(self.post(self.person,f'/polls/{pid}/claim').status_code,200)
        d=self.post(self.owner,'/audience-preview',{'targeting':{'country':['India'],'age_band':['25–34']},'tags':['design'],'language':'English'}).json
        self.assertEqual(d['matching_accounts'],1);self.assertFalse(d['guaranteed'])
    def test_notifications_private_and_read_persisted(self):
        pid=self.create();rid=self.answer(pid);self.accept(rid)
        notices=self.state(self.person)['notifications'];self.assertEqual(len(notices),1)
        self.assertEqual(self.state(self.client())['notifications'],[])
        self.assertEqual(self.post(self.owner,'/notifications/read',{'ids':[notices[0]['id']]}).status_code,400)
        self.post(self.person,'/notifications/read',{'ids':[notices[0]['id']]});self.assertTrue(self.state(self.person)['notifications'][0]['read'])
    def test_report_removal_refunds_and_blocks_participation(self):
        pid=self.create();before=self.state(self.owner)['pool'];self.post(self.person,f'/polls/{pid}/report',{'reason':'Misleading'})
        rid=self.sql('SELECT id FROM pp_reports WHERE poll_id=?',(pid,))[0][0]
        self.assertEqual(self.owner.get('/api/community/admin/reviews').status_code,403)
        with patch('community_features.is_admin',return_value=True):
            self.assertEqual(len(self.owner.get('/api/community/admin/reviews').json['reports']),1)
            result=self.post(self.owner,f'/admin/reports/{rid}',{'decision':'remove','reason':'This question violates the published moderation policy.'})
            self.assertEqual(result.status_code,200,result.json)
        self.assertEqual(self.person.get(f'/api/community/polls/{pid}/details').status_code,404)
        self.assertEqual(self.post(self.person,f'/polls/{pid}/claim').status_code,409)
        self.assertEqual(self.state(self.owner)['pool'],before+400)
        self.assertEqual(self.state(self.person)['notifications'][0]['title'],'Your report was reviewed')
    def test_quality_signals_do_not_automatically_reject(self):
        pid=self.create();rid=self.answer(pid,text='!!!!!!!!')
        r=self.owner.get(f'/api/community/polls/{pid}/details').json['responses'][0]
        self.assertTrue(r['quality']['flags']);self.assertFalse(r['quality']['automatic_rejection']);self.assertEqual(r['status'],'pending')
    def test_archive_contains_only_requester_records(self):
        import io,zipfile
        pid=self.create();self.answer(pid)
        r=self.person.get('/api/community/export/archive');self.assertEqual(r.status_code,200)
        with zipfile.ZipFile(io.BytesIO(r.data)) as z:
            data=json.loads(z.read('poll-pilled-data.json'));self.assertEqual(data['polls'],[]);self.assertEqual(len(data['responses']),1)
    def test_ai_usage_contains_no_prompts_or_identity(self):
        self.assertEqual(self.person.get('/api/community/admin/usage').status_code,403)
        with patch('community_features.is_admin',return_value=True):
            d=self.person.get('/api/community/admin/usage').json
            self.assertTrue(d['estimated']);self.assertNotIn('viewer',str(d))

if __name__=='__main__':unittest.main()
