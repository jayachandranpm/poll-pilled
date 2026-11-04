"""Private follow relationships, stable public identities and publication notices.

Publication events commit with their poll. Readers join those events to current
subscriptions, avoiding a growing per-follower fan-out transaction at publish time.
"""
import json
import sqlite3
import uuid
from flask import jsonify, request
from poll_rules import public_identity

FOLLOW_SCHEMA = '''
CREATE TABLE IF NOT EXISTS pp_people(viewer TEXT PRIMARY KEY,public_id TEXT NOT NULL UNIQUE,name TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS pp_follows(follower TEXT NOT NULL,publisher TEXT NOT NULL,created_at TEXT NOT NULL,notify_since TEXT NOT NULL,notify INTEGER NOT NULL CHECK(notify IN (0,1)),PRIMARY KEY(follower,publisher),CHECK(follower!=publisher));
CREATE INDEX IF NOT EXISTS pp_follows_publisher ON pp_follows(publisher,follower);
CREATE TABLE IF NOT EXISTS pp_publications(poll_id TEXT PRIMARY KEY REFERENCES pp_polls(id),publisher TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS pp_publications_publisher ON pp_publications(publisher,created_at DESC);
'''


def assigned_identity(conn, secret, who):
    row=conn.execute('SELECT public_id,name FROM pp_people WHERE viewer=?',(who,)).fetchone()
    if not row:
        base=public_identity(secret,who)['author']
        for attempt in range(8):
            name=base if attempt==0 else base+' '+uuid.uuid4().hex[:4].upper()
            try:
                conn.execute('INSERT INTO pp_people VALUES (?,?,?)',(who,uuid.uuid4().hex,name))
            except sqlite3.IntegrityError:
                pass
            row=conn.execute('SELECT public_id,name FROM pp_people WHERE viewer=?',(who,)).fetchone()
            if row: break
        if not row: raise RuntimeError('Could not allocate an anonymous identity.')
    return dict(id=row[0],author=row[1],initials=''.join(word[0] for word in row[1].split()[:2]))


def backfill_identities(conn, secret):
    # Preserve the names people already know. No legacy polls become new alerts.
    tables={r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    people={r[0] for r in conn.execute('SELECT viewer FROM pp_accounts')}
    if 'pp_polls' in tables: people.update(r[0] for r in conn.execute('SELECT DISTINCT owner FROM pp_polls'))
    if 'pp_responses' in tables: people.update(r[0] for r in conn.execute('SELECT DISTINCT viewer FROM pp_responses'))
    for who in sorted(people): assigned_identity(conn,secret,who)


def content_matches(data, pref):
    if data.get('format') not in pref['formats'] or data.get('language','English') not in pref['languages']: return False
    for origin,preference in [('text_origin','generated_polls'),('image_origin','generated_images'),('audio_origin','generated_audio'),('video_origin','generated_video')]:
        allowed=pref.get(preference,pref.get('generated_media',True))
        if not allowed and data.get(origin)=='generated': return False
    return True


def register_following(ctx):
    from community import CommunityError
    app,bp,db,viewer,prefs,identity,body,mutation,stamp=(ctx[k] for k in ('app','bp','db','viewer','prefs','identity','body','mutation','stamp'))

    def relation(publisher):
        return db().execute('SELECT * FROM pp_follows WHERE follower=? AND publisher=?',(viewer(),publisher)).fetchone()

    def person(public_id):
        row=db().execute('SELECT p.viewer FROM pp_people p JOIN pp_accounts a ON a.viewer=p.viewer WHERE p.public_id=?',(public_id,)).fetchone()
        if not row or prefs(row[0]).get('deleted'): raise CommunityError('This publisher is no longer available.',404)
        return row[0]

    def summary(publisher):
        r=relation(publisher)
        return dict(identity=identity(publisher),following=bool(r),notify_new_polls=bool(r and r['notify']),mine=publisher==viewer())

    def following_state():
        return [summary(r[0]) for r in db().execute('SELECT f.publisher FROM pp_follows f JOIN pp_accounts a ON a.viewer=f.publisher WHERE f.follower=? ORDER BY f.created_at DESC,f.publisher',(viewer(),)) if not prefs(r[0]).get('deleted')]

    def follower_count():
        return db().execute('SELECT COUNT(*) FROM pp_follows WHERE publisher=?',(viewer(),)).fetchone()[0]

    @bp.get('/api/community/people/<public_id>')
    @mutation
    def profile(public_id):
        who=person(public_id);data=summary(who)
        data['polls']=[ctx['serialize'](p) for p in db().execute("SELECT * FROM pp_polls WHERE owner=? AND status='active' AND closes_at>? ORDER BY created_at DESC,id DESC LIMIT 100",(who,stamp())) if not ctx['removed'](p['id']) and content_matches(json.loads(p['data']),prefs())]
        if who==viewer(): data['followers_count']=follower_count()
        return jsonify(data)

    @bp.post('/api/community/people/<public_id>/follow')
    @mutation
    def follow(public_id):
        who=person(public_id);data=body();desired=data.get('following');notify=data.get('notify',True)
        if type(desired) is not bool or type(notify) is not bool: raise CommunityError('Choose a valid follow preference.')
        if who==viewer(): raise CommunityError('You cannot follow yourself.')
        old=relation(who)
        if not desired:
            db().execute('DELETE FROM pp_follows WHERE follower=? AND publisher=?',(viewer(),who))
        elif not old:
            if db().execute('SELECT COUNT(*) FROM pp_follows WHERE follower=?',(viewer(),)).fetchone()[0]>=1000: raise CommunityError('You can follow up to 1,000 publishers.',409)
            ctx['rate_limit']('follow',30,3600)
            created=stamp()
            db().execute('INSERT INTO pp_follows VALUES (?,?,?,?,?)',(viewer(),who,created,created,int(notify)))
        elif bool(old['notify'])!=notify:
            db().execute('UPDATE pp_follows SET notify=?,notify_since=? WHERE follower=? AND publisher=?',(int(notify),stamp() if notify else old['notify_since'],viewer(),who))
        return jsonify(summary(who))

    def published(pid):
        db().execute('INSERT OR IGNORE INTO pp_publications VALUES (?,?,?)',(pid,viewer(),stamp()))

    @bp.post('/api/community/people/<public_id>/alerts')
    @mutation
    def alerts(public_id):
        who=person(public_id);notify=body().get('notify');old=relation(who)
        if type(notify) is not bool: raise CommunityError('Choose a valid notification preference.')
        if not old: raise CommunityError('You no longer follow this publisher. Refresh your following list.',409)
        if bool(old['notify'])!=notify:
            db().execute('UPDATE pp_follows SET notify=?,notify_since=? WHERE follower=? AND publisher=?',(int(notify),stamp() if notify else old['notify_since'],viewer(),who))
        return jsonify(summary(who))

    def publication_notices():
        pref=prefs()
        if not pref['notifications']: return []
        result=[]
        rows=db().execute('''SELECT p.* FROM pp_publications e
            JOIN pp_follows f ON f.publisher=e.publisher AND f.follower=?
            JOIN pp_accounts a ON a.viewer=e.publisher JOIN pp_polls p ON p.id=e.poll_id
            WHERE f.notify=1 AND e.created_at>=f.created_at AND e.created_at>=f.notify_since
            AND p.status='active' AND p.closes_at>? AND NOT EXISTS(SELECT 1 FROM pp_takedowns t WHERE t.poll_id=p.id)
            ORDER BY e.created_at DESC,e.poll_id DESC''',(viewer(),stamp()))
        for p in rows:
            data=json.loads(p['data'])
            if p['created_at']<pref.get('publication_notices_since',''): continue
            if ctx['eligible'](p) or not content_matches(data,pref): continue
            if prefs(p['owner']).get('deleted') or ctx['occupied'](p['id'])>=p['cap']: continue
            if db().execute('SELECT 1 FROM pp_responses WHERE poll_id=? AND viewer=?',(p['id'],viewer())).fetchone(): continue
            creator=identity(p['owner'])
            result.append(dict(id='publication-'+p['id'],kind='publication',title=creator['author']+' published a poll',detail=data['title'],
                               target='discover',poll_id=p['id'],creator_id=creator['id'],avatar=creator['avatar'],created_at=p['created_at']))
            if len(result)>=100: break
        return result

    def readable_notice_ids():
        return {'publication-'+r[0] for r in db().execute('SELECT e.poll_id FROM pp_publications e JOIN pp_follows f ON f.publisher=e.publisher WHERE f.follower=? AND e.created_at>=f.created_at AND e.created_at>=f.notify_since',(viewer(),))}

    return dict(following_state=following_state,follower_count=follower_count,published=published,readable_notice_ids=readable_notice_ids,
                publication_notices=publication_notices,is_following=lambda who:bool(relation(who)))
