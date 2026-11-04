"""Persistent marketplace for the current interface.

All money is integer demo points/credits. Mutations serialize with BEGIN IMMEDIATE;
responses, reserves, refunds and idempotency receipts commit together. No payment
provider is impersonated. Legacy app tables and API contracts remain untouched.
"""
import hashlib
import click
import hmac
import json
import math
import os
import re
import shutil
import subprocess
import uuid
from datetime import timedelta, datetime
from functools import wraps
from pathlib import Path

from flask import Blueprint, g, jsonify, request, session
from deployment import is_admin
from catalyst_storage import fetch_media, replayable_write
from media_tools import validate_clip
from poll_rules import public_identity
from community_following import assigned_identity, backfill_identities
from meta_ai import AIError
from community_rules import AVATARS, COUNTRIES, AGE_BANDS, pairwise_result, winning_choice, validate_regions, preference_statistics, quality_signals

CIRCLES = ['everyday', 'design', 'food', 'work']
FORMATS = ['classic', 'visual', 'audio', 'slider', 'rank', 'ab', 'video', 'pairwise', 'allocation', 'regions']
TOPICS = [*CIRCLES, 'technology', 'entertainment', 'travel', 'wellbeing']
DEFAULTS = dict(interests=['everyday', 'design'], formats=FORMATS, languages=['English'], theme='light', motion=True,
                generated_polls=True, generated_media=True, followups=False,
                tagline='', notifications=True, avatar='otter', onboarding_dismissed=False, generated_images=True, generated_audio=True, generated_video=True, country='', age_band='')
ASSETS = {'sunroom.png', 'reading-nook.png', 'tote.png', 'crossbody.png'}

class CommunityError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def register_community(app, db, now, meta, security):
    bp = Blueprint("community", __name__)
    def uid(): return uuid.uuid4().hex
    def stamp(): return now().isoformat()
    def viewer(): return session['viewer']
    def body():
        data = request.get_json(silent=True)
        if not isinstance(data, dict): raise CommunityError('Send a valid request.')
        return data
    def text(value, minimum=0, maximum=1000):
        if not isinstance(value, str) or not minimum <= len(value.strip()) <= maximum:
            raise CommunityError(f'Use between {minimum} and {maximum} characters.')
        return value.strip()
    def integer(value, low, high):
        if type(value) is not int or not low <= value <= high:
            raise CommunityError(f'Choose a whole number between {low} and {high}.')
        return value
    def account():
        db().execute('INSERT OR IGNORE INTO pp_accounts VALUES (?,?,?,?)',
                     (viewer(), json.dumps(DEFAULTS), '{}', uid()[:12]))
        assigned_identity(db(),app.config['SECRET_KEY'],viewer())
    def prefs(who=None):
        row = db().execute('SELECT preferences FROM pp_accounts WHERE viewer=?', (who or viewer(),)).fetchone()
        return {**DEFAULTS, **(json.loads(row[0]) if row else {})}
    def identity(who):
        return {**assigned_identity(db(),app.config['SECRET_KEY'],who), 'tagline':prefs(who)['tagline'], 'avatar':prefs(who)['avatar']}
    def balance(who, currency):
        return db().execute('SELECT COALESCE(SUM(amount),0) FROM pp_ledger WHERE viewer=? AND currency=?', (who, currency)).fetchone()[0]
    def entry(who, currency, amount, kind, reference, poll_id=None):
        db().execute('INSERT INTO pp_ledger VALUES (?,?,?,?,?,?,?,?)', (uid(), who, currency, amount, kind, reference, poll_id, stamp()))
    def debit(who, currency, amount, kind, reference, poll_id=None):
        if balance(who, currency) < amount:
            raise CommunityError('The community reward pool is full. Try fewer responses or publisher credits.' if who == 'pool' else 'Add publishing credits before reserving this audience.', 409)
        entry(who, currency, -amount, kind, reference, poll_id)
    def poll(pid, owner=False):
        row = db().execute('SELECT * FROM pp_polls WHERE id=?', (pid,)).fetchone()
        if not row: raise CommunityError('This poll could not be found.', 404)
        if owner and row['owner'] != viewer(): raise CommunityError('Only the publisher can do that.', 403)
        return row
    def asset(url, kind, sample=False):
        if not url: return ''
        if not isinstance(url, str): raise CommunityError('Upload a valid file.')
        if kind == 'image' and url.removeprefix('/assets/') in ASSETS:
            return '/assets/' + url.removeprefix('/assets/')
        if sample and url == '/assets/question-sample.mp3': return url
        if not re.fullmatch(r'/uploads/[a-f0-9]{32}\.(webp|webm|ogg|wav|m4a|mp3|mp4)', url):
            raise CommunityError('Use an uploaded file, not an external media URL.')
        if not db().execute('SELECT 1 FROM uploads WHERE filename=? AND viewer=? AND kind=?', (url.split('/')[-1], viewer(), kind)).fetchone():
            raise CommunityError('Upload your own media first.', 403)
        if kind in ['audio','video']:
            fetch_media(app, url.split('/')[-1])
            try:
                validate_clip(Path(app.config['UPLOAD_FOLDER'])/url.split('/')[-1],kind)
            except (subprocess.SubprocessError,ValueError,KeyError,OSError): raise CommunityError('Use a playable audio clip no longer than 60 seconds.')
        return url
    def quote(data):
        fmt = data.get('format', 'classic')
        if fmt not in FORMATS: raise CommunityError('Choose a supported format.')
        options=data.get('options',[])
        if not isinstance(options,list) or len(options)>5: raise CommunityError('Use at most five poll options.')
        words = len(str(data.get('title', '')).split())
        base={'classic':10,'visual':25,'audio':45,'slider':20,'rank':35,'ab':30,'video':75,'pairwise':8+12*(len(options)*(len(options)-1)//2),'allocation':45,'regions':35}[fmt]
        seconds = max(20, min(180, int(math.ceil((base + words / 3 + max(0, len(data.get('options', []))-2)*3)/5)*5)))
        points = (2 + int(fmt != 'classic') + max(0, math.ceil((seconds-30)/30))) * 100
        reach = data.get('reach', 'Community')
        if reach not in ['Community', 'Boost']: raise CommunityError('Choose Community or Boost.')
        cap = integer(data.get('responses', 20), 1, 50 if reach == 'Community' else 500)
        return dict(seconds=seconds, reward=points, cap=cap, response_credits=points//100+2,
                    reward_credits=points//100, fee_credits=2, credits=cap*(points//100+2) if reach=='Boost' else 0,
                    community_reserve=cap*points if reach=='Community' else 0)
    def rate_limit(kind, limit, seconds):
        cutoff=(now()-timedelta(seconds=seconds)).isoformat()
        db().execute('DELETE FROM pp_limits WHERE created_at<?', ((now()-timedelta(days=1)).isoformat(),))
        count=db().execute('SELECT COUNT(*) FROM pp_limits WHERE viewer=? AND kind=? AND created_at>?',(viewer(),kind,cutoff)).fetchone()[0]
        if count>=limit: raise CommunityError('Please slow down and try again shortly.',429)
        db().execute('INSERT INTO pp_limits VALUES (?,?,?)',(viewer(),kind,stamp()))
    def occupied(pid):
        return db().execute("SELECT COUNT(*) FROM pp_responses WHERE poll_id=? AND (status!='declined' OR source='Community')", (pid,)).fetchone()[0]
    def removed(pid): return bool(db().execute('SELECT 1 FROM pp_takedowns WHERE poll_id=?',(pid,)).fetchone())
    def closed(p): return p['status'] != 'active' or p['closes_at'] <= stamp()
    def eligible(p):
        if removed(p['id']): return 'Removed after review'
        if p['owner'] == viewer(): return 'Your own poll'
        if closed(p): return 'Campaign paused' if p['status']=='paused' else 'Poll closed'
        if p['audience'] != 'Everyone' and p['audience'] not in prefs()['interests']: return 'Outside your selected interests'
        if json.loads(p['data']).get('language', 'English') not in prefs()['languages']: return 'Outside your selected languages'
        targeting=json.loads(p['data']).get('targeting',{})
        for key in ('country','age_band'):
            if targeting.get(key) and prefs().get(key) not in targeting[key]: return 'Outside the selected audience profile'
        return ''
    def finish_referral(who):
        # Cookie-only local identities cannot unlock referral money.
        if not who.startswith(('cf-','zc-')): return
        link = db().execute('SELECT * FROM pp_referrals WHERE invitee=? AND rewarded=0', (who,)).fetchone()
        if not link: return
        count = db().execute("SELECT COUNT(DISTINCT poll_id) FROM pp_responses WHERE viewer=? AND status='accepted'", (who,)).fetchone()[0]
        if count >= 3 and balance('pool','points') >= 200:
            debit('pool','points',200,'referral','referral-'+who)
            entry(link['inviter'],'points',200,'Qualified referral','referral-'+who)
            db().execute('UPDATE pp_referrals SET rewarded=1 WHERE invitee=?', (who,))
    def accept(r):
        if r['status'] == 'accepted': return
        p = poll(r['poll_id'])
        entry(r['viewer'], 'points', p['reward'], 'Accepted response', 'answer-'+r['id'], p['id'])
        db().execute("UPDATE pp_responses SET status='accepted',reviewed_at=? WHERE id=?", (stamp(), r['id']))
        finish_referral(r['viewer'])
    def settle():
        # Publisher silence cannot indefinitely hold a valid participant's earnings.
        for r in db().execute("SELECT * FROM pp_responses WHERE status='pending' AND created_at<=?", ((now()-timedelta(hours=48)).isoformat(),)).fetchall(): accept(r)
        db().execute('DELETE FROM pp_claims WHERE expires_at<=?', (stamp(),))
        for p in db().execute("SELECT * FROM pp_polls WHERE status!='ended' AND closes_at<=?", (stamp(),)).fetchall(): end_poll(p)
        for f in db().execute("SELECT * FROM pp_followups WHERE status='open' AND expires_at<=?", (stamp(),)).fetchall(): end_followup(f)
    def end_poll(p):
        free = p['cap'] - occupied(p['id'])
        if free > 0:
            entry('pool' if p['funding']=='Community' else p['owner'], 'points' if p['funding']=='Community' else 'credits', free*(p['reward'] if p['funding']=='Community' else p['cost']), 'Unused response refund', 'close-'+p['id'], p['id'])
        db().execute("UPDATE pp_polls SET status='ended' WHERE id=?", (p['id'],))
        db().execute('DELETE FROM pp_claims WHERE poll_id=?', (p['id'],))
    def end_followup(f):
        remaining = db().execute("SELECT COUNT(*) FROM pp_invites WHERE followup_id=? AND answered_at=''", (f['id'],)).fetchone()[0]
        if remaining: entry(f['owner'],'credits',remaining*2,'Unused follow-up refund','followup-close-'+f['id'], f['poll_id'])
        db().execute("UPDATE pp_followups SET status='closed' WHERE id=?", (f['id'],))
    @app.errorhandler(CommunityError)
    def failure(error): return jsonify(error=str(error)), error.status
    def mutation(fn):
        @wraps(fn)
        def wrapped(*args, **kwargs):
            # These handlers only mutate the transactional snapshot (media
            # validation may read files). External AI/payment calls live outside
            # this wrapper. A known CAS conflict can safely replay against the
            # latest balances, capacity and idempotency receipts.
            def write():
                account(); settle()
                if request.method!='GET': rate_limit('write',120,60)
                return fn(*args, **kwargs)
            return replayable_write(db(), write)
        return wrapped
    def once(operation, data, fn):
        key = text(data.get('idempotency_key'), 8, 100)
        digest = hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()
        old = db().execute('SELECT * FROM pp_requests WHERE viewer=? AND key=?', (viewer(), key)).fetchone()
        if old:
            if old['digest'] != digest or old['operation'] != operation: raise CommunityError('That request key belongs to a different action.', 409)
            return json.loads(old['result'])
        result = fn()
        db().execute('INSERT INTO pp_requests VALUES (?,?,?,?,?,?)', (viewer(),key,operation,digest,json.dumps(result),stamp()))
        return result
    def response_data(r):
        return dict(id=r['id'], audio_origin=r['audio_origin'], name=identity(r['viewer'])['author'], tagline=identity(r['viewer'])['tagline'],
                    answer=json.loads(r['answer']), text=r['text'], transcript=r['transcript'] if r['public_audio'] or r['viewer']==viewer() or poll(r['poll_id'])['owner']==viewer() or is_admin() else '', audio=r['audio'] if r['public_audio'] or r['viewer']==viewer() or poll(r['poll_id'])['owner']==viewer() or is_admin() else '',
                    status=r['status'], reason=r['reason'], appeal=r['appeal'], consent=bool(r['consent']) and prefs(r['viewer'])['followups'],
                    created_at=r['created_at'], elapsed_seconds=r['elapsed_seconds'], quality=quality_signals(r['text'],r['elapsed_seconds'],poll(r['poll_id'])['seconds'],bool(r['text'] and db().execute('SELECT 1 FROM pp_responses WHERE poll_id=? AND id!=? AND lower(text)=lower(?)',(r['poll_id'],r['id'],r['text'])).fetchone())), mine=r['viewer']==viewer())
    def serialize(p):
        data = json.loads(p['data'])
        responses = db().execute('SELECT * FROM pp_responses WHERE poll_id=? ORDER BY created_at DESC', (p['id'],)).fetchall()
        accepted = [r for r in responses if r['status']=='accepted']
        own = next((r for r in responses if r['viewer']==viewer()), None)
        totals = [0]*len(data['options'])
        for r in accepted:
            ans=json.loads(r['answer'])
            if data['format']=='pairwise' and isinstance(ans,dict):
                for i,value in enumerate(ans['wins']): totals[i]+=value
            elif data['format']=='allocation':
                for i, value in enumerate(ans): totals[i]+=value
            else: totals[winning_choice(ans)]+=1
        # Ranking stores the full ordering; first-choice shares and average positions are distinct.
        positions = [round(sum(json.loads(r['answer']).index(i)+1 for r in accepted)/len(accepted),2) for i in range(len(totals))] if accepted and data['format']=='rank' else []
        my_claim=db().execute('SELECT expires_at FROM pp_claims WHERE poll_id=? AND viewer=? AND expires_at>?',(p['id'],viewer(),stamp())).fetchone()
        claimed = db().execute('SELECT COUNT(*) FROM pp_claims WHERE poll_id=? AND expires_at>?', (p['id'],stamp())).fetchone()[0]
        reason=eligible(p)
        outcome=db().execute('SELECT body,created_at FROM pp_outcomes WHERE poll_id=?', (p['id'],)).fetchone()
        unlocked=bool(own) or p['owner']==viewer()
        reactions={r['reaction']:r['n'] for r in db().execute('SELECT reaction,COUNT(*) n FROM pp_reactions WHERE poll_id=? GROUP BY reaction',(p['id'],))} if unlocked else {}
        my_reaction=db().execute('SELECT reaction FROM pp_reactions WHERE poll_id=? AND viewer=?',(p['id'],viewer())).fetchone()
        return {**data, 'tags':data.get('tags',[data['circle']]), 'results_unlocked':unlocked,'reactions':reactions,'my_reaction':my_reaction[0] if my_reaction else '', 'reported':bool(db().execute('SELECT 1 FROM pp_reports WHERE poll_id=? AND viewer=?',(p['id'],viewer())).fetchone()), 'id':p['id'], 'creator':identity(p['owner'])['author'], 'tagline':identity(p['owner'])['tagline'],
                'creator_id':identity(p['owner'])['id'], 'followed_creator':features['is_following'](p['owner']), 'can_follow':p['owner']!=viewer() and not prefs(p['owner']).get('deleted') and bool(db().execute('SELECT 1 FROM pp_accounts WHERE viewer=?',(p['owner'],)).fetchone()), 'created_at':p['created_at'],
                'avatar':prefs(p['owner'])['avatar'], 'reward':p['reward'], 'seconds':p['seconds'], 'responses':len(accepted) if unlocked else 0,
                'totals':totals if unlocked else [],'positions':positions if unlocked else [],'comments':0,
                'mine':p['owner']==viewer(), 'removed':removed(p['id']),'sample':bool(p['sample']), 'status':p['status'], 'cap':p['cap'],
                'funding':p['funding'],'audience':p['audience'],'closes_at':p['closes_at'], 'remaining':max(0,p['cap']-occupied(p['id'])-claimed),
                'claim':dict(expires_at=my_claim[0],reward=p['reward']) if my_claim else None,'eligible':not reason,'eligibility_reason':reason,'my_response':response_data(own) if own else None,
                'saved':bool(db().execute('SELECT 1 FROM pp_saved WHERE viewer=? AND poll_id=?',(viewer(),p['id'])).fetchone()),
                'ab_exposures':{str(r[0]):r[1] for r in db().execute('SELECT first_option,COUNT(*) FROM pp_ab_exposures WHERE poll_id=? GROUP BY first_option',(p['id'],))} if unlocked and data['format']=='ab' else {}, 'ab_statistics':preference_statistics(totals) if unlocked and data['format']=='ab' else None, 'presentation_order':([1,0] if int(hashlib.sha256((viewer()+p['id']).encode()).hexdigest(),16)%2 else [0,1]) if data['format']=='ab' else list(range(len(totals))), 'outcome':dict(outcome) if outcome and unlocked else None}
    def wallet():
        pending=db().execute("SELECT COALESCE(SUM(p.reward),0) FROM pp_responses r JOIN pp_polls p ON p.id=r.poll_id WHERE r.viewer=? AND r.status IN ('pending','rejected','appealed')", (viewer(),)).fetchone()[0]
        return dict(points=balance(viewer(),'points'), credits=balance(viewer(),'credits'), pending=pending,
                    paid=db().execute('SELECT COALESCE(SUM(net),0) FROM pp_redemptions WHERE viewer=?',(viewer(),)).fetchone()[0],
                    ledger=[dict(r) for r in db().execute('SELECT l.*,p.data FROM pp_ledger l LEFT JOIN pp_polls p ON p.id=l.poll_id WHERE l.viewer=? ORDER BY l.created_at DESC LIMIT 100',(viewer(),))],
                    redemptions=[dict(r) for r in db().execute('SELECT * FROM pp_redemptions WHERE viewer=? ORDER BY created_at DESC',(viewer(),))],
                    points_per_rupee=100, demo=True)

    @bp.get('/api/community/state')
    @mutation
    def state():
        account_row=db().execute('SELECT * FROM pp_accounts WHERE viewer=?',(viewer(),)).fetchone()
        polls=[serialize(p) for p in db().execute('SELECT * FROM pp_polls ORDER BY created_at DESC') if not removed(p['id']) or p['owner']==viewer() or is_admin()]
        pref=prefs()
        def score(p): return (int(not p['my_response']), int(p['eligible']), len(set(p['tags']) & set(pref['interests'])),int(p['followed_creator']),p['created_at'],p['id'])
        polls.sort(key=score,reverse=True)
        invitations=[dict(r) for r in db().execute("SELECT f.id,f.poll_id,f.question,f.expires_at,f.status,i.text,i.audio,i.answered_at FROM pp_invites i JOIN pp_followups f ON f.id=i.followup_id WHERE i.viewer=? ORDER BY f.created_at DESC",(viewer(),))]
        my_responses=[{**response_data(r),'poll_id':r['poll_id'],'title':json.loads(poll(r['poll_id'])['data'])['title']} for r in db().execute('SELECT * FROM pp_responses WHERE viewer=? ORDER BY created_at DESC',(viewer(),))]
        updates=[dict(r) for r in db().execute('SELECT o.* FROM pp_outcomes o WHERE EXISTS(SELECT 1 FROM pp_responses r WHERE r.poll_id=o.poll_id AND r.viewer=?) ORDER BY o.created_at DESC',(viewer(),))]
        return jsonify(csrf=session['csrf'],admin=is_admin(),authentication_enabled=app.config.get('CATALYST_AUTH_ENABLED',False),payments_mode=app.config.get('PAYMENTS_MODE','disabled'),polls=polls,preferences=pref,draft=json.loads(account_row['draft']),wallet=wallet(),
                       onboarding=onboarding_status(pref), notifications=features['notifications'](), following=features['following_state'](), followers_count=features['follower_count'](), identity=identity(viewer()),invitations=invitations,responses=my_responses,updates=updates,
                       referral=dict(code=account_row['referral_code'],qualified=db().execute('SELECT COUNT(*) FROM pp_referrals WHERE inviter=? AND rewarded=1',(viewer(),)).fetchone()[0],requires_verified_identity=True),
                       ai=meta['status'](),security=security['status'](),pool=balance('pool','points'))
    @bp.post('/api/community/quote')
    def get_quote(): return jsonify(quote=quote(body()))
    def validate_preferences(data, current):
        for key, allowed in [('interests',TOPICS),('formats',FORMATS),('languages',['English','Hindi','Tamil','Spanish'])]:
            if key in data:
                value=data[key]
                if not isinstance(value,list) or not value or len(value)>len(allowed) or any(v not in allowed for v in value): raise CommunityError('Choose at least one supported '+key+'.')
                current[key]=list(dict.fromkeys(value))
        for key in ['generated_polls','generated_media','generated_images','generated_audio','generated_video','followups','notifications','motion','onboarding_dismissed']:
            if key in data:
                if type(data[key]) is not bool: raise CommunityError('Choose a valid preference.')
                if key=='notifications' and data[key] and not current[key]: current['publication_notices_since']=stamp()
                current[key]=data[key]
        for key, allowed in [('avatar',AVATARS),('country',('',*COUNTRIES)),('age_band',('',*AGE_BANDS))]:
            if key in data:
                if data[key] not in allowed: raise CommunityError('Choose a supported '+key+'.')
                current[key]=data[key]
        if 'tagline' in data: current['tagline']=text(data['tagline'],0,70)
        if 'theme' in data:
            if data['theme'] not in ['light','dark','system']: raise CommunityError('Choose a supported theme.')
            current['theme']=data['theme']
        return current

    @bp.post('/api/community/preferences')
    @mutation
    def preferences():
        current=validate_preferences(body(),prefs())
        db().execute('UPDATE pp_accounts SET preferences=? WHERE viewer=?',(json.dumps(current),viewer()))
        return jsonify(preferences=current)

    def onboarding_status(pref):
        # Existing verified users see the new introduction once. It never changes
        # permissions, or blocks existing API clients from their own data.
        return dict(required=bool(getattr(g,'platform_user',None)) and not pref.get('onboarding_complete',False),
                    step=pref.get('onboarding_step',0),complete=pref.get('onboarding_complete',False))

    @bp.get('/api/community/onboarding')
    @mutation
    def onboarding():
        current=prefs()
        return jsonify(csrf=session['csrf'],identity=identity(viewer()),preferences=current,
                       onboarding=onboarding_status(current),security=security['status']())

    @bp.post('/api/community/onboarding')
    @mutation
    def save_onboarding():
        data=body();current=prefs();action=data.get('action','save')
        if not isinstance(action,str) or action not in {'save','complete','skip'}: raise CommunityError('Choose a supported setup action.')
        if action=='skip':
            current.update(onboarding_complete=True,onboarding_skipped=True,onboarding_dismissed=True,onboarding_completed_at=stamp())
        else:
            step=integer(data.get('step'),0,3)
            allowed=[{'intent'},{'interests','languages'},
                     {'formats','generated_polls','generated_images','generated_audio','generated_video'},
                     {'avatar','tagline','notifications'}][step]
            changes=data.get('preferences',{})
            if not isinstance(changes,dict) or set(changes)-allowed: raise CommunityError('Save only the preferences shown in this step.')
            if step==0:
                if not isinstance(changes.get('intent'),str) or changes['intent'] not in {'answer','create','both'}: raise CommunityError('Choose how you would like to start.')
                current['intent']=changes['intent']
            else:
                required={1:{'interests','languages'},2:{'formats'},3:{'avatar','tagline'}}[step]
                if not required<=changes.keys(): raise CommunityError('Complete the preferences in this step.')
                current=validate_preferences(changes,current)
            if step==2: current['generated_media']=True
            current['onboarding_step']=max(current.get('onboarding_step',0),min(step+1,3))
            if action=='complete':
                if step!=3: raise CommunityError('Finish on the final setup step.')
                current.update(onboarding_complete=True,onboarding_skipped=False,onboarding_dismissed=True,onboarding_completed_at=stamp())
        db().execute('UPDATE pp_accounts SET preferences=? WHERE viewer=?',(json.dumps(current),viewer()))
        return jsonify(saved=True,onboarding=onboarding_status(current),preferences=current,
                       security=security['status'](),
                       redirect='/#create' if current.get('intent')=='create' else '/#discover')

    @bp.post('/api/community/draft')
    @mutation
    def draft():
        data=body().get('draft',{})
        if not isinstance(data,dict) or len(json.dumps(data))>20000: raise CommunityError('This draft is too large.')
        db().execute('UPDATE pp_accounts SET draft=? WHERE viewer=?',(json.dumps(data),viewer()))
        return jsonify(saved=True)
    @bp.post('/api/community/publish')
    @mutation
    def publish():
        data=body()
        def run():
            rate_limit('publish',10,86400)
            q=quote(data); title=text(data.get('title'),8,180)
            options=data.get('options')
            if not isinstance(options,list) or not 2<=len(options)<=5: raise CommunityError('Add two to five choices.')
            options=[text(o,1,100) for o in options]
            if len(set(o.casefold() for o in options))!=len(options): raise CommunityError('Give each choice a different label.')
            if data.get('format')=='slider' and len(options)!=5: raise CommunityError('A slider needs five labels.')
            if data.get('circle') not in TOPICS or data.get('language','English') not in ['English','Hindi','Tamil','Spanish']: raise CommunityError('Choose a circle and language.')
            audience=data.get('audience','Everyone')
            if audience not in ['Everyone',*TOPICS]: raise CommunityError('Choose a supported audience.')
            if data.get('data_use_accepted') is not True: raise CommunityError('Accept the data collection and publishing terms.')
            if not isinstance(data.get('images',[]),list): raise CommunityError('Choose an image for each option.')
            images=[asset(u,'image') for u in data.get('images',[])] if data['format'] in ['visual','ab','regions'] else []
            if data['format'] in ['visual','ab'] and (len(images)!=len(options) or not all(images)): raise CommunityError('Add an image for every option.')
            regions=[]
            if data['format']=='regions':
                if len(images)!=1 or not images[0]: raise CommunityError('Upload one image to mark regions.')
                try: regions=validate_regions(data.get('regions'),len(options))
                except ValueError as error: raise CommunityError(str(error))
            targeting=features['validate_targeting'](data.get('targeting',{}))
            audio=asset(data.get('audio',''),'audio') if data['format']=='audio' else ''
            if data['format']=='audio' and not audio: raise CommunityError('Upload or record question audio first.')
            if data['format']=='ab' and len(options)!=2: raise CommunityError('A/B polls need exactly two options.')
            videos=data.get('videos',[])
            if not isinstance(videos,list): raise CommunityError('Upload a video for each option.')
            videos=[asset(u,'video') for u in videos] if data['format']=='video' else []
            if data['format']=='video' and (len(videos)!=len(options) or not all(videos)): raise CommunityError('Upload a video for each option.')
            tags=data.get('tags',[data['circle']])
            if not isinstance(tags,list) or not 1<=len(tags)<=5 or any(t not in TOPICS for t in tags): raise CommunityError('Choose one to five topic tags.')
            descriptions=data.get('video_descriptions',options)
            if not isinstance(descriptions,list) or (videos and len(descriptions)!=len(options)): raise CommunityError('Describe each video.')
            descriptions=[text(v,1,1000) for v in descriptions] if videos else []
            provenance={k:data.get(k,'human') for k in ['text_origin','image_origin','audio_origin','video_origin']}
            if any(v not in ['human','rephrased','generated'] for v in provenance.values()): raise CommunityError('Choose valid authorship labels.')
            provenance=meta['enforce_origins'](provenance,title,audio,images)
            if any(u.startswith('/assets/') for u in images): provenance['image_origin']='generated'
            pid=uid()[:12]; reach=data.get('reach','Community')
            debit('pool' if reach=='Community' else viewer(),'points' if reach=='Community' else 'credits',q['community_reserve'] if reach=='Community' else q['credits'],'Response reserve','reserve-'+pid,pid)
            stored=dict(regions=regions,targeting=targeting,tags=list(dict.fromkeys(tags)),videos=videos,video_descriptions=descriptions,title=title,name=text(data.get('name',title),1,180),format=data['format'],circle=data['circle'],options=options,images=images,audio=audio,transcript=text(data.get('transcript',''),0,3000),language=data.get('language','English'),**provenance,ai=any(v=='generated' for v in provenance.values()),platform_usage=reach=='Community',policy_version='community-2026-10',accepted_at=stamp())
            deadline=(now()+timedelta(hours=integer(data.get('hours',168),1,720))).isoformat()
            db().execute('INSERT INTO pp_polls VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',(pid,viewer(),json.dumps(stored),reach,audience if reach=='Boost' else 'Everyone',q['cap'],q['reward'],q['response_credits'],q['seconds'],'active',deadline,stamp(),0))
            features['published'](pid)
            draft=json.loads(db().execute('SELECT draft FROM pp_accounts WHERE viewer=?',(viewer(),)).fetchone()[0])
            if data.get('draft_id'):
                draft['deck_drafts']=[d for d in draft.get('deck_drafts',[]) if d.get('id')!=data['draft_id']]
                db().execute('UPDATE pp_accounts SET draft=? WHERE viewer=?',(json.dumps(draft),viewer()))
            return dict(id=pid,poll=serialize(poll(pid)),wallet=wallet())
        return jsonify(once('publish',data,run))
    @bp.post('/api/community/polls/<pid>/claim')
    @mutation
    def claim(pid):
        p=poll(pid); reason=eligible(p)
        if reason: raise CommunityError(reason,409)
        if db().execute('SELECT 1 FROM pp_responses WHERE poll_id=? AND viewer=?',(pid,viewer())).fetchone(): raise CommunityError('You already answered this poll.',409)
        old=db().execute('SELECT expires_at FROM pp_claims WHERE poll_id=? AND viewer=?',(pid,viewer())).fetchone()
        if old: return jsonify(expires_at=old[0],reward=p['reward'])
        if db().execute('SELECT COUNT(*) FROM pp_claims WHERE viewer=?',(viewer(),)).fetchone()[0]>=3: raise CommunityError('Finish one of your three reserved polls before reserving another.',409)
        count=db().execute('SELECT COUNT(*) FROM pp_claims WHERE poll_id=?',(pid,)).fetchone()[0]
        if occupied(pid)+count>=p['cap']: raise CommunityError('All funded places are currently reserved.',409)
        expiry=(now()+timedelta(minutes=15)).isoformat()
        db().execute('INSERT INTO pp_claims VALUES (?,?,?)',(pid,viewer(),expiry))
        if json.loads(p['data'])['format']=='ab':
            first=int(hashlib.sha256((viewer()+pid).encode()).hexdigest(),16)%2
            db().execute('INSERT OR IGNORE INTO pp_ab_exposures VALUES (?,?,?,?)',(pid,viewer(),first,stamp()))
        return jsonify(expires_at=expiry,reward=p['reward'])
    @bp.post('/api/community/polls/<pid>/answer')
    @mutation
    def answer(pid):
        p=poll(pid); data=body()
        old=db().execute('SELECT * FROM pp_responses WHERE poll_id=? AND viewer=?',(pid,viewer())).fetchone()
        if old: return jsonify(response=response_data(old),poll=serialize(p),wallet=wallet())
        reason=eligible(p)
        if reason: raise CommunityError(reason,409)
        if not db().execute('SELECT 1 FROM pp_claims WHERE poll_id=? AND viewer=? AND expires_at>?',(pid,viewer(),stamp())).fetchone(): raise CommunityError('Reserve a funded place before answering. Your previous reservation may have expired.',409)
        spec=json.loads(p['data']); ans=data.get('answer'); n=len(spec['options'])
        if spec['format']=='rank':
            if not isinstance(ans,list) or len(ans)!=n or any(type(v) is not int for v in ans) or sorted(ans)!=list(range(n)): raise CommunityError('Rank each option exactly once.')
        elif spec['format']=='pairwise' and isinstance(ans,dict):
            try: ans=pairwise_result(ans,n)
            except ValueError as error: raise CommunityError(str(error))
        elif spec['format']=='pairwise' and n>2: raise CommunityError('Complete every head-to-head round.')
        elif spec['format']=='allocation':
            if not isinstance(ans,list) or len(ans)!=n or any(type(v) is not int or not 0<=v<=100 for v in ans) or sum(ans)!=100: raise CommunityError('Distribute exactly 100 whole points.')
        else: integer(ans,0,n-1)
        if type(data.get('consent',False)) is not bool or type(data.get('public_audio',False)) is not bool: raise CommunityError('Choose valid sharing preferences.')
        note=text(data.get('text',''),0,3000); audio=asset(data.get('audio',''),'audio')
        rate_limit('answer',20,60)
        voice_origin=data.get('audio_origin','human')
        if voice_origin not in ['human','generated']: raise CommunityError('Choose a valid voice origin.')
        if audio and db().execute('SELECT 1 FROM ai_assets WHERE filename=? AND kind=?',(audio.split('/')[-1],'audio')).fetchone(): voice_origin='generated'
        rid=uid()
        db().execute('INSERT INTO pp_responses (id,poll_id,viewer,answer,text,audio,status,reason,appeal,consent,public_audio,created_at,reviewed_at,source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',(rid,pid,viewer(),json.dumps(ans),note,audio,'pending','','',int(data.get('consent',False)),int(data.get('public_audio',False)),stamp(),'',''))
        db().execute('UPDATE pp_responses SET audio_origin=?,transcript=? WHERE id=?',(voice_origin,text(data.get('transcript',''),0,3000),rid))
        expiry=db().execute('SELECT expires_at FROM pp_claims WHERE poll_id=? AND viewer=?',(pid,viewer())).fetchone()[0]
        elapsed=max(0,min(900,(now()-(datetime.fromisoformat(expiry)-timedelta(minutes=15))).total_seconds()))
        db().execute('UPDATE pp_responses SET elapsed_seconds=? WHERE id=?',(elapsed,rid))
        db().execute('DELETE FROM pp_claims WHERE poll_id=? AND viewer=?',(pid,viewer()))
        r=db().execute('SELECT * FROM pp_responses WHERE id=?',(rid,)).fetchone()
        if p['sample']: accept(r)
        return jsonify(response=response_data(db().execute('SELECT * FROM pp_responses WHERE id=?',(rid,)).fetchone()),
                       poll=serialize(p),wallet=wallet())
    @bp.post('/api/community/polls/<pid>/save')
    @mutation
    def save(pid):
        poll(pid); data=body()
        if type(data.get('saved')) is not bool: raise CommunityError('Choose saved or unsaved.')
        if data['saved']: db().execute('INSERT OR IGNORE INTO pp_saved VALUES (?,?)',(viewer(),pid))
        else: db().execute('DELETE FROM pp_saved WHERE viewer=? AND poll_id=?',(viewer(),pid))
        return jsonify(saved=data['saved'])
    @bp.get('/api/community/polls/<pid>/details')
    def details(pid):
        p=poll(pid); owner=p['owner']==viewer()
        if removed(pid) and not owner and not is_admin(): raise CommunityError('This poll was removed after review.',404)
        responses=[response_data(r) for r in db().execute('SELECT * FROM pp_responses WHERE poll_id=? ORDER BY created_at DESC',(pid,)) if owner or r['viewer']==viewer()]
        comments=[]
        followups=[]
        if owner:
            for f in db().execute('SELECT * FROM pp_followups WHERE poll_id=?',(pid,)):
                followups.append(dict(id=f['id'],question=f['question'],status=f['status'],expires_at=f['expires_at'],replies=[dict(name=identity(i['viewer'])['author'],text=i['text'],audio=i['audio'],audio_origin=i['audio_origin'],answered_at=i['answered_at']) for i in db().execute('SELECT * FROM pp_invites WHERE followup_id=?',(f['id'],))]))
        brief=db().execute('SELECT data FROM pp_briefs WHERE poll_id=?',(pid,)).fetchone() if owner else None
        return jsonify(poll=serialize(p),responses=responses,comments=comments,followups=followups,brief=json.loads(brief[0]) if brief else None)
    @bp.post('/api/community/polls/<pid>/comments')
    @bp.post('/api/community/comments/<pid>/like')
    def comments_removed(pid):
        raise CommunityError('Comments are not part of Poll Pilled.',410)
    @bp.post('/api/community/polls/<pid>/react')
    @mutation
    def react(pid):
        p=poll(pid)
        if removed(pid): raise CommunityError('This poll was removed after review.',404)
        if not db().execute('SELECT 1 FROM pp_responses WHERE poll_id=? AND viewer=?',(pid,viewer())).fetchone(): raise CommunityError('Answer this poll before reacting.',403)
        reaction=body().get('reaction')
        if reaction not in ['','helpful','surprising','relatable']: raise CommunityError('Choose a supported reaction.')
        db().execute('DELETE FROM pp_reactions WHERE poll_id=? AND viewer=?',(pid,viewer()))
        if reaction: db().execute('INSERT INTO pp_reactions VALUES (?,?,?)',(pid,viewer(),reaction))
        return jsonify(saved=True,poll=serialize(p))
    @bp.post('/api/community/polls/<pid>/report')
    @mutation
    def report(pid):
        poll(pid); data=body()
        reason=data.get('reason')
        if reason not in ['Misleading','Harmful or offensive','Spam or abuse','Unlabelled AI content','Other']: raise CommunityError('Choose a report reason.')
        if not db().execute('SELECT 1 FROM pp_reports WHERE poll_id=? AND viewer=?',(pid,viewer())).fetchone():
            rate_limit('report',10,3600)
            db().execute('INSERT INTO pp_reports VALUES (?,?,?,?,?,?)',(uid(),pid,viewer(),reason,text(data.get('detail',''),0,1000),stamp()))
        return jsonify(saved=True)
    @bp.post('/api/community/responses/<rid>/review')
    @mutation
    def review(rid):
        r=db().execute('SELECT * FROM pp_responses WHERE id=?',(rid,)).fetchone()
        if not r: raise CommunityError('Response not found.',404)
        poll(r['poll_id'],True); data=body(); action=data.get('action')
        if r['status'] in ['accepted','declined']: raise CommunityError('This review is already final.',409)
        if action=='accept': accept(r)
        elif action=='reject':
            if r['status']!='pending': raise CommunityError('An appeal needs independent review.',409)
            reason=text(data.get('reason'),20,600)
            db().execute("UPDATE pp_responses SET status='rejected',reason=?,reviewed_at=? WHERE id=?",(reason,stamp(),rid))
        else: raise CommunityError('Choose accept or request review.')
        return jsonify(saved=True)
    @bp.post('/api/community/responses/<rid>/appeal')
    @mutation
    def appeal(rid):
        r=db().execute('SELECT * FROM pp_responses WHERE id=? AND viewer=?',(rid,viewer())).fetchone()
        if not r: raise CommunityError('Response not found.',404)
        if r['status']!='rejected': raise CommunityError('Only a rejected response can be appealed.',409)
        db().execute("UPDATE pp_responses SET status='appealed',appeal=? WHERE id=?",(text(body().get('reason'),10,1000),rid))
        return jsonify(saved=True)
    @bp.post('/api/community/moderation/<rid>')
    @mutation
    def moderate(rid):
        secret=app.config.get('COMMUNITY_MODERATOR_TOKEN') or os.getenv('COMMUNITY_MODERATOR_TOKEN','')
        if not is_admin() and (not secret or not hmac.compare_digest(request.headers.get('X-Moderator-Token',''),secret)): raise CommunityError('Independent moderator access required.',403)
        r=db().execute('SELECT * FROM pp_responses WHERE id=?',(rid,)).fetchone()
        if not r or r['status'] not in ['rejected','appealed']: raise CommunityError('No open review for this response.',409)
        if is_admin() and poll(r['poll_id'])['owner']==viewer(): raise CommunityError('Another moderator must review responses to your own poll.',403)
        data=body(); reason=text(data.get('reason'),20,1000)
        if data.get('action')=='accept': accept(r)
        elif data.get('action')=='decline':
            db().execute("UPDATE pp_responses SET status='declined',reason=?,reviewed_at=? WHERE id=?",(reason,stamp(),rid))
            p=poll(r['poll_id'])
            if r['source']=='Community': entry('pool','points',p['reward'],'Invalid community response refund','declined-'+rid,p['id'])
            elif p['status']=='ended': entry('pool' if p['funding']=='Community' else p['owner'],'points' if p['funding']=='Community' else 'credits',p['reward'] if p['funding']=='Community' else p['cost'],'Invalid response refund','declined-'+rid,p['id'])
        else: raise CommunityError('Choose accept or decline.')
        db().execute('INSERT INTO pp_audit VALUES (?,?,?,?,?)',(uid(),rid,viewer(),reason,stamp()))
        return jsonify(saved=True)
    @bp.post('/api/community/polls/<pid>/status')
    @mutation
    def status(pid):
        p=poll(pid,True); action=body().get('status')
        if p['status']=='ended': raise CommunityError('This campaign has ended.',409)
        if action=='ended': end_poll(p)
        elif action in ['active','paused']: db().execute('UPDATE pp_polls SET status=? WHERE id=?',(action,pid))
        else: raise CommunityError('Choose a campaign status.')
        return jsonify(saved=True)
    @bp.post('/api/community/polls/<pid>/boost')
    @mutation
    def boost(pid):
        data=body()
        def run():
            p=poll(pid,True)
            if p['funding']!='Community' or p['status']=='ended': raise CommunityError('Only an open community poll can be boosted.',409)
            cap=integer(data.get('responses'),1,500); audience=data.get('audience','Everyone')
            if audience not in ['Everyone',*TOPICS]: raise CommunityError('Choose a supported audience.')
            debit(viewer(),'credits',cap*p['cost'],'Audience boost','boost-'+pid,pid)
            free=p['cap']-occupied(pid)
            if free: entry('pool','points',free*p['reward'],'Community allocation released','boost-release-'+pid,pid)
            db().execute("UPDATE pp_polls SET funding='Boost',audience=?,cap=?,status='active' WHERE id=?",(audience,occupied(pid)+cap,pid))
            # Already occupied community places retain their source for closure accounting.
            db().execute("UPDATE pp_responses SET source='Community' WHERE poll_id=? AND status!='declined'",(pid,))
            db().execute('DELETE FROM pp_claims WHERE poll_id=?',(pid,))
            return dict(saved=True)
        return jsonify(once('boost-'+pid,data,run))
    @bp.post('/api/community/polls/<pid>/outcome')
    @mutation
    def outcome(pid):
        poll(pid,True); note=text(body().get('text'),10,2000)
        db().execute('INSERT INTO pp_outcomes VALUES (?,?,?) ON CONFLICT(poll_id) DO UPDATE SET body=excluded.body,created_at=excluded.created_at',(pid,note,stamp()))
        return jsonify(saved=True)
    @bp.post('/api/community/polls/<pid>/followups')
    @mutation
    def followup(pid):
        data=body()
        def run():
            poll(pid,True); question=text(data.get('question'),8,300)
            targets=data.get('response_ids')
            if not isinstance(targets,list) or not targets or len(targets)>100 or any(not isinstance(rid,str) for rid in targets) or len(set(targets))!=len(targets): raise CommunityError('Choose one to 100 unique participants.')
            people=[]
            for rid in targets:
                r=db().execute("SELECT * FROM pp_responses WHERE id=? AND poll_id=? AND status='accepted' AND consent=1",(rid,pid)).fetchone()
                if not r or not prefs(r['viewer'])['followups']: raise CommunityError('Invite only participants who opted in to follow-ups.')
                people.append(r['viewer'])
            fid=uid();debit(viewer(),'credits',len(people)*2,'Follow-up reserve','followup-'+fid,pid)
            db().execute('INSERT INTO pp_followups VALUES (?,?,?,?,?,?,?)',(fid,pid,viewer(),question,'open',(now()+timedelta(days=7)).isoformat(),stamp()))
            for person in people: db().execute('INSERT INTO pp_invites (followup_id,viewer,text,audio,answered_at) VALUES (?,?,?,?,?)',(fid,person,'','',''))
            return dict(id=fid)
        return jsonify(once('followup-'+pid,data,run))
    @bp.post('/api/community/followups/<fid>/answer')
    @mutation
    def followup_answer(fid):
        f=db().execute('SELECT * FROM pp_followups WHERE id=?',(fid,)).fetchone()
        i=db().execute('SELECT * FROM pp_invites WHERE followup_id=? AND viewer=?',(fid,viewer())).fetchone()
        if not f or not i: raise CommunityError('This invitation is not available to you.',404)
        if i['answered_at']: return jsonify(saved=True)
        if f['status']!='open': raise CommunityError('This follow-up has closed.',409)
        data=body(); note=text(data.get('text',''),0,3000); audio=asset(data.get('audio',''),'audio')
        if not audio and len(note)<10: raise CommunityError('Add a little more detail, or record your answer.')
        origin=data.get('audio_origin','human')
        if origin not in ['human','generated']: raise CommunityError('Choose a valid voice origin.')
        if audio and db().execute('SELECT 1 FROM ai_assets WHERE filename=?',(audio.split('/')[-1],)).fetchone(): origin='generated'
        db().execute('UPDATE pp_invites SET text=?,audio=?,answered_at=?,audio_origin=? WHERE followup_id=? AND viewer=?',(note,audio,stamp(),origin,fid,viewer()))
        entry(viewer(),'points',100,'Paid follow-up','followup-'+fid,f['poll_id'])
        return jsonify(saved=True)
    @bp.post('/api/community/followups/<fid>/close')
    @mutation
    def followup_close(fid):
        f=db().execute('SELECT * FROM pp_followups WHERE id=? AND owner=?',(fid,viewer())).fetchone()
        if not f: raise CommunityError('Follow-up not found.',404)
        if f['status']=='open': end_followup(f)
        return jsonify(saved=True)
    @bp.post('/api/community/credits')
    @mutation
    def credits():
        data=body()
        def run():
            amount=integer(data.get('amount'),1,1500)
            if amount not in [250,750,1500]: raise CommunityError('Choose a listed credit pack.')
            entry(viewer(),'credits',amount,'Demo credit purchase',data['idempotency_key'])
            return dict(simulated=True)
        return jsonify(once('credits',data,run))
    @bp.post('/api/community/redeem')
    @mutation
    def redeem():
        data=body()
        def run():
            amount=integer(data.get('points'),500,1000000)
            if amount%100 or balance(viewer(),'points')<amount: raise CommunityError('Redeem available points in steps of 100.')
            fee=math.ceil(amount*.05); rid=uid()
            entry(viewer(),'points',-amount,'Demo redemption',data['idempotency_key'])
            db().execute('INSERT INTO pp_redemptions VALUES (?,?,?,?,?,?,?)',(rid,viewer(),amount,fee,amount-fee,'simulated',stamp()))
            return dict(id=rid,points=amount,fee=fee,net=amount-fee,simulated=True)
        return jsonify(once('redeem',data,run))
    @bp.post('/api/community/referral')
    @mutation
    def referral():
        code=text(body().get('code'),12,12)
        inviter=db().execute('SELECT viewer FROM pp_accounts WHERE referral_code=?',(code,)).fetchone()
        if not inviter or inviter[0]==viewer(): raise CommunityError('Use another member’s invitation code.')
        if db().execute('SELECT 1 FROM pp_responses WHERE viewer=?',(viewer(),)).fetchone(): raise CommunityError('Referral codes apply before your first response.')
        old=db().execute('SELECT inviter FROM pp_referrals WHERE invitee=?',(viewer(),)).fetchone()
        if old and old[0]!=inviter[0]: raise CommunityError('An invitation code is already linked to this account.',409)
        db().execute('INSERT OR IGNORE INTO pp_referrals VALUES (?,?,0)',(viewer(),inviter[0]))
        return jsonify(saved=True)
    @bp.get('/api/community/export')
    def export():
        return jsonify(preferences=prefs(),wallet=wallet(),responses=[dict(r) for r in db().execute('SELECT * FROM pp_responses WHERE viewer=?',(viewer(),))],polls=[json.loads(r['data']) for r in db().execute('SELECT data FROM pp_polls WHERE owner=?',(viewer(),))])
    @bp.post('/api/community/responses/<rid>/transcribe')
    def transcribe_response(rid):
        r=db().execute('SELECT * FROM pp_responses WHERE id=?',(rid,)).fetchone()
        if not r or not (r['viewer']==viewer() or poll(r['poll_id'])['owner']==viewer()): raise CommunityError('Only the participant or publisher can transcribe this response.',403)
        if not r['audio']: raise CommunityError('This response has no voice clip.')
        with db(): rate_limit('ai',10,60)
        fetch_media(app,r['audio'].split('/')[-1])
        transcript=meta['transcribe'](Path(app.config['UPLOAD_FOLDER']) / r['audio'].split('/')[-1])
        with db(): db().execute('UPDATE pp_responses SET transcript=? WHERE id=?',(transcript,rid))
        return jsonify(transcript=transcript)
    @bp.post('/api/community/polls/<pid>/insights')
    def insights(pid):
        p=poll(pid,True)
        with db(): rate_limit('ai',10,60)
        evidence=[dict(id=r['id'],answer=json.loads(r['answer']),text=' '.join([r['text'],r['transcript']]).strip()) for r in db().execute("SELECT * FROM pp_responses WHERE poll_id=? AND status='accepted' AND (text!='' OR transcript!='') ORDER BY created_at LIMIT 100",(pid,))]
        if len(evidence)<2: raise CommunityError('Collect at least two accepted written explanations before generating an insight brief.',409)
        brief=meta['insight_brief'](json.loads(p['data'])['title'], evidence)
        with db(): db().execute('INSERT INTO pp_briefs VALUES (?,?) ON CONFLICT(poll_id) DO UPDATE SET data=excluded.data',(pid,json.dumps(brief)))
        return jsonify(brief=brief)
    from community_features import register_features
    features=register_features(locals())
    def initialize():
        db().executescript('''
        CREATE TABLE IF NOT EXISTS pp_accounts(viewer TEXT PRIMARY KEY,preferences TEXT NOT NULL,draft TEXT NOT NULL,referral_code TEXT UNIQUE NOT NULL);
        CREATE TABLE IF NOT EXISTS pp_polls(id TEXT PRIMARY KEY,owner TEXT NOT NULL,data TEXT NOT NULL,funding TEXT NOT NULL,audience TEXT NOT NULL,cap INTEGER NOT NULL,reward INTEGER NOT NULL,cost INTEGER NOT NULL,seconds INTEGER NOT NULL,status TEXT NOT NULL,closes_at TEXT NOT NULL,created_at TEXT NOT NULL,sample INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS pp_responses(id TEXT PRIMARY KEY,poll_id TEXT NOT NULL REFERENCES pp_polls(id),viewer TEXT NOT NULL,answer TEXT NOT NULL,text TEXT NOT NULL,audio TEXT NOT NULL,status TEXT NOT NULL,reason TEXT NOT NULL,appeal TEXT NOT NULL,consent INTEGER NOT NULL,public_audio INTEGER NOT NULL,created_at TEXT NOT NULL,reviewed_at TEXT NOT NULL,source TEXT NOT NULL,UNIQUE(poll_id,viewer));
        CREATE TABLE IF NOT EXISTS pp_claims(poll_id TEXT REFERENCES pp_polls(id),viewer TEXT,expires_at TEXT NOT NULL,PRIMARY KEY(poll_id,viewer));
        CREATE TABLE IF NOT EXISTS pp_ledger(id TEXT PRIMARY KEY,viewer TEXT NOT NULL,currency TEXT NOT NULL,amount INTEGER NOT NULL,kind TEXT NOT NULL,reference TEXT NOT NULL,poll_id TEXT,created_at TEXT NOT NULL,UNIQUE(viewer,currency,reference));
        CREATE TABLE IF NOT EXISTS pp_requests(viewer TEXT,key TEXT,operation TEXT NOT NULL,digest TEXT NOT NULL,result TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(viewer,key));
        CREATE TABLE IF NOT EXISTS pp_saved(viewer TEXT,poll_id TEXT REFERENCES pp_polls(id),PRIMARY KEY(viewer,poll_id));
        CREATE TABLE IF NOT EXISTS pp_reactions(poll_id TEXT REFERENCES pp_polls(id),viewer TEXT,reaction TEXT NOT NULL,PRIMARY KEY(poll_id,viewer));
        CREATE TABLE IF NOT EXISTS pp_reports(id TEXT PRIMARY KEY,poll_id TEXT REFERENCES pp_polls(id),viewer TEXT,reason TEXT,detail TEXT,created_at TEXT,UNIQUE(poll_id,viewer));
        CREATE TABLE IF NOT EXISTS pp_comments(id TEXT PRIMARY KEY,poll_id TEXT REFERENCES pp_polls(id),viewer TEXT NOT NULL,body TEXT NOT NULL,audio TEXT NOT NULL,created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS pp_likes(comment_id TEXT REFERENCES pp_comments(id),viewer TEXT,PRIMARY KEY(comment_id,viewer));
        CREATE TABLE IF NOT EXISTS pp_outcomes(poll_id TEXT PRIMARY KEY REFERENCES pp_polls(id),body TEXT NOT NULL,created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS pp_followups(id TEXT PRIMARY KEY,poll_id TEXT REFERENCES pp_polls(id),owner TEXT NOT NULL,question TEXT NOT NULL,status TEXT NOT NULL,expires_at TEXT NOT NULL,created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS pp_invites(followup_id TEXT REFERENCES pp_followups(id),viewer TEXT,text TEXT NOT NULL,audio TEXT NOT NULL,answered_at TEXT NOT NULL,PRIMARY KEY(followup_id,viewer));
        CREATE TABLE IF NOT EXISTS pp_redemptions(id TEXT PRIMARY KEY,viewer TEXT NOT NULL,points INTEGER NOT NULL,fee INTEGER NOT NULL,net INTEGER NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS pp_referrals(invitee TEXT PRIMARY KEY,inviter TEXT NOT NULL,rewarded INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS pp_briefs(poll_id TEXT PRIMARY KEY REFERENCES pp_polls(id),data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS pp_limits(viewer TEXT NOT NULL,kind TEXT NOT NULL,created_at TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS pp_limits_lookup ON pp_limits(viewer,kind,created_at);
        CREATE TABLE IF NOT EXISTS pp_audit(id TEXT PRIMARY KEY,response_id TEXT REFERENCES pp_responses(id),moderator TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS pp_response_owner ON pp_responses(viewer,status);
        CREATE INDEX IF NOT EXISTS pp_response_poll ON pp_responses(poll_id,status);
        CREATE INDEX IF NOT EXISTS pp_ledger_owner ON pp_ledger(viewer,currency);
        ''')
        if 'audio_origin' not in {r[1] for r in db().execute('PRAGMA table_info(pp_responses)')}:
            db().execute("ALTER TABLE pp_responses ADD COLUMN audio_origin TEXT NOT NULL DEFAULT 'human'")
        if 'transcript' not in {r[1] for r in db().execute('PRAGMA table_info(pp_responses)')}:
            db().execute("ALTER TABLE pp_responses ADD COLUMN transcript TEXT NOT NULL DEFAULT ''")
        if 'elapsed_seconds' not in {r[1] for r in db().execute('PRAGMA table_info(pp_responses)')}:
            db().execute('ALTER TABLE pp_responses ADD COLUMN elapsed_seconds REAL NOT NULL DEFAULT 0')
        features['initialize']()
        with db():
            if not db().execute("SELECT 1 FROM pp_ledger WHERE reference='initial-pool'").fetchone(): entry('pool','points',1000000,'Demo community funding','initial-pool')
            examples=[('home','everyday','visual','Which corner would you call home?',['A little sunlight','A little colour'],['sunroom.png','reading-nook.png']),('bag','design','visual','Which bag goes everywhere with you?',['The everyday tote','The hands-free favourite'],['tote.png','crossbody.png']),('breakfast','food','classic','Your perfect slow Sunday starts with…',['Coffee and a croissant','A homemade breakfast','Something from the market','Sleeping in'],[]),('week','work','slider','How much would a four-day week change your life?',['Not much','A little','Quite a bit','A lot','Everything'],[]),('voice','everyday','audio','What makes a place feel like home?',['The people','The little rituals','The space itself'],[])]
            for pid,circle,fmt,title,options,images in examples:
                if db().execute('SELECT 1 FROM pp_polls WHERE id=?',(pid,)).fetchone(): continue
                data=dict(title=title,name=title,circle=circle,format=fmt,options=options,images=['/assets/'+i for i in images],audio='/assets/question-sample.mp3' if fmt=='audio' else '',transcript=title if fmt=='audio' else '',text_origin='human',audio_origin='generated' if fmt=='audio' else 'human',image_origin='generated' if images else 'human',ai=bool(images or fmt=='audio'),language='English',platform_usage=True)
                q=quote({**data,'responses':50})
                debit('pool','points',50*q['reward'],'Seed allocation','reserve-'+pid,pid)
                db().execute('INSERT INTO pp_polls VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',(pid,'sample-'+pid,json.dumps(data),'Community','Everyone',50,q['reward'],q['response_credits'],q['seconds'],'active',(now()+timedelta(days=365)).isoformat(),stamp(),1))
            backfill_identities(db(),app.config['SECRET_KEY'])
    @app.cli.command('community-reviews')
    def review_queue_command():
        rows=db().execute("SELECT id,poll_id,text,reason,appeal,status FROM pp_responses WHERE status IN ('rejected','appealed') ORDER BY created_at").fetchall()
        click.echo(json.dumps([dict(r) for r in rows],indent=2))

    @app.cli.command('community-review')
    @click.argument('response_id')
    @click.option('--decision',type=click.Choice(['accept','decline']),required=True)
    @click.option('--reason',required=True)
    def review_command(response_id,decision,reason):
        reason=text(reason,20,1000)
        with db():
            db().execute('BEGIN IMMEDIATE')
            r=db().execute('SELECT * FROM pp_responses WHERE id=?',(response_id,)).fetchone()
            if not r or r['status'] not in ['rejected','appealed']: raise click.ClickException('No open review for that response.')
            if decision=='accept': accept(r)
            else:
                db().execute("UPDATE pp_responses SET status='declined',reason=?,reviewed_at=? WHERE id=?",(reason,stamp(),response_id))
                p=poll(r['poll_id'])
                if r['source']=='Community': entry('pool','points',p['reward'],'Invalid community response refund','declined-'+response_id,p['id'])
                elif p['status']=='ended': entry('pool' if p['funding']=='Community' else p['owner'],'points' if p['funding']=='Community' else 'credits',p['reward'] if p['funding']=='Community' else p['cost'],'Invalid response refund','declined-'+response_id,p['id'])
            db().execute('INSERT INTO pp_audit VALUES (?,?,?,?,?)',(uid(),response_id,'server-operator',reason,stamp()))
        click.echo('Review resolved and audit record saved.')

    @app.cli.command('settle-community')
    def settle_command():
        with db():
            db().execute('BEGIN IMMEDIATE'); settle()
        print('Expired reservations, campaign refunds and review deadlines settled.')
    app.register_blueprint(bp)
    return dict(initialize=initialize)
