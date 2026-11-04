"""Turnstile setup and Workers AI speech. Credentials stay encrypted on the server."""
import json
import os
import re
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from flask import g, jsonify, request, session
from cryptography.fernet import InvalidToken
from ai_runtime import AIRuntime, vault_cipher
from meta_ai import AIError, transport
from catalyst_storage import persist_media, replayable_write
from cloudflare_store import read_settings, write_settings, turnstile_config
from deployment import is_admin

SPEAKERS=('luna','apollo','athena','orion','asteria','aurora','cora','hermes','iris','juno','phoebe','zeus')
MODEL='@cf/deepgram/aura-2-en'

def check_token(config, token, action):
    if not isinstance(token,str) or not 0<len(token)<=2048:
        raise AIError('Complete the security check and try again.',403)
    # Siteverify supports an idempotency key for a safe transport retry. The
    # application action is never repeated and the token remains single-use.
    payload=json.dumps({'secret':config['secret_key'],'response':token,'idempotency_key':str(uuid.uuid4())}).encode()
    result=None
    for attempt in range(2):
        req=urllib.request.Request('https://challenges.cloudflare.com/turnstile/v0/siteverify',data=payload,headers={'Content-Type':'application/json'},method='POST')
        try:
            with urllib.request.urlopen(req,timeout=4) as response: result=json.load(response)
            if not isinstance(result,dict): raise ValueError('Invalid verification response')
            codes=result.get('error-codes') or []
            if not isinstance(codes,list): raise ValueError('Invalid verification errors')
            if 'internal-error' in codes:
                if not attempt: continue
                raise AIError('Cloudflare verification is temporarily unavailable. Please try again. Reference: verify-unavailable.',503)
            break
        except urllib.error.HTTPError as error:
            if attempt or error.code<500:
                raise AIError('Cloudflare verification is temporarily unavailable. Please try again. Reference: verify-unavailable.',503) from None
        except (urllib.error.URLError,TimeoutError,ValueError):
            if attempt:
                raise AIError('Cloudflare verification did not respond. Please try again. Reference: verify-network.',503) from None
    codes=result.get('error-codes',[]) if isinstance(result,dict) else []
    if not isinstance(result,dict) or result.get('success') is not True:
        if 'timeout-or-duplicate' in codes:
            raise AIError('The security check expired or was already used. Start a fresh check. Reference: verify-expired.',403)
        if any(code in codes for code in ['missing-input-secret','invalid-input-secret']):
            raise AIError('The security service needs an administrator check. Reference: verify-configuration.',503)
        raise AIError('Cloudflare could not complete this check. Please try again. Reference: verify-rejected.',403)
    if result.get('hostname')!=config['hostname']:
        raise AIError('This website is not enabled for the security check. Reference: verify-hostname.',403)
    if result.get('action')!=action:
        raise AIError('This security check belongs to a different action. Please try again. Reference: verify-action.',403)


def register_cloudflare(app, db, security):
    cipher=vault_cipher(app)
    runtime=AIRuntime(app,db,cipher,AIError)
    def initialize():
        db().executescript('''
        CREATE TABLE IF NOT EXISTS cf_voice_connections(viewer TEXT PRIMARY KEY, data BLOB NOT NULL);
        CREATE TABLE IF NOT EXISTS security_limits(subject TEXT,created REAL NOT NULL);
        CREATE INDEX IF NOT EXISTS security_limit_age ON security_limits(created);
        ''')
        db().commit()
    def body():
        data=request.get_json(silent=True)
        if not isinstance(data,dict): raise AIError('Send a valid request.',400)
        return data
    def local_admin():
        if app.config.get('PLATFORM_MODE'): return is_admin()
        return app.testing or (request.remote_addr in {'127.0.0.1','::1'} and request.host.split(':')[0] in {'127.0.0.1','localhost','[::1]'} and not request.headers.get('Cf-Access-Jwt-Assertion'))
    def require_admin():
        if not local_admin(): raise AIError('Configure platform security from the local administrator workspace or server environment.',403)
    def voice_config():
        if app.config.get('PLATFORM_MODE'):
            # An administrator's saved connection (including an explicit
            # removal, {}) always overrides the encrypted deployment default.
            current=app.extensions['platform_read']('voice', None)
            if current is not None: return current
            encrypted=app.config.get('VOICE_CONFIG_ENCRYPTED') or os.getenv('PP_VOICE_CONFIG_ENCRYPTED')
            if not encrypted: return {}
            try:
                if not isinstance(encrypted,str) or len(encrypted)>4096: raise ValueError()
                config=json.loads(cipher.decrypt(encrypted.encode()))
                if not isinstance(config,dict): raise ValueError()
                account=config.get('account_id');token=config.get('token')
                if not isinstance(account,str) or not re.fullmatch('[a-fA-F0-9]{32}',account): raise ValueError()
                if not isinstance(token,str) or not 20<=len(token)<=512 or any(ch.isspace() for ch in token): raise ValueError()
                return dict(account_id=account,token=token)
            except (InvalidToken,ValueError,TypeError):
                raise AIError('The deployed voice connection could not be read. An administrator must save the connection again.',503)
        row=db().execute('SELECT data FROM cf_voice_connections WHERE viewer=?',(session['viewer'],)).fetchone()
        if not row: return {}
        try: return json.loads(cipher.decrypt(row['data']))
        except (InvalidToken,ValueError): raise AIError('The voice connection could not be decrypted. Save it again.',503)
    def status():
        config=voice_config();pending=read_settings(app).get('pending',{}) if local_admin() else {}
        active=turnstile_config(app)
        return dict(security=security['status'](),admin=local_admin(),environment_managed=bool(app.config.get('TURNSTILE_SITE_KEY')),
                    pending=dict(site_key=pending.get('site_key',''),hostname=pending.get('hostname','')),
                    turnstile=dict(site_key=active.get('site_key',''),hostname=active.get('hostname','')),
                    voice=dict(configured=bool(config),account_id=config.get('account_id',''),model=MODEL,language='English',storage='Encrypted on this server'),usage=runtime.status())
    @app.before_request
    def protect_cloudflare():
        if not request.path.startswith('/api/cloudflare'): return
        if app.config.get('CATALYST_AUTH_ENABLED'): return
        if app.config.get('PLATFORM_MODE') and getattr(g,'platform_user',None): return
        if not local_admin() and not (app.config.get('CF_ACCESS_AUD') and session.get('viewer','').startswith('cf-')):
            return jsonify(error='Configure Cloudflare Access before exposing credential settings remotely.'),403
    @app.get('/api/cloudflare/settings')
    def settings(): return jsonify(status())
    @app.post('/api/cloudflare/voice')
    def save_voice():
        require_admin()
        data=body(); account=data.get('account_id','');token=data.get('token','')
        if data.get('remove') is True:
            if app.config.get('PLATFORM_MODE'): app.extensions['platform_write']('voice', {})
            else:
                with db(): db().execute('DELETE FROM cf_voice_connections WHERE viewer=?',(session['viewer'],))
            runtime.clear()
            return jsonify(status())
        # A replacement credential must also repair an unreadable deployment
        # default; only consult the previous connection when keeping its token.
        if token == '': token=voice_config().get('token','')
        if not isinstance(account,str) or not re.fullmatch('[a-fA-F0-9]{32}',account): raise AIError('Use the 32-character Cloudflare Account ID.',400)
        if not isinstance(token,str) or not 20<=len(token.strip())<=512 or any(ch.isspace() for ch in token.strip()): raise AIError('Paste a valid Workers AI API token.',400)
        config=dict(account_id=account,token=token.strip())
        if app.config.get('PLATFORM_MODE'): app.extensions['platform_write']('voice', config)
        else:
            with db(): db().execute('INSERT INTO cf_voice_connections VALUES (?,?) ON CONFLICT(viewer) DO UPDATE SET data=excluded.data',(session['viewer'],cipher.encrypt(json.dumps(config).encode())))
        runtime.clear()
        return jsonify(status())
    @app.get('/api/cloudflare/voices')
    def voices():
        return jsonify(configured=bool(voice_config()),provider='Cloudflare Workers AI',model=MODEL,
                       language='English',max_characters=600,
                       voices=[dict(id=s,name=s.title(),language='English') for s in SPEAKERS])
    @app.post('/api/cloudflare/turnstile')
    def save_turnstile():
        require_admin()
        if app.config.get('TURNSTILE_SITE_KEY'): raise AIError('This widget is managed by server environment variables.',409)
        data=body();site=data.get('site_key','');secret=data.get('secret_key','');hostname=data.get('hostname','')
        if not all(isinstance(v,str) for v in [site,secret,hostname]) or not re.fullmatch(r'[A-Za-z0-9_-]{10,100}',site) or not re.fullmatch(r'[A-Za-z0-9_-]{10,200}',secret) or not re.fullmatch(r'[A-Za-z0-9.-]{1,253}',hostname): raise AIError('Enter the widget site key, secret key, and hostname without a scheme or port.',400)
        settings=read_settings(app);settings['pending']=dict(site_key=site,secret_key=secret,hostname=hostname.lower());write_settings(app,settings)
        return jsonify(status())
    @app.post('/api/cloudflare/turnstile/activate')
    def activate_turnstile():
        require_admin(); settings=read_settings(app);pending=settings.get('pending')
        if not pending: raise AIError('Save a widget before testing it.',409)
        check_token(pending,request.headers.get('X-Turnstile-Token',''),'poll_setup')
        settings['active']=settings.pop('pending');write_settings(app,settings)
        return jsonify(status())
    @app.post('/api/cloudflare/verify')
    def verify_demo():
        # app.before_request already checked CSRF, rate limit, hostname/action and token.
        return jsonify(verified=bool(turnstile_config(app)))
    @app.post('/api/cloudflare/speech')
    def cloudflare_speech():
        data=body();text=data.get('text','');speaker=data.get('speaker','luna')
        if not isinstance(text,str) or not 3<=len(text.strip())<=600 or not isinstance(speaker,str) or speaker not in SPEAKERS: raise AIError('Use 3–600 characters and a supported English voice.',400)
        text=text.strip();config=voice_config()
        if not config: raise AIError('AI voices are not connected yet. Your administrator can enable them in Platform administration → AI voices. Your own recording still works.',503)
        payload=dict(text=text,speaker=speaker,encoding='mp3')
        def work():
            url=f"https://api.cloudflare.com/client/v4/accounts/{config['account_id']}/ai/run/{MODEL}"
            req=urllib.request.Request(url,data=json.dumps(payload).encode(),headers={'Authorization':'Bearer '+config['token'],'Content-Type':'application/json','Accept':'audio/mpeg'},method='POST')
            try:
                with transport(req,timeout=60) as response:
                    content=response.read(8*1024*1024+1)
                    if len(content)>8*1024*1024 or not (content.startswith(b'ID3') or content[:2] in (b'\xff\xfb',b'\xff\xf3',b'\xff\xf2')): raise AIError('Cloudflare did not return valid MP3 audio. No answer was submitted.',502)
            except urllib.error.HTTPError as error:
                error.close()
                raise AIError('Cloudflare rejected the voice request. Check your token, account and Workers AI access.' if error.code in [401,403] else 'Cloudflare could not generate this voice. Try again later.',502,unbilled=error.code in [400,401,403])
            except (urllib.error.URLError,TimeoutError): raise AIError('The voice request could not be confirmed. It was not retried automatically.',503)
            filename=uuid.uuid4().hex+'.mp3';path=Path(app.config['UPLOAD_FOLDER'])/filename;path.write_bytes(content)
            try:
                persist_media(app,filename)
                def remember():
                    db().execute('INSERT OR IGNORE INTO uploads VALUES (?,?,?)',(filename,session['viewer'],'audio'))
                    db().execute('INSERT OR IGNORE INTO ai_assets VALUES (?,?,?)',(filename,session['viewer'],'audio'))
                replayable_write(db(),remember)
            except Exception:
                path.unlink(missing_ok=True);raise
            return dict(url='/uploads/'+filename,transcript=text,audio_origin='generated',speaker=speaker,provider='Cloudflare Workers AI'),dict(cost=len(text)*.00003)
        result=runtime.run('speech',dict(**payload,account=config['account_id'],model=MODEL),config['token'],len(text)*.00003,work)
        return jsonify(result)
    return dict(initialize=initialize)
