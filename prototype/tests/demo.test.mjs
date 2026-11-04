import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoClient,demoDraft,demoQuote,recommendFormat} from '../src/demo.js';

function setup(){
 const values=new Map();
 const storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
 const client=createDemoClient(storage);
 return {request:client.request,storage,values};
}
const state=c=>c.request('/api/community/state');
const details=(c,id='design-study')=>c.request(`/api/community/polls/${id}/details`);

test('seed provides every format and both sides of the marketplace',async()=>{
 const s=await state(setup());
 assert.deepEqual(new Set(s.polls.map(p=>p.format)),new Set(['classic','visual','audio','rank','slider','ab','video','pairwise','allocation']));
 assert(s.polls.some(p=>p.mine));assert(s.wallet.pending>0);assert(s.wallet.paid>0);
 assert(s.invitations.length);assert(s.updates.length);assert(s.draft.title);
});
test('brief recommendations and example drafts cover all five formats',()=>{
 for(const [brief,format] of [['Choose a logo design','visual'],['Rank our priorities','rank'],['Listen to this sound','audio'],['How useful is this idea?','slider'],['What matters most?','classic']]){
  assert.equal(recommendFormat(brief).format,format);
  const d=demoDraft(brief);assert.equal(d.format,format);assert(d.options.length>=2);
  if(format==='audio')assert(d.audio&&d.transcript);
  if(format==='visual')assert.equal(d.images.length,d.options.length);
 }
});
test('budget separates rewards and fees and scales with effort and audience',()=>{
 const base=demoDraft('Choose one','classic');
 const free=demoQuote(base),paid=demoQuote({...base,reach:'Boost',responses:100,audience:'design'});
 assert.equal(free.credits,0);assert(free.community_reserve>0);
 assert.equal(paid.credits,100*(paid.reward_credits+paid.fee_credits));
 assert(paid.matched_audience<free.matched_audience);
 assert(demoQuote(demoDraft('Listen to this','audio')).seconds>free.seconds);
 assert.throws(()=>demoQuote({...base,responses:51}),/1–50/);
});
test('demo preferences persist in one dedicated key and returned state is isolated',async()=>{
 const c=setup();await c.request('/api/community/preferences',{languages:['Tamil'],formats:['classic']});
 const s=await state(c);s.preferences.languages.push('Spanish');
 const restored=createDemoClient(c.storage);
 assert.deepEqual((await state(restored)).preferences.languages,['Tamil']);
 assert.deepEqual([...c.values.keys()],['pollpilled-ui-demo-v1']);
 await assert.rejects(c.request('/api/community/preferences',{formats:[]}),/at least one/);
 assert.deepEqual((await state(c)).preferences.formats,['classic']);
});
test('published rank draft keeps full ordering and credits rewards only once',async()=>{
 const c=setup(),before=await state(c);
 const draft={...demoDraft('Rank improvements'),data_use_accepted:true};
 const {id}=await c.request('/api/community/publish',draft);
 await c.request(`/api/community/polls/${id}/examples`,{});
 const d=await details(c,id);assert.equal(d.responses.length,3);
 assert(d.responses.every(r=>new Set(r.answer).size===draft.options.length));
 await c.request('/api/community/polls/breakfast/claim',{});
 await c.request('/api/community/polls/breakfast/answer',{answer:2,text:'I enjoy visiting the market.',consent:true});
 const accepted=await state(c);
 assert(accepted.wallet.points>before.wallet.points);
 await c.request('/api/community/polls/breakfast/answer',{answer:1});
 assert.equal((await state(c)).wallet.points,accepted.wallet.points);
});
test('insight findings cite accepted responses and disclose sample size',async()=>{
 const c=setup();const {brief}=await c.request('/api/community/polls/design-study/insights',{});
 const d=await details(c),accepted=d.responses.filter(r=>r.status==='accepted');
 assert.equal(brief.sample_size,accepted.length);assert(brief.demo);
 assert(brief.themes.some(t=>t.title==='Room for everyday essentials'));
 for(const finding of [...brief.themes,...brief.disagreements])for(const source of finding.sources)assert(accepted.some(r=>r.id===source));
});
test('appeal acceptance moves reserved points once and clears the case',async()=>{
 const c=setup(),before=await state(c);
 await c.request('/api/community/responses/mine-review/appeal',{reason:'My answer explains my need for reliability.'});
 assert.equal((await state(c)).responses.find(r=>r.id==='mine-review').status,'appealed');
 await c.request('/api/community/moderation/mine-review',{action:'accept',reason:'Relevant explanation.'});
 const after=await state(c);assert(after.wallet.points>before.wallet.points);assert(after.wallet.pending<before.wallet.pending);
 await assert.rejects(c.request('/api/community/moderation/mine-review',{action:'accept'}),/already been resolved/);
 assert.equal((await state(c)).wallet.points,after.wallet.points);
});
test('pending reward release updates both balance buckets exactly once',async()=>{
 const c=setup(),before=await state(c);
 await c.request('/api/community/responses/mine-pending/review',{action:'accept'});
 const after=await state(c),delta=after.wallet.points-before.wallet.points;
 assert(delta>0);assert.equal(before.wallet.pending-after.wallet.pending,delta);
 await c.request('/api/community/responses/mine-pending/review',{action:'accept'});
 assert.equal((await state(c)).wallet.points,after.wallet.points);
});
test('declined appeal opens a replacement that fills without another charge',async()=>{
 const c=setup(),before=await state(c);
 await c.request('/api/community/moderation/r6',{action:'decline',reason:'Example invalid response.'});
 const d=await details(c),replacement=d.replacements.at(-1);
 assert.equal(d.responses.find(r=>r.id==='r6').status,'declined');
 assert.equal(replacement.status,'searching');
 await c.request(`/api/community/replacements/${replacement.id}/fill`,{});
 const filled=await details(c);assert.equal(filled.poll.responses,d.poll.responses+1);
 assert.equal((await state(c)).wallet.credits,before.wallet.credits);
 await c.request(`/api/community/replacements/${replacement.id}/fill`,{});
 assert.equal((await details(c)).poll.responses,filled.poll.responses);
});
test('paid invitations respect consent and simulate replies, refunds and rewards',async()=>{
 const c=setup(),before=await state(c);
 await assert.rejects(c.request('/api/community/polls/design-study/followups',{question:'What would help?',response_ids:['r4']}),/accepted, consenting/);
 const {id}=await c.request('/api/community/polls/design-study/followups',{question:'What would you improve?',response_ids:['r1','r2']});
 assert.equal((await state(c)).wallet.credits,before.wallet.credits-4);
 await c.request(`/api/community/followups/${id}/sample-reply`,{});
 await c.request(`/api/community/followups/${id}/close`,{});
 assert.equal((await state(c)).wallet.credits,before.wallet.credits-2);
 await c.request('/api/community/followups/invite-1/answer',{text:'An inside pocket would make it more useful.'});
 await c.request('/api/community/followups/invite-1/answer',{text:'An inside pocket would make it more useful.'});
 assert.equal((await state(c)).wallet.points,before.wallet.points+100);
});
test('decision updates, sample AI media and reset stay local',async()=>{
 const c=setup();await c.request('/api/community/polls/design-study/outcome',{text:'We added the pocket you asked for.'});
 assert((await state(c)).updates.some(u=>u.body==='We added the pocket you asked for.'));
 assert((await c.request('/api/ai/transcribe',{})).demo);
 assert((await c.request('/api/ai/speech',{})).url.startsWith('/assets/'));
 await assert.rejects(c.request('/api/ai/connections',{key:'example'}),/not available/);
 await c.request('/api/community/demo/reset',{});
 assert.equal((await state(c)).wallet.points,1840);assert.equal((await state(c)).updates.length,1);
});
test('storage failure rolls back the attempted mutation',async()=>{
 const c=createDemoClient({getItem:()=>null,setItem:()=>{throw new Error('quota')}});
 await assert.rejects(c.request('/api/community/credits',{amount:250}),/local storage is full/);
 assert.equal((await state(c)).wallet.credits,1250);
});

test('expired places cannot credit rewards, and voice sharing remains an explicit choice',async()=>{
 const c=setup();await c.request('/api/community/polls/home/claim',{});
 const key='pollpilled-ui-demo-v1',saved=JSON.parse(c.storage.getItem(key));
 saved.polls.find(p=>p.id==='home').claim.expires_at='2000-01-01T00:00:00.000Z';
 c.storage.setItem(key,JSON.stringify(saved));
 const restored=createDemoClient(c.storage),before=await state(restored);
 await assert.rejects(restored.request('/api/community/polls/home/answer',{answer:0,audio:'/assets/voice-sample.mp3'}),/expired/);
 assert.equal((await state(restored)).wallet.points,before.wallet.points);
 await restored.request('/api/community/polls/home/claim',{});
 const privateReply=await restored.request('/api/community/polls/home/answer',{answer:0,audio:'/assets/voice-sample.mp3'});
 assert.equal(privateReply.response.public_audio,false);
 await restored.request('/api/community/polls/voice/claim',{});
 const publicReply=await restored.request('/api/community/polls/voice/answer',{answer:1,audio:'/assets/voice-sample.mp3',public_audio:true});
 assert.equal(publicReply.response.public_audio,true);
});
