import json
from pathlib import Path
import tempfile
import unittest
from app import create_app

class SettingsTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.config={'TESTING':True,'SECRET_KEY':'settings-test','DATABASE':str(Path(self.tmp.name)/'test.sqlite3'),'UPLOAD_FOLDER':str(Path(self.tmp.name)/'uploads')}
        self.app=create_app(self.config);self.client=self.app.test_client();self.csrf=self.client.get('/api/bootstrap').json['csrf']
    def tearDown(self): self.tmp.cleanup()
    def post(self,path,data):return self.client.post(path,json=data,headers={'X-CSRF-Token':self.csrf})
    def test_preferences_are_validated_persistent_and_private(self):
        self.assertEqual(self.client.get('/api/bootstrap').json['preferences']['font_size'],'comfortable')
        self.assertEqual(self.post('/api/preferences',{'font_size':'larger','reduce_motion':True,'accent':'teal'}).status_code,200)
        updated=self.client.get('/api/bootstrap').json['preferences']
        self.assertEqual(updated['font_size'],'larger');self.assertTrue(updated['reduce_motion']);self.assertEqual(updated['accent'],'teal')
        other=self.app.test_client().get('/api/bootstrap').json['preferences'];self.assertEqual(other['font_size'],'comfortable')
        with self.client.session_transaction() as s:viewer=s['viewer']
        restarted=create_app(self.config).test_client()
        with restarted.session_transaction() as s:s['viewer']=viewer;s['csrf']='fresh'
        self.assertEqual(restarted.get('/api/bootstrap').json['preferences'],updated)
        for payload in [{'reduce_motion':'false'},{'accent':[]},{'font_size':'tiny'},{'email':'other@example.com'},[],{}]:
            self.assertEqual(self.post('/api/preferences',payload).status_code,400)
        self.assertEqual(self.client.post('/api/preferences',json={'accent':'blue'}).status_code,403)
    def test_export_contains_only_own_records_and_no_credentials(self):
        self.post('/api/profile',{'name':'Export Human','bio':'My own profile'})
        self.post('/api/polls/four-day-week/vote',{'option_id':'four-day-week-0'})
        self.post('/api/participant/interests',{'topics':['Design']})
        other=self.app.test_client();token=other.get('/api/bootstrap').json['csrf']
        other.post('/api/profile',json={'name':'Another Human','bio':'Private profile text'},headers={'X-CSRF-Token':token})
        other.post('/api/credits/topup',json={'credits':500,'idempotency_key':'other-viewer-topup'},headers={'X-CSRF-Token':token})
        response=self.client.get('/api/account/export');data=response.json
        self.assertEqual(response.status_code,200);self.assertIn('attachment',response.headers['Content-Disposition'])
        self.assertEqual(data['profile'][0]['name'],'Export Human');self.assertEqual(len(data['votes']),1);self.assertEqual(data['rewards'][0]['amount'],200)
        self.assertEqual(data['credits'],[]);self.assertEqual(data['polls'],[])
        serialized=json.dumps(data);self.assertNotIn('Private profile text',serialized);self.assertNotIn('other-viewer-topup',serialized);self.assertNotIn('csrf',serialized);self.assertNotIn('SECRET_KEY',serialized)
