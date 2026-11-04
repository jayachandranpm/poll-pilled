"""Local demo marketplace. Integer points/credits; no external payment execution."""
import json
import uuid
from datetime import datetime
from flask import jsonify, request, session

POINTS_PER_RUPEE = 100
VOTE_POINTS = 200
VOICE_POINTS = 100
RESPONSE_CREDITS = 5
MIN_REDEMPTION = 500
AUDIENCES = ['Everyone', 'Tech & AI', 'Work & life', 'Culture', 'Design', 'Food & drink']


def register_marketplace(app, db, now):
    def body():
        data = request.get_json(silent=True)
        return data if isinstance(data, dict) else {}

    def balance(table, viewer):
        return db().execute(f'SELECT COALESCE(SUM(amount),0) FROM {table} WHERE viewer=?', (viewer,)).fetchone()[0]

    def interests(viewer):
        row = db().execute('SELECT topics FROM participant_interests WHERE viewer=?', (viewer,)).fetchone()
        return json.loads(row['topics']) if row else []

    def campaign(poll_id):
        return db().execute('SELECT * FROM campaigns WHERE poll_id=?', (poll_id,)).fetchone()

    def reward_info(poll):
        c = campaign(poll['id'])
        if not c:
            return None
        viewer = session['viewer']
        earned = db().execute("SELECT COALESCE(SUM(amount),0) FROM reward_ledger WHERE viewer=? AND poll_id=? AND kind IN ('vote','voice')", (viewer, poll['id'])).fetchone()[0]
        voted_reward = db().execute("SELECT 1 FROM reward_ledger WHERE viewer=? AND poll_id=? AND kind='vote'", (viewer, poll['id'])).fetchone()
        own = poll['owner'] == viewer
        matches = c['audience'] == 'Everyone' or c['audience'] in interests(viewer)
        closed = datetime.fromisoformat(poll['closes_at']) <= now()
        reason = 'Your own poll' if own else 'Join this topic to qualify' if not matches else 'Poll closed' if closed else 'Campaign paused' if c['status'] == 'paused' else 'Campaign ended' if c['status'] == 'ended' else 'Reward places filled' if c['completed'] >= c['response_cap'] else ''
        return dict(kind=c['kind'], audience=c['audience'], points=c['vote_points'], voice_bonus=c['voice_points'],
                    earned=earned, vote_rewarded=bool(voted_reward), eligible=not reason and not voted_reward,
                    reason=reason, remaining=max(0,c['response_cap']-c['completed']), cap=c['response_cap'],
                    completed=c['completed'], status=c['status'], demo=True)

    def fund_poll(poll_id, owner, data):
        pricing=data.get('quote') or dict(vote_points=VOTE_POINTS,voice_points=VOICE_POINTS,response_credits=RESPONSE_CREDITS)
        vote_points,voice_points,response_credits=(pricing[k] for k in ('vote_points','voice_points','response_credits'))
        kind = data.get('funding', 'community')
        audience = data.get('audience', 'Everyone')
        try:
            cap = int(data.get('response_cap', 50))
        except (TypeError, ValueError):
            raise ValueError('Choose a whole number of response places.')
        if kind not in {'community','publisher'} or audience not in AUDIENCES:
            raise ValueError('Choose a valid funding source and audience.')
        if not 1 <= cap <= 500:
            raise ValueError('Choose between 1 and 500 response places.')
        if kind == 'community':
            audience = 'Everyone'
            if cap > 50:
                raise ValueError('Community polls can reserve up to 50 rewarded responses.')
            reserve = cap * (vote_points + voice_points)
            pool = db().execute('SELECT COALESCE(SUM(amount),0) FROM community_pool').fetchone()[0]
            if pool < reserve:
                raise ValueError('The community pool cannot fund this poll yet. Choose fewer places or use publisher credits.')
            db().execute('INSERT INTO community_pool VALUES (?,?,?,?)', ('reserve-'+poll_id, -reserve, poll_id, now().isoformat()))
            credit_cost = 0
        else:
            credit_cost = cap * response_credits
            if balance('credit_ledger', owner) < credit_cost:
                raise ValueError(f'This campaign needs {credit_cost} credits. Add demo credits in Publisher studio first.')
            db().execute('INSERT INTO credit_ledger VALUES (?,?,?,?,?,?,?)', (uuid.uuid4().hex,owner,-credit_cost,'reserve',poll_id,'reserve-'+poll_id,now().isoformat()))
        db().execute('INSERT INTO campaigns (poll_id,kind,audience,response_cap,completed,status,credit_cost,owner,created_at,vote_points,voice_points,response_credits) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', (poll_id,kind,audience,cap,0,'active',credit_cost,owner,now().isoformat(),vote_points,voice_points,response_credits))

    def award(poll, kind='vote'):
        viewer = session['viewer']
        c = campaign(poll['id'])
        if not c or viewer == poll['owner']:
            return 0
        prior = db().execute('SELECT 1 FROM reward_ledger WHERE viewer=? AND poll_id=? AND kind=?', (viewer,poll['id'],kind)).fetchone()
        if prior:
            return 0
        if kind == 'vote':
            if c['status'] != 'active' or c['completed'] >= c['response_cap'] or datetime.fromisoformat(poll['closes_at']) <= now():
                return 0
            if c['audience'] != 'Everyone' and c['audience'] not in interests(viewer):
                return 0
            db().execute('UPDATE campaigns SET completed=completed+1 WHERE poll_id=?', (poll['id'],))
            amount = c['vote_points']
        else:
            # The optional voice bonus was reserved with the original rewarded vote.
            if not db().execute("SELECT 1 FROM reward_ledger WHERE viewer=? AND poll_id=? AND kind='vote'", (viewer,poll['id'])).fetchone():
                return 0
            if not db().execute("SELECT 1 FROM takes WHERE viewer=? AND poll_id=? AND audio_url!='' AND sample=0", (viewer,poll['id'])).fetchone():
                return 0
            amount = c['voice_points']
        db().execute('INSERT INTO reward_ledger VALUES (?,?,?,?,?,?,?)', (uuid.uuid4().hex,viewer,amount,kind,poll['id'],None,now().isoformat()))
        if kind == 'vote':
            amount += award(poll, 'voice')
        return amount

    def dashboard():
        viewer = session['viewer']
        rows = db().execute('SELECT c.*,p.title,p.mode,p.category,p.closes_at FROM campaigns c JOIN polls p ON p.id=c.poll_id WHERE c.owner=? ORDER BY c.created_at DESC', (viewer,)).fetchall()
        campaigns = [dict(r) for r in rows]
        for c in campaigns:
            voices=db().execute("SELECT COUNT(*) FROM reward_ledger WHERE poll_id=? AND kind='voice'",(c['poll_id'],)).fetchone()[0]
            unused_voice=max(0,c['completed']-voices)
            c['remaining_credits'] = ((c['response_cap']-c['completed'])*c['response_credits']+unused_voice*c['voice_points']//POINTS_PER_RUPEE) if c['kind']=='publisher' and c['status']!='ended' else 0
            c['expired'] = datetime.fromisoformat(c['closes_at']) <= now()
        ledger = [dict(r) for r in db().execute('SELECT l.*,p.title FROM reward_ledger l LEFT JOIN polls p ON p.id=l.poll_id WHERE l.viewer=? ORDER BY l.created_at DESC LIMIT 40', (viewer,))]
        redemptions = [dict(r) for r in db().execute('SELECT * FROM redemptions WHERE viewer=? ORDER BY created_at DESC LIMIT 20', (viewer,))]
        credits = [dict(r) for r in db().execute('SELECT * FROM credit_ledger WHERE viewer=? ORDER BY created_at DESC LIMIT 30', (viewer,))]
        return dict(demo=True, points=balance('reward_ledger',viewer), credits=balance('credit_ledger',viewer),
                    earned=db().execute("SELECT COALESCE(SUM(amount),0) FROM reward_ledger WHERE viewer=? AND amount>0", (viewer,)).fetchone()[0],
                    rewarded_responses=db().execute("SELECT COUNT(*) FROM reward_ledger WHERE viewer=? AND kind='vote'", (viewer,)).fetchone()[0],
                    redeemed=db().execute('SELECT COALESCE(SUM(points),0) FROM redemptions WHERE viewer=?',(viewer,)).fetchone()[0], interests=interests(viewer),
                    ledger=ledger, credit_history=credits, redemptions=redemptions, campaigns=campaigns,
                    community_pool=db().execute('SELECT COALESCE(SUM(amount),0) FROM community_pool').fetchone()[0],
                    points_per_rupee=POINTS_PER_RUPEE, vote_points=VOTE_POINTS, voice_points=VOICE_POINTS,
                    response_credits=RESPONSE_CREDITS, minimum_redemption=MIN_REDEMPTION, redemption_fee_percent=5,
                    packs=[250,500,1000], audiences=AUDIENCES)

    @app.get('/api/marketplace')
    def marketplace():
        return jsonify(marketplace=dashboard())

    def key_from(data):
        key = data.get('idempotency_key')
        if not isinstance(key,str) or not 8 <= len(key) <= 80:
            raise ValueError('A unique request key is required. Please try again.')
        return key

    @app.post('/api/credits/topup')
    def topup():
        data = body()
        try:
            key = key_from(data)
            pack = data.get('credits')
            if type(pack) is not int or pack not in {250,500,1000}:
                raise ValueError('Choose a demo credit pack.')
            with db():
                db().execute('BEGIN IMMEDIATE')
                prior = db().execute('SELECT * FROM credit_ledger WHERE viewer=? AND request_key=?', (session['viewer'],key)).fetchone()
                if prior and (prior['kind']!='topup' or prior['amount']!=pack):
                    raise ValueError('This request key was already used for a different action.')
                if not prior:
                    db().execute('INSERT INTO credit_ledger VALUES (?,?,?,?,?,?,?)', (uuid.uuid4().hex,session['viewer'],pack,'topup',None,key,now().isoformat()))
            return jsonify(marketplace=dashboard(), simulated=True)
        except ValueError as exc:
            return jsonify(error=str(exc)),400

    @app.post('/api/rewards/redeem')
    def redeem():
        data = body()
        try:
            key = key_from(data)
            points = data.get('points')
            if type(points) is not int or points < MIN_REDEMPTION or points % POINTS_PER_RUPEE:
                raise ValueError('Redeem at least 500 points, in steps of 100.')
            with db():
                db().execute('BEGIN IMMEDIATE')
                prior = db().execute('SELECT * FROM redemptions WHERE viewer=? AND request_key=?', (session['viewer'],key)).fetchone()
                if prior:
                    if prior['points'] != points:
                        raise ValueError('This request key was already used for another amount.')
                    result = dict(prior)
                else:
                    if balance('reward_ledger',session['viewer']) < points:
                        raise ValueError('You do not have enough points for this redemption.')
                    fee = (points*5+99)//100
                    rid = uuid.uuid4().hex
                    db().execute('INSERT INTO redemptions VALUES (?,?,?,?,?,?,?,?)', (rid,session['viewer'],points,fee,points-fee,'simulated',key,now().isoformat()))
                    db().execute('INSERT INTO reward_ledger VALUES (?,?,?,?,?,?,?)', (uuid.uuid4().hex,session['viewer'],-points,'redemption',None,rid,now().isoformat()))
                    result = dict(db().execute('SELECT * FROM redemptions WHERE id=?',(rid,)).fetchone())
            return jsonify(redemption=result,marketplace=dashboard(),simulated=True),201
        except ValueError as exc:
            return jsonify(error=str(exc)),400

    @app.post('/api/participant/interests')
    def set_interests():
        data = body()
        topics = data.get('topics')
        if not isinstance(topics,list) or len(topics)>5 or any(t not in AUDIENCES[1:] for t in topics):
            return jsonify(error='Choose topics from the community list.'),400
        with db():
            db().execute('INSERT INTO participant_interests VALUES (?,?) ON CONFLICT(viewer) DO UPDATE SET topics=excluded.topics', (session['viewer'],json.dumps(sorted(set(topics)))))
        return jsonify(marketplace=dashboard())

    @app.post('/api/campaigns/<poll_id>/status')
    def change_campaign(poll_id):
        data = body()
        status = data.get('status')
        if status not in {'active','paused','ended'}:
            return jsonify(error='Choose a valid campaign status.'),400
        with db():
            db().execute('BEGIN IMMEDIATE')
            c = campaign(poll_id)
            if not c or c['owner']!=session['viewer']:
                return jsonify(error='This campaign does not belong to your workspace.'),404
            if c['status']=='ended' and status!='ended':
                return jsonify(error='An ended campaign cannot be reopened.'),400
            if status=='ended' and c['status']!='ended':
                unfilled = c['response_cap']-c['completed']
                voices=db().execute("SELECT COUNT(*) FROM reward_ledger WHERE poll_id=? AND kind='voice'",(poll_id,)).fetchone()[0]
                unused_voice=max(0,c['completed']-voices)
                if c['kind']=='publisher':
                    db().execute('INSERT INTO credit_ledger VALUES (?,?,?,?,?,?,?)', (uuid.uuid4().hex,c['owner'],unfilled*c['response_credits']+unused_voice*c['voice_points']//POINTS_PER_RUPEE,'refund',poll_id,'refund-'+poll_id,now().isoformat()))
                else:
                    db().execute('INSERT INTO community_pool VALUES (?,?,?,?)', ('refund-'+poll_id,unfilled*(c['vote_points']+c['voice_points'])+unused_voice*c['voice_points'],poll_id,now().isoformat()))
                db().execute('UPDATE polls SET closes_at=? WHERE id=?', (now().isoformat(),poll_id))
            db().execute('UPDATE campaigns SET status=? WHERE poll_id=?',(status,poll_id))
        return jsonify(marketplace=dashboard())

    def initialize():
        db().executescript('''
            CREATE TABLE IF NOT EXISTS campaigns (poll_id TEXT PRIMARY KEY REFERENCES polls(id),kind TEXT NOT NULL,audience TEXT NOT NULL,response_cap INTEGER NOT NULL,completed INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL,credit_cost INTEGER NOT NULL,owner TEXT NOT NULL,created_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS reward_ledger (id TEXT PRIMARY KEY,viewer TEXT NOT NULL,amount INTEGER NOT NULL,kind TEXT NOT NULL,poll_id TEXT REFERENCES polls(id),redemption_id TEXT,created_at TEXT NOT NULL,UNIQUE(viewer,poll_id,kind));
            CREATE TABLE IF NOT EXISTS credit_ledger (id TEXT PRIMARY KEY,viewer TEXT NOT NULL,amount INTEGER NOT NULL,kind TEXT NOT NULL,poll_id TEXT REFERENCES polls(id),request_key TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(viewer,request_key));
            CREATE TABLE IF NOT EXISTS redemptions (id TEXT PRIMARY KEY,viewer TEXT NOT NULL,points INTEGER NOT NULL,fee INTEGER NOT NULL,net INTEGER NOT NULL,status TEXT NOT NULL,request_key TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(viewer,request_key));
            CREATE TABLE IF NOT EXISTS participant_interests (viewer TEXT PRIMARY KEY,topics TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS community_pool (id TEXT PRIMARY KEY,amount INTEGER NOT NULL,poll_id TEXT REFERENCES polls(id),created_at TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS reward_viewer_idx ON reward_ledger(viewer);
            CREATE INDEX IF NOT EXISTS credit_viewer_idx ON credit_ledger(viewer);
        ''')
        columns={row['name'] for row in db().execute('PRAGMA table_info(campaigns)')}
        for name,default in [('vote_points',200),('voice_points',100),('response_credits',5)]:
            if name not in columns:
                db().execute(f'ALTER TABLE campaigns ADD COLUMN {name} INTEGER NOT NULL DEFAULT {default}')
        with db():
            db().execute("INSERT OR IGNORE INTO community_pool VALUES ('demo-launch-budget',1000000,NULL,?)",(now().isoformat(),))
            for p in db().execute('SELECT p.* FROM polls p LEFT JOIN campaigns c ON c.poll_id=p.id WHERE c.poll_id IS NULL').fetchall():
                fund_poll(p['id'],p['owner'],{})
        # Existing real votes remain valid; example base vote counts never mint points.
        with app.test_request_context():
            with db():
                for vote in db().execute('SELECT * FROM votes').fetchall():
                    session['viewer']=vote['viewer']
                    award(db().execute('SELECT * FROM polls WHERE id=?',(vote['poll_id'],)).fetchone())

    return dict(reward_info=reward_info, fund_poll=fund_poll, award=award, dashboard=dashboard, initialize=initialize)
