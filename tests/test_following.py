import json
import sqlite3
import tempfile
import unittest
import uuid
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

from app import create_app
from catalyst_storage import SnapshotConnection
from community_following import assigned_identity
from poll_rules import public_identity


class FollowingTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        self.config=dict(TESTING=True,SECRET_KEY='following-tests',DATABASE=str(self.root/'db.sqlite3'),UPLOAD_FOLDER=str(self.root/'uploads'))
        self.app=create_app(self.config)
        self.owner=self.client();self.reader=self.client();self.other=self.client()
        self.publisher=self.state(self.owner)['identity']['id']
    def tearDown(self): self.tmp.cleanup()
    def client(self):
        client=self.app.test_client();client.csrf=client.get('/api/community/state').json['csrf'];return client
    def state(self,c): return c.get('/api/community/state').json
    def post(self,c,path,data=None):
        return c.post('/api/community'+path,json=data or {},headers={'X-CSRF-Token':c.csrf})
    def follow(self,c=None,following=True,notify=True):
        return self.post(c or self.reader,f'/people/{self.publisher}/follow',dict(following=following,notify=notify))
    def publish(self,key=None,**extra):
        data=dict(title='Which everyday idea should we try?',name='A decision',format='classic',circle='design',options=['First idea','Second idea'],images=[],reach='Community',responses=5,data_use_accepted=True,idempotency_key=key or uuid.uuid4().hex)
        data.update(extra);r=self.post(self.owner,'/publish',data);self.assertEqual(r.status_code,200,r.json);return r.json['id']
    def notices(self,c=None):
        return (c or self.reader).get('/api/community/notifications').json['notifications']
    def sql(self,query,args=()):
        with closing(sqlite3.connect(self.config['DATABASE'])) as db, db:
            result=db.execute(query,args).fetchall();db.commit();return result

    def test_identity_stays_assigned_without_exposing_private_account_ids(self):
        first=self.state(self.reader)['identity'];self.assertEqual(first,self.state(self.reader)['identity'])
        self.assertNotEqual(first['id'],self.publisher)
        with self.reader.session_transaction() as session: private=session['viewer']
        self.assertNotIn(private,json.dumps(first))
        self.assertEqual(first['author'],public_identity('following-tests',private)['author'])
        with self.app.app_context():
            with closing(sqlite3.connect(self.config['DATABASE'])) as db, db:
                # The persisted identity survives key changes and a fresh process.
                self.assertEqual(assigned_identity(db,'changed-signing-key',private)['author'],first['author'])
        create_app(self.config)
        self.assertEqual(self.state(self.reader)['identity'],first)

    def test_name_collisions_are_resolved_with_unique_assignments(self):
        with closing(sqlite3.connect(self.config['DATABASE'])) as db, db:
            with patch('community_following.public_identity',return_value={'author':'Curious Otter ABC123'}):
                one=assigned_identity(db,'key','one');two=assigned_identity(db,'key','two')
        self.assertNotEqual(one['author'],two['author']);self.assertNotEqual(one['id'],two['id'])

    def test_follow_is_desired_state_idempotent_private_and_not_self_following(self):
        for _ in range(2): self.assertEqual(self.follow().status_code,200)
        self.assertEqual(self.sql('SELECT COUNT(*) FROM pp_follows')[0][0],1)
        self.assertEqual(self.state(self.owner)['followers_count'],1)
        self.assertEqual(self.state(self.reader)['following'][0]['identity']['id'],self.publisher)
        response=self.follow(self.owner);self.assertEqual(response.status_code,400)
        self.assertEqual(self.post(self.reader,'/people/unknown/follow',{'following':True}).status_code,404)
        for value in ['true',1,None]:
            self.assertEqual(self.post(self.reader,f'/people/{self.publisher}/follow',{'following':value}).status_code,400)
        self.assertEqual(self.post(self.reader,f'/people/{self.publisher}/follow',{'following':True,'notify':'yes'}).status_code,400)
        self.assertEqual(self.reader.post('/api/community/people/'+self.publisher+'/follow',json={'following':False}).status_code,403)

    def test_one_new_poll_notice_for_followers_even_when_publish_is_retried(self):
        old=self.publish();self.follow()
        pid=self.publish(key='one-publication-123')
        self.assertEqual(self.publish(key='one-publication-123'),pid)
        notices=self.notices();self.assertEqual([n['poll_id'] for n in notices],[pid]);self.assertFalse(notices[0]['read'])
        self.assertNotEqual(old,pid);self.assertEqual(self.sql('SELECT COUNT(*) FROM pp_publications WHERE poll_id=?',(pid,))[0][0],1)
        self.assertEqual(self.notices(self.other),[]);self.assertEqual(self.notices(self.owner),[])
        p=self.reader.get(f'/api/community/polls/{pid}/details').json['poll']
        self.assertTrue(p['followed_creator']);self.assertEqual(p['creator_id'],self.publisher)
        self.assertFalse(p['results_unlocked']);self.assertEqual(p['totals'],[])

    def test_mute_unfollow_and_refollow_never_replay_old_publications(self):
        self.follow();one=self.publish();self.assertEqual(len(self.notices()),1)
        self.follow(notify=False);self.assertEqual(self.notices(),[])
        self.publish();self.follow(notify=True);self.assertEqual(self.notices(),[])
        two=self.publish();self.assertEqual([n['poll_id'] for n in self.notices()],[two])
        self.follow(following=False);self.assertEqual(self.notices(),[])
        self.follow();self.assertEqual(self.notices(),[])
        three=self.publish();self.assertEqual([n['poll_id'] for n in self.notices()],[three]);self.assertNotEqual(one,three)

    def test_stale_alert_toggle_cannot_follow_someone_again(self):
        self.follow();self.follow(following=False)
        self.assertEqual(self.post(self.reader,f'/people/{self.publisher}/alerts',{'notify':True}).status_code,409)
        self.assertEqual(self.state(self.reader)['following'],[])
        self.follow();self.assertEqual(self.post(self.reader,f'/people/{self.publisher}/alerts',{'notify':False}).status_code,200)
        self.assertFalse(self.state(self.reader)['following'][0]['notify_new_polls'])

    def test_notice_preferences_language_formats_ai_and_audience_are_enforced(self):
        self.follow();pid=self.publish()
        self.post(self.reader,'/preferences',{'notifications':False});self.assertEqual(self.notices(),[])
        self.post(self.reader,'/preferences',{'notifications':True});self.assertEqual(self.notices(),[])
        pid=self.publish()
        self.post(self.reader,'/preferences',{'languages':['Tamil']});self.assertEqual(self.notices(),[])
        self.post(self.reader,'/preferences',{'languages':['English'],'formats':['audio']});self.assertEqual(self.notices(),[])
        self.post(self.reader,'/preferences',{'formats':['classic'],'generated_polls':False})
        data=json.loads(self.sql('SELECT data FROM pp_polls WHERE id=?',(pid,))[0][0]);data['text_origin']='generated'
        self.sql('UPDATE pp_polls SET data=? WHERE id=?',(json.dumps(data),pid));self.assertEqual(self.notices(),[])
        self.post(self.reader,'/preferences',{'generated_polls':True});self.assertEqual(len(self.notices()),1)
        data['targeting']={'country':['Canada']};self.sql('UPDATE pp_polls SET data=? WHERE id=?',(json.dumps(data),pid));self.assertEqual(self.notices(),[])
        self.post(self.reader,'/preferences',{'country':'Canada'});self.assertEqual(len(self.notices()),1)

    def test_closed_removed_and_completed_polls_do_not_prompt_another_answer(self):
        self.follow();pid=self.publish();self.assertEqual(len(self.notices()),1)
        self.sql("UPDATE pp_polls SET status='paused' WHERE id=?",(pid,));self.assertEqual(self.notices(),[])
        self.sql("UPDATE pp_polls SET status='active' WHERE id=?",(pid,))
        self.sql("INSERT INTO pp_takedowns VALUES (?, 'Removed', '2026-01-01')",(pid,));self.assertEqual(self.notices(),[])
        self.sql('DELETE FROM pp_takedowns WHERE poll_id=?',(pid,))
        self.assertEqual(self.post(self.reader,f'/polls/{pid}/claim').status_code,200)
        self.assertEqual(self.post(self.reader,f'/polls/{pid}/answer',{'answer':0}).status_code,200)
        self.assertEqual(self.notices(),[])

    def test_read_state_is_per_user_and_stale_publication_remains_markable(self):
        self.follow();pid=self.publish();notice=self.notices()[0]['id']
        self.assertEqual(self.post(self.other,'/notifications/read',{'ids':[notice]}).status_code,400)
        self.assertEqual(self.post(self.reader,'/notifications/read',{'ids':[notice]}).status_code,200)
        self.assertTrue(self.notices()[0]['read'])
        self.sql("UPDATE pp_polls SET status='ended' WHERE id=?",(pid,))
        self.assertEqual(self.post(self.reader,'/notifications/read',{'ids':[notice]}).status_code,200)
        self.assertEqual(self.sql('SELECT COUNT(*) FROM pp_notice_reads')[0][0],1)

    def test_publisher_profile_only_contains_public_identity_and_locked_results(self):
        pid=self.publish();profile=self.reader.get('/api/community/people/'+self.publisher)
        self.assertEqual(profile.status_code,200);self.assertFalse(profile.json['mine'])
        self.assertNotIn('followers_count',profile.json)
        self.assertEqual(profile.json['polls'][0]['totals'],[])
        with self.owner.session_transaction() as session: self.assertNotIn(session['viewer'],profile.text)
        self.sql("UPDATE pp_accounts SET preferences=? WHERE viewer=(SELECT viewer FROM pp_people WHERE public_id=?)",(json.dumps({'deleted':True}),self.publisher))
        self.assertEqual(self.reader.get('/api/community/people/'+self.publisher).status_code,404)
        self.assertEqual(self.follow().status_code,404)

    def test_reactions_remain_locked_are_replaceable_and_reject_removed_polls(self):
        pid=self.publish()
        self.assertEqual(self.post(self.reader,f'/polls/{pid}/react',{'reaction':'helpful'}).status_code,403)
        self.post(self.reader,f'/polls/{pid}/claim');self.post(self.reader,f'/polls/{pid}/answer',{'answer':0})
        for value in ['helpful','surprising','relatable','relatable']:
            self.assertEqual(self.post(self.reader,f'/polls/{pid}/react',{'reaction':value}).status_code,200)
        details=self.reader.get(f'/api/community/polls/{pid}/details').json['poll']
        self.assertEqual(details['reactions'],{'relatable':1})
        self.assertEqual(self.other.get(f'/api/community/polls/{pid}/details').json['poll']['reactions'],{})
        self.assertEqual(self.post(self.reader,f'/polls/{pid}/react',{'reaction':''}).status_code,200)
        self.sql("INSERT INTO pp_takedowns VALUES (?, 'Removed', '2026-01-01')",(pid,))
        self.assertEqual(self.post(self.reader,f'/polls/{pid}/react',{'reaction':'helpful'}).status_code,404)

    def test_follow_publish_answer_review_reward_and_react_as_one_workflow(self):
        self.follow()
        self.assertEqual(self.post(self.owner,'/credits',{'amount':250,'idempotency_key':'credits-workflow-123'}).status_code,200)
        before=self.state(self.owner)['wallet']['credits'];pid=self.publish(key='publish-workflow-123',reach='Boost')
        after=self.state(self.owner)['wallet']['credits'];self.assertLess(after,before)
        self.publish(key='publish-workflow-123',reach='Boost');self.assertEqual(self.state(self.owner)['wallet']['credits'],after)
        self.assertEqual(self.notices()[0]['poll_id'],pid)
        self.post(self.reader,f'/polls/{pid}/claim')
        response=self.post(self.reader,f'/polls/{pid}/answer',{'answer':0,'text':'The first option makes the most sense to me.'})
        self.assertEqual(response.status_code,200,response.json)
        rid=response.json['response']['id'];self.assertEqual(self.state(self.reader)['wallet']['pending'],200)
        reviewed=self.post(self.owner,f'/responses/{rid}/review',{'action':'accept'});self.assertEqual(reviewed.status_code,200,reviewed.json)
        self.assertEqual(self.state(self.reader)['wallet']['points'],200)
        self.assertEqual(self.state(self.reader)['wallet']['pending'],0)
        self.assertEqual(self.post(self.owner,f'/responses/{rid}/review',{'action':'accept'}).status_code,409)
        self.assertEqual(self.state(self.reader)['wallet']['points'],200)
        self.assertEqual(self.post(self.reader,f'/polls/{pid}/react',{'reaction':'helpful'}).status_code,200)
        p=self.reader.get(f'/api/community/polls/{pid}/details').json['poll'];self.assertEqual(p['reactions'],{'helpful':1});self.assertEqual(p['totals'],[1,0])
        self.assertEqual([n['title'] for n in self.notices()],['Response accepted'])

    def test_snapshot_migration_preserves_balances_names_and_existing_polls(self):
        pid=self.publish()
        conn=sqlite3.connect(self.config['DATABASE']);conn.row_factory=sqlite3.Row
        original=conn.execute('SELECT viewer,name FROM pp_people').fetchall()
        conn.executescript('DROP TABLE pp_publications; DROP TABLE pp_follows; DROP TABLE pp_people;')
        data=conn.serialize();conn.close()
        class Store:
            revision=0
            def __init__(self,data): self.data=data
            def load(self,template): return self.revision,self.data
            def commit(self,revision,data):
                assert revision==self.revision;self.data=data;self.revision+=1;return self.revision
        store=Store(data);migrated=SnapshotConnection(store,data,'following-tests')
        self.assertEqual(migrated.execute('SELECT COUNT(*) FROM pp_publications').fetchone()[0],0)
        self.assertIsNotNone(migrated.execute('SELECT id FROM pp_polls WHERE id=?',(pid,)).fetchone())
        for who,name in original: self.assertEqual(migrated.execute('SELECT name FROM pp_people WHERE viewer=?',(who,)).fetchone()[0],name)
        again=SnapshotConnection(store,data,'following-tests');self.assertEqual(store.revision,1)
        migrated.close();again.close()


if __name__=='__main__': unittest.main()
