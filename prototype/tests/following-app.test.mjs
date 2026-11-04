import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';

const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/deck-prototype/main.js',import.meta.url))],bundle:true,write:false,format:'iife',platform:'browser',plugins:[{name:'test-providers',setup(b){
 b.onLoad({filter:/\.css$/},()=>({contents:'',loader:'js'}));
 b.onLoad({filter:/deck-prototype\/icons\.js$/},()=>({contents:'export const icon=()=>"<svg class=icon></svg>";',loader:'js'}));
 b.onLoad({filter:/deck-prototype\/brand\.js$/},()=>({contents:'export const logo=()=>"<span>Poll Pilled</span>";',loader:'js'}));
 b.onLoad({filter:/deck-prototype\/overview\.js$/},()=>({contents:'export const mountOverviewChart=()=>{};',loader:'js'}));
 b.onLoad({filter:/src\/api\.js$/},()=>({contents:'export const liveRequest=(...args)=>window.__request(...args);export const configureSession=()=>{};export const activateTurnstile=async()=>{};export const upload=(...args)=>window.__upload(...args);',loader:'js'}));
}}]});
const settle=async predicate=>{for(let i=0;i<60;i++){if(predicate())return;await new Promise(r=>setTimeout(r,5));}assert.ok(predicate(),'UI did not reach the expected state');};
async function setup({withoutPolls=false,multimodal=false,legacyCopy=false,initialHash='#discover',delayState=false}={}){
 const dom=new JSDOM('<div id="app"></div><dialog id="dialog"></dialog><div id="toast"></div>',{url:'https://app.test/'+initialHash,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.structuredClone=structuredClone;w.scrollTo=()=>{};w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
 w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};
 w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new w.Event('close'))};
 w.HTMLElement.prototype.showPopover=function(){this.dataset.testPopoverOpen='true'};
 w.HTMLElement.prototype.hidePopover=function(){delete this.dataset.testPopoverOpen};
 w.HTMLElement.prototype.scrollIntoView=()=>{};
 const makePoll=(id,name)=>({id,format:'classic',title:'Which idea would you choose '+id+'?',circle:'design',tags:['design'],creator:name,creator_id:'publisher-'+id,tagline:'Make everyday choices count.',avatar:'otter',options:['First idea','Second idea'],images:[],totals:[],responses:0,reward:200,seconds:20,cap:20,remaining:20,eligible:true,status:'active',can_follow:true,followed_creator:false,created_at:'2026-11-03T10:00:00',my_response:null,my_reaction:'',reactions:{},saved:false,text_origin:'human',image_origin:'human',audio_origin:'human',video_origin:'human',language:'English'});
 const snapshot={csrf:'qa',identity:{id:'reader',author:'Thoughtful Finch 123ABC',avatar:'otter'},preferences:{interests:['design'],formats:['classic'],languages:['English'],theme:'light',motion:false,notifications:true,tagline:'A thoughtful perspective.',generated_polls:true,generated_images:true,generated_audio:true,generated_video:true,onboarding_dismissed:true},wallet:{points:0,pending:0,credits:0,ledger:[],redemptions:[]},draft:{},polls:[makePoll('one','Curious Otter 234ABC'),makePoll('two','Quiet Owl 567DEF')],following:[],followers_count:0,notifications:[],responses:[],updates:[],invitations:[],referral:{code:'qa'},ai:{meta:{configured:false},usage:{}},security:{turnstile_enabled:false}};
 if(withoutPolls)snapshot.polls=[];
 if(legacyCopy){snapshot.preferences.tagline='Here for a fresh perspective.';Object.assign(snapshot.polls[0],{tagline:'Here for a fresh perspective.',sample:true,ai:true,image_origin:'generated'});}
 if(multimodal){
  snapshot.preferences.formats=['visual','audio','video'];
  Object.assign(snapshot.polls[0],{format:'visual',images:['/assets/first.webp','/assets/second.webp']});
  Object.assign(snapshot.polls[1],{format:'audio',audio:'/assets/example.mp3'});
  snapshot.polls.push({...makePoll('three','Calm Finch'),format:'video',videos:['/assets/first.mp4','/assets/second.mp4']});
 }
 let releaseState;const stateGate=delayState?new Promise(resolve=>releaseState=resolve):null;
 const calls=[];
 w.__request=async(path,data)=>{
  calls.push([path,data]);
  if(path==='/api/community/state'){if(stateGate)await stateGate;return structuredClone(snapshot);}
  if(path==='/api/community/draft'){snapshot.draft=structuredClone(data.draft);return {saved:true};}
  if(path==='/api/community/preferences'){Object.assign(snapshot.preferences,data);if(data.avatar)snapshot.identity.avatar=data.avatar;return {saved:true,preferences:structuredClone(snapshot.preferences)};}
  if(path==='/api/community/notifications')return {notifications:structuredClone(snapshot.notifications),enabled:true};
  if(path==='/api/community/notifications/read'){snapshot.notifications.forEach(n=>{if(data.ids.includes(n.id))n.read=true});return {saved:true};}
  if(path.endsWith('/follow')){
   const id=path.split('/').at(-2),p=snapshot.polls.find(p=>p.creator_id===id);p.followed_creator=data.following;
   snapshot.following=data.following?[{identity:{id,author:p.creator,tagline:p.tagline,avatar:p.avatar},following:true,notify_new_polls:true}]:[];return {following:data.following};
  }
  const p=snapshot.polls.find(p=>path.includes('/polls/'+p.id+'/'));
  if(path.endsWith('/claim'))return {expires_at:new Date(Date.now()+900000).toISOString()};
  if(path.endsWith('/answer')){p.my_response={id:'response-'+p.id,answer:data.answer,status:'pending'};snapshot.wallet.pending+=p.reward;return {response:p.my_response};}
  if(path.endsWith('/react')){p.my_reaction=data.reaction;p.reactions=data.reaction?{[data.reaction]:1}:{};return {saved:true};}
  throw new Error('Unexpected test request: '+path);
 };
 w.eval(outputFiles[0].text);if(!delayState)await settle(()=>!w.document.querySelector('[data-page-loading]')&&w.document.querySelector(withoutPolls?'.thread-rail':'#poll-one'));
 const click=selector=>{const el=w.document.querySelector(selector);assert.ok(el,selector);assert.notEqual(el.disabled,true,selector);el.focus();el.click();};
 return {dom,w,snapshot,calls,click,releaseState,cleanup(){w.dispatchEvent(new w.Event('pagehide'));w.close();}};
}

test('connected app follows a publisher, persists the feed URL, and routes new-poll notifications',async()=>{
 const x=await setup();
 assert.equal(x.w.document.querySelector('[data-action=small]'),null);
 x.click('#poll-one [data-action=follow-publisher]');
 await settle(()=>x.w.document.querySelector('#poll-one [data-action=follow-publisher]')?.getAttribute('aria-pressed')==='true');
 x.click('[data-action=feed-tab][data-tab=following]');await settle(()=>x.w.location.hash.includes('feed=following'));
 assert.ok(x.w.document.querySelector('#poll-one'));assert.equal(x.w.document.querySelector('#poll-two'),null);
 x.snapshot.notifications=[{id:'publication-one',kind:'publication',title:'A new poll',detail:x.snapshot.polls[0].title,poll_id:'one',target:'discover',created_at:'2026-11-03',read:false,avatar:'otter'}];
 x.click('[data-action=notifications]');await settle(()=>x.w.document.querySelector('[data-action=notification-open]'));
 x.click('[data-action=notification-open]');await settle(()=>x.w.location.hash==='#discover/one?feed=following');
 assert.equal(x.snapshot.notifications[0].read,true);assert.equal(x.w.document.querySelector('#dialog').open,false);
 assert.equal(x.w.document.querySelectorAll('.focus-page .thread-poll').length,1);x.cleanup();
});
test('connected answering unlocks the illustrated reactions and selected reactions survive refresh',async()=>{
 const x=await setup();assert.equal(x.w.document.querySelector('#poll-one .poll-reactions'),null);
 x.click('#poll-one [data-action=choose][data-index="0"]');x.click('#poll-one [data-action=submit]');
 await settle(()=>x.w.document.querySelector('#poll-one .poll-reactions'));
 assert.equal(x.w.document.querySelectorAll('#poll-one .reaction-art').length,3);
 assert.equal(x.w.document.querySelector('#poll-two .poll-reactions'),null);
 x.click('#poll-one [data-action=react][data-reaction="Interesting"]');
 await settle(()=>x.w.document.querySelector('#poll-one [data-reaction="Interesting"]')?.getAttribute('aria-pressed')==='true');
 assert.equal(x.snapshot.polls[0].my_reaction,'helpful');assert.equal(x.calls.filter(([path])=>path.endsWith('/answer')).length,1);assert.equal(x.calls.filter(([path])=>path.endsWith('/claim')).length,1);
 x.click('#poll-one [data-action=react][data-reaction="Interesting"]');await settle(()=>x.snapshot.polls[0].my_reaction==='');x.cleanup();
});

test('submission and reaction receipts work even when subsequent feed reads fail',async()=>{
 const x=await setup(),existing=x.w.__request;
 x.w.__request=async(path,data)=>{
  if(path==='/api/community/state')throw Error('Feed temporarily unavailable');
  const result=await existing(path,data);
  if(path.endsWith('/answer')||path.endsWith('/react'))return {...result,poll:structuredClone(x.snapshot.polls[0]),wallet:structuredClone(x.snapshot.wallet)};
  return result;
 };
 x.click('#poll-one [data-action=choose][data-index="1"]');x.click('#poll-one [data-action=submit]');
 await settle(()=>x.w.document.querySelector('#poll-one .poll-reactions'));
 assert.match(x.w.document.querySelector('#receipt-one').textContent,/Response received/);
 x.click('#poll-one [data-action=react][data-reaction="Surprising"]');
 await settle(()=>x.w.document.querySelector('#poll-one [data-reaction="Surprising"]')?.getAttribute('aria-pressed')==='true');
 assert.match(x.w.document.querySelector('#poll-one [data-reaction="Surprising"] .reaction-count').textContent,/1/);
 assert.equal(x.calls.filter(([path])=>path==='/api/community/state').length,1);
 assert.equal(x.calls.filter(([path])=>path.endsWith('/answer')).length,1);
 x.click('[data-nav=overview]');await settle(()=>x.w.document.querySelector('.insights-summary'));
 assert.match(x.w.document.querySelector('.insights-summary').textContent,/Polls answered1/);
 x.cleanup();
});

test('a failed answer keeps the selection and explanation and allows a deliberate retry',async()=>{
 const x=await setup(),existing=x.w.__request;let fail=true;
 x.w.__request=(path,data)=>{if(path.endsWith('/answer')&&fail){fail=false;throw Error('The server could not confirm this action.');}return existing(path,data);};
 x.click('#poll-one [data-action=choose][data-index="0"]');
 const note=x.w.document.querySelector('#poll-one [data-answer-note]');note.value='This makes the most sense to me.';note.dispatchEvent(new x.w.Event('input',{bubbles:true}));
 x.click('#poll-one [data-action=submit]');await settle(()=>x.w.document.querySelector('#toast').textContent.includes('could not confirm'));
 assert.equal(x.w.document.querySelector('#poll-one [data-answer-note]').value,note.value);
 assert.equal(x.w.document.querySelector('#poll-one [data-action=choose][data-index="0"]').getAttribute('aria-pressed'),'true');
 assert.equal(x.w.document.querySelector('#poll-one .poll-reactions'),null);
 x.click('#poll-one [data-action=submit]');await settle(()=>x.w.document.querySelector('#poll-one .poll-reactions'));
 assert.equal(x.calls.find(([path])=>path.endsWith('/answer'))[1].text,note.value);
 x.cleanup();
});


test('appearance applies before saving, serializes rapid changes and avoids reloading the feed',async()=>{
 const x=await setup();
 x.w.location.hash='#settings';await settle(()=>x.w.document.querySelector('[data-action=settings-section][data-section=appearance]'));x.click('[data-action=settings-section][data-section=appearance]');
 await settle(()=>x.w.document.querySelector('[data-action=theme][data-theme=dark]'));
 const existing=x.w.__request,pending=[];
 x.w.__request=(path,data)=>{
  if(path!=='/api/community/preferences')return existing(path,data);
  x.calls.push([path,data]);return new Promise((resolve,reject)=>pending.push({data,resolve:()=>{Object.assign(x.snapshot.preferences,data);resolve({preferences:structuredClone(x.snapshot.preferences)})},reject}));
 };
 const reads=x.calls.filter(([path])=>path==='/api/community/state').length;
 x.click('[data-action=theme][data-theme=dark]');
 assert.equal(x.w.document.documentElement.dataset.theme,'dark');
 await settle(()=>pending.length===1);
 x.click('[data-action=theme][data-theme=light]');
 assert.equal(x.w.document.documentElement.dataset.theme,'light');
 assert.equal(pending.length,1,'second save waits for the first');
 pending[0].resolve();await settle(()=>pending.length===2);
 assert.equal(x.w.document.documentElement.dataset.theme,'light','older completion must not repaint');
 pending[1].resolve();await settle(()=>x.snapshot.preferences.theme==='light');
 x.click('[data-action=motion]');assert.equal(x.w.document.documentElement.dataset.motion,'true');
 await settle(()=>pending.length===3);pending[2].resolve();
 await settle(()=>x.snapshot.preferences.motion===true);
 assert.equal(x.calls.filter(([path])=>path==='/api/community/state').length,reads);
 x.cleanup();
});

test('failed appearance save restores the last saved mode with useful feedback',async()=>{
 const x=await setup();x.w.location.hash='#settings';await settle(()=>x.w.document.querySelector('[data-action=settings-section][data-section=appearance]'));x.click('[data-action=settings-section][data-section=appearance]');
 await settle(()=>x.w.document.querySelector('[data-action=theme][data-theme=dark]'));
 const existing=x.w.__request;let reject;
 x.w.__request=(path,data)=>path==='/api/community/preferences'?new Promise((resolve,fail)=>{reject=fail}):existing(path,data);
 x.click('[data-action=theme][data-theme=dark]');assert.equal(x.w.document.documentElement.dataset.theme,'dark');
 await settle(()=>reject);reject(Error('Connection unavailable.'));
 await settle(()=>x.w.document.documentElement.dataset.theme==='light');
 assert.match(x.w.document.querySelector('#toast').textContent,/Appearance could not be saved/);
 assert.equal(x.w.document.querySelector('[data-action=theme][data-theme=light]').getAttribute('aria-pressed'),'true');
 x.cleanup();
});


test('empty journeys use the matching custom artwork and their actions remain usable',async t=>{
 const x=await setup({withoutPolls:true});t.after(()=>x.cleanup());
 const scene=key=>x.w.document.querySelector(`[data-empty-scene="${key}"] img`);
 assert.match(scene('discover').getAttribute('src'),/empty-states\/poll-pilled-discover\.png$/);
 assert.equal(scene('discover').getAttribute('alt'),'');
 assert.equal(scene('discover').getAttribute('aria-hidden'),'true');
 assert.equal(x.w.document.querySelector('.feed-end'),null,'empty feed must not also announce caught-up results');
 for(const [view,key] of [['wallet','rewards'],['saved','saved'],['polls','drafts'],['overview','insights']]){
  x.click(`[data-nav="${view}"]`);await settle(()=>scene(key));
  assert.ok(scene(key));assert.ok(scene(key).width>0&&scene(key).height>0,'reserved artwork size');
 }
 x.click('[data-action=notifications]');await settle(()=>x.w.document.querySelector('#dialog [data-empty-scene=notifications]'));
 x.click('#dialog [data-action=manage-following]');await settle(()=>x.w.document.querySelector('#dialog [data-empty-scene=following]'));
 x.click('#dialog [data-action=find-publishers]');await settle(()=>x.w.location.hash==='#discover');
 assert.equal(x.w.document.querySelector('#dialog').open,false);
 x.click('[data-nav=polls]');await settle(()=>scene('drafts'));
 x.click('[data-action=polls-tab][data-tab=drafts]');
 x.click('.thread-single [data-empty-scene=drafts] [data-action=new-poll]');
 await settle(()=>x.w.document.querySelector('#editor-form'));
 assert.equal(x.w.location.hash,'#create');
 assert.equal(x.w.document.querySelector('img[src*="/assets/threads/"]'),null);
 x.cleanup();
});

test('first poll images load promptly while later media waits for use',async t=>{
 const x=await setup({multimodal:true});t.after(()=>x.cleanup());
 const first=[...x.w.document.querySelectorAll('#poll-one .image-choice img')];
 assert.equal(first.length,2);
 for(const image of first){
  assert.equal(image.getAttribute('loading'),'eager');
  assert.equal(image.getAttribute('fetchpriority'),'high');
  assert.ok(image.width>0&&image.height>0);
 }
 assert.equal(x.w.document.querySelector('#poll-two audio').getAttribute('preload'),'none');
 for(const video of x.w.document.querySelectorAll('#poll-three video'))assert.equal(video.getAttribute('preload'),'none');
 assert.equal(x.w.document.querySelector('#poll-two .thread-avatar').getAttribute('loading'),'lazy');
 x.click('#poll-one [data-action=choose][data-index="0"]');
 await settle(()=>x.w.document.querySelector('#poll-one [data-action=submit]').disabled===false);
 assert.equal(x.w.document.querySelector('#poll-two audio').getAttribute('preload'),'none');
});

const fill=(x,selector,value)=>{const input=x.w.document.querySelector(selector);assert.ok(input,selector);input.value=value;input.dispatchEvent(new x.w.Event('input',{bubbles:true}));};

test('poll copy omits demo labels and account filler while preserving AI labels and real identities',async t=>{
 const x=await setup({legacyCopy:true});t.after(()=>x.cleanup());
 assert.doesNotMatch(x.w.document.querySelector('#main').textContent,/Here for a fresh perspective|Example poll|simulated rewards|Human-created/);
 assert.match(x.w.document.querySelector('#poll-one .thread-poll-meta').textContent,/AI visuals/);
 assert.match(x.w.document.querySelector('#poll-two .author-tagline').textContent,/Make everyday choices count/);
 const actions=x.w.document.querySelector('.workspace-actions');
 assert.deepEqual([...actions.querySelectorAll('.btn')].map(b=>b.textContent),['Notifications','Invite friends']);
 assert.equal(x.w.document.querySelector('[data-action=demo-info]'),null);
 assert.doesNotMatch(x.w.document.querySelector('#poll-one').textContent,/Demo/);
 x.click('.workspace-actions [data-action=invite-friends]');await settle(()=>x.w.document.querySelector('#invite-code'));
 assert.equal(x.w.document.querySelector('#dialog-title').textContent,'Invite friends');
});

test('settings pages support Back, Forward and cancelling unsaved interests',async t=>{
 const x=await setup();t.after(()=>x.cleanup());
 x.w.location.hash='#settings';await settle(()=>x.w.document.querySelector('[data-section=interests]'));
 x.click('[data-action=settings-section][data-section=interests]');assert.equal(x.w.location.hash,'#settings/interests');
 x.w.history.back();await settle(()=>x.w.location.hash==='#settings'&&x.w.document.querySelector('.settings-directory'));
 x.w.history.forward();await settle(()=>x.w.location.hash==='#settings/interests'&&x.w.document.querySelector('[data-topic=Food]'));
 x.click('[data-action=interest][data-topic=Food]');
 assert.equal(x.w.document.querySelector('[data-action=interest][data-topic=Food]').getAttribute('aria-pressed'),'true');
 x.click('[data-action=cancel-preferences]');assert.equal(x.w.location.hash,'#settings');
 x.click('[data-action=settings-section][data-section=interests]');
 assert.equal(x.w.document.querySelector('[data-action=interest][data-topic=Food]').getAttribute('aria-pressed'),'false');
 assert.equal(x.calls.filter(([path,data])=>path.endsWith('/preferences')&&data).length,0);
});

test('identity edits are staged together and Cancel restores the saved avatar and tagline',async t=>{
 const x=await setup();t.after(()=>x.cleanup());
 x.w.location.hash='#settings/profile';await settle(()=>x.w.document.querySelector('#tagline'));
 fill(x,'#tagline','I test useful ideas.');x.click('[data-action=avatar][data-id=river]');
 await settle(()=>x.w.document.querySelector('[data-action=avatar][data-id=river]').getAttribute('aria-pressed')==='true');
 assert.equal(x.w.document.querySelector('#tagline').value,'I test useful ideas.');
 assert.equal(x.calls.filter(([path])=>path.endsWith('/preferences')).length,0);
 x.click('[data-action=cancel-preferences]');x.click('[data-action=settings-section][data-section=profile]');
 assert.equal(x.w.document.querySelector('#tagline').value,'A thoughtful perspective.');
 assert.equal(x.w.document.querySelector('[data-action=avatar][data-id=otter]').getAttribute('aria-pressed'),'true');
 fill(x,'#tagline','Questions worth answering.');x.click('[data-action=avatar][data-id=river]');await settle(()=>x.w.document.querySelector('[data-action=avatar][data-id=river]').getAttribute('aria-pressed')==='true');
 x.click('[data-action=save-tagline]');await settle(()=>x.snapshot.preferences.tagline==='Questions worth answering.');
 assert.equal(x.snapshot.preferences.avatar,'river');
});

test('leaving the editor saves first, returns to its source, and preserves edits after a failed save',async t=>{
 const x=await setup();t.after(()=>x.cleanup());
 x.click('.thread-composer [data-action=new-poll]');await settle(()=>x.w.location.hash==='#create');
 fill(x,'#editor-title','Which design should we ship?');x.click('[data-action=close-editor]');
 await settle(()=>x.w.location.hash==='#discover');
 assert.equal(x.snapshot.draft.deck_drafts[0].title,'Which design should we ship?');
 x.click('[data-nav=polls]');x.click('[data-action=polls-tab][data-tab=drafts]');
 assert.equal(x.w.location.hash,'#polls?tab=drafts');
 x.click('[data-action=edit-draft]');await settle(()=>x.w.location.hash==='#create');
 fill(x,'#editor-title','Which revised design should we ship?');
 const existing=x.w.__request;let fail=true;
 x.w.__request=(path,data)=>{if(path==='/api/community/draft'&&fail)throw Error('Connection unavailable.');return existing(path,data);};
 x.click('[data-nav=wallet]');await settle(()=>x.w.document.querySelector('#toast').textContent.includes('Draft not saved'));
 assert.equal(x.w.location.hash,'#create');assert.equal(x.w.document.querySelector('#editor-title').value,'Which revised design should we ship?');
 fail=false;x.click('[data-nav=wallet]');await settle(()=>x.w.location.hash==='#wallet');
 assert.equal(x.snapshot.draft.deck_drafts[0].title,'Which revised design should we ship?');
});

test('discarding an answer recording stops the microphone without uploading',async t=>{
 const x=await setup();t.after(()=>x.cleanup());let stopped=0,recorder;
 const stream={getTracks:()=>[{stop(){stopped++;}}]};
 Object.defineProperty(x.w.navigator,'mediaDevices',{value:{getUserMedia:async()=>stream}});
 x.w.MediaRecorder=class {constructor(){recorder=this;this.state='inactive';this.mimeType='audio/webm';}start(){this.state='recording';}stop(){this.state='inactive';this.onstop?.();}};
 x.w.document.querySelector('#poll-one details[data-reason]').open=true;
 x.click('#poll-one [data-action=record-answer]');await settle(()=>x.w.document.querySelector('[data-action=cancel-recording]'));
 x.click('[data-action=cancel-recording]');await settle(()=>!x.w.document.querySelector('[data-action=cancel-recording]'));
 assert.equal(recorder.state,'inactive');assert.ok(stopped>0);
 assert.equal(x.w.document.querySelector('#poll-one audio'),null);
 assert.equal(x.calls.filter(([path])=>path.includes('upload')).length,0);
});

test('a generated image cannot attach to a draft after its dialog is closed',async t=>{
 const x=await setup();t.after(()=>x.cleanup());
 x.click('.thread-composer [data-action=new-poll]');await settle(()=>x.w.location.hash==='#create');
 x.click('[data-action=editor-format][data-format=image]');await settle(()=>x.w.document.querySelector('[data-action=generate-image]'));
 fill(x,'#editor-title','Which packaging would you choose?');
 x.click('[data-action=generate-image]');await settle(()=>x.w.document.querySelector('#image-prompt'));
 fill(x,'#image-prompt','A blue box on a white desk');
 const existing=x.w.__request;let finish;
 x.w.__request=(path,data)=>path==='/api/ai/image'?new Promise(resolve=>{finish=resolve}):existing(path,data);
 x.click('[data-action=apply-ai-image]');await settle(()=>finish);
 x.click('#dialog [data-action=close-dialog]');finish({url:'/uploads/generated.webp',image_origin:'generated'});
 await new Promise(resolve=>setTimeout(resolve,30));
 assert.equal(x.w.document.querySelector('#dialog').open,false);
 assert.equal(x.w.document.querySelector('.upload-box img'),null);
 assert.equal(x.snapshot.draft.deck_drafts.at(-1).images.length,0);
});


test('search and poll detail preserve the query through browser navigation',async t=>{
 const x=await setup();t.after(()=>x.cleanup());
 x.click('[data-nav=search]');fill(x,'#poll-search','one');
 assert.equal(x.w.location.hash,'#search?q=one');
 const first=x.w.document.querySelector('#search-results [data-action=open-poll]');assert.ok(first);first.focus();first.click();
 assert.equal(x.w.location.hash,'#discover/one?q=one');
 x.w.history.back();await settle(()=>x.w.location.hash==='#search?q=one'&&x.w.document.querySelector('#poll-search'));
 assert.equal(x.w.document.querySelector('#poll-search').value,'one');
 fill(x,'#poll-search','missing result');x.click('[data-action=clear-filters]');
 assert.equal(x.w.location.hash,'#search');assert.equal(x.w.document.querySelector('#poll-search').value,'');
});


test('an expired reservation is discarded so the next submission can renew it',async t=>{
 const x=await setup();t.after(()=>x.cleanup());const existing=x.w.__request;let fail=true;
 x.w.__request=(path,data)=>{if(path.endsWith('/answer')&&fail){fail=false;throw Object.assign(Error('Reservation expired.'),{status:409});}return existing(path,data);};
 x.click('#poll-one [data-action=choose][data-index="0"]');x.click('#poll-one [data-action=submit]');
 await settle(()=>x.w.document.querySelector('#toast').textContent.includes('Reservation expired'));
 x.click('#poll-one [data-action=submit]');await settle(()=>x.w.document.querySelector('#poll-one .poll-reactions'));
 assert.equal(x.calls.filter(([path])=>path.endsWith('/claim')).length,2);
 assert.equal(x.calls.filter(([path])=>path.endsWith('/answer')).length,1);
});

test('transcripts, media, reason disclosures and keyboard focus never reserve a place',async t=>{
 const x=await setup({multimodal:true});t.after(()=>x.cleanup());
 x.w.document.querySelector('#poll-two audio').focus();
 x.click('#poll-two [data-transcript] summary');
 x.click('#poll-two [data-reason] summary');
 x.w.document.querySelector('#poll-two [data-answer-note]').focus();
 await new Promise(r=>setTimeout(r,20));
 assert.equal(x.calls.filter(([p])=>p.endsWith('/claim')).length,0);
 x.click('#poll-two [data-action=choose][data-index="1"]');
 await settle(()=>x.calls.some(([p])=>p==='/api/community/polls/two/claim'));
 assert.equal(x.calls.filter(([p])=>p.endsWith('/claim')).length,1);
});

test('publisher details cannot reopen after leaving the workspace',async t=>{
 const x=await setup();t.after(()=>x.cleanup());x.snapshot.polls[0].mine=true;
 x.click('[data-action=feed-tab][data-tab=foryou]');await settle(()=>x.w.document.querySelector('[data-action=publisher-results][data-id=one]'));
 let finish;const existing=x.w.__request;
 x.w.__request=(p,d)=>p.endsWith('/details')?new Promise(r=>finish=r):existing(p,d);
 x.click('[data-action=publisher-results][data-id=one]');await settle(()=>finish);
 x.click('[data-nav=wallet]');finish({poll:x.snapshot.polls[0],responses:[],followups:[]});
 await new Promise(r=>setTimeout(r,20));
 assert.equal(x.w.location.hash,'#wallet');assert.equal(x.w.document.querySelector('#dialog').open,false);
});

test('quotes for an older question cannot open review or update the budget',async t=>{
 const x=await setup();t.after(()=>x.cleanup());
 x.click('.thread-composer [data-action=new-poll]');await settle(()=>x.w.document.querySelector('#editor-title'));
 fill(x,'#editor-title','Which design should we ship?');
 for(const [i,el] of [...x.w.document.querySelectorAll('.editor-option')].entries()){el.value='Option '+i;el.dispatchEvent(new x.w.Event('input',{bubbles:true}));}
 let finish;const existing=x.w.__request;
 x.w.__request=(p,d)=>p==='/api/community/quote'?new Promise(r=>finish=r):existing(p,d);
 x.click('[data-action=review-poll]');await settle(()=>finish);
 fill(x,'#editor-title','Which other design would you prefer?');
 finish({quote:{seconds:45,reward:300,fee_credits:2,credits:100,cap:20}});
 await new Promise(r=>setTimeout(r,20));
 assert.equal(x.w.document.querySelector('#dialog').open,false);
 assert.doesNotMatch(x.w.document.querySelector('#budget-summary').textContent,/45 sec/);
});

test('uploads finishing after navigation do not attach or reopen the editor',async t=>{
 const x=await setup();t.after(()=>x.cleanup());
 x.click('.thread-composer [data-action=new-poll]');await settle(()=>x.w.document.querySelector('#editor-title'));
 x.click('[data-action=editor-format][data-format=image]');await settle(()=>x.w.document.querySelector('[data-image="0"]'));
 fill(x,'#editor-title','Which picture works best for you?');
 let finish;x.w.__upload=()=>new Promise(r=>finish=r);
 const input=x.w.document.querySelector('[data-image="0"]');Object.defineProperty(input,'files',{value:[new x.w.File(['img'],'image.png',{type:'image/png'})]});
 input.dispatchEvent(new x.w.Event('change',{bubbles:true}));await settle(()=>finish);
 x.click('[data-nav=wallet]');await settle(()=>x.w.location.hash==='#wallet');
 finish('/uploads/late.png');await new Promise(r=>setTimeout(r,20));
 assert.equal(x.w.location.hash,'#wallet');assert.deepEqual(x.snapshot.draft.deck_drafts[0].images,[]);
});

test('My polls and workspace tabs support arrows, Home and End with linked panels',async t=>{
 const x=await setup();t.after(()=>x.cleanup());
 const key=(id,k)=>{const tab=x.w.document.getElementById(id);tab.focus();tab.dispatchEvent(new x.w.KeyboardEvent('keydown',{key:k,bubbles:true}));};
 key('workspace-tab-live','ArrowRight');assert.equal(x.w.document.activeElement.id,'workspace-tab-drafts');
 assert.equal(x.w.document.querySelector('#workspace-polls-panel').getAttribute('aria-labelledby'),'workspace-tab-drafts');
 key('workspace-tab-drafts','End');assert.equal(x.w.document.activeElement.id,'workspace-tab-saved');
 x.click('[data-nav=polls]');key('polls-tab-live','ArrowRight');
 assert.equal(x.w.location.hash,'#polls?tab=drafts');assert.equal(x.w.document.activeElement.id,'polls-tab-drafts');
 assert.equal(x.w.document.querySelectorAll('.tabs [role=tab][tabindex="0"]').length,1);
 key('polls-tab-drafts','Home');assert.equal(x.w.document.activeElement.id,'polls-tab-live');
});

test('late audience estimates do not update another screen or throw',async t=>{
 const x=await setup();t.after(()=>x.cleanup());
 x.click('.thread-composer [data-action=new-poll]');await settle(()=>x.w.document.querySelector('[data-action=audience-preview]'));
 fill(x,'#editor-title','Which idea would help you most?');let finish;const existing=x.w.__request;
 x.w.__request=(p,d)=>p==='/api/community/audience-preview'?new Promise(r=>finish=r):existing(p,d);
 x.click('[data-action=audience-preview]');await settle(()=>finish);x.click('[data-nav=wallet]');await settle(()=>x.w.location.hash==='#wallet');
 finish({matching_accounts:3,note:'Sample profile estimate.'});await new Promise(r=>setTimeout(r,20));
 assert.equal(x.w.location.hash,'#wallet');assert.doesNotMatch(x.w.document.querySelector('#toast').textContent,/null|textContent/);
});

test('a submitted answer is frozen while its reservation is completing',async t=>{
 const x=await setup();t.after(()=>x.cleanup());let release;const existing=x.w.__request;
 x.w.__request=(p,d)=>p.endsWith('/claim')?new Promise(r=>release=r):existing(p,d);
 x.click('#poll-one [data-action=choose][data-index="0"]');
 fill(x,'#poll-one [data-answer-note]','My original reason.');x.click('#poll-one [data-action=submit]');await settle(()=>release);
 x.click('#poll-one [data-action=choose][data-index="1"]');fill(x,'#poll-one [data-answer-note]','Changed later.');
 release({expires_at:new Date(Date.now()+900000).toISOString()});await settle(()=>x.w.document.querySelector('#receipt-one'));
 const payload=x.calls.find(([p])=>p.endsWith('/answer'))[1];assert.equal(payload.answer,0);assert.equal(payload.text,'My original reason.');
});

test('publishing cannot erase newer edits made after closing review',async t=>{
 const x=await setup();t.after(()=>x.cleanup());
 x.click('.thread-composer [data-action=new-poll]');await settle(()=>x.w.document.querySelector('#editor-title'));
 fill(x,'#editor-title','Which design should we publish?');
 [...x.w.document.querySelectorAll('.editor-option')].forEach((el,i)=>{el.value='Option '+i;el.dispatchEvent(new x.w.Event('input',{bubbles:true}));});
 let finish;const existing=x.w.__request;
 x.w.__request=(p,d)=>p==='/api/community/quote'?Promise.resolve({quote:{seconds:20,reward:200,fee_credits:1,credits:60,cap:20}}):p==='/api/community/publish'?new Promise(r=>finish=r):existing(p,d);
 x.click('[data-action=review-poll]');await settle(()=>x.w.document.querySelector('#publish-consent'));
 x.click('#publish-consent');x.click('[data-action=publish-sample]');await settle(()=>finish);
 x.click('#dialog [data-action=close-dialog]');fill(x,'#editor-title','My next question should be kept.');
 finish({poll:{...x.snapshot.polls[0],id:'new-poll',mine:true},wallet:x.snapshot.wallet});
 await settle(()=>x.w.document.querySelector('#toast').textContent==='Your poll is published.');
 assert.equal(x.w.location.hash,'#create');assert.equal(x.w.document.querySelector('#editor-title').value,'My next question should be kept.');
 assert.equal(x.snapshot.draft.deck_drafts.at(-1).title,'My next question should be kept.');
});

test('opening Following cannot erase unsaved preferences during a background refresh',async t=>{
 const x=await setup();t.after(()=>x.cleanup());x.w.location.hash='#settings/interests';await settle(()=>x.w.document.querySelector('[data-action=interest][data-topic=Food]'));
 x.click('[data-action=interest][data-topic=Food]');
 x.click('[data-action=notifications]');await settle(()=>x.w.document.querySelector('#dialog [data-action=manage-following]'));
 x.click('#dialog [data-action=manage-following]');await settle(()=>x.w.document.querySelector('#dialog [data-empty-scene=following]'));
 x.click('#dialog [data-action=close-dialog]');x.click('[data-action=interest][data-topic=Travel]');
 assert.equal(x.w.document.querySelector('[data-action=interest][data-topic=Food]').getAttribute('aria-pressed'),'true');
 assert.equal(x.w.document.querySelector('[data-action=interest][data-topic=Travel]').getAttribute('aria-pressed'),'true');
 assert.equal(x.snapshot.preferences.interests.includes('food'),false,'unsaved edits stay local until Save');
});

test('editor disclosures stay expanded after choosing topics and changing formats',async t=>{
 const x=await setup();t.after(()=>x.cleanup());x.click('.thread-composer [data-action=new-poll]');await settle(()=>x.w.document.querySelector('.audience-details'));
 for(const sel of ['.audience-details','[data-authorship]','[data-targeting]'])x.w.document.querySelector(sel).open=true;
 x.click('[data-action=editor-topic][data-topic=Food]');await settle(()=>!x.w.document.querySelector('[data-action=editor-topic][data-topic=Food]').disabled);
 assert.equal(x.w.document.querySelector('.audience-details').open,true);assert.equal(x.w.document.querySelector('[data-targeting]').open,true);
 x.click('[data-action=editor-format][data-format=ranking]');await settle(()=>x.w.document.querySelector('[data-action=editor-format][data-format=ranking]').getAttribute('aria-pressed')==='true');
 assert.equal(x.w.document.querySelector('.audience-details').open,true);assert.equal(x.w.document.querySelector('[data-authorship]').open,true);
});

test('incomplete allocations stay disabled after rerender and invalid totals cannot submit',async t=>{
 const x=await setup();t.after(()=>x.cleanup());x.snapshot.polls[0].format='allocation';x.snapshot.preferences.formats.push('allocation');
 x.click('[data-action=feed-tab][data-tab=foryou]');await settle(()=>x.w.document.querySelector('#poll-one [data-allocation]'));
 fill(x,'#poll-one [data-allocation="0"]','50');
 assert.equal(x.w.document.querySelector('#poll-one [data-action=submit]').disabled,true);
 x.click('#poll-two [data-action=follow-publisher]');await settle(()=>x.w.document.querySelector('#poll-two [data-action=follow-publisher]').getAttribute('aria-pressed')==='true');
 assert.equal(x.w.document.querySelector('#poll-one [data-action=submit]').disabled,true);
 fill(x,'#poll-one [data-allocation="1"]','50');assert.equal(x.w.document.querySelector('#poll-one [data-action=submit]').disabled,false);
 fill(x,'#poll-one [data-allocation="0"]','-10');fill(x,'#poll-one [data-allocation="1"]','110');assert.equal(x.w.document.querySelector('#poll-one [data-action=submit]').disabled,true);
 assert.equal(x.calls.some(([p])=>p.endsWith('/answer')),false);
});

for(const [hash,view,title] of [['#discover','discover','For you'],['#discover/one','discover','Poll'],['#wallet','wallet','Wallet'],['#polls?tab=drafts','polls','My polls'],['#saved','saved','Saved polls'],['#search','search','Search'],['#overview','overview','Insights'],['#create','create','New poll'],['#settings/appearance','settings','Appearance']]){
 test('refresh shows a route-matched skeleton until data is ready: '+hash,async()=>{
  const x=await setup({initialHash:hash,delayState:true}),doc=x.w.document;
  assert.equal(doc.querySelector('[data-page-loading]').dataset.pageLoading,view);
  assert.equal(doc.querySelector('#main').getAttribute('aria-busy'),'true');
  assert.equal(doc.querySelector('#main h1').textContent,title);
  assert.equal(doc.querySelectorAll('.thread-rail').length,1);
  assert.ok(doc.querySelectorAll('.skeleton').length>5);
  assert.equal(doc.querySelectorAll('.skeleton-panel button,.skeleton-panel input').length,0);
  assert.equal(doc.querySelector('#poll-one'),null);
  x.releaseState();await settle(()=>!doc.querySelector('[data-page-loading]'));
  assert.equal(doc.querySelector('#main').getAttribute('aria-busy'),null);
  if(hash==='#discover/one')assert.ok(doc.querySelector('.focus-page'));
  x.cleanup();
 });
}
test('notifications show a cancellable skeleton and ignore a late response',async()=>{
 const x=await setup();let finish;const original=x.w.__request;
 x.w.__request=(path,data)=>path==='/api/community/notifications'?new Promise(r=>finish=r):original(path,data);
 x.click('[data-action=notifications]');assert.ok(x.w.document.querySelector('#dialog [data-loading-region]'));
 x.click('#dialog [data-action=close-dialog]');assert.equal(x.w.document.querySelector('#dialog').open,false);
 finish({notifications:[],enabled:true});await settle(()=>!x.w.document.querySelector('[data-action=notifications].is-loading'));
 assert.equal(x.w.document.querySelector('#dialog').open,false);x.cleanup();
});
test('dialog load failure replaces skeleton with a working retry action',async()=>{
 const x=await setup(),original=x.w.__request;let fail=true;
 x.w.__request=async(path,data)=>{if(path==='/api/community/notifications'&&fail)throw Error('Please retry this connection.');return original(path,data)};
 x.click('[data-action=notifications]');await settle(()=>x.w.document.querySelector('#dialog [role=alert]'));
 assert.equal(x.w.document.querySelector('#dialog [data-loading-region]'),null);
 assert.match(x.w.document.querySelector('#dialog').textContent,/Please retry/);
 fail=false;x.click('#dialog [data-action=notifications]');await settle(()=>x.w.document.querySelector('#dialog .inbox-heading'));x.cleanup();
});
test('answer button shows busy feedback without discarding its choice on failure',async()=>{
 const x=await setup(),original=x.w.__request;let fail;
 x.w.__request=(path,data)=>path.endsWith('/answer')?new Promise((_,reject)=>fail=reject):original(path,data);
 x.click('#poll-one [data-action=choose][data-index="0"]');x.click('#poll-one [data-action=submit]');await settle(()=>!!fail);
 const button=x.w.document.querySelector('#poll-one [data-action=submit]');
 assert.equal(button.disabled,true);assert.equal(button.getAttribute('aria-busy'),'true');assert.ok(button.classList.contains('is-loading'));
 fail(Error('Try again'));await settle(()=>!button.disabled);
 assert.equal(button.getAttribute('aria-busy'),null);assert.equal(button.textContent,'Submit');
 assert.equal(x.w.document.querySelector('#poll-one [data-index="0"]').getAttribute('aria-pressed'),'true');x.cleanup();
});

test('closing a loading dialog releases its launcher without blocking the next action',async()=>{
 const x=await setup(),original=x.w.__request;let resolve;
 x.w.__request=(path,data)=>path==='/api/community/notifications'?new Promise(r=>resolve=r):original(path,data);
 x.click('[data-action=notifications]');x.click('#dialog [data-action=close-dialog]');
 assert.equal(x.w.document.querySelector('[data-action=notifications]').disabled,false);
 x.click('#poll-one [data-action=follow-publisher]');await settle(()=>x.snapshot.following.length===1);
 resolve({notifications:[],enabled:true});await settle(()=>!x.w.document.querySelector('#poll-one .is-loading'));
 assert.equal(x.w.document.querySelector('#dialog').open,false);x.cleanup();
});

test('review identifies invalid fields, focuses the first, and clears feedback as the user edits',async t=>{
 const x=await setup();t.after(()=>x.cleanup());x.click('[data-nav=create]');await settle(()=>x.w.document.querySelector('#editor-title'));
 x.click('[data-action=review-poll]');await settle(()=>x.w.document.querySelector('#editor-title-error'));
 assert.equal(x.w.document.activeElement.id,'editor-title');assert.equal(x.w.document.querySelectorAll('[aria-invalid=true]').length,3);
 assert.equal(x.calls.filter(([path])=>path.includes('/quote')).length,0);
 fill(x,'#editor-title','Which version would you choose?');assert.equal(x.w.document.querySelector('#editor-title-error'),null);
 assert.equal(x.w.document.querySelector('#question-count').textContent,'31/180');
 fill(x,'#editor-option-0','First');fill(x,'#editor-option-1','Second');assert.equal(x.w.document.querySelectorAll('[aria-invalid=true]').length,0);x.cleanup();
});
test('format controls preserve work on reselect and on cancelling a destructive change',async()=>{
 const x=await setup();x.click('[data-nav=create]');await settle(()=>x.w.document.querySelector('#editor-title'));
 fill(x,'#editor-title','Which version would you choose?');fill(x,'#editor-option-0','First');fill(x,'#editor-option-1','Second');
 x.click('[data-action=editor-format][data-format=classic]');await settle(()=>!x.w.document.querySelector('[data-action=editor-format][data-format=classic]').disabled);
 assert.equal(x.w.document.querySelector('#editor-option-0').value,'First');
 x.click('[data-action=editor-format][data-format=image]');await settle(()=>x.w.document.querySelector('[data-action=confirm-editor-format]'));
 x.click('#dialog [data-action=close-dialog]');assert.equal(x.w.document.querySelector('#editor-option-0').value,'First');
 x.click('[data-action=editor-format][data-format=image]');await settle(()=>x.w.document.querySelector('[data-action=confirm-editor-format]'));
 x.click('[data-action=confirm-editor-format]');await settle(()=>x.w.document.querySelector('[data-image="0"]'));
 assert.equal(x.w.document.querySelector('#editor-title').value,'Which version would you choose?');assert.equal(x.w.document.querySelector('#editor-option-0').value,'');x.cleanup();
});
test('the classic desktop menu opens Settings and route navigation focuses its heading',async t=>{
 const x=await setup();t.after(()=>x.cleanup());x.click('.thread-rail [data-action=thread-menu]');x.click('#thread-popover [data-action=settings-home]');assert.equal(x.w.location.hash,'#settings');
 assert.equal(x.w.document.activeElement.textContent,'Settings');assert.ok(x.w.document.querySelector('.settings-directory [data-section=appearance]'));
 x.click('[data-section=profile]');assert.equal(x.w.document.activeElement.textContent,'Your identity');x.cleanup();
});
test('feedback can be dismissed without changing the current page',async()=>{
 const x=await setup();x.click('[data-nav=create]');await settle(()=>x.w.document.querySelector('#editor-title'));
 x.click('[data-action=save-draft]');await settle(()=>x.w.document.querySelector('#toast.visible .toast-dismiss'));
 x.click('.toast-dismiss');assert.equal(x.w.document.querySelector('#toast').classList.contains('visible'),false);assert.equal(x.w.document.querySelector('#toast').inert,true);assert.equal(x.w.location.hash,'#create');x.cleanup();
});
