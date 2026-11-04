"""Verified registration, password and email-code authentication in Catalyst storage.

Normal sign-in requires Turnstile. A separately routed email fallback supports
managed browsers, with durable quotas and browser-bound, single-use codes.
Hosted Catalyst cookies are not an alternative credential once this is enabled.
"""
import hashlib
import hmac
import json
import ipaddress
import os
import re
import secrets
import time
from pathlib import Path
from flask import g, jsonify, request, send_from_directory, session
from werkzeug.security import generate_password_hash, check_password_hash
from ai_runtime import vault_cipher
from cloudflare_store import turnstile_config
from cloudflare_integration import check_token
from deployment import is_admin
from meta_ai import AIError
from catalyst_storage import replayable_write

PASSWORD_METHOD = 'scrypt:32768:8:3'
PUBLIC_AUTH_PATHS = {'/sign-in', '/create-account', '/security-check', '/api/auth/register', '/api/auth/login', '/api/auth/reset-password', '/api/auth/resend-code', '/api/auth/session', '/api/auth/request-code', '/api/auth/verify-code', '/api/auth/logout'}
FALLBACK_PATHS = {'/api/auth/email-fallback/' + action for action in ('register', 'request-code', 'resend-code', 'verify-code', 'reset-password')}
PUBLIC_AUTH_PATHS |= FALLBACK_PATHS

def register_custom_auth(app, db):
    app.config.setdefault('EMAIL_AUTH_FALLBACK_ENABLED', os.getenv('PP_EMAIL_AUTH_FALLBACK_ENABLED', 'true') == 'true')
    cipher = vault_cipher(app)
    dummy_password = generate_password_hash(secrets.token_urlsafe(32), method=PASSWORD_METHOD)
    def digest(value):
        return hmac.new(str(app.config['SECRET_KEY']).encode(), value.encode(), hashlib.sha256).hexdigest()
    def read(name, default=None):
        return app.extensions['platform_read'](name, default)
    def put(name, value):
        db().execute('INSERT INTO platform_settings VALUES (?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value',
                     (name, cipher.encrypt(json.dumps(value).encode())))
    def config():
        return read('auth_config', {}) if app.config.get('PLATFORM_MODE') else {}
    def enabled(): return config().get('enabled') is True
    def fallback_ready():
        return bool(app.config['EMAIL_AUTH_FALLBACK_ENABLED'] and enabled() and config().get('sender'))
    def require_fallback():
        if not fallback_ready(): raise AIError('Email fallback is not available. Use the standard sign-in option.', 503)
    def user():
        token = session.get('auth_session', '')
        if not token: return None
        record = read('auth_session:' + digest(token), {})
        if record.get('expires', 0) <= time.time(): return None
        account = read('auth_account:' + digest(record['email']), {})
        if not account or account.get('disabled'): return None
        return dict(user_id=account['user_id'], email_id=record['email'], is_confirmed=True, status='ACTIVE')
    app.extensions['custom_auth'] = dict(enabled=enabled, user=user)

    def protected_request():
        origin = request.headers.get('Origin')
        expected = app.config.get('PUBLIC_APP_URL') or request.host_url.rstrip('/')
        if origin and origin != expected.rstrip('/'):
            raise AIError('This sign-in request came from another site.', 403)
        token = request.headers.get('X-CSRF-Token', '')
        if not token or not hmac.compare_digest(token, session.get('csrf', '')):
            raise AIError('Refresh the sign-in page and try again.', 403)
    def verify_bot():
        current = turnstile_config(app)
        if not current: raise AIError('Secure sign-in is not configured yet.', 503)
        check_token(current, request.headers.get('X-Turnstile-Token', ''), 'poll_login')
    def verified_continuation(record, browser):
        """Only server-stored proof from this browser's active flow qualifies.

        This is not a reusable Turnstile token or general session exemption.
        The OTP's expiry, five attempts, CSRF and single-use checks still apply.
        """
        verified=record.get('bot_verified_at', 0)
        return (isinstance(verified,(int,float)) and 0 <= time.time()-verified < 600
                and bool(browser) and hmac.compare_digest(record.get('browser',''),digest(browser)))
    def body():
        value = request.get_json(silent=True)
        if not isinstance(value, dict): raise AIError('Send a valid sign-in request.', 400)
        return value
    def normalize_email(value):
        if not isinstance(value, str): raise AIError('Enter a valid email address.', 400)
        value = value.strip().casefold()
        if len(value) > 254 or not re.fullmatch(r'[a-z0-9.!#$%&\x27*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}', value):
            raise AIError('Enter a valid email address.', 400)
        return value
    def charge_limit(name, limit, window):
        current=time.time(); entries=[t for t in read(name, []) if t > current-window]
        if len(entries) >= limit: raise AIError('Too many sign-in attempts. Please try again later.', 429)
        put(name, entries + [current])
    def fallback_limits(email, browser, stage):
        # Only the socket peer is trusted. Never take identity from spoofable
        # X-Forwarded-For/CF-Connecting-IP headers. Behind Catalyst this may be
        # a shared gateway, so email/browser/global quotas remain independent.
        try:
            address=ipaddress.ip_address(request.remote_addr or '')
            peer=str(ipaddress.ip_network(str(address)+'/64', strict=False)) if address.version==6 else str(address)
        except ValueError: peer='unknown-peer'
        base='auth_rate:fallback:'+stage+':'
        if stage=='send':
            for name,limit,window in [('global',100,3600),('daily',300,86400),
                ('peer:'+digest(peer),60,3600),('browser:'+digest(browser),10,3600),
                ('email-short:'+digest(email),3,900),('email:'+digest(email),5,3600),('email-day:'+digest(email),10,86400)]:
                charge_limit(base+name,limit,window)
        else:
            for name,limit,window in [('global',1000,900),('peer:'+digest(peer),300,900),
                ('browser:'+digest(browser),30,900),('email:'+digest(email),10,900)]:
                charge_limit(base+name,limit,window)
    def auth_method(record, fallback):
        # Method is selected by an exact server route, never a request-body flag.
        if (record.get('method')=='email_fallback') != fallback:
            raise AIError('Continue with the sign-in method that requested this code.',403)
    def prune_auth():
        now=time.time()
        if now-read('auth_cleanup_at',0)<3600: return
        # Retain only the lifetime needed by codes, resends, grants and quotas.
        # Account records and valid sessions are never touched here.
        rows=db().execute("SELECT name FROM platform_settings WHERE name LIKE 'auth_code:%' OR name LIKE 'auth_reset:%' OR name LIKE 'auth_rate:%' OR name LIKE 'auth_session:%'").fetchall()
        for row in rows:
            name=row[0];value=read(name)
            if name.startswith('auth_rate:'):
                keep=[t for t in value if t>now-86400]
                if keep:
                    if keep!=value: put(name,keep)
                    continue
            elif value.get('expires',0)+(3600 if name.startswith('auth_code:') else 0)>now: continue
            db().execute('DELETE FROM platform_settings WHERE name=?',(name,))
        for row in db().execute("SELECT name FROM platform_settings WHERE name LIKE 'auth_latest:%'").fetchall():
            if not read('auth_code:'+read(row[0],'')):
                db().execute('DELETE FROM platform_settings WHERE name=?',(row[0],))
        put('auth_cleanup_at',now)
    def code_hash(cid, browser, email, code): return digest('|'.join([cid, browser, email, code]))

    @app.get('/create-account')
    @app.get('/sign-in')
    def signin_page():
        return send_from_directory(Path(app.root_path)/'prototype'/'dist'/'client', 'sign-in.html')

    @app.get('/security-check')
    def security_diagnostic_page():
        # Public client-only isolation test. It does not accept tokens, grant
        # login/clearance, or modify authentication or user records.
        return send_from_directory(Path(app.root_path)/'prototype'/'dist'/'client', 'security-check.html')

    @app.get('/welcome')
    def onboarding_page():
        return send_from_directory(Path(app.root_path)/'prototype'/'dist'/'client', 'welcome.html')

    @app.get('/api/auth/session')
    def auth_session():
        session.setdefault('csrf', secrets.token_urlsafe(32))
        session.setdefault('auth_browser', secrets.token_urlsafe(32))
        current=turnstile_config(app); settings=config()
        return jsonify(csrf=session['csrf'], ready=bool(current and settings.get('sender')),
                       enabled=settings.get('enabled') is True, email_fallback_enabled=fallback_ready(),
                       security=dict(turnstile_enabled=bool(current), site_key=current.get('site_key',''),hostname=current.get('hostname','')))

    def password(value):
        if not isinstance(value, str) or not 15 <= len(value) <= 128:
            raise AIError('Use a password between 15 and 128 characters. A few unrelated words work well.', 400)
        if len(set(value)) < 5 or value.casefold() in {'password123456789', '123456789012345', 'qwertyuiopasdfgh', 'thisismypassword'}:
            raise AIError('Choose a less predictable password or passphrase.', 400)
        return value

    def auth_limits(email, kind='login'):
        browser=session.get('auth_browser')
        if not browser: raise AIError('Refresh the sign-in page.', 403)
        def charge():
            charge_limit('auth_rate:'+kind+':global', 500, 3600)
            charge_limit('auth_rate:'+kind+':browser:'+digest(browser), 30, 900)
            charge_limit('auth_rate:'+kind+':email:'+digest(email), 10, 900)
        replayable_write(db(),charge)
        return browser

    def grant_session(email):
        token=secrets.token_urlsafe(32)
        old=session.get('auth_session')
        if old: db().execute('DELETE FROM platform_settings WHERE name=?',('auth_session:'+digest(old),))
        put('auth_session:'+digest(token),dict(email=email,created=time.time(),device=request.user_agent.string[:200],expires=time.time()+86400))
        return token

    def finish_session(token, new=False):
        session.clear();session.update(auth_session=token,csrf=secrets.token_urlsafe(32));session.permanent=True
        return jsonify(verified=True,created=new,redirect='/welcome' if new else '/')

    def revoke_email_sessions(email):
        for row in db().execute("SELECT name FROM platform_settings WHERE name LIKE 'auth_session:%'").fetchall():
            if read(row[0],{}).get('email')==email:
                db().execute('DELETE FROM platform_settings WHERE name=?',(row[0],))

    def send_challenge(kind, fallback=False):
        protected_request(); data=body(); resend=kind=='resend'
        if fallback: require_fallback()
        browser=session.get('auth_browser')
        if not browser: raise AIError('Refresh the sign-in page.',403)
        settings=config()
        if not settings.get('sender'): raise AIError('Email sign-in is awaiting sender configuration.',503)
        prior_id=data.get('challenge_id','') if resend else None
        if resend and (not isinstance(prior_id,str) or not re.fullmatch(r'[A-Za-z0-9_-]{32}',prior_id)):
            raise AIError('Start again to request a new code.',400)
        email=None if resend else normalize_email(data.get('email'))
        if not resend and kind not in {'signup','signin','reset'}: raise AIError('Choose a supported sign-in method.',400)
        if kind=='signup': password(data.get('password'))
        if not fallback: verify_bot()
        cid=secrets.token_urlsafe(24); code=f'{secrets.randbelow(1000000):06d}'
        # Quotas and the challenge are committed together. Only local database
        # work may replay on a revision conflict; SMTP never does.
        def prepare():
            prior=read('auth_code:'+prior_id,{}) if resend else None
            if resend:
                if (not prior or prior.get('used') or prior.get('expires',0)+3000<=time.time()
                        or not hmac.compare_digest(prior.get('browser',''),digest(browser))):
                    raise AIError('Start again to request a new code.',403)
                auth_method(prior,fallback)
            purpose=prior['purpose'] if resend else kind
            target=prior['email'] if resend else email
            if fallback: fallback_limits(target,browser,'send')
            # Shared email cooldowns also apply across normal/fallback routes.
            charge_limit('auth_rate:global',500,3600)
            charge_limit('auth_rate:browser:'+digest(browser),20,3600)
            charge_limit('auth_rate:email:'+digest(target),5,3600)
            charge_limit('auth_rate:resend:'+digest(target),1,60)
            prune_auth()
            existing=read('auth_account:'+digest(target))
            allowed=(not existing) if purpose=='signup' else bool(existing and not existing.get('disabled'))
            hashed=prior.get('password_hash') if resend else (generate_password_hash(data['password'],method=PASSWORD_METHOD) if purpose=='signup' else None)
            if resend: db().execute('DELETE FROM platform_settings WHERE name=?',('auth_code:'+prior_id,))
            # Different browsers must not invalidate each other's active codes.
            latest_key='auth_latest:'+digest(target+'|'+browser+'|'+purpose)
            previous=read(latest_key)
            if previous: db().execute('DELETE FROM platform_settings WHERE name=?',('auth_code:'+previous,))
            put(latest_key,cid)
            now=time.time()
            record=dict(email=target,browser=digest(browser),code=code_hash(cid,browser,target,code),
                issued_at=now,expires=now+600,attempts=0,used=False,purpose=purpose,
                method='email_fallback' if fallback else 'turnstile',password_hash=hashed if allowed else None,allowed=allowed)
            if not fallback: record['bot_verified_at']=now
            put('auth_code:'+cid,record)
            return target,purpose,allowed
        email,kind,allowed=replayable_write(db(),prepare)
        if allowed:
            try:
                if app.testing and 'auth_send' in app.extensions: app.extensions['auth_send'](email,code)
                else:
                    import zcatalyst_sdk
                    label={'signup':'email verification','signin':'sign-in','reset':'password reset'}[kind]
                    zcatalyst_sdk.initialize(req=request,scope='admin').email().send_mail(dict(
                        from_email=settings['sender'],to_email=[email],display_name='Poll Pilled',
                        subject='Your Poll Pilled '+label+' code',html_mode=False,
                        content=f'Your Poll Pilled {label} code is {code}.\n\nIt expires in 10 minutes. Do not share this code. If you did not request it, ignore this email.'))
            except Exception:
                replayable_write(db(),lambda:db().execute('DELETE FROM platform_settings WHERE name=?',('auth_code:'+cid,)))
                raise AIError('The email could not be delivered. Please try again later.',503) from None
        # The response does not reveal account existence or eligibility.
        return jsonify(challenge_id=cid,expires_in=600,resend_after=60,verification_security_required=False)

    @app.post('/api/auth/resend-code')
    def resend_code(): return send_challenge('resend')

    @app.post('/api/auth/register')
    def register_account(): return send_challenge('signup')

    def code_purpose():
        purpose=body().get('purpose','signin')
        if not isinstance(purpose,str) or purpose not in {'signin','reset'}: raise AIError('Choose sign-in or password recovery.',400)
        return purpose

    @app.post('/api/auth/request-code')
    def request_code(): return send_challenge(code_purpose())

    @app.post('/api/auth/email-fallback/register')
    def fallback_register(): return send_challenge('signup',True)

    @app.post('/api/auth/email-fallback/request-code')
    def fallback_request_code(): return send_challenge(code_purpose(),True)

    @app.post('/api/auth/email-fallback/resend-code')
    def fallback_resend_code(): return send_challenge('resend',True)

    @app.post('/api/auth/login')
    def password_login():
        protected_request();data=body();email=normalize_email(data.get('email'));verify_bot()
        auth_limits(email)
        value=data.get('password','')
        if not isinstance(value,str) or len(value)>128: raise AIError('Email or password is incorrect. Try again or use an email code.',403)
        account=read('auth_account:'+digest(email),{})
        valid=check_password_hash(account.get('password_hash') or dummy_password,value)
        if not valid or not account or account.get('disabled'):
            raise AIError('Email or password is incorrect. Try again or use an email code.',403)
        with db(): token=grant_session(email)
        return finish_session(token)

    def check_code_record(cid,browser,fallback):
        record=read('auth_code:'+cid,{})
        if (not record or record.get('used') or record['expires']<=time.time() or record['attempts']>=5
                or not browser or not hmac.compare_digest(record['browser'],digest(browser))):
            raise AIError('This code expired or cannot be used. Request a new code.',403)
        auth_method(record,fallback)
        return record

    def complete_code(fallback=False):
        protected_request(); data=body()
        if fallback: require_fallback()
        cid=data.get('challenge_id','');code=data.get('code','');browser=session.get('auth_browser','')
        if not isinstance(cid,str) or not re.fullmatch(r'[A-Za-z0-9_-]{32}',cid) or not isinstance(code,str) or not re.fullmatch(r'[0-9]{6}',code):
            raise AIError('Enter the six-digit code from your email.',400)
        record=check_code_record(cid,browser,fallback)
        # Legacy normal codes still need real Turnstile proof. Fallback records
        # carry a distinct server-only method, never fabricated bot verification.
        if not fallback and not verified_continuation(record,browser): verify_bot()
        def consume():
            record=check_code_record(cid,browser,fallback)
            if fallback: fallback_limits(record['email'],browser,'verify')
            valid=hmac.compare_digest(record['code'],code_hash(cid,browser,record['email'],code)) and record.get('allowed',True)
            record['attempts']+=1
            account_key='auth_account:'+digest(record['email']);account=read(account_key)
            purpose=record.get('purpose','signin')
            valid=bool(valid and not (account and account.get('disabled'))
                       and ((not account and record.get('password_hash')) if purpose=='signup' else account))
            record['used']=valid
            put('auth_code:'+cid,record)
            if not valid: return None
            new=False;token=None;reset_token=None
            if purpose=='signup':
                put(account_key,dict(user_id='pp-'+digest(record['email']),created=time.time(),password_hash=record['password_hash']))
                new=True
            if purpose=='reset':
                reset_token=secrets.token_urlsafe(32)
                grant=dict(email=record['email'],browser=digest(browser),expires=time.time()+600,
                           method='email_fallback' if fallback else 'turnstile')
                if not fallback: grant['bot_verified_at']=time.time()
                put('auth_reset:'+digest(reset_token),grant)
            else: token=grant_session(record['email'])
            record.pop('password_hash',None);put('auth_code:'+cid,record)
            settings=config();settings['delivery_verified']=True;put('auth_config',settings)
            return token,new,reset_token
        outcome=replayable_write(db(),consume)
        # Commit failed guesses before returning an error, so lockouts persist.
        if not outcome: raise AIError('That code did not match or cannot be used. Check your email or request a new code.',403)
        token,new,reset_token=outcome
        if reset_token:
            session['password_reset']=reset_token
            return jsonify(verified=True,reset_required=True,verification_security_required=False)
        return finish_session(token,new)

    @app.post('/api/auth/verify-code')
    def verify_code(): return complete_code()

    @app.post('/api/auth/email-fallback/verify-code')
    def fallback_verify_code(): return complete_code(True)

    def complete_password_reset(fallback=False):
        protected_request();data=body()
        if fallback: require_fallback()
        key='auth_reset:'+digest(session.get('password_reset',''));browser=session.get('auth_browser','')
        def current_grant():
            grant=read(key,{})
            if not grant or grant.get('expires',0)<=time.time() or not browser or not hmac.compare_digest(grant.get('browser',''),digest(browser)):
                raise AIError('Verify your email again before setting a password.',403)
            auth_method(grant,fallback)
            return grant
        grant=current_grant()
        if not fallback and not verified_continuation(grant,browser): verify_bot()
        auth_limits(grant['email'],'reset')
        hashed=generate_password_hash(password(data.get('password')),method=PASSWORD_METHOD)
        def reset():
            grant=current_grant()
            account_key='auth_account:'+digest(grant['email']);account=read(account_key,{})
            if not account or account.get('disabled'): raise AIError('This account is unavailable.',403)
            account['password_hash']=hashed;put(account_key,account)
            revoke_email_sessions(grant['email'])
            for row in db().execute("SELECT name FROM platform_settings WHERE name LIKE 'auth_reset:%' OR name LIKE 'auth_code:%'").fetchall():
                if read(row[0],{}).get('email')==grant['email']:
                    db().execute('DELETE FROM platform_settings WHERE name=?',(row[0],))
            return grant_session(grant['email'])
        return finish_session(replayable_write(db(),reset))

    @app.post('/api/auth/reset-password')
    def reset_password(): return complete_password_reset()

    @app.post('/api/auth/email-fallback/reset-password')
    def fallback_reset_password(): return complete_password_reset(True)

    @app.post('/api/auth/logout')
    def logout():
        protected_request()
        token=session.get('auth_session')
        if token:
            with db(): db().execute('DELETE FROM platform_settings WHERE name=?',('auth_session:'+digest(token),))
        custom=enabled();session.clear()
        return jsonify(redirect='/sign-in' if custom else '/__catalyst/auth/login',custom=custom)

    def owned_sessions():
        current=user()
        if not current: return []
        result=[]
        for row in db().execute("SELECT name FROM platform_settings WHERE name LIKE 'auth_session:%'"):
            value=read(row[0],{})
            if value.get('email')==current['email_id'] and value.get('expires',0)>time.time():
                result.append((row[0],value))
        return result

    @app.get('/api/community/sessions')
    def list_sessions():
        current='auth_session:'+digest(session.get('auth_session',''))
        return jsonify(sessions=[dict(id=name.split(':',1)[1],current=name==current,device=value.get('device','Browser session'),expires=value['expires']) for name,value in owned_sessions()])

    @app.post('/api/community/sessions/revoke')
    def revoke_session():
        ident=body().get('id'); allowed={name for name,value in owned_sessions()}
        name='auth_session:'+str(ident)
        if name not in allowed: raise AIError('Session not found.',404)
        if name=='auth_session:'+digest(session.get('auth_session','')): raise AIError('Use Sign out for this device.',409)
        with db(): db().execute('DELETE FROM platform_settings WHERE name=?',(name,))
        return jsonify(revoked=True)

    @app.post('/api/community/account/delete')
    def delete_account():
        current=user()
        if not current: raise AIError('Sign in to manage your account.',401)
        if is_admin(): raise AIError('The platform administrator cannot delete their only admin account.',409)
        if body().get('confirmation')!='DELETE': raise AIError('Type DELETE to confirm.',400)
        who=session['viewer']; sessions=owned_sessions(); account_key='auth_account:'+digest(current['email_id'])
        # Disable sign-in first and erase personal profile fields atomically. Anonymous
        # poll answers and ledger entries stay for research and financial audit.
        with db():
            db().execute('BEGIN IMMEDIATE')
            account=read(account_key,{});account.update(disabled=True,deleted_at=time.time());put(account_key,account)
            for name,value in sessions: db().execute('DELETE FROM platform_settings WHERE name=?',(name,))
            from community import DEFAULTS
            db().execute('UPDATE pp_accounts SET preferences=?,draft=? WHERE viewer=?',(json.dumps({**DEFAULTS,'tagline':'Former participant','followups':False,'notifications':False,'deleted':True}),'{}',who))
            db().execute('DELETE FROM pp_follows WHERE follower=? OR publisher=?',(who,who))
            for table in ('pp_saved','pp_claims','pp_notice_reads'): db().execute('DELETE FROM '+table+' WHERE viewer=?',(who,))
            # Existing funded responses retain their rewards. Unfilled campaigns are
            # settled by the shared routine on the next request/job.
            db().execute("UPDATE pp_polls SET closes_at=? WHERE owner=? AND status!='ended'",('2000-01-01',who))
            db().execute("UPDATE pp_followups SET expires_at=? WHERE owner=? AND status='open'",('2000-01-01',who))
        session.clear();return jsonify(deleted=True)

    @app.get('/api/admin/auth')
    def admin_auth_status():
        if not is_admin(): raise AIError('Administrator access required.',403)
        settings=config()
        return jsonify(sender=settings.get('sender',''),enabled=settings.get('enabled') is True,
                       delivery_verified=settings.get('delivery_verified') is True,turnstile_ready=bool(turnstile_config(app)))

    @app.post('/api/admin/auth')
    def admin_auth_settings():
        if not is_admin(): raise AIError('Administrator access required.',403)
        data=body();settings=config()
        if 'sender' in data:
            sender=normalize_email(data['sender'])
            if sender!=settings.get('sender'):
                settings.update(sender=sender,delivery_verified=False)
        if data.get('enabled') is True:
            if not settings.get('delivery_verified') or not turnstile_config(app):
                raise AIError('Verify Turnstile and complete an email-code sign-in before activation.',409)
            verified=user()
            if not verified or verified['email_id']!=g.platform_email.casefold():
                raise AIError('Complete the email-code sign-in with your administrator email before activation.',409)
            settings['enabled']=True
        with db():
            put('auth_config',settings)
            # Link the existing verified Catalyst account to its unchanged viewer ID.
            existing=getattr(g,'platform_user',None)
            if existing:
                key='auth_account:'+digest(existing['email_id'].casefold())
                if not read(key): put(key,dict(user_id=str(existing['user_id']),created=time.time()))
        return admin_auth_status()

    return app.extensions['custom_auth']
