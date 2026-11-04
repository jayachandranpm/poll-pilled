"""Optional Cloudflare Access identity + action-specific Turnstile verification.

Local mode is explicitly unprotected. Enabling either service requires complete
configuration and fails closed. Edge WAF/rate limits are configured separately.
"""
import hashlib
import hmac
import json
import os
import re
import secrets
import time
from cloudflare_store import turnstile_config
from catalyst_storage import replayable_write
import urllib.error
import urllib.request
from flask import g, jsonify, request, session

# Signed-in creation tools use the existing AI rate limits, daily feature caps,
# atomic budget reservations and duplicate guards instead of another CAPTCHA.
# Keep credential, quota and administrator settings out of this exact allowlist.
AI_TOOL_POST_ROUTES = frozenset({
    '/api/ai', '/api/ai/assist', '/api/ai/image', '/api/ai/transcribe',
    '/api/ai/vision', '/api/ai/segment', '/api/ai/studio',
    '/api/ai/studio/review', '/api/ai/insights', '/api/cloudflare/speech',
    '/api/community/polls/<pid>/insights',
    '/api/community/responses/<rid>/transcribe',
})

# These authenticated, bounded actions do not publish polls, buy/redeem credits,
# or grant account access. Participant answers retain eligibility, reservation,
# duplicate-response and reward-ledger validation. Match Flask's actual route rule, never a client flag
# or a loose URL prefix. Unknown/new writes remain protected by default.
ROUTINE_POST_ROUTES = frozenset({
    '/api/community/preferences', '/api/community/onboarding',
    '/api/community/draft', '/api/community/quote', '/api/polls/quote',
    '/api/community/audience-preview', '/api/community/notifications/read',
    '/api/community/sessions/revoke', '/api/upload',
    '/api/community/polls/<pid>/claim', '/api/community/polls/<pid>/answer',
    '/api/community/followups/<fid>/answer', '/api/community/polls/<pid>/save',
    '/api/community/polls/<pid>/react', '/api/community/polls/<pid>/report',
    '/api/community/responses/<rid>/appeal',
    '/api/community/people/<public_id>/follow',
    '/api/community/people/<public_id>/alerts',
    '/api/polls/<poll_id>/save', '/api/profile',
}) | AI_TOOL_POST_ROUTES


def register_security(app, db=None):
    names = ('CF_ACCESS_TEAM_DOMAIN','CF_ACCESS_AUD','TURNSTILE_SITE_KEY','TURNSTILE_SECRET_KEY','TURNSTILE_HOSTNAME')
    for name in names:
        app.config.setdefault(name, os.getenv(name, ''))
    access = bool(app.config['CF_ACCESS_TEAM_DOMAIN'] or app.config['CF_ACCESS_AUD'])
    turnstile = any(app.config[name] for name in names[2:])
    jwks = None
    issuer = app.config['CF_ACCESS_TEAM_DOMAIN'].rstrip('/')
    if access:
        if not re.fullmatch(r'https://[a-z0-9-]+\.cloudflareaccess\.com', issuer) or not app.config['CF_ACCESS_AUD']:
            raise ValueError('Cloudflare Access requires a valid team domain and application AUD.')
        import jwt
        jwks = jwt.PyJWKClient(issuer+'/cdn-cgi/access/certs', timeout=5)
        app.config['SESSION_COOKIE_SECURE'] = True
    if turnstile and not all(app.config[name] for name in names[2:]):
        raise ValueError('Turnstile requires the site key, secret key, and expected hostname.')

    def verify_access():
        if not access:
            return None
        import jwt
        token = request.headers.get('Cf-Access-Jwt-Assertion', '')
        try:
            key = jwks.get_signing_key_from_jwt(token).key
            claims = jwt.decode(token, key, algorithms=['RS256'], audience=app.config['CF_ACCESS_AUD'], issuer=issuer,
                                options={'require':['exp','iat','sub','iss','aud']})
            subject = claims['sub']
            if not isinstance(subject,str) or not subject:
                raise ValueError('Missing identity')
        except (jwt.PyJWTError, ValueError, TypeError):
            return jsonify(error='Sign in through Cloudflare Access to continue.'),401
        g.access_verified = True
        viewer = 'cf-'+hmac.new(str(app.config['SECRET_KEY']).encode(), subject.encode(), hashlib.sha256).hexdigest()
        if session.get('viewer') != viewer:
            session.clear()
            session.update(viewer=viewer, csrf=secrets.token_urlsafe(32))
            session.permanent=True

    def authenticated():
        # Set only by verified identity middleware in this request. A signed
        # anonymous/local session or a submitted viewer ID is not sufficient.
        return bool(getattr(g,'platform_user',None) or getattr(g,'access_verified',False))

    def routine_write():
        return (authenticated() and request.method=='POST' and request.url_rule
                and request.url_rule.rule in ROUTINE_POST_ROUTES)

    def verify_write():
        current=turnstile_config(app)
        if request.path in {'/api/cloudflare/turnstile','/api/cloudflare/turnstile/activate'}: return None
        if not current or not request.path.startswith('/api/') or request.method not in {'POST','PUT','PATCH','DELETE'} or routine_write():
            return None
        from cloudflare_integration import check_token
        from meta_ai import AIError
        try:
            check_token(current,request.headers.get('X-Turnstile-Token',''),'poll_write')
        except AIError as error:
            return jsonify(error=str(error)),error.status

    def status():
        current=turnstile_config(app)
        return dict(access_enabled=access, turnstile_enabled=bool(current),rate_limits_enabled=True,
                    site_key=current.get('site_key',''),hostname=current.get('hostname',''),
                    captcha_policy=dict(version=1,free_posts=sorted(ROUTINE_POST_ROUTES) if authenticated() else []),
                    edge_status='Verify in Cloudflare dashboard', mode='Cloudflare configured' if access or current else 'Local demo')
    def throttle():
        if not db or not request.path.startswith('/api/') or request.method not in {'POST','PUT','PATCH','DELETE'}: return None
        # Never trust a client-supplied forwarded IP. Access provides the account identity.
        identity=session.get('viewer') if authenticated() else request.remote_addr
        identity=identity or 'unknown'
        subject=hmac.new(str(app.config['SECRET_KEY']).encode(),identity.encode(),hashlib.sha256).hexdigest()
        buckets=[(subject,120)]
        # Media and reservations are bounded without interrupting the editor
        # or opening a widget when someone focuses an answer control.
        rule=request.url_rule.rule if request.url_rule else ''
        if rule=='/api/upload': buckets.append((subject+':upload',10))
        if rule=='/api/community/polls/<pid>/claim': buckets.append((subject+':claim',20))
        if rule in {'/api/community/polls/<pid>/answer','/api/community/followups/<fid>/answer'}:
            buckets.append((subject+':submission',20))
        current=time.time()
        def write():
            db().execute('DELETE FROM security_limits WHERE created<?',(current-60,))
            for key,limit in buckets:
                if db().execute('SELECT COUNT(*) FROM security_limits WHERE subject=?',(key,)).fetchone()[0]>=limit:
                    response=jsonify(error='Too many requests. Please wait a minute.');response.status_code=429;response.headers['Retry-After']='60';return response
            db().executemany('INSERT INTO security_limits VALUES (?,?)',[(key,current) for key,limit in buckets])
        return replayable_write(db(), write)
    return dict(verify_access=verify_access,verify_write=verify_write,status=status,throttle=throttle)
