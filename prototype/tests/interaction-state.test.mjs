import test from 'node:test';
import assert from 'node:assert/strict';
import {readResponseDraft,updateResponseDraft,clearResponseDraft,subscribeResponseDraft,actionableCount,redemptionQuote,reviewDeadline,campaignMetrics} from '../src/interactionState.js';
import {createDraftWriter} from '../src/draftPersistence.js';
import {createDemoClient} from '../src/demo.js';
import {readRoute,routeURL} from '../src/navigation.js';

test('response drafts survive new poll objects and navigation, including private media and round history',()=>{
 const poll={id:'test-continuity',format:'pairwise',options:['A','B','C']};let changes=0;const unsubscribe=subscribeResponseDraft(()=>changes++);
 updateResponseDraft(poll,{answer:1,text:'Why B',audio:'/private.webm',origin:'human',consent:true,progress:[{winner:1,challenger:2}]});
 const restored=readResponseDraft({...poll,remaining:3});
 assert.equal(restored.answer,1);assert.equal(restored.audio,'/private.webm');assert.equal(restored.text,'Why B');assert.equal(restored.consent,true);assert.equal(restored.progress.length,1);
 assert.equal(readResponseDraft({...poll}),restored,'stable snapshots avoid render loops');
 updateResponseDraft(poll,{mode:'AI voice'});assert.equal(readResponseDraft(poll).text,'Why B');assert.equal(changes,2);unsubscribe();
 clearResponseDraft(poll.id);assert.equal(readResponseDraft(poll).answer,null);assert.equal(readResponseDraft(poll).text,'');
});
test('format/option changes invalidate stale answers but another poll never inherits them',()=>{
 const p={id:'test-revision',format:'classic',options:['A','B']};updateResponseDraft(p,{answer:1,text:'A reason'});
 assert.equal(readResponseDraft({...p,id:'another-poll'}).answer,null);
 assert.equal(readResponseDraft({...p,options:['A','C']}).answer,null);
 assert.deepEqual(readResponseDraft({...p,format:'allocation'}).answer,[0,0]);
});
test('attention count excludes passive, answered and expired items',()=>{
 const future=new Date(Date.now()+86400000).toISOString();
 assert.equal(actionableCount({invitations:[{status:'open',expires_at:future},{status:'open',expires_at:future,answered_at:future},{status:'open',expires_at:'2020-01-01'}],responses:[{status:'pending'},{status:'appealed'},{status:'rejected'},{status:'accepted'}]}),2);
 assert.equal(reviewDeadline({created_at:'2026-10-29T12:00:00Z'}),'2026-10-31T12:00:00.000Z');
});
test('redemption quote matches ledger and invalid amounts cannot change a balance',async()=>{
 const storage=new Map(),c=createDemoClient({getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)});const before=(await c.request('/api/community/state')).wallet;
 for(const points of [0,-500,499,500.5,NaN,Infinity])await assert.rejects(c.request('/api/community/redeem',{points}),/500 whole/);
 assert.equal((await c.request('/api/community/state')).wallet.points,before.points);
 const q=redemptionQuote(731);assert.equal(q.fee,37);assert.equal(q.net,694);assert.equal(q.valid,true);
 await c.request('/api/community/redeem',{points:731});const after=(await c.request('/api/community/state')).wallet;
 assert.equal(after.points,before.points-731);assert.equal(after.paid,before.paid+q.net);assert.equal(after.redemptions[0].fee,q.fee);
});
test('campaign closure quote includes only unused funded places',()=>{
 assert.deepEqual(campaignMetrics({funding:'Boost',remaining:24,reward:300,responses:3,cap:30}),{remaining:24,refund:120,community:7200,progress:10});
 assert.equal(campaignMetrics({funding:'Community',remaining:5,reward:400,responses:4,cap:10}).refund,0);
});
test('wallet response links round trip to the relevant review',()=>{
 const route=readRoute('?view=wallet&response=private-response-7');assert.equal(route.response,'private-response-7');assert.match(routeURL(route),/response=private-response-7/);
});
test('serial draft writes prevent older autosave completing after newer work',async()=>{
 let release;const calls=[];const write=createDraftWriter(async draft=>{calls.push(draft.title);if(draft.title==='Old')await new Promise(resolve=>{release=resolve});});
 const first=write({title:'Old'}),newer={title:'Newest'};const second=write(newer);newer.title='Mutated caller';
 await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(calls,['Old']);release();await Promise.all([first,second]);assert.deepEqual(calls,['Old','Newest']);
});
test('a failed autosave does not block the next recovery write',async()=>{
 const saved=[];const write=createDraftWriter(async d=>{if(d.title==='Fail')throw new Error('offline');saved.push(d.title)});
 await assert.rejects(write({title:'Fail'}),/offline/);await write({title:'Recovered'});assert.deepEqual(saved,['Recovered']);
});
