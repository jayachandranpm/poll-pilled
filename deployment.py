"""Deployment identity and administrative boundaries.

Never infer an administrator from request headers, a form field, or a local
browser identity. Catalyst verifies the user before the allowlisted email is used.
"""
import hashlib
import hmac
import json
import os
import secrets
from functools import wraps
from flask import g, jsonify, request, session, redirect
from ai_runtime import vault_cipher


def settlement_key(app):
    return hmac.new(str(app.config['SECRET_KEY']).encode(),b'poll-pilled:settlement:v1',hashlib.sha256).hexdigest()


def is_admin():
    return bool(getattr(g, 'platform_admin', False))


def register_deployment(app, db):
    app.config.setdefault('CATALYST_AUTH_ENABLED', os.getenv('PP_CATALYST_AUTH_ENABLED') == 'true')
    app.config.setdefault('PLATFORM_MODE', os.getenv('PLATFORM_MODE') == 'true')
    app.config.setdefault('ADMIN_EMAIL', os.getenv('ADMIN_EMAIL', 'jayachandranpm2001@gmail.com'))
    app.config.setdefault('PAYMENTS_MODE', os.getenv('PAYMENTS_MODE', 'disabled'))
    if app.config['CATALYST_AUTH_ENABLED']:
        app.config['SESSION_COOKIE_SECURE'] = True
        if not os.getenv('SECRET_KEY') or not os.getenv('AI_VAULT_KEY'):
            raise RuntimeError('Stable SECRET_KEY and AI_VAULT_KEY are required for Catalyst.')
    cipher = vault_cipher(app)
    app.extensions['platform_db'] = db

    def read(key, default=None):
        row = db().execute('SELECT value FROM platform_settings WHERE name=?', (key,)).fetchone()
        return json.loads(cipher.decrypt(bytes(row[0]))) if row else default

    def write(key, value):
        with db():
            db().execute('INSERT INTO platform_settings VALUES (?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value',
                         (key, cipher.encrypt(json.dumps(value).encode())))

    app.extensions['platform_read'] = read
    app.extensions['platform_write'] = write

    def sign_in_required(message):
        custom = app.extensions.get('custom_auth')
        login = '/sign-in' if custom and custom['enabled']() else '/__catalyst/auth/login'
        if request.method == 'GET' and request.path in {'/', '/poll-deck.html', '/admin', '/welcome'}:
            return redirect(login)
        return jsonify(error=message, login_required=True, login_url=login), 401

    def identity():
        g.platform_admin = False
        custom = app.extensions.get('custom_auth')
        if custom and custom['enabled']():
            user = custom['user']()
            if not user: return sign_in_required('Sign in securely to continue.')
        elif not app.config['CATALYST_AUTH_ENABLED']:
            # Explicit test injection; never an HTTP header or query parameter.
            if app.testing and app.config.get('TEST_PLATFORM_USER'):
                user = app.config['TEST_PLATFORM_USER']
            else:
                return None
        else:
            if request.path == '/health':
                return None
            try:
                import zcatalyst_sdk
                user = zcatalyst_sdk.initialize(req=request).authentication().get_current_user()
            except Exception:
                return sign_in_required('Sign in to Poll Pilled to continue.')
        if not isinstance(user, dict) or not user.get('user_id') or not user.get('email_id'):
            return sign_in_required('A verified app account is required.')
        if user.get('status') not in (None, 'ACTIVE', 'Active', 'active') or user.get('is_confirmed') is False:
            return jsonify(error='Verify your email before continuing.'), 403
        subject = str(user['user_id'])
        viewer = 'zc-' + hmac.new(str(app.config['SECRET_KEY']).encode(), subject.encode(), hashlib.sha256).hexdigest()
        if session.get('viewer') != viewer:
            grant = session.get('auth_session')
            session.clear()
            session.update(viewer=viewer, csrf=secrets.token_urlsafe(32))
            if grant: session['auth_session'] = grant
        g.platform_admin = user['email_id'].casefold() == app.config['ADMIN_EMAIL'].casefold()
        g.platform_email = user['email_id']
        g.platform_user = user
        return None

    def protect():
        if request.path=='/internal/settlement':
            if request.method!='POST' or not hmac.compare_digest(request.headers.get('X-Settlement-Key',''),settlement_key(app)):
                return jsonify(error='Not found.'),404
            return None
        if os.getenv('WEBHOOK_ONLY')=='true':
            if request.path not in {'/health','/api/payments/webhook'}:
                return jsonify(error='Not found.'),404
            return None
        if request.path == '/api/payments/webhook':
            return jsonify(error='Use the dedicated webhook receiver.'),404
        from custom_auth import PUBLIC_AUTH_PATHS
        if request.path in PUBLIC_AUTH_PATHS:
            return None
        if request.method in {'GET','HEAD'} and (request.path == '/health' or request.path.startswith('/assets/')):
            return None
        error = identity()
        if error is not None:
            return error
        if not app.config['PLATFORM_MODE']:
            return None
        path = request.path
        if path == '/api/ai/speech':
            return jsonify(error='Use the configured AI voice studio. Muse Model API currently provides transcription, not voice synthesis.'), 410
        admin_paths = {'/api/ai/connections', '/api/ai/connections/test', '/api/ai/preferences', '/api/ai/cache/clear',
                       '/api/cloudflare/settings', '/api/cloudflare/voice', '/api/cloudflare/turnstile', '/api/cloudflare/turnstile/activate'}
        if (path.startswith('/api/admin') or path == '/admin' or path in admin_paths) and not is_admin():
            return jsonify(error='Administrator access required.'), 403
        if path.startswith('/api/') and not path.startswith(('/api/community/', '/api/ai', '/api/admin/', '/api/payments/', '/api/cloudflare/')) and path not in {'/api/upload','/api/session'}:
            return jsonify(error='This legacy endpoint is not available in the deployed app.'), 410
        if path == '/api/community/redeem':
            return jsonify(error='Cash-outs are a placeholder; points have not been deducted.'), 410
        if path == '/api/community/credits' and app.config['PAYMENTS_MODE']=='live':
            return jsonify(error='Simulated credits are unavailable in live mode.'), 410

    @app.get('/api/admin/settings')
    def admin_settings():
        if not is_admin():
            return jsonify(error='Administrator access required.'), 403
        limits = {**dict(enabled=True,daily_usd=1,platform_daily_usd=10,image=5,draft=20,rephrase=30,transcription=10,vision=20,insights=20,segmentation=20,speech=10,review=20),**read('ai_limits',{})}
        return jsonify(limits=limits, meta_configured=bool(read('meta_key', '') or os.getenv('MODEL_API_KEY')),
                       project_id='22220000000763319', payments_mode=app.config['PAYMENTS_MODE'],
                       stripe_configured=bool(read('stripe',{}).get('secret_key')),
                       currency=read('stripe',{}).get('currency','usd'),unit_minor=read('stripe',{}).get('unit_minor',100))

    @app.post('/api/admin/settings')
    def save_admin_settings():
        if not is_admin():
            return jsonify(error='Administrator access required.'), 403
        data = request.get_json(silent=True)
        if not isinstance(data, dict) or not data or set(data)-{'meta_key','limits','stripe'}:
            return jsonify(error='Provide a settings object with supported fields.'), 400
        changes = {}
        if 'meta_key' in data:
            key = data['meta_key']
            if not isinstance(key, str) or not 8 <= len(key.strip()) <= 4096 or any(c.isspace() for c in key.strip()):
                return jsonify(error='Enter a valid Meta API key.'), 400
            changes['meta_key'] = key.strip()
        if 'limits' in data:
            limits = data['limits']
            expected = {'enabled', 'daily_usd', 'platform_daily_usd', 'image', 'draft', 'rephrase', 'transcription'}
            if not isinstance(limits, dict) or not expected<=set(limits) or set(limits)-expected-{'vision','insights','segmentation','speech','review'} or type(limits['enabled']) is not bool:
                return jsonify(error='Provide every AI limit.'), 400
            import math
            if any(type(limits[k]) not in (float, int) or not math.isfinite(limits[k]) or not .01 <= limits[k] <= 100 for k in ('daily_usd', 'platform_daily_usd')):
                return jsonify(error='Daily budgets must be between $0.01 and $100.'), 400
            if any(type(limits[k]) is not int or not 0 <= limits[k] <= 100 for k in ('image', 'draft', 'rephrase', 'transcription','vision','insights','segmentation','speech','review') if k in limits):
                return jsonify(error='Feature limits must be whole numbers from 0 to 100.'), 400
            changes['ai_limits'] = limits
        if 'stripe' in data:
            value=data['stripe']
            if not isinstance(value,dict): return jsonify(error='Provide valid Stripe settings.'),400
            current=read('stripe',{})
            for key,prefix in [('secret_key','sk_test_'),('webhook_secret','whsec_')]:
                if value.get(key):
                    if not isinstance(value[key],str) or not value[key].startswith(prefix) or len(value[key])>512:
                        return jsonify(error='Use Stripe test credentials and a valid webhook signing secret.'),400
                    current[key]=value[key]
            currency=value.get('currency',current.get('currency','usd'));unit=value.get('unit_minor',current.get('unit_minor',100))
            if currency not in ['usd','eur','gbp','inr','cad','aud','sgd'] or type(unit) is not int or not 1<=unit<=10000:
                return jsonify(error='Choose a supported currency and credit value.'),400
            if current.get('currency') and (currency!=current['currency'] or unit!=current['unit_minor']):
                return jsonify(error='Credit denomination is locked after configuration to protect existing balances.'),409
            current.update(currency=currency,unit_minor=unit)
            changes['stripe'] = current
        # Validate the whole form before saving any credential or limit.
        with db():
            for name, value in changes.items():
                db().execute('INSERT INTO platform_settings VALUES (?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value',
                             (name, cipher.encrypt(json.dumps(value).encode())))
        return admin_settings()

    def initialize():
        db().execute('CREATE TABLE IF NOT EXISTS platform_settings(name TEXT PRIMARY KEY,value BLOB NOT NULL)')
        db().commit()
    return dict(protect=protect, initialize=initialize)
