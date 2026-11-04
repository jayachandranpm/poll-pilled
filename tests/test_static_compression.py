import gzip
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from app import create_app


class StaticCompressionTests(unittest.TestCase):
    def test_precompressed_assets_negotiate_cache_and_preserve_ranges(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            assets=root/'prototype/dist/client/assets';assets.mkdir(parents=True)
            raw=b'export const message="A cached public asset";\n'*100
            name='bundle-12345678.js';(assets/name).write_bytes(raw)
            (assets/(name+'.gz')).write_bytes(gzip.compress(raw,mtime=0))
            app=create_app(dict(TESTING=True,DATABASE=str(root/'db'),UPLOAD_FOLDER=str(root/'uploads')))
            app.template_folder=str(Path(app.root_path)/'templates')
            app.root_path=directory;app.config['CATALYST_STORAGE']=True
            client=app.test_client();path='/assets/'+name
            with patch('app.store_for',side_effect=AssertionError('Static files must not load user records')):
                with client.get(path,headers={'Accept-Encoding':'gzip'}) as response:
                    self.assertEqual(gzip.decompress(response.data),raw)
                    self.assertEqual(response.headers['Content-Encoding'],'gzip')
                    self.assertIn('Accept-Encoding',response.headers['Vary'])
                    self.assertIn('immutable',response.headers['Cache-Control'])
                    self.assertNotIn('Set-Cookie',response.headers)
                    etag=response.headers['ETag'];length=response.content_length
                with client.head(path,headers={'Accept-Encoding':'gzip'}) as response:
                    self.assertEqual(response.data,b'');self.assertEqual(response.content_length,length)
                with client.get(path,headers={'Accept-Encoding':'gzip;q=0, br;q=0'}) as response:
                    self.assertNotIn('Content-Encoding',response.headers);self.assertEqual(response.data,raw)
                with client.get(path,headers={'If-None-Match':etag}) as response:
                    self.assertEqual(response.status_code,304);self.assertEqual(response.data,b'')
                with client.get(path,headers={'Accept-Encoding':'gzip','Range':'bytes=0-9'}) as response:
                    self.assertEqual(response.status_code,206)
                    self.assertNotIn('Content-Encoding',response.headers)
                    self.assertEqual(response.data,raw[:10])
                # Brotli decoding happens in the browser, not the server. A
                # sentinel suffices to test negotiation without a runtime SDK.
                (assets/(name+'.br')).write_bytes(b'brotli-artifact')
                with client.get(path,headers={'Accept-Encoding':'gzip, br'}) as response:
                    self.assertEqual(response.headers['Content-Encoding'],'br')
                    self.assertEqual(response.data,b'brotli-artifact')
                with client.get(path,headers={'Accept-Encoding':'br;q=0.5,gzip;q=1'}) as response:
                    self.assertEqual(response.headers['Content-Encoding'],'gzip')
                self.assertEqual(client.get('/assets/%2e%2e/%2e%2e/db').status_code,404)
