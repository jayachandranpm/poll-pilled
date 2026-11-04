"""Server-only encrypted Cloudflare settings. The vault key is kept separately."""
import json
import os
from pathlib import Path
import tempfile
from ai_runtime import vault_cipher

def path_for(app):
    return Path(app.config['DATABASE']).parent / '.cloudflare-settings.enc'

def read_settings(app):
    if app.config.get('PLATFORM_MODE') and 'platform_read' in app.extensions:
        return app.extensions['platform_read']('cloudflare', {})
    path=path_for(app)
    if not path.exists(): return {}
    # Decryption failure must surface, never silently disable protection.
    return json.loads(vault_cipher(app).decrypt(path.read_bytes()))

def write_settings(app, value):
    if app.config.get('PLATFORM_MODE'):
        return app.extensions['platform_write']('cloudflare', value)
    path=path_for(app); path.parent.mkdir(parents=True,exist_ok=True)
    raw=vault_cipher(app).encrypt(json.dumps(value).encode())
    fd, temporary=tempfile.mkstemp(prefix='.cloudflare-',dir=path.parent)
    try:
        with os.fdopen(fd,'wb') as output:
            output.write(raw);output.flush();os.fsync(output.fileno())
        os.replace(temporary,path)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)

def turnstile_config(app):
    if app.config.get('TURNSTILE_SITE_KEY'):
        return dict(site_key=app.config['TURNSTILE_SITE_KEY'],secret_key=app.config['TURNSTILE_SECRET_KEY'],hostname=app.config['TURNSTILE_HOSTNAME'],source='environment')
    return read_settings(app).get('active',{})
