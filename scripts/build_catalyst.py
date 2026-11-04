"""Package only application code and public assets; never copy local user records."""
from pathlib import Path
import json, os, secrets, shutil, subprocess
from cryptography.fernet import Fernet
from bundle_ffmpeg import bundle_ffmpeg
ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'deployment'/'build'
DEST.mkdir(parents=True,exist_ok=True)
bundle_ffmpeg(DEST, ROOT/'deployment'/'vendor-cache')
for name in ['app.py','deployment.py','custom_auth.py','payments.py','catalyst_storage.py','catalyst_cache.py','catalog_media.py','media_tools.py','settings.py','marketplace.py','community.py','community_features.py','community_following.py','community_rules.py','seed.py','poll_rules.py','security.py','meta_ai.py','creator_studio.py','ai_runtime.py','cloudflare_integration.py','cloudflare_store.py','requirements.txt']:
    shutil.copy2(ROOT/name,DEST/name)
# Fingerprinted frontend bundles from older builds are not needed in the new
# release. Replacing this generated directory keeps repeat deployments bounded.
client_build=DEST/'prototype'/'dist'/'client'
if client_build.exists(): shutil.rmtree(client_build)
for folder in ['templates','prototype/dist/client']:
    shutil.copytree(ROOT/folder,DEST/folder,dirs_exist_ok=True)
# Hash each shipped media asset and retain an optimized, immutable catalog.
# These files are already public UI assets, never user uploads or local records.
import gzip, hashlib, mimetypes
from PIL import Image
catalog=DEST/'catalog';catalog.mkdir(exist_ok=True)
manifest={}
assets=ROOT/'prototype'/'dist'/'client'/'assets'
for source in assets.rglob('*'):
    if source.suffix.lower() not in {'.png','.jpg','.jpeg','.webp','.mp3','.mp4','.webm'}: continue
    if source.suffix.lower() in {'.png','.jpg','.jpeg','.webp'}:
        import io
        image=Image.open(source)
        # Match delivery size to the largest rendered component, including
        # high-density displays. Keep full source artwork in the workspace.
        relative=source.relative_to(assets).as_posix()
        bound=192 if source.name.startswith('avatar-') else 768 if relative.startswith('empty-states/') else 896 if relative.startswith('welcome/') else 384 if relative.startswith('reactions/') else 1280
        image.thumbnail((bound,bound),Image.Resampling.LANCZOS)
        output=io.BytesIO();image.save(output,format='WEBP',quality=88)
        raw=output.getvalue();suffix='.webp';mime='image/webp'
    else:
        raw=source.read_bytes();suffix=source.suffix;mime=mimetypes.guess_type(source.name)[0]
    digest=hashlib.sha256(raw).hexdigest();name=digest+suffix
    (catalog/name).write_bytes(raw)
    manifest[source.relative_to(assets).as_posix()]=dict(file=name,key='catalog/'+name,digest=digest,mime=mime)
(catalog/'manifest.json').write_text(json.dumps(manifest))
# Precompress static text once per release, never inside a cold request.
# Brotli is optional for packaging environments; gzip is always available.
try:
    import brotli
except ImportError:
    brotli=None
for source in (client_build/'assets').rglob('*'):
    if source.suffix.lower() not in {'.js','.css','.svg','.json'}: continue
    raw=source.read_bytes()
    if len(raw)<512: continue
    for suffix,encoded in [('.gz',gzip.compress(raw,compresslevel=9,mtime=0)), *([('.br',brotli.compress(raw,quality=11))] if brotli else [])]:
        if len(encoded)<len(raw): source.with_name(source.name+suffix).write_bytes(encoded)
(DEST/'gunicorn.conf.py').write_text('import os\nbind="0.0.0.0:"+os.environ.get("X_ZOHO_CATALYST_LISTEN_PORT","9000")\nworkers=2\nthreads=2\ntimeout=180\naccesslog=None\nerrorlog="-"\n')
config_path=ROOT/'deployment'/'app-config.json'
config=json.loads(config_path.read_text())
env=config.setdefault('env_variables',{})
env.setdefault('SECRET_KEY',secrets.token_hex(32))
env.setdefault('AI_VAULT_KEY',Fernet.generate_key().decode())
env.update(PLATFORM_MODE='true',PP_CATALYST_AUTH_ENABLED='true',PP_CATALYST_STORAGE='true',PP_CATALYST_BUCKET='poll-pilled-22220000000763319',ADMIN_EMAIL='jayachandranpm2001@gmail.com',PAYMENTS_MODE='test',BUNDLED_FFMPEG='true',PP_CATALYST_CACHE_SEGMENT='22220000000763337')
config.setdefault('catalyst_auth',True)
config.update(memory=512,login_redirect='/',command='python3 -m gunicorn --config gunicorn.conf.py app:app')
config_path.write_text(json.dumps(config,indent=2));os.chmod(config_path,0o600)
print('Packaged application and public assets. Local database, uploads and credentials excluded.')
