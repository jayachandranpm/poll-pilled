import hashlib
import io
import json
import os
import tempfile
import unittest
import zlib
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch
from cryptography.fernet import Fernet
from PIL import Image
from app import create_app
from catalyst_storage import CatalystStore, StorageUnavailable, persist_media, fetch_media
import catalyst_cache
import catalog_media


class CacheAndBucketTests(unittest.TestCase):
    def test_cache_names_fit_the_live_provider_limit(self):
        first=catalyst_cache.cache_key('pp:catalog:long-bucket-name:'+('a'*64))
        self.assertEqual(len(first),43)
        self.assertNotEqual(first,catalyst_cache.cache_key('pp:snapshot:'+('a'*64)))
    def test_cached_snapshot_still_reads_latest_revision_and_checks_integrity(self):
        cipher=Fernet(Fernet.generate_key());first=cipher.encrypt(zlib.compress(b'first'))
        second=cipher.encrypt(zlib.compress(b'second'))
        store=CatalystStore.__new__(CatalystStore);store.cipher=cipher
        store.sdk=Mock();store.bucket=Mock()
        store.latest=Mock(return_value=dict(Revision=1,ObjectKey='one',Digest=hashlib.sha256(first).hexdigest()))
        store.bucket.get_object.side_effect=[first,second]
        with patch.dict(os.environ,{'PP_CATALYST_CACHE_SEGMENT':''}):
            self.assertEqual(store.load(b''),(1,b'first'))
            self.assertEqual(store.load(b''),(1,b'first'))
            self.assertEqual(store.bucket.get_object.call_count,1)
            self.assertEqual(store.latest.call_count,2)
            store.latest.return_value=dict(Revision=2,ObjectKey='two',Digest=hashlib.sha256(second).hexdigest())
            with patch('catalyst_cache.get',return_value='corrupted cache value'):
                self.assertEqual(store.load(b''),(2,b'second'))

    def test_cache_failure_is_nonfatal_and_expiry_is_enforced(self):
        sdk=Mock();sdk.cache.return_value.segment.return_value.get_value.side_effect=RuntimeError('offline')
        sdk.cache.return_value.segment.return_value.put.side_effect=RuntimeError('offline')
        with patch.dict(os.environ,{'PP_CATALYST_CACHE_SEGMENT':'test'}),patch('catalyst_cache.time.time',return_value=100):
            self.assertIsNone(catalyst_cache.get(sdk,'test:expiry'))
            catalyst_cache.put(sdk,'test:expiry','value',seconds=10)
            self.assertEqual(catalyst_cache.get(sdk,'test:expiry'),'value')
        with patch.dict(os.environ,{'PP_CATALYST_CACHE_SEGMENT':'test'}),patch('catalyst_cache.time.time',return_value=111):
            self.assertIsNone(catalyst_cache.get(sdk,'test:expiry'))

    def test_media_requires_acknowledgement_and_can_restore_after_restart(self):
        with tempfile.TemporaryDirectory() as folder:
            app=SimpleNamespace(config={'UPLOAD_FOLDER':folder})
            filename='a'*32+'.webp';path=Path(folder,filename);path.write_bytes(b'image')
            store=SimpleNamespace(bucket=Mock())
            with patch('catalyst_storage.store_for',return_value=store):
                store.bucket.put_object.return_value=False
                with self.assertRaises(StorageUnavailable):persist_media(app,filename)
                store.bucket.put_object.return_value=True;persist_media(app,filename)
                self.assertEqual(store.bucket.put_object.call_args.args[0],'media/'+filename)
                path.unlink();store.bucket.get_object.return_value=b'image'
                fetch_media(app,filename);fetch_media(app,filename)
                self.assertEqual(path.read_bytes(),b'image');store.bucket.get_object.assert_called_once()

    def test_public_catalog_is_direct_cacheable_and_independent_of_cloud_services(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'catalog').mkdir();(root/'catalog'/'image.webp').write_bytes(b'image')
            app=create_app(dict(TESTING=True,DATABASE=str(root/'db'),UPLOAD_FOLDER=str(root/'uploads')))
            app.root_path=folder;app.config.update(CATALYST_STORAGE=True,CATALYST_BUCKET='test-bucket')
            item=dict(key='catalog/image.webp',file='image.webp',digest='test-catalog',mime='image/webp')
            (root/'catalog'/'manifest.json').write_text(json.dumps({'tote.png':item}))
            client=app.test_client()
            with patch('app.store_for',side_effect=AssertionError('Public artwork must not wait for cloud storage')):
                with client.get('/assets/tote.png') as response:
                    self.assertEqual(response.status_code,200)
                    self.assertEqual(response.data,b'image')
                    self.assertEqual(response.mimetype,'image/webp')
                    self.assertNotIn('Location',response.headers)
                    self.assertNotIn('Set-Cookie',response.headers)
                    self.assertEqual(response.headers['Cache-Control'],'public, max-age=3600, stale-while-revalidate=86400')
                    etag=response.headers['ETag']
                with client.get('/assets/tote.png',headers={'If-None-Match':etag}) as response:
                    self.assertEqual(response.status_code,304)
                with client.head('/assets/tote.png') as response:
                    self.assertEqual(response.data,b'')
                    self.assertEqual(response.content_length,5)
                with client.get('/assets/tote.png',headers={'Range':'bytes=0-1'}) as response:
                    self.assertEqual(response.status_code,206)
                    self.assertEqual(response.data,b'im')
                with app.test_request_context('/assets/tote.png'):
                    self.assertIsNone(catalog_media.response_for(app,'../uploads/private.webp'))
                    self.assertIsNone(catalog_media.response_for(app,'uploads/private.webp'))
                    self.assertIsNone(catalog_media.response_for(app,'catalog/manifest.json'))


class MediaPrivacyTests(unittest.TestCase):
    def test_drafts_stay_private_and_published_media_supports_revalidation_and_ranges(self):
        with tempfile.TemporaryDirectory() as folder:
            app=create_app(dict(TESTING=True,SECRET_KEY='test',DATABASE=str(Path(folder)/'db'),UPLOAD_FOLDER=str(Path(folder)/'uploads')))
            owner=app.test_client();other=app.test_client()
            csrf=owner.get('/api/community/state').json['csrf'];other.get('/api/community/state')
            def upload():
                image=io.BytesIO();Image.new('RGB',(16,16),'skyblue').save(image,'PNG');image.seek(0)
                result=owner.post('/api/upload',data={'kind':'image','file':(image,'image.png')},headers={'X-CSRF-Token':csrf})
                self.assertEqual(result.status_code,201);return result.json['url']
            a,b=upload(),upload()
            with owner.get(a) as private:
                self.assertEqual(private.headers['Cache-Control'],'private, no-store')
            self.assertEqual(other.get(a,headers={'If-None-Match':a.rsplit('/',1)[-1]}).status_code,404)
            published=owner.post('/api/community/publish',json=dict(idempotency_key='media-cache-publish-test',title='Which image feels more inviting?',format='visual',circle='design',options=['First','Second'],images=[a,b],reach='Community',responses=2,data_use_accepted=True),headers={'X-CSRF-Token':csrf})
            self.assertEqual(published.status_code,200,published.json)
            with other.get(a) as response:
                self.assertEqual(response.status_code,200);etag=response.headers['ETag']
                self.assertEqual(response.headers['Cache-Control'],'private, no-cache')
            self.assertEqual(other.get(a,headers={'If-None-Match':etag}).status_code,304)
            with other.get(a,headers={'Range':'bytes=0-9'}) as response:
                self.assertEqual(response.status_code,206);self.assertEqual(len(response.data),10)

if __name__=='__main__':unittest.main()
