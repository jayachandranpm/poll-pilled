"""Encrypted local AI cache and atomic per-session spend reservations.

The vault key is independent of Flask's cookie-signing key. No prompt, credential,
or provider response is written to the usage ledger. Dollar amounts are estimates,
not invoices; ambiguous provider failures retain the reservation conservatively.
"""
import base64
import hashlib
import json
import math
import os
from pathlib import Path
import time
import uuid
from cryptography.fernet import Fernet, InvalidToken
from flask import g, session


def vault_cipher(app):
    supplied = app.config.get('AI_VAULT_KEY') or os.getenv('AI_VAULT_KEY')
    if supplied:
        return Fernet(supplied.encode() if isinstance(supplied, str) else supplied)
    # Tests and separate instances must never share a vault with the real app.
    path = Path(app.config['DATABASE']).parent / '.ai-vault-key'
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'wb') as out:
            out.write(Fernet.generate_key())
    except FileExistsError:
        pass
    os.chmod(path, 0o600)
    return Fernet(path.read_bytes().strip())


class AIRuntime:
    def __init__(self, app, db, cipher, error):
        self.app, self.db, self.cipher, self.error = app, db, cipher, error

    def initialize(self):
        self.db().executescript('''
        CREATE TABLE IF NOT EXISTS ai_preferences(viewer TEXT PRIMARY KEY, daily_limit REAL NOT NULL DEFAULT 1, enabled INTEGER NOT NULL DEFAULT 1);
        CREATE TABLE IF NOT EXISTS ai_cache(viewer TEXT NOT NULL, digest TEXT NOT NULL, result BLOB NOT NULL, expires REAL NOT NULL, PRIMARY KEY(viewer,digest));
        CREATE TABLE IF NOT EXISTS ai_calls(id TEXT PRIMARY KEY, viewer TEXT NOT NULL, digest TEXT NOT NULL, task TEXT NOT NULL, started REAL NOT NULL, state TEXT NOT NULL, cost REAL NOT NULL, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0, cached_tokens INTEGER NOT NULL DEFAULT 0);
        CREATE UNIQUE INDEX IF NOT EXISTS ai_one_inflight ON ai_calls(viewer,digest) WHERE state='pending';
        CREATE INDEX IF NOT EXISTS ai_call_budget ON ai_calls(viewer,started);
        ''')
        self.db().commit()

    def status(self):
        viewer = session['viewer']
        pref = self.db().execute('SELECT * FROM ai_preferences WHERE viewer=?', (viewer,)).fetchone()
        day = int(time.time() // 86400) * 86400
        row = self.db().execute("SELECT COALESCE(SUM(cost),0) spend, COUNT(*) requests, COALESCE(SUM(cached_tokens),0) cached_tokens FROM ai_calls WHERE viewer=? AND started>=?", (viewer, day)).fetchone()
        hits = self.db().execute("SELECT COUNT(*) FROM ai_calls WHERE viewer=? AND started>=? AND state='cache'", (viewer, day)).fetchone()[0]
        platform=self.app.extensions['platform_read']('ai_limits', {}) if self.app.config.get('PLATFORM_MODE') else {}
        return dict(daily_limit=platform.get('daily_usd', pref['daily_limit'] if pref else 1.0), enabled=platform.get('enabled', bool(pref['enabled']) if pref else True),
                    spent_usd=round(row['spend'], 6), requests=row['requests']-hits, cache_hits=hits,
                    cached_input_tokens=row['cached_tokens'], resets_at=day+86400, cache_hours=24,
                    currency='USD', estimated=True, mode='Economy', rate_date='2026-10-30')

    def preferences(self, data):
        current = self.status()
        limit = data.get('daily_limit', current['daily_limit'])
        enabled = data.get('enabled', current['enabled'])
        if isinstance(limit, bool) or not isinstance(limit, (int, float)) or not math.isfinite(limit) or not .01 <= limit <= 100 or not isinstance(enabled, bool):
            raise self.error('Choose a daily limit between $0.01 and $100.', 400)
        with self.db():
            self.db().execute('INSERT INTO ai_preferences VALUES (?,?,?) ON CONFLICT(viewer) DO UPDATE SET daily_limit=excluded.daily_limit,enabled=excluded.enabled', (session['viewer'], round(limit, 2), int(enabled)))
        return self.status()

    def clear(self):
        with self.db():
            self.db().execute('DELETE FROM ai_cache WHERE viewer=?', (session['viewer'],))

    def run(self, task, payload, credential, reserve, work, use_cache=True):
        """work returns (JSON-safe result, optional metered usage). Never retry billing calls."""
        from catalyst_storage import replayable_write
        viewer, started = session['viewer'], time.time()
        digest = hashlib.sha256(json.dumps(['v2', task, hashlib.sha256(credential.encode()).hexdigest(), payload], sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        ident = uuid.uuid4().hex
        conn = self.db()
        # Rebase only the local budget/cache transaction on a known revision
        # conflict. Provider work below must never be repeated by this retry.
        def reserve_call():
            limits = self.status()
            if not limits['enabled']:
                raise self.error('AI is paused. Enable it in Settings → AI connections.', 409)
            conn.execute('DELETE FROM ai_cache WHERE expires<?', (started,))
            conn.execute("UPDATE ai_calls SET state='uncertain' WHERE state='pending' AND started<?", (started-180,))
            cached = conn.execute('SELECT result FROM ai_cache WHERE viewer=? AND digest=?', (viewer, digest)).fetchone() if use_cache else None
            if cached:
                try:
                    result = json.loads(self.cipher.decrypt(cached['result']))
                except (InvalidToken, ValueError):
                    conn.execute('DELETE FROM ai_cache WHERE viewer=? AND digest=?',(viewer,digest))
                    cached = None
            if cached:
                conn.execute('INSERT INTO ai_calls(id,viewer,digest,task,started,state,cost) VALUES (?,?,?,?,?,?,0)', (ident,viewer,digest,task,started,'cache'))
                return True, result
            if conn.execute("SELECT 1 FROM ai_calls WHERE viewer=? AND digest=? AND state='pending'", (viewer,digest)).fetchone():
                raise self.error('This AI request is already running. Wait for it to finish.', 409)
            if conn.execute("SELECT COUNT(*) FROM ai_calls WHERE viewer=? AND started>? AND state!='cache'", (viewer,started-60)).fetchone()[0] >= 10:
                raise self.error('Please wait a minute before running more AI actions.', 429)
            spent = conn.execute('SELECT COALESCE(SUM(cost),0) FROM ai_calls WHERE viewer=? AND started>=?',(viewer,int(started//86400)*86400)).fetchone()[0]
            if spent + reserve > limits['daily_limit'] + 1e-9:
                raise self.error('This request would exceed your daily AI limit. Adjust it in Settings → AI connections.', 429)
            if self.app.config.get('PLATFORM_MODE'):
                platform=self.app.extensions['platform_read']('ai_limits', {})
                day=int(started//86400)*86400
                total=conn.execute('SELECT COALESCE(SUM(cost),0) FROM ai_calls WHERE started>=?',(day,)).fetchone()[0]
                if total+reserve > platform.get('platform_daily_usd',10):
                    raise self.error('The platform AI budget has been reached. Try again tomorrow.',429)
                allowed=platform.get(task, {'image':5,'draft':20,'rephrase':30,'transcription':10,'speech':10}.get(task,20))
                used=conn.execute("SELECT COUNT(*) FROM ai_calls WHERE viewer=? AND task=? AND started>=? AND state!='cache'",(viewer,task,day)).fetchone()[0]
                if used>=allowed: raise self.error('Your daily limit for this AI feature has been reached.',429)
            conn.execute('INSERT INTO ai_calls(id,viewer,digest,task,started,state,cost) VALUES (?,?,?,?,?,?,?)', (ident,viewer,digest,task,started,'pending',reserve))
            return False, None
        cached, result = replayable_write(conn, reserve_call)
        if cached:
            g.ai_usage = dict(cached=True, estimated_usd=0, task=task)
            return result
        try:
            result, usage = work()
        except Exception as exc:
            replayable_write(conn, lambda: conn.execute("UPDATE ai_calls SET state='failed',cost=? WHERE id=?", (0 if getattr(exc,'unbilled',False) else reserve,ident)))
            raise
        usage = usage or {}
        cost = usage.get('cost', reserve)
        if not isinstance(cost, (int,float)) or not math.isfinite(cost) or cost < 0:
            cost = reserve
        def finish():
            conn.execute("UPDATE ai_calls SET state='complete',cost=?,input_tokens=?,output_tokens=?,cached_tokens=? WHERE id=?", (cost,usage.get('input',0),usage.get('output',0),usage.get('cached',0),ident))
            if use_cache:
                conn.execute('INSERT INTO ai_cache VALUES (?,?,?,?) ON CONFLICT(viewer,digest) DO UPDATE SET result=excluded.result,expires=excluded.expires', (viewer,digest,self.cipher.encrypt(json.dumps(result).encode()),started+86400))
        # Other requests may have saved during model inference. Rebase the
        # completed-result write, never repeat the billable work above.
        replayable_write(conn, finish)
        g.ai_usage = dict(cached=False, estimated_usd=round(cost,6), task=task)
        return result
