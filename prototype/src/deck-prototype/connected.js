import {validateEditorFields} from './editorExperience.js';
import {pageSkeleton, loadingRegion, beginActivity} from './loading.js';
import {canSubmitAnswer} from './answerValidity.js';
import {emptyArtworkURL} from './emptyStates.js';
import {createCreatorStudio} from './creatorStudio.js';
import {createFollowing, reactionCards} from './following.js';
import {createFeatureFlows} from './featureFlows.js';
import './featureFlows.css';
import {selectControl, disclosure} from './controls.js';
import {liveRequest, configureSession, upload, activateTurnstile} from '../api.js';
import {personalTagline} from './copy.js';
import {createViewScope} from './viewScope.js';

const topicToId={Design:'design',Lifestyle:'everyday',Work:'work',Food:'food',Technology:'technology',Travel:'travel',Entertainment:'entertainment',Wellbeing:'wellbeing'};
const idToTopic=Object.fromEntries(Object.entries(topicToId).map(([a,b])=>[b,a]));
const toFormat=t=>({image:'visual',ranking:'rank'})[t]||t;
const toType=t=>({visual:'image',rank:'ranking'})[t]||t;
const reactions={'Love it':'relatable',Interesting:'helpful',Surprising:'surprising'};
const field=(id,label,value='',type='text')=>`<label class="form-field"><span class="field-label">${label}</span><input class="field" id="${id}" type="${type}" value="${value}"></label>`;

export function createConnected(c){
 const {state,polls,formats,render,route,readHash,toast,openDialog,closeDialog,dialog,esc,button,icon,ib,empty,threadSingle}=c;
 const req=async(path,data)=>{
  if(data!==undefined&&(path.startsWith('/api/ai')||path==='/api/cloudflare/speech')&&state.view==='create'){
   await flushDrafts();await saveDraft();
  }
  return liveRequest(path,data);
 }, community=(path,data)=>req('/api/community'+path,data);
 const captureView=createViewScope(dialog);
 const formDialog=(title,body,footer='')=>openDialog(title,`<div class="form-stack">${body}</div>`,footer);
 let snapshot=null,error='',loginRequired=false,busy=false,activeWork=null,quote=null,quoteFingerprint='',quoteSerial=0,recording=null,mediaStream=null;
 let appearanceQueue=Promise.resolve(),appearanceVersion=0,appearancePending=0;
 const notes=new Map(), keys=new Map();
 const key=operation=>{if(!keys.has(operation))keys.set(operation,crypto.randomUUID());return keys.get(operation)};
 const clearKey=operation=>keys.delete(operation);
 const api={ready:false,views:{},start,prepareLeave,resetPreferences,loadingView,settingsBody,budgetSummary,answerControls,results,quote:()=>quote,editorExtras:()=>features.editorExtras()+(state.editor.type==='regions'&&state.editor.imagePrompts?.length?`<div class="studio-visual-plan">${button('Generate shared image','studio-images','small')}</div>`:''),starter:()=>features.starter(),workspaceExtras:()=>features.workspaceExtras()};
 state.points=0;state.pending=0;state.credits=0;state.completed={};state.drafts=[];state.published=[];polls.splice(0);
 state.editor=blankDraft();
 formats.regions=['Image regions','gallery-linear'];formats.pairwise=['Head to head','transfer-horizontal-linear'];formats.ab=['A/B testing','layers-minimalistic-linear'];formats.allocation=['Allocate 100 points','chart-square-linear'];
 function blankDraft(){return {title:'',type:'classic',options:['',''],images:[],videos:[],topic:'Design',tags:['design'],regions:[],targeting:{},count:20,seconds:20,reach:'Community',hours:168,language:'English',transcript:'',text_origin:'human',image_origin:'human',audio_origin:'human',video_origin:'human',audience:'Everyone'};}
 function mapPoll(p){const total=p.totals.reduce((a,b)=>a+b,0);return {...p,type:toType(p.format),topic:idToTopic[p.tags?.[0]||p.circle]||'Lifestyle',topics:(p.tags||[p.circle]).map(t=>idToTopic[t]).filter(Boolean),name:p.creator,mediaURL:p.audio,images:p.images||[],videos:p.videos||[],thumb:p.images?.[0],percent:p.totals.map(v=>total?Math.round(100*v/total):0),count:p.cap};}
 function applyReceipt(receipt){
  if(receipt.poll){
   const p=mapPoll(receipt.poll),index=polls.findIndex(item=>item.id===p.id);
   if(index<0)polls.unshift(p);else polls[index]=p;
   const stored=snapshot.polls.findIndex(item=>item.id===p.id);
   if(stored<0)snapshot.polls.unshift(receipt.poll);else snapshot.polls[stored]=receipt.poll;
   if(p.my_response){
    state.completed[p.id]=true;state.answers[p.id]=p.my_response.answer;
    const response={...p.my_response,poll_id:p.id,title:p.title};
    const responseIndex=snapshot.responses.findIndex(item=>item.id===response.id);
    if(responseIndex<0)snapshot.responses.unshift(response);else snapshot.responses[responseIndex]=response;
   }
   state.reaction[p.id]=Object.keys(reactions).find(k=>reactions[k]===p.my_reaction)||null;
   state.published=polls.filter(item=>item.mine);
  }
  if(receipt.wallet){snapshot.wallet=receipt.wallet;state.points=receipt.wallet.points;state.pending=receipt.wallet.pending;state.credits=receipt.wallet.credits;}
 }
 async function confirmed(receipt,message){
  applyReceipt(receipt);
  // A committed action is not undone by a failed secondary feed read. Current
  // servers return the affected poll and wallet in the transaction receipt.
  if(receipt.poll)return;
  try{await refresh();}catch{toast(message+' The rest of the feed will update when you reload.');}
 }
 async function refresh({keepEdits=true}={}){
  const next=await community('/state');
  const edits=keepEdits&&api.ready&&state.view==='settings'?{interests:new Set(state.interests),allowed:new Set(state.allowed),tagline:document.querySelector('#tagline')?.value??state.tagline,avatar:state.avatar}:null;
  snapshot=next;configureSession(snapshot);
  const pref=snapshot.preferences;polls.splice(0,polls.length,...snapshot.polls.map(mapPoll));
  state.points=snapshot.wallet.points;state.pending=snapshot.wallet.pending;state.credits=snapshot.wallet.credits;
  state.preferences=pref;state.avatar=snapshot.identity.avatar||'otter';state.notifications=snapshot.notifications||[];state.following=snapshot.following||[];state.followersCount=snapshot.followers_count||0;state.personId=snapshot.identity.id;state.name=snapshot.identity.author;state.tagline=personalTagline(pref.tagline);state.admin=snapshot.admin;state.authenticated=snapshot.authentication_enabled;
  state.saved=new Set(polls.filter(p=>p.saved).map(p=>p.id));state.published=polls.filter(p=>p.mine);
  state.drafts=snapshot.draft?.deck_drafts|| (snapshot.draft?.title?[snapshot.draft]:[]);
  if(!appearancePending){state.theme=pref.theme||'light';state.motion=pref.motion!==false;}
  state.interests=new Set(pref.interests.map(t=>idToTopic[t]).filter(Boolean));state.allowed=new Set(pref.formats.map(toType));
  state.ai='custom';state.appliedAI='all';
  state.appliedFormats=new Set(state.allowed);state.appliedInterests=null;
  state.completed={};state.reaction={};
  for(const p of polls){if(p.my_response){state.completed[p.id]=true;state.answers[p.id]=p.my_response.answer;}state.reaction[p.id]=Object.keys(reactions).find(k=>reactions[k]===p.my_reaction)||null;}
  if(!polls.some(p=>p.id===state.poll))state.poll=polls[0]?.id||'';
  document.documentElement.dataset.motion=String(state.motion);
  if(edits)Object.assign(state,edits);
  api.ready=true;error='';
 }
 let starting=false;
 async function start(){
  if(starting)return;starting=true;error='';loginRequired=false;render();
  try{await refresh();if(snapshot.onboarding?.required&&location.pathname!=='/admin'){location.replace('/welcome');return;}readHash();following.start();if(location.pathname==='/admin')await showAdmin();}
  catch(e){if(api.ready)toast(e.message);else{error=e.message;loginRequired=e.loginRequired===true;render();}}
  finally{starting=false;}
 }
 function loadingView(){return error?`<main class="thread-single" id="main"><header class="thread-column-head"><h1>Poll Pilled</h1></header><section class="thread-panel settings-panel"><h2>Unable to connect</h2><p role="alert">${esc(error)}</p>${loginRequired?'<a class="btn primary" href="/sign-in">Sign in again</a>':button('Try again','retry-connect','primary')}</section></main>`:pageSkeleton(state);}
 function selectedPoll(el){return polls.find(p=>p.id===(el.closest('[data-poll-id]')?.dataset.pollId||el.dataset.id||state.poll));}
 const dialogLoads={'publisher-profile':['Publisher','profile'],'manage-following':['Following','list'],notifications:['Notifications','list'],'publisher-results':['Manage poll','overview'],'open-admin':['Platform administration','form'],'open-security':['Bot protection','form'],'open-auth-settings':['Sign-in settings','form'],'admin-reviews':['Reports & appeals','list'],'admin-schedule':['Scheduled settlement','form'],'admin-usage':['AI usage','overview'],sessions:['Active sessions','list'],'voice-admin':['AI voice connection','form']};
 async function run(el,work){
  if(busy){toast('Please wait for the current action to finish.');return;}
  busy=true;const ticket=Symbol('action');activeWork=ticket;const finish=beginActivity(el,'Working…'),loading=dialogLoads[el?.dataset?.action];
  const cancellable=!!loading||['voice-editor','voice-answer','voice-followup'].includes(el?.dataset?.action);
  const release=()=>{if(activeWork===ticket){busy=false;activeWork=null;}finish();};
  if(loading)formDialog(loading[0],loadingRegion('Loading '+loading[0].toLowerCase()+'…',loading[1]));
  const current=captureView();
  if(cancellable){dialog.addEventListener('close',release);window.addEventListener('poll-navigation',release);}
  try{await work();}
  catch(e){
   if(loading&&current()&&dialog.querySelector('[data-loading-region]'))formDialog(loading[0],`<p role="alert">${esc(e.message)}</p>`,button('Try again',el.dataset.action,'primary',Object.entries(el.dataset).filter(([k])=>k!=='action').map(([k,v])=>`data-${k.replace(/[A-Z]/g,x=>'-'+x.toLowerCase())}="${esc(v)}"`).join(' ')));
   else if(!cancellable||current())toast(e.message);
  }finally{dialog.removeEventListener('close',release);window.removeEventListener('poll-navigation',release);release();}
 }
 function saveAppearance(changes){
  if(Object.entries(changes).every(([key,value])=>state[key]===value))return;
  const version=++appearanceVersion;appearancePending++;const finish=beginActivity(null,'Saving appearance…');
  Object.assign(state,changes);document.documentElement.dataset.motion=String(state.motion);render();
  // Render immediately, serialize saves, and never refresh the whole feed for
  // a theme switch. Rapid selections stay responsive and persist in order.
  appearanceQueue=appearanceQueue.then(async()=>{
   try{
    const result=await community('/preferences',changes);
    Object.assign(snapshot.preferences,result.preferences||changes);
    state.preferences=snapshot.preferences;
   }catch(e){
    if(version===appearanceVersion){
     state.theme=snapshot.preferences.theme||'light';state.motion=snapshot.preferences.motion!==false;
     document.documentElement.dataset.motion=String(state.motion);render();
    }
    toast('Appearance could not be saved. '+e.message);
   }finally{appearancePending--;finish();}
  });
 }
 const single=(title,body)=>threadSingle(title,body,c.context());
 const note=p=>notes.get(p.id)||{};
 function optionalReason(p){
  const n=note(p),active=recording?.pid===p.id;
  return disclosure({kind:'reason',id:p.id,label:active?'Recording…':n.text||n.audio?'Your reason':'Add a reason',icon:'chat-round-line-linear',optional:true,open:state.openReasons?.[p.id]??Boolean(n.text||n.audio||active),body:`<label class="reason-input"><span class="sr-only">Reason for your answer</span><textarea class="field" rows="3" data-answer-note="${p.id}" maxlength="3000" placeholder="Because…">${esc(n.text||'')}</textarea></label><div class="reason-tools">${button(icon('microphone-3-linear','sm')+'<span>'+ (active?'Finish recording':'Record')+'</span>',active?'stop-recording':'record-answer','quiet small',`data-id="${p.id}"`)}${button(icon('stars-linear','sm')+'<span>AI voice</span>','voice-answer','quiet small',`data-id="${p.id}"`)}<label class="btn quiet small audio-upload-control">${icon('headphones-round-linear','sm')}<span>Audio file</span><input class="sr-only" type="file" accept="audio/*" data-answer-audio="${p.id}" aria-label="Attach an audio reason"></label></div>${active?`<div class="recording-status" role="status"><span></span>Recording · 60 sec max ${button('Discard','cancel-recording','quiet small')}</div>`:''}${n.audio?`<audio controls preload="metadata" src="${esc(n.audio)}" aria-label="Your recorded reason"></audio><label class="consent-row"><input type="checkbox" data-ai-voice="${p.id}" ${n.audio_origin==='generated'?'checked':''} ${n.voiceLocked?'disabled':''}>${n.audio_origin==='generated'?'AI voice':'This audio uses an AI voice'}</label>${button('Remove audio','remove-answer-audio','quiet small',`data-id="${p.id}"`)}`:''}<p class="reason-privacy">Only the publisher sees your reason.</p><label class="consent-row"><input type="checkbox" data-followup-consent="${p.id}" ${n.consent?'checked':''}>Allow paid follow-up questions</label>`});
 }


 function answerControls(p,preview=false,priority=false){
  const a=preview?state.previewAnswers[p.type]:state.answers[p.id];const choose=preview?'preview-choice':'choose';const choice=(label,i,image='')=>`<button type="button" class="${image?'image-choice':'classic-choice'}" data-action="${choose}" data-index="${i}" aria-pressed="${a===i}">${image?`<span class="image-wrap"><img src="${esc(image)}" alt="" width="320" height="426" loading="${preview||priority?'eager':'lazy'}" decoding="async"${priority?' fetchpriority="high"':''}></span>`:''}<span class="choice-label"><span class="choice-mark">${icon(a===i?'check-circle-bold':'circle-linear')}</span><span>${esc(label)}</span></span></button>`;
  const custom=features.answerControls(p,preview);if(custom!==null)return custom+(!preview?optionalReason(p):'');
  let body='';
  if(['image','ab'].includes(p.type))body=`<div class="image-options" role="group" aria-label="Choose an image">${(p.presentation_order||p.options.map((_,i)=>i)).map(i=>choice(p.options[i],i,p.images[i]||emptyArtworkURL('drafts'))).join('')}</div>`;
  else if(p.type==='slider')body=`<div class="slider-card"><div class="slider-value" aria-live="polite">${a===undefined?'Choose a position':esc(p.options[a])}</div><input type="range" id="${preview?'preview-opinion-scale':'opinion-scale'}" min="0" max="${p.options.length-1}" value="${a??2}" aria-label="${esc(p.title||'Opinion scale')}"><div class="scale-labels"><span>${esc(p.options[0])}</span><span>${esc(p.options.at(-1))}</span></div>${button('Use this position',preview?'preview-scale-confirm':'scale-confirm','quiet small')}</div>`;
  else if(p.type==='ranking'){const order=a||p.options.map((_,i)=>i);body=`<p class="format-note">Move your favourites to the top.</p><div class="rank-list">${order.map((i,pos)=>`<div class="rank-row"><span class="rank-number">${pos+1}</span><span>${esc(p.options[i])}</span><div class="row">${ib('alt-arrow-up-linear','Move '+esc(p.options[i])+' up',preview?'preview-rank':'rank',`data-index="${pos}" data-direction="-1" ${pos===0?'disabled':''}`)}${ib('alt-arrow-down-linear','Move '+esc(p.options[i])+' down',preview?'preview-rank':'rank',`data-index="${pos}" data-direction="1" ${pos===order.length-1?'disabled':''}`)}</div></div>`).join('')}</div>${button('Keep this order',preview?'preview-confirm-rank':'confirm-rank','quiet small')}`;}
  else if(p.type==='allocation'){const values=a||p.options.map(()=>0);body=`<p class="format-note">Distribute 100 points across the options.</p>${p.options.map((o,i)=>`<label class="allocation-row"><span>${esc(o)}</span><input class="field" type="number" min="0" max="100" value="${values[i]}" data-allocation="${i}" data-preview="${preview}" aria-label="Points for ${esc(o)}"></label>`).join('')}<p data-allocation-total aria-live="polite">${values.reduce((x,y)=>x+y,0)} / 100 points</p>`;}
  else {const media=p.type==='audio'?`<audio controls preload="${preview||priority?'metadata':'none'}" src="${esc(p.mediaURL||'')}" aria-label="Audio for ${esc(p.title)}"></audio>${disclosure({kind:'transcript',id:p.id,label:'Read transcript',icon:'list-linear',open:state.openTranscripts[p.id],body:`<p>${esc(p.transcript||'The publisher has not supplied a transcript.')}</p>`})}`:p.type==='video'?`<div class="video-options">${p.options.map((o,i)=>`<section><h3>${esc(o)}</h3><video controls playsinline preload="${preview||priority?'metadata':'none'}" src="${esc(p.videos?.[i]||'')}" aria-label="${esc(o)}"></video><p>${esc(p.video_descriptions?.[i]||o)}</p></section>`).join('')}</div>`:'';body=`${media}<div class="classic-options" role="group" aria-label="Choose an option">${p.options.map((o,i)=>choice(o,i)).join('')}</div>`;}
  return body+(!preview?optionalReason(p):'');
 }
 function results(p){const r=p.my_response;return `${r?`<div class="result-banner" tabindex="-1" id="receipt-${p.id}">${icon('check-circle-bold')}<div><h3>Response received</h3><p>${p.reward} points · ${esc(r.status==='accepted'?'Available':r.status==='pending'?'Pending review':r.status)}</p></div></div>`:''}<h3>Results</h3><p class="results-sample">${p.responses} accepted ${p.responses===1?'response':'responses'}${p.type==='pairwise'?' · Share of comparison wins':''}</p>${p.responses?p.options.map((o,i)=>`<div class="result-option"><div class="result-label"><span>${esc(o)}</span><strong>${p.percent[i]||0}%</strong></div><div class="bar-track"><div class="bar-fill" style="width:${p.percent[i]||0}%"></div></div>${p.positions?.length?`<small>Average rank: ${p.positions[i]}</small>`:''}</div>`).join(''):'<p class="format-note">Results will appear as responses are accepted.</p>'}${p.ab_statistics?`<p class="format-note">A preference: ${p.ab_statistics.a_interval[0]}–${p.ab_statistics.a_interval[1]}% (95% interval). ${p.ab_statistics.clear_preference?'Evidence of a preference difference.':'More responses may be needed.'} Randomized display order; this measures preference, not conversion.</p>`:''}${p.outcome?`<section class="outcome-card"><h3>You helped decide</h3><p>${esc(p.outcome.body)}</p></section>`:''}${r?reactionCards(p,state,esc):''}`;}
 function settingsBody(){const custom=features.settingsBody();if(custom!==null)return custom;
  if(state.settings==='appearance')return `<fieldset><legend>Color mode</legend><div class="appearance-control">${['light','dark','system'].map(v=>`<button data-action="theme" data-theme="${v}" aria-pressed="${state.theme===v}">${icon(v==='dark'?'moon-linear':'sun-2-linear')}${v==='system'?'Auto':v[0].toUpperCase()+v.slice(1)}</button>`).join('')}</div></fieldset><div class="setting-row"><h3>Subtle motion</h3><button class="switch" role="switch" aria-label="Subtle motion" aria-checked="${state.motion}" data-action="motion"></button></div>`;
  if(state.settings==='profile')return `<div class="profile-card"><img src="/assets/avatar-otter.png" alt=""><div><h2>${esc(state.name)}</h2><p>Your public, anonymous identity.</p></div></div>${field('tagline','Your tagline',esc(state.tagline))}<div class="action-row">${button('Save tagline','save-tagline','primary')}</div>`;
  if(state.settings==='interests')return `<fieldset><legend>Your topics</legend><div class="preference-grid">${Object.keys(topicToId).map(t=>`<button class="preference" data-action="interest" data-topic="${t}" aria-pressed="${state.interests.has(t)}">${t}${icon(state.interests.has(t)?'check-circle-bold':'add-circle-linear')}</button>`).join('')}</div></fieldset><fieldset><legend>Ways to answer</legend><div class="preference-grid">${Object.entries(formats).map(([k,[l]])=>`<button class="preference" data-action="format-pref" data-format="${k}" aria-pressed="${state.allowed.has(k)}">${l}${icon(state.allowed.has(k)?'check-circle-bold':'add-circle-linear')}</button>`).join('')}</div></fieldset><fieldset><legend>AI-created content</legend><div class="classic-options">${[['all','Include human and AI-created polls'],['human','Only human-created polls and media']].map(([v,l])=>`<button class="classic-choice" data-action="ai-pref" data-pref="${v}" aria-pressed="${state.ai===v}">${icon(state.ai===v?'check-circle-bold':'circle-linear')}${l}</button>`).join('')}</div></fieldset>${selectControl({id:'interest-language',label:'Language',value:snapshot.preferences.languages[0],options:['English','Hindi','Tamil','Spanish']})}<label class="consent-row"><input id="followup-preference" type="checkbox" ${snapshot.preferences.followups?'checked':''}>Allow paid follow-up invitations for responses I opt into</label><div class="action-row">${button('Save preferences','save-preferences','primary')}</div>`;
  return `<div class="settings-copy"><h2>Your perspective. Your privacy.</h2><p>Poll content and responses are collected for research and platform improvement. Your public identity is an anonymous name and tagline. A voice recording can still identify you.</p><p>Free community polls also permit platform reuse. Publishers see responses to their own polls.</p></div><div class="action-row"><a class="btn" href="/api/community/export" download="poll-pilled-data.json">Download my data</a>${state.admin?button('Open admin','open-admin'):''}</div>`;
 }
 function editorData(){const e=state.editor;return {title:e.title,format:toFormat(e.type),draft_id:e.id,circle:e.tags?.[0]||topicToId[e.topic]||'everyday',tags:e.tags?.length?e.tags:[topicToId[e.topic]||'everyday'],regions:e.regions||[],targeting:e.targeting||{},options:e.options,images:e.images||[],audio:e.mediaURL||'',videos:e.videos||[],video_descriptions:e.video_descriptions||e.options,transcript:e.transcript||'',reach:e.reach||'Community',responses:e.count,hours:e.hours||168,language:e.language||'English',audience:e.audience||'Everyone',text_origin:e.text_origin||'human',image_origin:e.image_origin||'human',audio_origin:e.audio_origin||'human',video_origin:e.video_origin||'human'};}
 async function getQuote(){
  const serial=++quoteSerial,draft=state.editor,data=editorData(),fingerprint=JSON.stringify(data);
  const result=await community('/quote',data);
  if(serial!==quoteSerial||state.editor!==draft||JSON.stringify(editorData())!==fingerprint)return null;
  quote=result.quote;quoteFingerprint=fingerprint;draft.seconds=quote.seconds;
  const box=document.querySelector('#budget-summary');if(box)box.innerHTML=budgetSummary();
  return quote;
 }
 function budgetSummary(){if(!quote||quoteFingerprint!==JSON.stringify(editorData()))return '<p>Estimate shown when you review your poll.</p>';return `<div><span>Estimated time</span><strong>${quote.seconds} sec</strong></div><div><span>Reward per response</span><strong>${quote.reward} points</strong></div><div><span>Platform fee per response</span><strong>${quote.fee_credits} credits</strong></div><div><span>${state.editor.reach==='Boost'?'Reserved credits':'Community-funded places'}</span><strong>${state.editor.reach==='Boost'?quote.credits:quote.cap}</strong></div>`;}
 function pollRow(p,draft=false){return `<article class="poll-row"><span class="queue-thumb format-thumb">${icon(formats[p.type]?.[1]||'checklist-minimalistic-linear')}</span><div class="poll-row-copy"><h3>${esc(p.title||'Untitled draft')}</h3><p>${draft?'Draft':`${p.responses} of ${p.cap} responses · ${p.status}`}</p></div><div class="poll-row-actions">${button(draft?'Edit':p.mine?'Manage':'Open',draft?'edit-draft':p.mine?'publisher-results':'open-poll','small',`data-id="${p.id}"`)}${draft?button('Duplicate','duplicate-draft','quiet small',`data-id="${p.id}"`)+button('Delete','delete-draft','quiet small',`data-id="${p.id}"`):''}</div></article>`;}
 api.views.polls=()=>{const list=state.tab==='drafts'?state.drafts:state.published;return single('My polls',`<div class="tabs" role="tablist" aria-label="My polls"><button class="tab" role="tab" id="polls-tab-live" aria-controls="my-polls-panel" tabindex="${state.tab!=='drafts'?0:-1}" data-action="polls-tab" data-tab="live" aria-selected="${state.tab!=='drafts'}">Published (${state.published.length})</button><button class="tab" role="tab" id="polls-tab-drafts" aria-controls="my-polls-panel" tabindex="${state.tab==='drafts'?0:-1}" data-action="polls-tab" data-tab="drafts" aria-selected="${state.tab==='drafts'}">Drafts (${state.drafts.length})</button></div><div role="tabpanel" id="my-polls-panel" aria-labelledby="polls-tab-${state.tab==='drafts'?'drafts':'live'}">${list.length?list.map(p=>pollRow(p,state.tab==='drafts')).join(''):empty('Your next question starts here','Create a poll or pick up a saved draft.','Create a poll','new-poll','drafts')}</div>`)};
 api.views.saved=()=>single('Saved polls',polls.filter(p=>p.saved).map(p=>pollRow(p)).join('')||empty('Keep good questions close','Save a poll to revisit it later.','Find a poll','discover','saved'));
 api.views.overview=()=>single('Insights',`<div class="insights-summary"><div><p>Available points</p><strong>${state.points}</strong></div><div><p>Pending review</p><strong>${state.pending}</strong></div><div><p>Polls answered</p><strong>${snapshot.responses.length}</strong></div></div>${snapshot.updates.length?snapshot.updates.map(u=>`<section class="settings-panel"><h2>You helped decide</h2><p>${esc(u.body)}</p></section>`).join(''):empty('See the difference you make','Publisher updates will appear here after you participate.','Discover polls','discover','insights')}`);
 api.views.wallet=()=>single('Wallet',`<section class="wallet-summary"><h2>Available points</h2><div class="balance-value">${state.points.toLocaleString()} <small>pts</small></div>${button('Redeem points','redeem','primary')}<div class="balance-stats"><div><strong>${state.pending.toLocaleString()}</strong><span>Pending review</span></div><div><strong>${snapshot.wallet.redemptions.length}</strong><span>Redemption requests</span></div></div></section><div class="credit-row"><div><h3>${state.credits.toLocaleString()} publishing credits</h3><p>Reserve an audience for your poll.</p></div>${button('Add credits','credits')}</div>${snapshot.invitations.filter(i=>!i.answered_at&&i.status==='open').map(i=>`<section class="settings-panel"><h3>Paid follow-up</h3><p>${esc(i.question)}</p>${button('Answer · +100 points','answer-followup','primary',`data-id="${i.id}"`)}</section>`).join('')}${snapshot.responses.filter(r=>['rejected','appealed','declined'].includes(r.status)).map(r=>`<section class="settings-panel"><h3>${esc(r.title)}</h3><p>${esc(r.reason)} · ${r.status}</p>${r.status==='rejected'?button('Appeal this decision','appeal','',`data-id="${r.id}"`):''}</section>`).join('')}<div class="list-heading"><h2>Recent activity</h2></div>${snapshot.wallet.ledger.length?snapshot.wallet.ledger.map(l=>`<div class="transaction"><span class="transaction-icon">${icon('checklist-minimalistic-linear')}</span><div><h3>${esc(l.kind)}</h3><p>${new Date(l.created_at).toLocaleDateString()}</p></div><strong>${l.amount>0?'+':''}${l.amount} ${esc(l.currency)}</strong></div>`).join(''):empty('Your balance starts here','Earn points by answering funded polls.','Find a poll','discover','rewards',true)}<p class="prototype-footnote">Payments are placeholders. Points and publishing credits are simulated; no money moves.</p>`);

 async function showPublisher(pid){
  const current=captureView();const d=await community(`/polls/${pid}/details`);if(!current())return;state.poll=pid;const p=mapPoll(d.poll);state.management=d;
  openDialog('Manage poll',`<h3>${esc(p.title)}</h3>${results(p)}<div class="action-row section-actions">${button(p.status==='paused'?'Resume':'Pause','campaign-status','',`data-status="${p.status==='paused'?'active':'paused'}" ${p.status==='ended'?'disabled':''}`)}${button('End poll','end-poll','',p.status==='ended'?'disabled':'')}${button('Share decision','share-outcome')}${button('AI insight brief','generate-insights')}</div><h3>Responses</h3>${d.responses.map(r=>`<article class="review-row" id="evidence-${r.id}"><strong>${esc(r.name)}</strong><p>${esc(r.text||'No written explanation')}</p>${r.transcript?`<p>${esc(r.transcript)}</p>`:''}${r.audio&&!r.transcript?button('Transcribe with Meta','transcribe-response','small',`data-id="${r.id}"`):''}${r.quality?.flags.length?`<p class="format-note">Review signals: ${esc(r.quality.flags.join(' · '))}. These do not reject a response.</p>`:''}${r.audio?`<audio controls src="${esc(r.audio)}"></audio>${r.audio_origin==='generated'?'<span class="ai-label">AI voice</span>':''}`:''}<small>${esc(r.status)}</small>${r.status==='pending'?`<div class="row">${button('Accept','review-response','small',`data-id="${r.id}" data-decision="accept"`)}${button('Reject','reject-response','small',`data-id="${r.id}"`)}</div>`:''}${r.consent&&r.status==='accepted'?button('Invite follow-up','invite-followup','small',`data-id="${r.id}"`):''}</article>`).join('')||empty('Waiting for the first perspective','Responses will appear here as people answer.','','','responses',true)}${features.followups(d.followups)}${d.brief?briefView(d.brief):''}`,button('Done','close-dialog'));
 }
 function briefView(brief){return `<section class="insight-brief"><h3>AI insight brief</h3><p>${esc(brief.summary||'')} · ${brief.sample_size} supporting responses</p>${[...(brief.themes||[]),...(brief.disagreements||[])].map(t=>`<h4>${esc(t.title)}</h4><p>${esc(t.summary)}</p><div>${(t.sources||[]).map(id=>`<button class="link" data-action="evidence" data-id="${esc(id)}">View response</button>`).join(' · ')}</div>`).join('')}</section>`;}
 async function showAuthSettings(){
  const current=captureView(),data=await req('/api/admin/auth');if(!current())return;
  formDialog('Sign-in settings',`<div class="security-status"><strong>${data.enabled?'Custom sign-in active':'Custom sign-in setup'}</strong><p>Turnstile → emailed code → secure session. Account data stays in Catalyst.</p></div>${field('auth-sender','Verified Catalyst Mail sender',esc(data.sender||''),'email')}<p class="format-note">The sender and its domain or SMTP configuration must be verified in Catalyst Mail.</p><p>Turnstile: ${data.turnstile_ready?'Ready':'Not active'}<br>Email delivery: ${data.delivery_verified?'Verified by a successful sign-in':'Awaiting a test sign-in'}</p><div class="action-row"><a class="btn" href="/sign-in" target="_blank" rel="noopener">Test email sign-in</a>${!data.enabled?button('Activate custom sign-in','enable-custom-auth','primary',!data.delivery_verified||!data.turnstile_ready?'disabled':''):''}</div>`,`${button('Back','open-admin')}${button('Save sender','save-auth-settings','primary')}`);
 }
 async function showSecurity(){
  const current=captureView(),data=await req('/api/cloudflare/settings');if(!current())return;state.securitySetup=data;
  const config=data.pending.site_key?data.pending:data.turnstile;
  formDialog('Bot protection',`<div class="security-status" role="status"><strong>${data.security.turnstile_enabled?'Turnstile active':data.pending.site_key?'Ready to verify':'Not configured'}</strong><p>${data.security.turnstile_enabled?'Sign-in, publishing and sensitive account changes use security checks. Signed-in answers, settings, drafts and AI tools do not.':'Save the widget keys, then complete one check to enable protection.'}</p></div><p class="format-note">Manage email-code authentication in Sign-in settings. Turnstile must be active before custom sign-in can be enabled.</p>${field('security-site','Site key',esc(config.site_key||''))}${field('security-host','Allowed hostname',esc(config.hostname||location.hostname))}<label><span class="field-label">Secret key</span><input class="field" id="security-secret" type="password" autocomplete="new-password" placeholder="Paste from your Cloudflare widget"></label><p class="format-note">Encrypted in Catalyst. The secret is never returned to the browser.</p>${data.pending.site_key?button('Verify and activate','activate-security','primary'):''}`,`${button('Back','open-admin')}${button('Save widget keys','save-security','primary',data.environment_managed?'disabled':'')}`);
 }
 function showFollowup(id,keep=false){
  state.followupId=id;if(!keep){state.followupAudio='';state.followupText='';state.followupOrigin='human';}
  const f=snapshot.invitations.find(x=>x.id===id);if(!f)return;
  formDialog('Paid follow-up',`<h3>${esc(f.question)}</h3><textarea class="field" id="followup-answer" maxlength="3000" aria-label="Your answer">${esc(state.followupText||'')}</textarea><div class="action-row">${button('Voice studio','voice-followup','small')}${button('Record voice answer','record-followup','small')}<label class="btn">Add voice answer<input type="file" accept="audio/*" class="sr-only" data-followup-audio="true"></label></div><span id="followup-upload-status" role="status"></span>${state.followupAudio?`<audio controls src="${esc(state.followupAudio)}" aria-label="Follow-up audio"></audio>`:''}<label class="consent-row"><input type="checkbox" id="followup-ai-voice" ${state.followupOrigin==='generated'?'checked disabled':''}>${state.followupOrigin==='generated'?'AI voice':'This recording uses an AI-generated voice'}</label>`,button('Submit answer','submit-followup','primary'));
 }
 async function showAdmin(){if(!state.admin){toast('Administrator access required.');return;}const current=captureView(),data=await req('/api/admin/settings');if(!current())return;state.adminSettings=data;const l=data.limits;formDialog('Platform administration',`<p>Project: Poll-Pilled · ${esc(data.project_id)}</p><label><span class="field-label">Meta API key ${data.meta_configured?'(configured)':''}</span><input class="field" id="admin-meta-key" type="password" autocomplete="new-password" placeholder="Leave blank to keep the saved key"></label><p class="format-note">Encrypted on the server. Never returned to the browser.</p><label class="consent-row"><input type="checkbox" id="admin-ai-enabled" ${l.enabled?'checked':''}>Enable AI assistance</label>${field('admin-daily-usd','Per-user daily budget (USD)',l.daily_usd,'number')}${field('admin-platform-usd','Platform daily budget (USD)',l.platform_daily_usd,'number')}${['image','draft','rephrase','transcription','vision','insights','segmentation','speech','review'].map(k=>field('admin-'+k,k[0].toUpperCase()+k.slice(1)+' requests per user / day',l[k],'number')).join('')}<p>Cache: encrypted, 24 hours. Duplicate requests and automatic paid retries are blocked.</p><div class="action-row">${button('Review reports & appeals','admin-reviews')}${button('AI usage','admin-usage')}${button('Scheduled settlement','admin-schedule')}${button('AI voices','voice-admin')}${button('Bot protection','open-security')}${button('Sign-in settings','open-auth-settings')}<a class="btn" href="https://console.catalyst.zoho.com/baas/854222738/project/22220000000763319/Development#/serverless/appsail" target="_blank" rel="noopener">Catalyst console</a></div>`,button('Save settings','save-admin','primary'));}

 const features=createFeatureFlows({...c,api,captureView,community,req,refresh,run,formDialog,snapshot:()=>snapshot,editorData,getQuote,showPublisher,saveDraft:()=>saveDraft(),flushDrafts:()=>flushDrafts(),removeDraft:id=>removeDraft(id),topicToId,idToTopic,blankDraft,notes});
 const studio=createCreatorStudio({...c,req,run,formDialog,captureView,saveDraft,notes,idToTopic,showFollowup,cancelRecording:()=>features.cancelRecording()});
 let draftTimer,saveQueue=Promise.resolve(),savedDraftFingerprint='';
 async function flushDrafts(){clearTimeout(draftTimer);await saveQueue.catch(()=>{});}
 async function prepareLeave(){await flushDrafts();await saveDraft();}
 function resetPreferences(){if(!snapshot)return;const pref=snapshot.preferences;state.preferenceEdits={};state.interests=new Set(pref.interests.map(t=>idToTopic[t]).filter(Boolean));state.allowed=new Set(pref.formats.map(toType));state.tagline=personalTagline(pref.tagline);state.avatar=pref.avatar||'otter';}
 const activeDialog=()=>{const epoch=dialog.dataset.epoch;return ()=>dialog.open&&dialog.dataset.epoch===epoch;};
 async function removeDraft(id){await flushDrafts();const list=state.drafts.filter(d=>d.id!==id);await community('/draft',{draft:{deck_drafts:list}});state.drafts=list;if(state.editor.id===id){state.editor=blankDraft();savedDraftFingerprint='';}}
 async function saveDraft(){const e=state.editor;if(!e.title.trim()&&!e.options.some(x=>x.trim()))return;if(!e.id)e.id=crypto.randomUUID();const draft=structuredClone(e),fingerprint=JSON.stringify(draft);if(fingerprint===savedDraftFingerprint){const status=document.querySelector('#draft-save-status');if(status)status.textContent='Saved';return saveQueue;}saveQueue=saveQueue.catch(()=>{}).then(async()=>{const list=state.drafts.filter(x=>x.id!==draft.id);list.push(draft);await community('/draft',{draft:{deck_drafts:list}});state.drafts=list;savedDraftFingerprint=fingerprint;const status=document.querySelector('#draft-save-status');if(status)status.textContent=state.editor.id===draft.id&&JSON.stringify(state.editor)===fingerprint?'Saved':'Unsaved changes';});return saveQueue;}
 const scheduleSave=()=>{if(state.view!=='create'||(!state.editor.title.trim()&&!state.editor.options.some(x=>x.trim())))return;clearTimeout(draftTimer);const status=document.querySelector('#draft-save-status');if(status)status.textContent='Saving…';draftTimer=setTimeout(()=>saveDraft().catch(e=>{toast(e.message);if(status)status.textContent='Not saved';}),1000);};
 document.addEventListener('input',e=>{if(e.target.closest('#editor-form'))scheduleSave();});
 document.addEventListener('change',e=>{if(e.target.closest('#editor-form'))scheduleSave();});
 document.addEventListener('click',e=>{if(e.target.closest('#editor-form'))scheduleSave();});
 window.addEventListener('beforeunload',e=>{if((state.editor.title.trim()||state.editor.options.some(x=>x.trim()))&&JSON.stringify(state.editor)!==savedDraftFingerprint){e.preventDefault();e.returnValue='';}});
 const claims=new Map();
 const startClaim=async pid=>{const p=polls.find(x=>x.id===pid);if(!p||p.mine||p.my_response||!p.eligible)return;const pending=claims.get(pid);if(pending){const claim=await pending;if(Date.parse(claim.expires_at)>Date.now()+30000)return claim;claims.delete(pid);}if(!claims.has(pid))claims.set(pid,community(`/polls/${pid}/claim`,{}).catch(e=>{claims.delete(pid);throw e}));return claims.get(pid);};
 // Reading media or moving keyboard focus must never reserve a response slot.
 const claimWarnings=new Set();
 function reserveOnIntent(target){
  const card=target.closest('[data-poll-id]');if(!card||!target.closest('.poll-answers'))return;
  const pid=card.dataset.pollId;
  startClaim(pid).catch(e=>{if(!claimWarnings.has(pid)){claimWarnings.add(pid);toast(e.message);}});
 }
 document.addEventListener('click',e=>{
  const intent=e.target.closest('[data-action]');
  if(intent&&['choose','rank','confirm-rank','scale-confirm','pair-choice','record-answer'].includes(intent.dataset.action)&&!intent.disabled&&intent.dataset.preview!=='true')reserveOnIntent(intent);
 },true);
 document.addEventListener('input',e=>{if(e.target.matches('[data-answer-note],[data-allocation]:not([data-preview="true"]),.poll-answers input[type=range]'))reserveOnIntent(e.target);},true);
 const handled=new Set(['sign-out','retry-connect','submit','react','save-poll','send-report','new-poll','save-preferences','save-tagline','theme','quick-theme','motion','save-draft','edit-draft','review-poll','publish-sample','publisher-results','rephrase','apply-rephrase','credits','sample-credits','redeem','sample-redeem','prototype-info','open-admin','save-admin','open-security','save-security','activate-security','open-auth-settings','save-auth-settings','enable-custom-auth','scale-confirm','preview-scale-confirm','editor-format','confirm-editor-format','add-option','remove-option','record-answer','stop-recording','cancel-recording','close-editor','cancel-preferences','remove-answer-audio','campaign-status','end-poll','confirm-end-poll','share-outcome','save-outcome','generate-insights','evidence','review-response','reject-response','confirm-reject','invite-followup','send-followup','answer-followup','submit-followup','appeal','send-appeal','ai-draft','apply-ai-draft','generate-image','apply-ai-image','transcribe-question','analyse-images','preview-editor']);
 const following=createFollowing({state,polls,captureView,community,refresh,formDialog,closeDialog,dialog,render,route,button,icon,esc,toast,empty,isBusy:()=>busy});
 document.addEventListener('click',ev=>{
  const followAction=ev.target.closest('[data-action]');if(followAction&&!followAction.disabled&&following.handles(followAction.dataset.action)){ev.preventDefault();ev.stopImmediatePropagation();run(followAction,()=>following.action(followAction));return;}
  const el=ev.target.closest('[data-action]');if(!el||el.disabled)return;if(studio.handles(el.dataset.action)){ev.preventDefault();ev.stopImmediatePropagation();run(el,()=>studio.action(el));return;}if(features.handles(el.dataset.action)){ev.preventDefault();ev.stopImmediatePropagation();if(['avatar','pair-choice','pair-back'].includes(el.dataset.action)){features.action(el).catch(e=>toast(e.message));}else run(el,()=>features.action(el));return;}if(!handled.has(el.dataset.action))return;
  ev.preventDefault();ev.stopImmediatePropagation();const a=el.dataset.action,p=selectedPoll(el);if(p)state.poll=p.id;
  if(['theme','quick-theme','motion'].includes(a)){
   saveAppearance(a==='motion'?{motion:!state.motion}:{theme:a==='theme'?el.dataset.theme:state.theme==='dark'?'light':'dark'});return;
  }
  if(a==='cancel-preferences'){resetPreferences();route('settings',{settings:'menu'});return;}
  if(a==='cancel-recording'){cancelAnswerRecording();render();return;}
  run(el,async()=>{
   const current=captureView(),pollId=state.poll;
   if(a==='retry-connect')return start();
   if(a==='sign-out'){
    const logout=await req('/api/auth/logout',{});if(logout.custom){location.assign('/sign-in');return;}
    const load=src=>new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=()=>reject(new Error('Could not load secure sign-out. Please try again.'));document.head.append(script)});
    if(!window.catalyst?.auth){await load('https://static.zohocdn.com/catalyst/sdk/js/4.6.2/catalystWebSDK.js');await load('/__catalyst/sdk/init.js');}
    await window.catalyst.auth.signOut(location.origin+'/__catalyst/auth/login');return;
   }
   if(a==='submit'){
    if(!canSubmitAnswer(p,state.answers[p.id])||p.my_response)return;
    const payload=structuredClone({answer:state.answers[p.id],...note(p),public_audio:false,audio_origin:note(p).audio_origin||'human'});
    await startClaim(p.id);
    let receipt;
    try{receipt=await community(`/polls/${p.id}/answer`,payload);}
    catch(error){if(error.status===409)claims.delete(p.id);throw error;}
    if(receipt.response){p.my_response=receipt.response;state.completed[p.id]=true;state.answers[p.id]=receipt.response.answer;}
    notes.delete(p.id);claims.delete(p.id);await confirmed(receipt,'Your answer is saved.');render();document.querySelector(`#receipt-${p.id}`)?.focus({preventScroll:true});return;
   }
   if(a==='react'){const label=el.dataset.reaction,val=state.reaction[p.id]===label?'':reactions[label],receipt=await community(`/polls/${p.id}/react`,{reaction:val});state.reaction[p.id]=val?label:null;await confirmed(receipt,'Your reaction is saved.');render();document.querySelector(`#poll-${p.id} [data-action=react][data-reaction="${label}"]`)?.focus({preventScroll:true});return;}
   if(a==='save-poll'){await community(`/polls/${p.id}/save`,{saved:!p.saved});await refresh();render();toast(state.saved.has(p.id)?'Poll saved.':'Removed from saved polls.');return;}
   if(a==='send-report'){const value=dialog.querySelector('[name=report-reason]:checked')?.value;if(value===undefined)return;await community(`/polls/${p.id}/report`,{reason:['Misleading','Harmful or offensive','Spam or abuse','Unlabelled AI content','Other'][Number(value)]});if(current())closeDialog();toast('Report received. Thank you.');return;}
   if(a==='new-poll'){features.cancelRecording();await flushDrafts();await saveDraft();state.editor=blankDraft();savedDraftFingerprint='';quote=null;route('create');return;}
   if(a==='close-editor'){await prepareLeave();const target=state.editorReturn||{view:'polls',tab:'drafts'};route(target.view,target);return;}
   if(a==='save-preferences'){await features.savePreferences();return;}
   if(a==='save-tagline'){await community('/preferences',{tagline:document.querySelector('#tagline').value,avatar:state.avatar});await refresh({keepEdits:false});render();toast('Identity saved.');return;}
   if(a==='save-draft'){if(!state.editor.title.trim()&&!state.editor.options.some(x=>x.trim()))throw new Error('Add a question or an answer first.');clearTimeout(draftTimer);await saveDraft();render();toast('Draft saved.');return;}
   if(a==='edit-draft'){features.cancelRecording();await flushDrafts();await saveDraft();const d=state.drafts.find(x=>x.id===el.dataset.id);if(!d)throw new Error('This draft is no longer available.');state.editor=structuredClone(d);savedDraftFingerprint=JSON.stringify(d);quote=null;route('create');return;}
   if(a==='preview-editor'){openDialog('Respondent preview',`<h3>${esc(state.editor.title||'Your question')}</h3>${answerControls({...state.editor,id:'preview'},true)}`,button('Back to editing','close-dialog'));return;}
   if(a==='review-poll'){if(!validateEditorFields(state.editor))return;const q=await getQuote();if(!current())return;if(!q){toast('Your poll changed while estimating. Review it again.');return;}openDialog('Review poll',`<h3>${esc(state.editor.title)}</h3><p>${state.editor.count} responses · Estimated ${q.seconds} seconds</p><div class="budget-summary">${budgetSummary()}</div><label class="consent-row"><input type="checkbox" id="publish-consent">I agree that poll content and responses are collected. ${state.editor.reach==='Boost'?'':'This free community poll may also be reused by the platform.'}</label>`,button('Back to editing','close-dialog')+button('Publish poll','publish-sample','primary'));return;}
   if(a==='publish-sample'){
    if(!dialog.querySelector('#publish-consent')?.checked)throw new Error('Accept the publishing terms before continuing.');
    const draft=state.editor,data=structuredClone(editorData()),fingerprint=JSON.stringify(data),draftId=draft.id;
    clearTimeout(draftTimer);await saveQueue;
    const r=await community('/publish',{...data,data_use_accepted:true,idempotency_key:key('publish-'+fingerprint)});
    clearKey('publish-'+fingerprint);state.drafts=state.drafts.filter(d=>d.id!==draftId);
    if(state.editor===draft){
     if(JSON.stringify(editorData())===fingerprint){state.editor=blankDraft();savedDraftFingerprint='';}
     else{draft.id=crypto.randomUUID();savedDraftFingerprint='';try{await saveDraft();}catch{toast('Poll published. Your newer edits are still here; save them as a new draft.');}}
    }
    await confirmed(r,'Your poll is published.');
    if(current()){closeDialog();route('polls',{tab:'live'});}else render();
    toast('Your poll is published.');return;
   }
   if(a==='publisher-results')return showPublisher(el.dataset.id);
   if(a==='rephrase'){const draft=state.editor;formDialog('Rephrase question','<p role="status">Rephrasing your question…</p>');const current=activeDialog();const r=await req('/api/ai',{task:'rephrase',prompt:draft.title,text_origin:draft.text_origin});if(!current()||state.editor!==draft)return;state.suggestion=r;formDialog('Rephrase question',`<p>${esc(r.question)}</p>`,button('Keep original','close-dialog')+button('Use this version','apply-rephrase','primary'));return;}
   if(a==='apply-rephrase'){state.editor.title=state.suggestion.question;state.editor.text_origin=state.suggestion.text_origin;await saveDraft();closeDialog();render();return;}
   if(a==='ai-draft'){formDialog('Create with Meta',`<label><span class="field-label">What do you want to learn?</span><textarea class="field" id="ai-brief" maxlength="4000">${esc(state.editor.title)}</textarea></label>${button('Record brief','record-brief','small')}<p>Fully generated questions are labelled AI-created.</p>`,button('Generate draft','apply-ai-draft','primary'));return;}
   if(a==='apply-ai-draft'){features.cancelRecording();const draft=state.editor;const r=await req('/api/ai',{task:'draft',prompt:dialog.querySelector('#ai-brief').value,format:toFormat(state.editor.type)});if(!current()||state.editor!==draft)return;Object.assign(state.editor,{title:r.draft.title,options:r.draft.options,text_origin:'generated'});if(state.editor.type==='regions')state.editor.regions=state.editor.options.map((_,i)=>state.editor.regions[i]||{x:.05,y:.1+i*.15,width:.4,height:.12});await saveDraft();closeDialog();render();return;}
   if(a==='generate-image'){state.imageTarget=Number(el.dataset.index);formDialog('Generate an image',field('image-prompt','Describe the image',esc(state.editor.imagePrompts?.[state.imageTarget]||'')),button('Generate with Meta','apply-ai-image','primary'));return;}
   if(a==='apply-ai-image'){const current=activeDialog(),draft=state.editor,target=state.imageTarget;const r=await req('/api/ai/image',{prompt:dialog.querySelector('#image-prompt').value});if(!current()||state.editor!==draft)return;draft.images[target]=r.url;draft.image_origin='generated';await saveDraft();if(current())closeDialog();if(state.editor===draft)render();return;}
   if(a==='transcribe-question'){const draft=state.editor,url=draft.mediaURL;const r=await req('/api/ai/transcribe',{url});if(!current()||state.editor!==draft||draft.mediaURL!==url)return;draft.transcript=r.transcript;await saveDraft();if(current())render();return;}
   if(a==='analyse-images'){const draft=state.editor;formDialog('Visual review','<p role="status">Reviewing your images…</p>');const current=activeDialog();const r=await req('/api/ai/vision',{images:draft.images,prompt:draft.title});if(current()&&state.editor===draft)openDialog('Visual review',`<p>${esc(r.description||r.analysis||r.text||r.summary||'Review completed.')}</p>`,button('Done','close-dialog'));return;}
   if(['credits','redeem','sample-credits','sample-redeem'].includes(a)){return features.payments(a);}
   if(a==='prototype-info'){openDialog('About Poll Pilled','<p>Ask better questions. Share your perspective. See the difference you make.</p><p>Responses, preferences and drafts are stored securely on the server. Available rewards come from funded poll budgets.</p>',button('Done','close-dialog'));return;}
   if(a==='open-admin')return showAdmin();
   if(a==='open-security')return showSecurity();
   if(a==='open-auth-settings')return showAuthSettings();
   if(a==='save-auth-settings'){await req('/api/admin/auth',{sender:dialog.querySelector('#auth-sender').value.trim()});toast('Sender saved. Complete a test email-code sign-in.');if(current())return showAuthSettings();return;}
   if(a==='enable-custom-auth'){await req('/api/admin/auth',{enabled:true});toast('Turnstile-protected sign-in is active.');if(current())return showAuthSettings();return;}
   if(a==='save-security'){
    await req('/api/cloudflare/turnstile',{site_key:dialog.querySelector('#security-site').value.trim(),secret_key:dialog.querySelector('#security-secret').value.trim(),hostname:dialog.querySelector('#security-host').value.trim()});
    if(current())dialog.querySelector('#security-secret').value='';toast('Keys encrypted. Complete the verification to activate protection.');if(current())return showSecurity();return;
   }
   if(a==='activate-security'){
    const result=await activateTurnstile(state.securitySetup.pending);configureSession(result);await refresh();toast('Turnstile is active for sign-in and protected actions.');if(current())return showSecurity();return;
   }
   if(a==='save-admin'){const value=id=>dialog.querySelector('#'+id).value;const data={limits:{enabled:dialog.querySelector('#admin-ai-enabled').checked,daily_usd:Number(value('admin-daily-usd')),platform_daily_usd:Number(value('admin-platform-usd')),...Object.fromEntries(['image','draft','rephrase','transcription','vision','insights','segmentation','speech','review'].map(k=>[k,Number(value('admin-'+k))]))}};if(value('admin-meta-key'))data.meta_key=value('admin-meta-key');await req('/api/admin/settings',data);if(current())dialog.querySelector('#admin-meta-key').value='';toast('Admin settings saved securely.');if(current())return showAdmin();return;}
   if(a==='scale-confirm'||a==='preview-scale-confirm'){const preview=a.startsWith('preview');const range=(preview?dialog:el.closest('.thread-poll')).querySelector('input[type=range]');if(preview)state.previewAnswers.slider=Number(range.value);else {state.answers[p.id]=Number(range.value);c.refreshStage();}return;}
   if(a==='editor-format'||a==='confirm-editor-format'){
    const format=el.dataset.format;if(!formats[format]||state.editor.type===format)return;
    if(a==='confirm-editor-format'){if(state.editor!==state.formatChangeDraft)return;closeDialog();}
    else if(state.editor.options.some(o=>o.trim())||state.editor.images.some(Boolean)||state.editor.videos.some(Boolean)||state.editor.mediaURL){
     state.formatChangeDraft=state.editor;
     formDialog('Change poll format?',`<p>Switching to ${esc(formats[format][0])} clears the current answers and media. Your question stays.</p>`,button('Keep editing','close-dialog')+button('Change format','confirm-editor-format','primary',`data-format="${format}"`));return;
    }
    features.cancelRecording();state.editor.type=format;if(['slider','ranking','pairwise','allocation','regions'].includes(format)){state.editorDisclosures??={};state.editorDisclosures.formats=true;const extra=document.querySelector('[data-formats]');if(extra)extra.open=true;}state.previewAnswers={};state.editor.options=state.editor.type==='slider'?['Not at all','A little','Somewhat','A lot','Completely']:['ranking','allocation'].includes(state.editor.type)?['','','']:['',''];state.editor.images=[];state.editor.videos=[];state.editor.imagePrompts=[];state.editor.mediaURL='';state.editor.transcript='';state.editor.audio_origin='human';state.editor.image_origin='human';state.editor.video_origin='human';state.editor.regions=state.editor.type==='regions'?state.editor.options.map((_,i)=>({x:.05,y:.1+i*.2,width:.4,height:.15})):[];quote=null;await saveDraft();render();return;}
   if(a==='add-option'){if(state.editor.options.length<5){state.editor.options.push('');if(state.editor.type==='regions'){state.editor.regions||=[];state.editor.regions.push({x:.05,y:.1+(state.editor.options.length-1)*.15,width:.4,height:.12});}}await saveDraft();render();return;}
   if(a==='remove-option'){const i=Number(el.dataset.index);if(state.editor.options.length>2){state.editor.options.splice(i,1);if(state.editor.type!=='regions')state.editor.images.splice(i,1);state.editor.regions?.splice(i,1);state.editor.videos.splice(i,1);}await saveDraft();render();return;}
   if(a==='record-answer'){
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('Microphone recording is unavailable. Attach an audio file instead.');
    cancelAnswerRecording();const epoch=recordingEpoch,stream=await navigator.mediaDevices.getUserMedia({audio:true});
    if(epoch!==recordingEpoch){stream.getTracks().forEach(t=>t.stop());return;}
    mediaStream=stream;const recorder=new MediaRecorder(stream),chunks=[],capture={pid:p.id,recorder,stream};recording=capture;
    recorder.ondataavailable=e=>chunks.push(e.data);
    recorder.onstop=async()=>{
     clearTimeout(capture.timer);stream.getTracks().forEach(t=>t.stop());if(recording===capture)recording=null;
     if(epoch!==recordingEpoch)return;
     try{const blob=new Blob(chunks,{type:recorder.mimeType}),url=await upload(new File([blob],'response.webm',{type:blob.type}),'audio');
      if(epoch!==recordingEpoch)return;notes.set(p.id,{...note(p),audio:url,audio_origin:'human',voiceLocked:false,transcript:''});render();
     }catch(e){if(epoch===recordingEpoch){toast(e.message);render();}}
    };
    recorder.start();capture.timer=setTimeout(()=>recorder.state==='recording'&&recorder.stop(),60000);render();return;
   }
   if(a==='stop-recording'){recording?.recorder.stop();return;}
   if(a==='remove-answer-audio'){notes.set(p.id,{...note(p),audio:'',audio_origin:'human',voiceLocked:false,transcript:''});render();return;}
   if(a==='campaign-status'){await community(`/polls/${pollId}/status`,{status:el.dataset.status});await refresh();if(current())return showPublisher(pollId);return;}
   if(a==='end-poll'){openDialog('End this poll?',`<p>Unfilled places will be refunded. Existing participant rewards are kept.</p>`,button('Cancel','close-dialog')+button('End poll','confirm-end-poll','primary'));return;}
   if(a==='confirm-end-poll'){await community(`/polls/${pollId}/status`,{status:'ended'});await refresh();if(current())return showPublisher(pollId);return;}
   if(a==='share-outcome'){formDialog('You helped decide',`<textarea class="field" id="outcome-text" aria-label="Decision update" maxlength="1000" placeholder="Tell participants what their answers helped you decide."></textarea>`,button('Share update','save-outcome','primary'));return;}
   if(a==='save-outcome'){await community(`/polls/${pollId}/outcome`,{text:dialog.querySelector('#outcome-text').value});if(current())return showPublisher(pollId);return;}
   if(a==='generate-insights'){await community(`/polls/${pollId}/insights`,{});if(current())return showPublisher(pollId);return;}
   if(a==='evidence'){dialog.querySelector('#evidence-'+CSS.escape(el.dataset.id))?.scrollIntoView({block:'center',behavior:'smooth'});return;}
   if(a==='review-response'){await community(`/responses/${el.dataset.id}/review`,{action:'accept',reason:''});await refresh();if(current())return showPublisher(pollId);return;}
   if(a==='reject-response'){state.reviewId=el.dataset.id;formDialog('Explain the rejection',`<textarea class="field" id="review-reason" aria-label="Reason for rejection" maxlength="500" placeholder="Describe the quality issue. Disagreement is not a reason to reject."></textarea>`,button('Submit review','confirm-reject','primary'));return;}
   if(a==='confirm-reject'){await community(`/responses/${state.reviewId}/review`,{action:'reject',reason:dialog.querySelector('#review-reason').value});if(current())return showPublisher(pollId);return;}
   if(a==='invite-followup'){state.followupResponse=el.dataset.id;formDialog('Paid follow-up',`<p>Reserve 2 credits: 100 participant points and 1 platform credit.</p><textarea class="field" id="followup-question" aria-label="Follow-up question" maxlength="250" placeholder="What would you like to understand better?"></textarea>`,button('Send invitation','send-followup','primary'));return;}
   if(a==='send-followup'){await community(`/polls/${pollId}/followups`,{question:dialog.querySelector('#followup-question').value,response_ids:[state.followupResponse],hours:168,idempotency_key:key('followup')});clearKey('followup');await refresh();if(current())return showPublisher(pollId);return;}
   if(a==='answer-followup'){showFollowup(el.dataset.id);return;}
   if(a==='submit-followup'){await community(`/followups/${state.followupId}/answer`,{text:dialog.querySelector('#followup-answer').value,audio:state.followupAudio||'',audio_origin:dialog.querySelector('#followup-ai-voice').checked?'generated':'human'});if(current())closeDialog();await refresh();render();return;}
   if(a==='appeal'){state.appealId=el.dataset.id;formDialog('Appeal a review',`<textarea class="field" id="appeal-reason" aria-label="Reason for appeal" maxlength="1000" placeholder="Tell us why this response should be reconsidered."></textarea>`,button('Send appeal','send-appeal','primary'));return;}
   if(a==='send-appeal'){await community(`/responses/${state.appealId}/appeal`,{reason:dialog.querySelector('#appeal-reason').value});if(current())closeDialog();await refresh();render();toast('Appeal submitted.');}
  });
 },true);
 document.addEventListener('change',ev=>{
  const t=ev.target;if(features.change(t,ev))return;
  if(t.matches('input[type=file]')){
   ev.stopImmediatePropagation();const file=t.files?.[0];if(!file)return;
   const answer=t.dataset.answerAudio,draft=state.editor,type=draft.type,current=captureView();
   const kind=answer?'audio':t.dataset.image!==undefined?'image':t.dataset.video!==undefined?'video':type;
   const index=Number(t.dataset.image??t.dataset.video??0),options=draft.options.slice();
   run(t,async()=>{
    try{
     const url=await upload(file,kind);
     if(!current())return;
     if(answer){if(state.completed[answer])return;notes.set(answer,{...(notes.get(answer)||{}),audio:url,audio_origin:'human',voiceLocked:false,transcript:''});}
     else{
      if(state.editor!==draft||draft.type!==type||JSON.stringify(draft.options)!==JSON.stringify(options)){toast('Your draft changed. Attach the file to the intended option again.');return;}
      if(kind==='image')draft.images[index]=url;else if(kind==='video')draft.videos[index]=url;
      else Object.assign(draft,{mediaURL:url,mediaName:file.name,audio_origin:'human',transcript:''});
      await saveDraft();
     }
     if(current()){render();toast('File uploaded.');}
    }finally{t.value='';}
   });
  }
  if(t.dataset.aiVoice)notes.set(t.dataset.aiVoice,{...(notes.get(t.dataset.aiVoice)||{}),audio_origin:t.checked?'generated':'human'});
  if(t.dataset.followupConsent)notes.set(t.dataset.followupConsent,{...(notes.get(t.dataset.followupConsent)||{}),consent:t.checked});
  if(t.dataset.editorField){state.editor[t.dataset.editorField]=t.type==='number'?Number(t.value):t.value;quote=null;if(t.dataset.editorField==='reach'&&state.editor.reach==='Community')state.editor.count=Math.min(50,state.editor.count);getQuote().catch(e=>toast(e.message));}
 },true);
 document.addEventListener('input',ev=>{
  const t=ev.target;if(t.id==='followup-answer')state.followupText=t.value;if(t.dataset.answerNote)notes.set(t.dataset.answerNote,{...(notes.get(t.dataset.answerNote)||{}),text:t.value});
  if(t.dataset.editorField){state.editor[t.dataset.editorField]=t.type==='number'?Number(t.value):t.value;quote=null;}
  if(t.dataset.allocation!==undefined){const preview=t.dataset.preview==='true',p=preview?state.editor:selectedPoll(t);const values=[...(preview?state.previewAnswers[p.type]:state.answers[p.id])||p.options.map(()=>0)];values[Number(t.dataset.allocation)]=Number(t.value);if(preview)state.previewAnswers[p.type]=values;else state.answers[p.id]=values;const total=values.reduce((x,y)=>x+y,0),root=t.closest('.poll-answers')||dialog;root.querySelector('[data-allocation-total]').textContent=total+' / 100 points';const submit=root.closest('.thread-poll')?.querySelector('[data-action=submit]');if(submit)submit.disabled=!canSubmitAnswer(p,values);}
 },true);
 let recordingEpoch=0;
 function cancelAnswerRecording(){
  recordingEpoch++;const current=recording;recording=null;
  if(current){clearTimeout(current.timer);current.recorder.onstop=null;if(current.recorder.state==='recording')current.recorder.stop();current.stream.getTracks().forEach(t=>t.stop());}
  mediaStream?.getTracks().forEach(t=>t.stop());mediaStream=null;
 }
 for(const event of ['poll-navigation','popstate','pagehide','beforeunload'])window.addEventListener(event,cancelAnswerRecording);
 return api;
}
