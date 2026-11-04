"""Account, moderation and audience workflows for the poll marketplace."""
import io
import json
import time
import zipfile
from pathlib import Path
from flask import jsonify, request, send_file
from deployment import is_admin
from community_rules import COUNTRIES, AGE_BANDS
from catalyst_storage import fetch_media
from community_following import FOLLOW_SCHEMA, register_following


FEATURE_SCHEMA = '''
        CREATE TABLE IF NOT EXISTS pp_notice_reads(viewer TEXT,notice TEXT,PRIMARY KEY(viewer,notice));
        CREATE TABLE IF NOT EXISTS pp_report_reviews(report_id TEXT PRIMARY KEY,moderator TEXT,decision TEXT,reason TEXT,created_at TEXT);
        CREATE TABLE IF NOT EXISTS pp_ab_exposures(poll_id TEXT,viewer TEXT,first_option INTEGER,created_at TEXT,PRIMARY KEY(poll_id,viewer));
        CREATE TABLE IF NOT EXISTS pp_takedowns(poll_id TEXT PRIMARY KEY,reason TEXT,created_at TEXT);
        '''

def register_features(ctx):
    app, bp, db = (ctx[k] for k in ('app','bp','db'))
    viewer,prefs,body,text,mutation,poll,stamp,uid = (ctx[k] for k in ('viewer','prefs','body','text','mutation','poll','stamp','uid'))
    # Import lazily: community imports this module during app construction.
    from community import CommunityError
    following=register_following(ctx)

    def initialize():
        db().executescript(FEATURE_SCHEMA)
        db().executescript(FOLLOW_SCHEMA)
        if 'audio_origin' not in {r[1] for r in db().execute('PRAGMA table_info(pp_invites)')}:
            db().execute("ALTER TABLE pp_invites ADD COLUMN audio_origin TEXT NOT NULL DEFAULT 'human'")

    def notifications():
        result=following['publication_notices']()
        def add(ident,title,detail,target,created):
            result.append(dict(id=ident,title=title,detail=detail,target=target,created_at=created))
        for r in db().execute("SELECT id,poll_id,status,reason,reviewed_at FROM pp_responses WHERE viewer=? AND status!='pending'",(viewer(),)):
            add('review-'+r['id']+'-'+r['status'],'Response '+r['status'],r['reason'] or 'Your points are available in your wallet.','wallet',r['reviewed_at'])
        for r in db().execute('SELECT f.* FROM pp_invites i JOIN pp_followups f ON f.id=i.followup_id WHERE i.viewer=? AND i.answered_at=\'\' AND f.status=\'open\'',(viewer(),)):
            add('invite-'+r['id'],'A paid follow-up for you',r['question'],'wallet',r['created_at'])
        for r in db().execute('SELECT o.* FROM pp_outcomes o WHERE EXISTS(SELECT 1 FROM pp_responses r WHERE r.poll_id=o.poll_id AND r.viewer=?)',(viewer(),)):
            add('decision-'+r['poll_id']+'-'+r['created_at'],'You helped decide',r['body'],'overview',r['created_at'])
        for r in db().execute('SELECT v.*,r.poll_id FROM pp_report_reviews v JOIN pp_reports r ON r.id=v.report_id WHERE r.viewer=?',(viewer(),)):
            add('report-'+r['report_id'],'Your report was reviewed',r['reason'],'discover',r['created_at'])
        read={r[0] for r in db().execute('SELECT notice FROM pp_notice_reads WHERE viewer=?',(viewer(),))}
        return [{**n,'read':n['id'] in read} for n in sorted(result,key=lambda n:n['created_at'],reverse=True)[:100]]

    @bp.get('/api/community/notifications')
    def get_notifications():
        return jsonify(notifications=notifications(),enabled=prefs()['notifications'])

    @bp.post('/api/community/notifications/read')
    @mutation
    def read_notifications():
        ids=body().get('ids',[]); allowed={n['id'] for n in notifications()}|following['readable_notice_ids']()|{r[0] for r in db().execute('SELECT notice FROM pp_notice_reads WHERE viewer=?',(viewer(),))}
        if not isinstance(ids,list) or len(ids)>100 or any(not isinstance(i,str) or i not in allowed for i in ids): raise CommunityError('Choose your own notifications.')
        for ident in ids: db().execute('INSERT OR IGNORE INTO pp_notice_reads VALUES (?,?)',(viewer(),ident))
        return jsonify(saved=True)

    def validate_targeting(data):
        if not isinstance(data,dict): raise CommunityError('Choose a valid audience.')
        out={}
        for key,allowed in [('country',COUNTRIES),('age_band',AGE_BANDS)]:
            values=data.get(key,[])
            if not isinstance(values,list) or len(values)>len(allowed) or any(v not in allowed for v in values): raise CommunityError('Choose supported audience values.')
            out[key]=list(dict.fromkeys(values))
        return out

    @bp.post('/api/community/audience-preview')
    def audience_preview():
        data=body(); target=validate_targeting(data.get('targeting',{})); language=data.get('language','English'); tags=data.get('tags',[])
        if not isinstance(tags,list) or any(not isinstance(t,str) for t in tags): raise CommunityError('Choose valid topics.')
        matched=0
        for r in db().execute('SELECT viewer,preferences FROM pp_accounts WHERE viewer!=?',(viewer(),)):
            p=prefs(r['viewer'])
            if language not in p['languages'] or tags and not set(tags)&set(p['interests']): continue
            if any(target[k] and p.get(k) not in target[k] for k in target): continue
            matched+=1
        return jsonify(matching_accounts=matched, self_reported=True, guaranteed=False, note='Current matching profiles; participation and delivery time are not guaranteed.')

    def admin():
        if not is_admin(): raise CommunityError('Administrator access required.',403)

    @bp.get('/api/community/admin/reviews')
    def review_queue():
        admin()
        reports=[]
        for r in db().execute('SELECT r.* FROM pp_reports r LEFT JOIN pp_report_reviews v ON r.id=v.report_id WHERE v.report_id IS NULL ORDER BY r.created_at'):
            p=poll(r['poll_id']); reports.append(dict(id=r['id'],poll_id=p['id'],title=json.loads(p['data'])['title'],options=json.loads(p['data'])['options'],images=json.loads(p['data']).get('images',[]),reason=r['reason'],detail=r['detail'],created_at=r['created_at']))
        appeals=[{**ctx['response_data'](r),'poll_id':r['poll_id'],'title':json.loads(poll(r['poll_id'])['data'])['title']} for r in db().execute("SELECT * FROM pp_responses WHERE status IN ('rejected','appealed') ORDER BY created_at")]
        audit=[dict(r) for r in db().execute('SELECT response_id,reason,created_at FROM pp_audit ORDER BY created_at DESC LIMIT 50')]
        return jsonify(reports=reports,appeals=appeals,audit=audit)

    @bp.post('/api/community/admin/reports/<rid>')
    @mutation
    def review_report(rid):
        admin(); data=body(); reason=text(data.get('reason'),20,1000); decision=data.get('decision')
        if decision not in ('dismiss','remove'): raise CommunityError('Choose a review decision.')
        r=db().execute('SELECT * FROM pp_reports WHERE id=?',(rid,)).fetchone()
        if not r: raise CommunityError('Report not found.',404)
        if db().execute('SELECT 1 FROM pp_report_reviews WHERE report_id=?',(rid,)).fetchone(): raise CommunityError('This report was already reviewed.',409)
        if decision=='remove':
            p=poll(r['poll_id'])
            if p['status']!='ended': ctx['end_poll'](p)
            db().execute('INSERT OR REPLACE INTO pp_takedowns VALUES (?,?,?)',(p['id'],reason,stamp()))
        db().execute('INSERT INTO pp_report_reviews VALUES (?,?,?,?,?)',(rid,viewer(),decision,reason,stamp()))
        return jsonify(saved=True)

    @bp.get('/api/community/admin/usage')
    def ai_usage():
        admin(); day=int(time.time()//86400)*86400
        summary=[dict(r) for r in db().execute('SELECT task,state,COUNT(*) requests,SUM(cost) estimated_usd,SUM(input_tokens) input_tokens,SUM(output_tokens) output_tokens FROM ai_calls WHERE started>=? GROUP BY task,state',(day,))]
        history=[dict(r) for r in db().execute('SELECT task,started,state,cost estimated_usd,input_tokens,output_tokens,cached_tokens FROM ai_calls ORDER BY started DESC LIMIT 100')]
        return jsonify(summary=summary,history=history,estimated=True,resets_at=day+86400)

    @bp.post('/api/community/admin/settle')
    @mutation
    def settle_now():
        admin();ctx['settle']();return jsonify(settled=True)

    @bp.post('/internal/settlement')
    def scheduled_settlement():
        # The deployment guard verifies a scoped secret for this exact endpoint.
        with db():
            db().execute('BEGIN IMMEDIATE');ctx['settle']()
        app.extensions['platform_write']('settlement_last_run',stamp())
        return jsonify(settled=True)

    @bp.get('/api/community/admin/schedule')
    def schedule_status():
        admin()
        return jsonify(configured=bool(app.extensions['platform_read']('settlement_job_id')),last_run=app.extensions['platform_read']('settlement_last_run'))

    @bp.post('/api/community/admin/schedule')
    def setup_schedule():
        admin()
        import zcatalyst_sdk
        from deployment import settlement_key
        jobs=zcatalyst_sdk.initialize(req=request,scope='admin').job_scheduling()
        ident=app.extensions['platform_read']('settlement_job_id')
        if ident:
            job=jobs.cron.get(ident)
            return jsonify(configured=bool(job.get('cron_status')),last_run=app.extensions['platform_read']('settlement_last_run'))
        pool=next((p for p in jobs.get_all_jobpool() if p.get('name')=='PollPilledSettlement'),None)
        if not pool: raise CommunityError('Create the PollPilledSettlement AppSail job pool in Catalyst first.',409)
        result=jobs.cron.create(dict(cron_name='PollPilledHourlySettlement',cron_type='Periodic',cron_status=True,
            cron_detail=dict(repetition_type='every',hour=1,minute=0,second=0,timezone='Asia/Kolkata'),
            job_meta=dict(job_name='PollPilledSettlement',jobpool_id=str(pool['id']),target_type='AppSail',target_id='22220000000763369',
                          request_method='POST',url='/internal/settlement',headers={'X-Settlement-Key':settlement_key(app)},request_body='{}',
                          job_config=dict(number_of_retries=2,retry_interval=60000))))
        app.extensions['platform_write']('settlement_job_id',str(result['id']))
        return jsonify(configured=True)

    @bp.get('/api/community/export/archive')
    def export_archive():
        # Only the requesting participant's records and uploads; no other identities.
        owned=[dict(r) for r in db().execute('SELECT * FROM pp_polls WHERE owner=?',(viewer(),))]
        answers=[dict(r) for r in db().execute('SELECT * FROM pp_responses WHERE viewer=?',(viewer(),))]
        payload=dict(version=2,exported_at=stamp(),preferences=prefs(),wallet=ctx['wallet'](),polls=owned,responses=answers,
                     drafts=json.loads(db().execute('SELECT draft FROM pp_accounts WHERE viewer=?',(viewer(),)).fetchone()[0]),
                     reports=[dict(r) for r in db().execute('SELECT * FROM pp_reports WHERE viewer=?',(viewer(),))],
                     followup_replies=[dict(r) for r in db().execute('SELECT * FROM pp_invites WHERE viewer=?',(viewer(),))],
                     reviews=[dict(r) for r in db().execute('SELECT a.response_id,a.reason,a.created_at FROM pp_audit a JOIN pp_responses r ON r.id=a.response_id WHERE r.viewer=?',(viewer(),))],notifications=notifications(),following=following['following_state']())
        uploads=db().execute('SELECT filename FROM uploads WHERE viewer=?',(viewer(),)).fetchall()
        # Bound archive memory; failure is explicit, never a silently incomplete archive.
        output=io.BytesIO(); size=0
        with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as z:
            z.writestr('poll-pilled-data.json',json.dumps(payload,indent=2))
            for row in uploads:
                filename=row['filename'];fetch_media(app,filename);path=Path(app.config['UPLOAD_FOLDER'])/filename
                if not path.is_file(): raise CommunityError('A media file is temporarily unavailable. Please retry your export.',503)
                size+=path.stat().st_size
                if size>100*1024*1024: raise CommunityError('Your media archive exceeds 100 MB. Download the JSON export and individual media files instead.',413)
                z.write(path,'media/'+filename)
        output.seek(0)
        return send_file(output,mimetype='application/zip',as_attachment=True,download_name='poll-pilled-data.zip')

    return dict(initialize=initialize,notifications=notifications,validate_targeting=validate_targeting,**following)
