import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {pollFeed} from '../src/deck-prototype/pollFeed.js';

const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/deck-prototype/following.js',import.meta.url))],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'styles',setup(b){b.onLoad({filter:/\.css$/},()=>({contents:'',loader:'js'}));}}]});
const {createFollowing,reactionCards}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const esc=v=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const formats={classic:['Classic']};
const poll=(id,extra={})=>({id,title:'Choose an idea',type:'classic',topics:['Design'],eligible:true,remaining:10,reward:200,seconds:20,language:'English',created_at:'2026-11-01',...extra});
const feedState=extra=>({view:'discover',feedTab:'following',preferences:{languages:['English']},topic:'For you',query:'',sort:'recommended',interests:new Set(['Design']),...extra});

test('Following means publishers, not merely matching topics, and newest is first',()=>{
 const polls=[poll('unfollowed-topic'),poll('older',{followed_creator:true,created_at:'2026-11-01'}),poll('newer',{followed_creator:true,topics:['Food'],created_at:'2026-11-03'})];
 assert.deepEqual(pollFeed(polls,feedState(),formats).map(p=>p.id),['newer','older']);
 assert.equal(polls[0].id,'unfollowed-topic');
});
test('feed respects AI, formats, language, capacity and eligibility without hiding answered results',()=>{
 const polls=[poll('yes',{followed_creator:true}),poll('ai',{followed_creator:true,text_origin:'generated'}),poll('language',{followed_creator:true,language:'Tamil'}),poll('full',{followed_creator:true,remaining:0}),poll('closed',{followed_creator:true,eligible:false}),poll('answered',{followed_creator:true,remaining:0,my_response:{id:'answer'}})];
 const state=feedState({preferences:{languages:['English'],generated_polls:false},appliedFormats:new Set(['classic'])});
 assert.deepEqual(pollFeed(polls,state,formats).map(p=>p.id).sort(),['answered','yes']);
});
test('For you preserves the server recommendation order and explicit sorting works',()=>{
 const polls=[poll('a',{seconds:50,reward:400}),poll('b',{seconds:20,reward:200})];
 assert.deepEqual(pollFeed(polls,feedState({feedTab:'foryou'}),formats).map(p=>p.id),['a','b']);
 assert.deepEqual(pollFeed(polls,feedState({feedTab:'foryou',sort:'quick'}),formats).map(p=>p.id),['b','a']);
});

function setup(handler){
 const dom=new JSDOM('<button data-action="notifications"><span data-notification-badge hidden></span></button><dialog></dialog><h2 class="thread-question"></h2>',{url:'https://app.test/#discover',pretendToBeVisual:true});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,Event:dom.window.Event});
 const dialog=document.querySelector('dialog'),calls=[],routes=[],toasts=[];
 const publisher={identity:{id:'public-id',author:'Curious Otter ABC123',tagline:'Small questions. Better choices.',avatar:'otter'},following:false,notify_new_polls:false,mine:false,polls:[]};
 const state={preferences:{notifications:true},following:[],notifications:[],view:'discover',feedTab:'foryou'};
 const polls=[poll('new-poll')];let renders=0,refreshes=0;
 const button=(label,action,css='',attrs='')=>`<button class="${css}" data-action="${action}" ${attrs}>${label}</button>`;
 const close=()=>{dialog.removeAttribute('open');dialog.dispatchEvent(new Event('close'));};
 const api=createFollowing({state,polls,dialog,button,icon:()=>'<svg></svg>',esc,toast:v=>toasts.push(v),empty:(t,d,label,action)=>`<h3>${esc(t)}</h3><p>${esc(d)}</p>${label?button(label,action):''}`,
  community:async(path,data)=>{calls.push([path,data]);if(handler)return handler(path,data,{publisher,state});
   if(path==='/notifications')return {notifications:state.notifications,enabled:state.preferences.notifications};
   if(path==='/notifications/read'){state.notifications.forEach(n=>{if(data.ids.includes(n.id))n.read=true;});return {saved:true};}
   if(path.endsWith('/follow')){publisher.following=data.following;publisher.notify_new_polls=data.notify;return structuredClone(publisher);}
   if(path.endsWith('/alerts')){publisher.notify_new_polls=data.notify;return structuredClone(publisher);}
   return structuredClone(publisher);
  },
  refresh:async()=>{refreshes++;state.following=publisher.following?[structuredClone(publisher)]:[];},
  render:()=>{renders++;},route:(view,extra={})=>{Object.assign(state,{view},extra);routes.push([view,extra]);window.dispatchEvent(new Event('poll-navigation'));},
  formDialog:(title,body,footer='')=>{dialog.setAttribute('open','');dialog.innerHTML=`<h2>${title}</h2><div class="dialog-body">${body}</div><footer>${footer}</footer>`;},closeDialog:close,isBusy:()=>false});
 const action=(name,extra={})=>api.action({dataset:{action:name,...extra}});
 const click=async selector=>{const el=dialog.querySelector(selector);assert.ok(el,selector);await api.action(el);};
 return {dom,dialog,state,publisher,api,action,click,calls,routes,toasts,close,get renders(){return renders},get refreshes(){return refreshes},cleanup(){api.stop();dom.window.close();}};
}

test('publisher follow and mute controls persist desired state and update their labels',async()=>{
 const x=setup();await x.action('publisher-profile',{id:'public-id'});
 assert.match(x.dialog.textContent,/Follow publisher/);
 await x.click('[data-action=follow-publisher]');assert.equal(x.publisher.following,true);assert.equal(x.dialog.querySelector('[data-action=follow-publisher]').getAttribute('aria-pressed'),'true');
 await x.click('[data-action=publisher-alerts]');assert.equal(x.publisher.notify_new_polls,false);assert.match(x.dialog.textContent,/Alerts off/);
 await x.click('[data-action=follow-publisher]');assert.equal(x.publisher.following,false);assert.equal(x.dialog.querySelector('[data-action=publisher-alerts]'),null);x.cleanup();
});
test('opening a publication notification marks only that notice read and opens its exact poll',async()=>{
 const x=setup();x.state.notifications=[{id:'publication-new-poll',title:'New poll',detail:'Your next choice',poll_id:'new-poll',target:'discover',created_at:'2026-11-03',read:false},{id:'review',title:'Reward available',detail:'200 points',target:'wallet',created_at:'2026-11-02',read:false}];
 await x.action('notifications');await x.click('[data-id="publication-new-poll"]');
 assert.deepEqual(x.calls.find(([path])=>path==='/notifications/read')[1].ids,['publication-new-poll']);
 assert.equal(x.state.notifications[1].read,false);assert.equal(x.state.mobileAnswer,true);assert.equal(x.state.poll,'new-poll');assert.equal(x.dialog.open,false);x.cleanup();
});
test('empty Following has a real recovery action and feed switching refreshes published polls',async()=>{
 const x=setup();await x.action('manage-following');assert.ok(x.dialog.querySelector('[data-action=find-publishers]'));
 await x.action('find-publishers');assert.equal(x.state.feedTab,'foryou');assert.equal(x.state.view,'discover');
 await x.action('feed-tab',{tab:'following'});assert.equal(x.state.feedTab,'following');assert.equal(x.refreshes,3);x.cleanup();
});
test('late publisher requests cannot open a dialog after navigation',async()=>{
 let finish;const x=setup(()=>new Promise(resolve=>{finish=resolve}));const pending=x.action('publisher-profile',{id:'public-id'});
 window.dispatchEvent(new Event('poll-navigation'));finish(x.publisher);await pending;assert.equal(x.dialog.open,false);x.cleanup();
});
test('notification polling updates badges without rerendering unsaved answers',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const x=setup();x.state.notifications=[{id:'new',title:'New',created_at:'2026-11-03',read:false}];x.api.start();
 t.mock.timers.tick(30000);await Promise.resolve();await Promise.resolve();
 assert.equal(x.calls.filter(([path])=>path==='/notifications').length,1);assert.equal(x.renders,0);assert.equal(x.refreshes,0);
 assert.equal(document.querySelector('[data-notification-badge]').textContent,'1');assert.equal(document.querySelector('[data-notification-badge]').hidden,false);
 x.cleanup();t.mock.timers.reset();
});
test('illustrated reactions keep the three labels, counts, and accessible selection states',()=>{
 const dom=new JSDOM(reactionCards({id:'poll',reactions:{relatable:2,helpful:3,surprising:1}},{reaction:{poll:'Interesting'}},esc));
 const buttons=[...dom.window.document.querySelectorAll('button')];assert.equal(buttons.length,3);
 assert.deepEqual(buttons.map(b=>b.dataset.reaction),['Love it','Interesting','Surprising']);
 assert.equal(buttons.filter(b=>b.getAttribute('aria-pressed')==='true').length,1);
 assert.equal(buttons[1].getAttribute('aria-label'),'Interesting, 3 reactions');assert.equal(dom.window.document.querySelectorAll('.reaction-art').length,3);dom.window.close();
});
