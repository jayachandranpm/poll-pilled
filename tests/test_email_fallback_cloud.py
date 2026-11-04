"""Authentication transactions through the deployed snapshot adapter."""
import sqlite3
import threading
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
from tests import test_email_fallback as fixtures
from catalyst_storage import SnapshotConnection, StorageConflict


class SnapshotService:
    def __init__(self,data):
        self.data=data;self.revision=0;self.lock=threading.Lock()
    def load(self,template):
        with self.lock:return self.revision,self.data
    def commit(self,revision,data):
        with self.lock:
            if revision!=self.revision:raise StorageConflict('Concurrent save')
            self.data=data;self.revision+=1;return self.revision


class CloudEmailFallbackTests(fixtures.EmailFallbackTests):
    def setUp(self):
        super().setUp()
        conn=sqlite3.connect(self.app.config['DATABASE'])
        try:self.store=SnapshotService(conn.serialize())
        finally:conn.close()
        self.app.config['CATALYST_STORAGE']=True
        patched=patch('app.store_for',return_value=self.store)
        patched.start();self.addCleanup(patched.stop)

    def stored(self,name):
        with self.app.test_request_context('/api/auth/session'):
            return self.app.extensions['platform_read'](name)

    def save(self,name,value):
        with self.app.test_request_context('/api/auth/session'):
            self.app.extensions['platform_write'](name,value)

    def test_methods_are_bound_in_storage_and_client_flags_do_not_bypass_turnstile(self):
        # The inherited legacy fixture uses an app context (local template), so
        # exercise this case with real HTTP registration instead.
        cid,code=self.start()
        self.assertEqual(self.post('verify-code',{'challenge_id':cid,'code':code,'method':'turnstile'}).status_code,403)
        result=self.post('register',{'email':'normal@example.com','password':'a normal violet long passphrase'})
        self.assertEqual(result.status_code,200,result.json)
        self.assertEqual(self.fallback('verify-code',{'challenge_id':result.json['challenge_id'],'code':self.sent[-1][1]}).status_code,403)
        self.assertEqual(self.client.post('/api/auth/login',json={'email':'person@example.com','password':'anything','skip_captcha':True},headers={'X-CSRF-Token':self.csrf}).status_code,403)

    def test_fallback_can_be_disabled_without_affecting_normal_flow(self):
        cid,code=self.start();self.app.config['EMAIL_AUTH_FALLBACK_ENABLED']=False
        self.assertEqual(self.fallback('verify-code',{'challenge_id':cid,'code':code}).status_code,503)
        result=self.post('register',{'email':'normal@example.com','password':'a normal violet long passphrase'})
        self.assertEqual(result.status_code,200,result.json)
        self.assertEqual(self.post('verify-code',{'challenge_id':result.json['challenge_id'],'code':self.sent[-1][1]}).status_code,200)

    def twins(self):
        cookie=self.client.get_cookie(self.app.config['SESSION_COOKIE_NAME'])
        clients=[self.app.test_client(),self.app.test_client()]
        for client in clients:client.set_cookie(cookie.key,cookie.value)
        return clients

    def concurrent(self,clients,path,data):
        original=self.store.commit;barrier=threading.Barrier(2);counter=0;lock=threading.Lock()
        def commit(revision,payload):
            nonlocal counter
            with lock:counter+=1;first=counter<=2
            if first:barrier.wait(timeout=10)
            return original(revision,payload)
        def invoke(client):
            return client.post('/api/auth/email-fallback/'+path,json=data,headers={'X-CSRF-Token':self.csrf})
        with patch.object(self.store,'commit',side_effect=commit),patch('custom_auth.check_token',side_effect=AssertionError('Unexpected CAPTCHA')):
            with ThreadPoolExecutor(max_workers=2) as pool:return list(pool.map(invoke,clients))

    def test_concurrent_code_consumption_grants_exactly_one_session(self):
        cid,code=self.start()
        results=self.concurrent(self.twins(),'verify-code',{'challenge_id':cid,'code':code})
        self.assertEqual(sorted(r.status_code for r in results),[200,403],[r.json for r in results])
        record=self.stored('auth_code:'+cid)
        self.assertTrue(record['used']);self.assertEqual(record['attempts'],1)
        with self.app.test_request_context('/api/auth/session'):
            rows=self.app.extensions['platform_db']().execute("SELECT name FROM platform_settings WHERE name LIKE 'auth_session:%'").fetchall()
            self.assertEqual(len(rows),1)

    def test_concurrent_email_requests_reserve_quota_before_sending_once(self):
        self.account()
        results=self.concurrent(self.twins(),'request-code',{'email':'person@example.com'})
        self.assertEqual(sorted(r.status_code for r in results),[200,429],[r.json for r in results])
        self.assertEqual(len(self.sent),1)
        self.assertEqual(len(self.stored('auth_rate:fallback:send:global')),1)

    def test_known_revision_conflict_does_not_duplicate_mail(self):
        self.account();original=self.store.commit;count=0
        def commit(revision,data):
            nonlocal count
            count+=1
            if count==1:
                peer=SnapshotConnection(self.store,self.app.extensions['database_template'])
                try:
                    with peer:peer.execute("INSERT INTO security_limits VALUES ('concurrent-work',1)")
                finally:peer.close()
            return original(revision,data)
        with patch.object(self.store,'commit',side_effect=commit):cid,code=self.start('person@example.com')
        self.assertEqual(len(self.sent),1);self.assertEqual(len(self.stored('auth_rate:fallback:send:global')),1)
        self.assertEqual(self.fallback('verify-code',{'challenge_id':cid,'code':code}).status_code,200)
