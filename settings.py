"""Per-browser preferences and a scoped, downloadable activity export."""
import json
import os
from flask import jsonify, request, session

DEFAULTS = dict(font_size='comfortable', density='comfortable', accent='green', surface='paper', reduce_motion=False, default_sort='trending', poll_formats=['text','voice','image','interactive'], generated_content='include')
CHOICES = dict(font_size={'comfortable','larger'}, density={'comfortable','compact'}, accent={'green','blue','purple','teal'}, surface={'paper','white'}, default_sort={'trending','newest','closing'}, generated_content={'include','hide'})

def register_settings(app, db):
    def initialize():
        db().execute('CREATE TABLE IF NOT EXISTS preferences (viewer TEXT PRIMARY KEY, data TEXT NOT NULL)')
        db().commit()
    def preferences():
        row=db().execute('SELECT data FROM preferences WHERE viewer=?',(session['viewer'],)).fetchone()
        return {**DEFAULTS, **(json.loads(row['data']) if row else {})}
    @app.post('/api/preferences')
    def save_preferences():
        data=request.get_json(silent=True)
        if not isinstance(data,dict) or not data or set(data)-set(DEFAULTS):
            return jsonify(error='Choose supported preferences.'),400
        for key,value in data.items():
            if key=='poll_formats':
                valid=isinstance(value,list) and 1<=len(value)<=4 and all(isinstance(x,str) and x in {'text','voice','image','interactive'} for x in value) and len(value)==len(set(value))
            elif key=='reduce_motion':
                valid=type(value) is bool
            else:
                valid=isinstance(value,str) and value in CHOICES[key]
            if not valid:
                return jsonify(error='Choose a valid '+key.replace('_',' ')+'.'),400
        updated={**preferences(),**data}
        with db():
            db().execute('INSERT INTO preferences VALUES (?,?) ON CONFLICT(viewer) DO UPDATE SET data=excluded.data',(session['viewer'],json.dumps(updated)))
        return jsonify(preferences=updated)
    @app.get('/api/account/export')
    def export_activity():
        viewer=session['viewer']
        def own(table,field='viewer'):
            rows=[]
            for row in db().execute(f'SELECT * FROM {table} WHERE {field}=?',(viewer,)):
                item=dict(row);item.pop('viewer',None);item.pop('owner',None);rows.append(item)
            return rows
        polls=own('polls','owner')
        for poll in polls:
            poll['options']=[dict(r) for r in db().execute('SELECT id,label,position,image_url FROM options WHERE poll_id=? ORDER BY position',(poll['id'],))]
        payload=dict(product='Poll Pilled',environment='local demo',preferences=preferences(),profile=own('profiles'),interests=own('participant_interests'),polls=polls,votes=own('votes'),bookmarks=own('bookmarks'),takes=own('takes'),reactions=own('take_likes'),rewards=own('reward_ledger'),credits=own('credit_ledger'),redemptions=own('redemptions'),campaigns=own('campaigns','owner'),poll_events=own('poll_events'),poll_design=[dict(r) for r in db().execute('SELECT d.* FROM poll_design d JOIN polls p ON p.id=d.poll_id WHERE p.owner=?',(viewer,))])
        response=jsonify(payload);response.headers['Content-Disposition']='attachment; filename="pollpilled-data.json"';return response
    return dict(initialize=initialize,preferences=preferences)
