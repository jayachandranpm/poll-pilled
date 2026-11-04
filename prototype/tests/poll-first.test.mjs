import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoClient} from '../src/demo.js';
import {validAnswer,matchesPreferences,topicMatch,formats,allocatePoints,comparePolls} from '../src/pollModel.js';
const client=()=>createDemoClient({getItem:()=>null,setItem(){}});
test('results and private responses stay locked; voting unlocks reactions, comments stay disabled',async()=>{
 const c=client();let p=(await c.request('/api/community/state')).polls.find(p=>p.id==='home');assert.equal(p.results_unlocked,false);assert.deepEqual(p.totals,[]);assert.equal(p.base,undefined);
 assert.deepEqual((await c.request('/api/community/polls/home/details')).responses,[]);
 await assert.rejects(c.request('/api/community/polls/home/react',{reaction:'helpful'}));
 await c.request('/api/community/polls/home/claim',{});await c.request('/api/community/polls/home/answer',{answer:0});
 await c.request('/api/community/polls/home/react',{reaction:'helpful'});await c.request('/api/community/polls/home/react',{reaction:'helpful'});
 p=(await c.request('/api/community/state')).polls.find(p=>p.id==='home');assert.equal(p.results_unlocked,true);assert.equal(p.reactions.helpful,1);assert.ok(p.totals[0]>0);
 await assert.rejects(c.request('/api/community/polls/home/comments',{text:'hello'}));
});
test('all nine formats are available; invalid rankings, allocation and implicit choices are rejected',async()=>{
 assert.equal(Object.keys(formats).length,9);
 for(const p of [{format:'classic',options:['A','B']},{format:'pairwise',options:['A','B']}]){assert.equal(validAnswer(p,null),false);assert.equal(validAnswer(p,true),false);assert.equal(validAnswer(p,0),true)}
 assert.equal(validAnswer({format:'rank',options:['A','B']},[0,0]),false);
 const p={format:'allocation',options:['A','B','C']};assert.equal(validAnswer(p,[50,30,20]),true);assert.equal(validAnswer(p,[50,30,10]),false);assert.equal(validAnswer(p,[101,0,-1]),false);
 const c=client();await c.request('/api/community/polls/focus-allocation/claim',{});await assert.rejects(c.request('/api/community/polls/focus-allocation/answer',{answer:[50,20,10]}));await c.request('/api/community/polls/focus-allocation/answer',{answer:[60,30,10]});const result=(await c.request('/api/community/polls/focus-allocation/details')).poll;assert.equal(result.responses,1);assert.deepEqual(result.totals,[60,30,10]);
});
test('topic tags and AI preference matching includes generated video without excluding rephrasing',()=>{
 const pref={formats:Object.keys(formats),languages:['English'],interests:['wellbeing'],generated_polls:false,generated_media:false};const p={circle:'work',tags:['work','wellbeing'],format:'video',language:'English',text_origin:'rephrased',video_origin:'human'};assert.equal(topicMatch(p,pref),1);assert.equal(matchesPreferences(p,pref),true);assert.equal(matchesPreferences({...p,video_origin:'generated'},pref),false);
});
test('reports are accepted before voting and persisted without revealing results',async()=>{const c=client();await c.request('/api/community/polls/home/report',{reason:'Misleading'});const p=(await c.request('/api/community/polls/home/details')).poll;assert.equal(p.reported,true);assert.equal(p.results_unlocked,false)});

test('allocation sliders preserve the chosen amount and rebalance without losing points',()=>{
 assert.deepEqual(allocatePoints([34,33,33],0,35),[35,33,32]);
 assert.deepEqual(allocatePoints([35,33,32],1,100),[0,100,0]);
 assert.deepEqual(allocatePoints([0,0,0],2,20),[0,0,20]);
 for(let i=0;i<3;i++)for(let amount=0;amount<=100;amount++){const v=allocatePoints([60,20,20],i,amount);assert.equal(v[i],amount);assert.ok(v.every(n=>Number.isInteger(n)&&n>=0));assert.ok(v.reduce((a,b)=>a+b,0)<=100)}
});

test('fresh polls lead a new feed visit but submitting does not move the current card',()=>{
 const polls=[{id:'old',my_response:{},tags:['design'],reward:600,seconds:20},{id:'new',tags:['design'],reward:200,seconds:30},{id:'next',tags:['work'],reward:300,seconds:40}];
 const options={sort:'for-you',preferences:{interests:['design']},answered:new Set(['old'])};
 const order=()=>[...polls].sort((a,b)=>comparePolls(a,b,options)).map(p=>p.id);
 assert.deepEqual(order(),['new','next','old']);polls[1].my_response={answer:0};assert.deepEqual(order(),['new','next','old']);
 options.answered=new Set(['old','new']);assert.deepEqual(order(),['next','old','new']);
});
