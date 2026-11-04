import {beginActivity,installMediaLoading,rememberAppearance} from './loading.js';
import {emptyState} from './emptyStates.js';
import {pollFeed} from './pollFeed.js';
import {rememberDisclosures} from './controls.js';
import './threads.css';
import {icon} from './icons.js';
import {logo} from './brand.js';
import './forms.css';
import './interaction-feedback.css';
import {clearEditorError} from './editorExperience.js';
import {threadShell,threadDiscover,threadSettings,threadSearch,threadPoll,threadEditor,threadSingle} from './threadViews.js';
import { formats, polls, editorDefaults } from './data.js';
import {createConnected} from './connected.js';
import {routeHash, parseRoute} from './routes.js';

let chartModule, chartLoading;
function mountOverviewChart(state){
 if(chartModule){chartModule.mountOverviewChart(state);return;}
 if(!document.querySelector('#earnings-chart')||chartLoading)return;
 chartLoading=import('./overview.js').then(module=>{chartModule=module;module.mountOverviewChart(state);})
  .catch(()=>toast('The chart could not load. Try opening Insights again.'))
  .finally(()=>{chartLoading=null;});
}

// Connected Catalyst application; server state owns identities and balances.
const state = {view:'discover',sideColumn:true,rightTab:'live',feedTab:'foryou',audienceOpen:false,appliedAI:'all',period:9,poll:'everyday-bag',mobileAnswer:false,query:'',topic:'For you',answers:{},completed:{},saved:new Set(),reaction:{},previewAnswers:{},openTranscripts:{},openReasons:{},tagline:'Small opinions. Better everyday things.',appliedInterests:null,appliedFormats:null,points:5340,pending:680,tab:'live',settings:'menu',theme:document.documentElement.dataset.preferredTheme||'light',interests:new Set(['Design','Lifestyle','Work']),allowed:new Set(Object.keys(formats)),ai:'all',motion:document.documentElement.dataset.motion!=='false',editor:editorDefaults(),drafts:[],published:[],sort:'recommended'};
const app=document.querySelector('#app');
const dialog=document.querySelector('#dialog');
let dialogReturn=null,toastTimer,editorFileURLs=[];
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const mark=selected=>`<span class="choice-mark">${icon(selected?'check-circle-bold':'circle-linear')}</span>`;
const button=(label,action,cls='',extra='')=>`<button type="button" class="btn ${cls}" data-action="${action}" ${extra}>${label}</button>`;
const ib=(name,label,action,extra='')=>`<button type="button" class="icon-btn" aria-label="${label}" data-action="${action}" ${extra}>${icon(name)}</button>`;
const lock=()=>`<span class="locked-note">${icon('lock-keyhole-linear','sm')}Results unlock after answering</span>`;
const activePoll=()=>polls.find(p=>p.id===state.poll)||polls[0];
const matches=()=>pollFeed(polls,state,formats);
const empty=(title,description,actionLabel,action,scene='drafts',compact=false)=>emptyState({title,description,actionLabel,action,scene,compact},button);

const navLinks=[['overview','Overview','widget-2-linear'],['discover','Discover','compass-linear'],['create','Create a poll','checklist-minimalistic-linear'],['polls','My polls','chart-square-linear'],['wallet','Wallet','wallet-money-linear'],['saved','Saved polls','bookmark-linear']];
function context(){return {state,icon,logo,ib,button,polls,matches,activePoll,empty,answerControls,results,esc,formats,queueItem,settingsBody:()=>connected.settingsBody(),budgetSummary:()=>connected.budgetSummary(),connected};}
function shell(content){return threadShell(content,context());}
function overview(){return threadSingle('Insights',`<div class="insights-summary"><div><p>Available points</p><strong>${state.points.toLocaleString()}</strong></div><div><p>Pending review</p><strong>${state.pending.toLocaleString()}</strong></div><div><p>Polls answered</p><strong>${28+Object.keys(state.completed).length}</strong></div></div><div class="chart-section"><div class="row between"><h2>Points by format</h2><span class="subtle-badge">Sample activity</span></div><div class="chart-wrap"><canvas id="earnings-chart" role="img" aria-label="Sample earning activity by poll format, May to October"></canvas></div><div class="chart-legend">${[['Image','#edc04c'],['Classic','#50c3a2'],['Audio','#80b6ef'],['Interactive','#d582b8'],['Video','#b49cde']].map(([label,color])=>`<span style="--series:${color}">${label}</span>`).join('')}</div></div><p class="prototype-footnote">Sample activity · No real earnings</p>`,context());}
function queueItem(p){return `<button class="queue-poll" data-action="open-poll" data-id="${p.id}" aria-current="${state.poll===p.id}" aria-label="${esc(p.title)} · ${formats[p.type][0]} · ${p.seconds} seconds · ${p.reward} points">${p.thumb?`<img class="queue-thumb" src="${p.thumb}" alt="" width="74" height="91">`:`<span class="queue-thumb format-thumb">${icon(formats[p.type][1])}</span>`}<span class="queue-copy"><strong>${p.title}</strong><span>${icon(formats[p.type][1])}${formats[p.type][0]}</span><span class="queue-reward">${state.completed[p.id]?`${icon('check-circle-linear')} Answered`:`${p.seconds} sec <span aria-hidden="true">·</span> +${p.reward} pts`}</span></span></button>`;}
function queueContent(){const list=matches();return list.length?list.map(queueItem).join(''):empty('No polls found','Try another word or explore all topics.','Clear filters','clear-filters','no-results');}
function discover(){return threadDiscover(context());}
function searchPage(){return threadSearch(context());}
function answerControls(p,preview=false,priority=false){if(connected)return connected.answerControls(p,preview,priority);const a=preview?state.previewAnswers[p.type]:state.answers[p.id];
 if(['image','ab'].includes(p.type))return `<div class="image-options" role="group" aria-label="Choose one option">${p.options.map((o,i)=>`<button class="image-choice" data-action="${preview?'preview-choice':'choose'}" data-index="${i}" aria-pressed="${a===i}" aria-label="${esc(o)}"><span class="image-wrap"><img src="${p.images[i]||'/assets/deck/canvas-tote.png'}" alt="${esc(o)}" width="320" height="370"></span><span class="choice-label">${mark(a===i)}<span>${esc(o)}</span></span></button>`).join('')}</div>`;
 if(p.type==='slider')return `<div class="slider-card"><p class="format-note">Slide to share how you feel.</p><div class="slider-value" id="${preview?'preview-slider-value':'slider-value'}" aria-live="polite">${a===undefined?'—':a}</div><input type="range" id="${preview?'preview-opinion-scale':'opinion-scale'}" min="1" max="10" step="1" value="${a??5}" aria-label="How much does natural light matter, from 1 to 10"><div class="scale-labels"><span>A little</span><span>A lot</span></div></div>`;
 if(p.type==='ranking'){const order=Array.isArray(a)?a:p.options.map((_,i)=>i);return `<p class="format-note">Move your favourites to the top.</p><div class="rank-list">${order.map((i,pos)=>`<div class="rank-row"><span class="rank-number">${pos+1}</span><span>${esc(p.options[i])}</span><div class="row">${ib('alt-arrow-up-linear',`Move ${esc(p.options[i])} up`,preview?'preview-rank':'rank',`data-index="${pos}" data-direction="-1" ${pos===0?'disabled':''}`)}${ib('alt-arrow-down-linear',`Move ${esc(p.options[i])} down`,preview?'preview-rank':'rank',`data-index="${pos}" data-direction="1" ${pos===order.length-1?'disabled':''}`)}</div></div>`).join('')}</div>${button('Keep this order',preview?'preview-confirm-rank':'confirm-rank','quiet small','style="margin-top:12px"')}`;}
 const media=p.type==='audio'?`<div class="audio-card"><div class="row">${icon('headphones-round-linear')}<h3>A little room to unwind</h3></div><audio controls preload="metadata" src="${p.mediaURL||'/assets/question-sample.mp3'}" aria-label="Sample soundtrack"></audio><details class="transcript" data-transcript="${p.id}" ${state.openTranscripts[p.id]?'open':''}><summary>Read transcript</summary><p>An instrumental soundscape with gentle, steady beats and soft ambient textures. No spoken words. Where would this fit into your day?</p></details></div>`:p.type==='video'?`<video class="video-player" controls playsinline preload="metadata" src="${p.mediaURL||'/assets/poll-preview-a.mp4'}" aria-label="Sample introduction video"></video><details class="transcript" data-transcript="${p.id}" ${state.openTranscripts[p.id]?'open':''} style="margin-bottom:20px"><summary>Read video description</summary><p>A short product introduction exploring how a thoughtful workspace can change your day.</p></details>`:'';
 return `${media}<div class="classic-options" role="group" aria-label="Choose one option">${p.options.map((o,i)=>`<button class="classic-choice" data-action="${preview?'preview-choice':'choose'}" data-index="${i}" aria-pressed="${a===i}">${mark(a===i)}<span>${esc(o)}</span></button>`).join('')}</div>`;
}
function results(p){if(connected)return connected.results(p);const answer=state.answers[p.id],a=p.type==='slider'?(answer<=3?0:answer<=7?1:2):answer;return `<div class="result-banner" tabindex="-1" id="receipt-${p.id}">${icon('check-circle-bold','lg')}<div><h3>Your perspective counts.</h3><p>+${p.reward} points pending review · Sample reward</p></div></div><div class="row between"><h3>Here’s how others answered</h3><span class="subtle-badge">Sample results</span></div><p class="results-sample">${p.sample+1} responses · Your answer is anonymous</p>${p.options.map((o,i)=>`<div class="result-option ${a===i?'chosen':''}"><div class="result-label"><span class="row">${esc(o)} ${a===i?icon('check-circle-bold','sm'):''}</span><strong>${p.percent[i]}%</strong></div><div class="bar-track"><div class="bar-fill" style="width:${p.percent[i]}%"></div></div></div>`).join('')}<div class="divider"></div><p class="format-note">What do you think of the result?</p><div class="reactions">${[['heart-linear','Love it'],['stars-linear','Interesting'],['question-circle-linear','Surprising']].map(([ic,label])=>`<button class="reaction" data-action="react" data-reaction="${label}" aria-pressed="${state.reaction[p.id]===label}">${icon(ic,'sm')}${label}</button>`).join('')}</div>`;}
function pollRow(p,status='Live',draft=false){return `<article class="poll-row">${(['image','ab'].includes(p.type)&&p.images?.[0])||p.thumb?`<img src="${(['image','ab'].includes(p.type)&&p.images?.[0])||p.thumb}" alt="">`:`<span class="queue-thumb format-thumb" style="width:48px;height:58px">${icon(formats[p.type][1])}</span>`}<div class="poll-row-copy"><h3>${esc(p.title)}</h3><p>${formats[p.type][0]} · ${p.topic||'Design'} ${status==='Live'?`· ${p.id==='sample-live'?'48 of 100':`0 of ${p.count||100}`} responses`:''}</p></div><span class="badge">${status}</span>${button(draft?'Continue editing':state.view==='saved'?'Open poll':'View results',draft?'edit-draft':state.view==='saved'?'open-poll':'publisher-results','small',`data-id="${p.id}"`)}</article>`;}
function myPolls(){const list=state.tab==='drafts'?state.drafts:[...state.published,{...polls[0],id:'sample-live'}];return threadSingle('My polls',`<div class="tabs" role="tablist" aria-label="Poll status"><button role="tab" class="tab" data-action="polls-tab" data-tab="live" aria-selected="${state.tab==='live'}">Live <span class="muted">${state.published.length+1}</span></button><button role="tab" class="tab" data-action="polls-tab" data-tab="drafts" aria-selected="${state.tab==='drafts'}">Drafts <span class="muted">${state.drafts.length}</span></button></div><div role="tabpanel">${list.length?list.map(p=>pollRow(p,state.tab==='drafts'?'Draft':'Live',state.tab==='drafts')).join(''):empty('Your next question starts here','Save a draft while you work on your next poll.','Create a poll','new-poll')}</div>`,context());}
function saved(){const list=polls.filter(p=>state.saved.has(p.id));return threadSingle('Saved polls',list.length?list.map(p=>pollRow(p,'Saved')).join(''):empty('Keep the good questions close','Save a poll after answering to revisit its results.','Find a poll','discover','saved'),context());}
function wallet(){return threadSingle('Wallet',`<section class="wallet-summary"><div class="row between"><h2>Available points</h2><span class="subtle-badge">Sample balance</span></div><div class="balance-value">${state.points.toLocaleString()} <small>pts</small></div>${button('Redeem points','redeem','primary')}<div class="balance-stats"><div><strong>${state.pending.toLocaleString()}</strong><span>Pending review</span></div><div><strong>2,000</strong><span>Redeemed</span></div></div></section><div class="credit-row"><div><h3>2,500 publishing credits</h3><p>Use credits to reach your audience.</p></div>${button('Add credits','credits')}</div><div class="list-heading"><h2>Recent activity</h2><span class="muted">This week</span></div>${Object.keys(state.completed).map(id=>{const p=polls.find(x=>x.id===id);return transaction(p.title,'Pending review · Just now',p.reward);}).join('')}${transaction('A little more green','Approved · Today',250)}${transaction('A better way to start the day','Approved · Yesterday',300)}${transaction('Your favourite kind of coffee','Approved · Yesterday',200)}<p class="prototype-footnote">Sample points and credits · Payments are simulated.</p>`,context());}
function transaction(title,sub,amount){return `<div class="transaction"><span class="transaction-icon">${icon('checklist-minimalistic-linear')}</span><div><h3>${esc(title)}</h3><p>${sub}</p></div><strong>+${amount} pts</strong></div>`;}
function settings(){return threadSettings(context());}
function settingsBody(){
 if(state.settings==='appearance')return `<fieldset><legend>Color mode</legend>${appearanceControl()}</fieldset><div class="setting-row"><div><h3>Subtle motion</h3><p>Feedback as you choose and move around.</p></div><button class="switch" role="switch" aria-label="Subtle motion" aria-checked="${state.motion}" data-action="motion"></button></div><p class="prototype-note">Changes apply to this preview.</p>`;
 if(state.settings==='interests')return `<p>Choose what appears in your feed.</p><fieldset class="section-label"><legend>Your topics</legend><div class="preference-grid">${['Design','Lifestyle','Work','Food','Technology','Travel'].map(t=>`<button class="preference" data-action="interest" data-topic="${t}" aria-pressed="${state.interests.has(t)}">${esc(t)}${icon(state.interests.has(t)?'check-circle-bold':'add-circle-linear')}</button>`).join('')}</div></fieldset><div class="divider"></div><fieldset><legend>Ways to answer</legend><div class="preference-grid">${Object.entries(formats).map(([k,[l,ic]])=>`<button class="preference" data-action="format-pref" data-format="${k}" aria-pressed="${state.allowed.has(k)}">${icon(ic)}${l}${icon(state.allowed.has(k)?'check-circle-bold':'add-circle-linear')}</button>`).join('')}</div></fieldset><div class="divider"></div><fieldset><legend>AI-created polls</legend><div class="classic-options">${[['all','A mix of human and AI-created'],['human','Only human-created']].map(([v,l])=>`<button class="classic-choice" data-action="ai-pref" data-pref="${v}" aria-pressed="${state.ai===v}">${mark(state.ai===v)}${l}</button>`).join('')}</div></fieldset>${button('Save preferences','save-preferences','primary','style="margin-top:24px"')}`;
 if(state.settings==='profile')return `<div class="profile-card"><img src="/assets/avatar-otter.png" alt="Your otter avatar"><div><h2>Sunny Otter</h2><p>Your name stays anonymous.</p></div></div><label><span class="field-label">Your tagline</span><input class="field" id="tagline" maxlength="80" value="${esc(state.tagline)}"></label><p class="prototype-note">A little about your perspective, without your real name.</p>${button('Save tagline','save-tagline','primary','style="margin-top:24px"')}`;
 return `<h2>Your perspective. Your privacy.</h2><p>Know what’s shared before you answer.</p><div class="text-list"><div class="card soft"><h3>Anonymous by default</h3><p>Publishers see your anonymous name and tagline, never your personal identity.</p></div><div class="card soft"><h3>Answers help shape decisions</h3><p>Poll content and responses may be collected for research and platform improvement.</p></div><div class="card soft"><h3>A preview, with sample data</h3><p>This prototype sends no answers, files or payments to a server. Reloading restores the sample state.</p></div></div>`;
}
function editorPreview(){const e=state.editor,p={...e,id:'editor-preview'};return `<span class="badge">${e.seconds} sec · +${e.type==='classic'?200:300} pts</span><h3>${esc(e.title||'Your question goes here')}</h3>${answerControls(p,true)}${lock()}`;}
function editor(){return threadEditor(context());}
function budgetSummary(){const e=state.editor,cost=e.type==='classic'?2:3,total=e.count*cost;return `<div><span>Participant rewards</span><span>${total} credits</span></div><div><span>Platform fee · 10%</span><span>${Math.round(total*.1)} credits</span></div><div><span>Total budget</span><span>${Math.round(total*1.1)} credits</span></div>`;}

function render(){if(connected.ready)rememberAppearance(state.theme,state.motion);rememberDisclosures(app,state);const previousFocus=document.activeElement;const focusedPoll=previousFocus?.closest('[data-poll-id]')?.dataset.pollId;const action=previousFocus?.dataset.action;const focusAttrs=previousFocus?.dataset||{};const scroll=document.querySelector('#thread-feed')?.scrollTop||0;document.body.classList.toggle('is-answering',state.view==='discover'&&state.mobileAnswer);document.documentElement.dataset.theme=state.theme==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):state.theme;const canvasColor=getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim();if(canvasColor)document.querySelector('meta[name=theme-color]')?.setAttribute('content',canvasColor);app.innerHTML=connected.ready?shell(({overview,discover,search:searchPage,create:editor,polls:myPolls,wallet,saved,settings,...connected.views}[state.view]||discover)()):shell(connected.loadingView());if(!connected.ready)app.querySelectorAll('button:not([data-action="retry-connect"])').forEach(b=>b.disabled=true);document.title=`${({discover:'Discover',create:'New poll',polls:'My polls',overview:'Insights'})[state.view]||state.view[0].toUpperCase()+state.view.slice(1)} · Poll Pilled`;const feed=document.querySelector('#thread-feed');if(feed)feed.scrollTop=scroll;if(action){const candidates=[...app.querySelectorAll(`[data-action="${action}"]`)];const same=candidates.find(n=>(!focusedPoll||n.closest('[data-poll-id]')?.dataset.pollId===focusedPoll)&&Object.entries(focusAttrs).every(([k,v])=>n.dataset[k]===v));same?.focus({preventScroll:true});}mountOverviewChart(state);}

function refreshStage(){const p=activePoll(),card=document.querySelector(`#poll-${p.id}`);if(card){rememberDisclosures(card,state);card.outerHTML=threadPoll(p,context(),state.mobileAnswer);}const pending=document.querySelector('.workspace-balance span');if(pending)pending.textContent=state.pending+' pending';refreshQueue();}
function refreshQueue(){const list=document.querySelector('#search-results');if(list)list.innerHTML=queueContent();}
function refreshEditorPreview(){const el=document.querySelector('#editor-preview');if(el)el.innerHTML=editorPreview();}
function toast(message){
 clearTimeout(toastTimer);const el=document.querySelector('#toast');
 el.innerHTML=`<span class="toast-message">${esc(message)}</span><button type="button" class="toast-dismiss" aria-label="Dismiss message">${icon('close-circle-linear','sm')}</button>`;
 const previous=document.activeElement;
 const hide=()=>{clearTimeout(toastTimer);if(el.contains(document.activeElement)){const target=previous?.isConnected?previous:app.querySelector('#main h1');if(target){target.tabIndex=target.tagName==='H1'?-1:target.tabIndex;target.focus({preventScroll:true});}}el.inert=true;el.classList.remove('visible');};
 const schedule=()=>{clearTimeout(toastTimer);toastTimer=setTimeout(hide,message.length>120?9000:6000);};
 el.querySelector('.toast-dismiss').addEventListener('click',hide);
 el.onmouseenter=()=>clearTimeout(toastTimer);el.onmouseleave=schedule;el.onfocusin=()=>clearTimeout(toastTimer);el.onfocusout=schedule;
 el.inert=false;el.classList.add('visible');schedule();
}

const scrollPositions=new Map();let currentHash=location.hash, navigationPending=false;
function rememberLocation(){scrollPositions.set(currentHash,{page:window.scrollY,feed:document.querySelector('#thread-feed')?.scrollTop||0});}
function restoreLocation(){const scroll=scrollPositions.get(location.hash);window.scrollTo(0,scroll?.page||0);const feed=document.querySelector('#thread-feed');if(feed)feed.scrollTop=scroll?.feed||0;}
function commitRoute(view,extra={}){
 rememberLocation();if(state.view==='settings'&&connected.ready)connected.resetPreferences();window.dispatchEvent(new Event('poll-navigation'));closePopover(false);if(dialog.open)closeDialog();
 if(view==='create'&&state.view!=='create')state.editorReturn={view:state.view,settings:state.settings,tab:state.tab,feedTab:state.feedTab,topic:state.topic,query:state.query,sort:state.sort};
 Object.assign(state,{view,mobileAnswer:false},view==='settings'&&!extra.settings?{settings:'menu'}:{},extra);
 const hash=routeHash(state);if(hash!==location.hash)history.pushState(null,'',hash);currentHash=hash;render();restoreLocation();const heading=app.querySelector('#main h1');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}
}
function route(view,extra={}){
 if(navigationPending)return;
 if(state.view==='create'&&view!=='create'&&connected.ready){
  navigationPending=true;const finish=beginActivity(null,'Saving draft…');connected.prepareLeave().then(()=>commitRoute(view,extra)).catch(e=>toast('Draft not saved. '+e.message+' Your edits are still here.')).finally(()=>{navigationPending=false;finish();});return;
 }
 commitRoute(view,extra);
}
function readHash(){const next=parseRoute(location.hash);if(connected.ready&&next.mobileAnswer&&!polls.some(p=>p.id===next.poll))next.mobileAnswer=false;Object.assign(state,next);currentHash=location.hash;render();restoreLocation();}
window.addEventListener('popstate',()=>{rememberLocation();if(state.view==='settings'&&connected.ready)connected.resetPreferences();window.dispatchEvent(new Event('poll-navigation'));if(dialog.open)closeDialog();if(state.view==='create'&&connected.ready)connected.prepareLeave().catch(e=>toast('Draft not saved. '+e.message));readHash();});
let dialogEpoch=0,dialogReturnData={},dialogReturnPoll='';
function restoreDialogFocus(){
 if(dialog.open)return;
 const target=dialogReturn?.isConnected?dialogReturn:[...document.querySelectorAll('[data-action],[data-nav]')].find(el=>(!dialogReturnPoll||el.closest('[data-poll-id]')?.dataset.pollId===dialogReturnPoll)&&Object.keys(dialogReturnData).length&&Object.entries(dialogReturnData).every(([k,v])=>el.dataset[k]===v));
 target?.focus?.({preventScroll:true});
}
function closeDialog(){if(!dialog.open)return;dialog.dataset.epoch=String(++dialogEpoch);dialog.close();restoreDialogFocus();}
function openDialog(title,body,footer=''){
 if(!dialog.open){dialogReturn=document.activeElement;dialogReturnData={...dialogReturn?.dataset};dialogReturnPoll=dialogReturn?.closest('[data-poll-id]')?.dataset.pollId||'';}
 dialog.dataset.epoch=String(++dialogEpoch);dialog.dispatchEvent(new Event('poll-dialog-replace'));
 dialog.innerHTML=`<header class="dialog-header"><h2 id="dialog-title" tabindex="-1">${title}</h2><button type="button" class="icon-btn dialog-close" data-action="close-dialog" aria-label="Close ${esc(title)}">${icon('close-circle-linear')}</button></header><div class="dialog-body">${body}</div>${footer?`<footer class="dialog-footer">${footer}</footer>`:''}`;
 if(!dialog.open)dialog.showModal();dialog.querySelector('#dialog-title').focus({preventScroll:true});
}
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}});
dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialog();});
dialog.addEventListener('close',restoreDialogFocus);
function validateEditor(){const e=state.editor;if(!e.title.trim()){toast('Give your poll a question first.');document.querySelector('#editor-title')?.focus();return false;}if(e.options.some(o=>!o.trim())){toast('Add a name for every answer option.');return false;}if(!Number.isFinite(e.count)||e.count<10||e.count>1000||!Number.isFinite(e.seconds)||e.seconds<10||e.seconds>300){toast('Use 10–1,000 responses and 10–300 seconds.');return false;}return true;}

document.addEventListener('click',e=>{
 const el=e.target.closest('[data-action],[data-nav]');if(!el||el.disabled)return;
 if(el.dataset.nav){e.preventDefault();route(el.dataset.nav);return;}
 const a=el.dataset.action,card=el.closest('[data-poll-id]');if(card)state.poll=card.dataset.pollId;const p=activePoll();
 if(el.closest('#thread-popover')&&!['menu-appearance','menu-main'].includes(a))closePopover(false);
 if(threadAction(a,el))return;
 if(a==='period'){state.period=Number(el.dataset.period);render();return;}
 if(a==='quick-theme'){state.theme=state.theme==='dark'?'light':'dark';render();return;}
 if(a==='sidebar-topic'){const topic=el.dataset.topic;route('discover',{topic,query:'',poll:polls.find(x=>x.topic===topic)?.id||(polls[0]?.id||'')});return;}
 if(a==='search'){openSearch();return;}
 if(a==='command-nav'){const v=el.dataset.view;closeDialog();route(v);return;}
 if(a==='command-poll'){const id=el.dataset.id;closeDialog();route('discover',{poll:id,mobileAnswer:true});return;}

 if(a==='open-poll'){route('discover',{poll:el.dataset.id,mobileAnswer:true});return;}
 if(a==='back-polls'){route('discover');return;}
 if(a==='choose'){const i=Number(el.dataset.index);state.answers[p.id]=i;(card||document).querySelectorAll('.poll-answers [data-action="choose"]').forEach(b=>{const selected=Number(b.dataset.index)===i;b.setAttribute('aria-pressed',String(selected));b.querySelector('.choice-mark').innerHTML=icon(selected?'check-circle-bold':'circle-linear');});(card||document).querySelector('[data-action="submit"]').disabled=false;return;}
 if(a==='submit'){if(state.answers[p.id]===undefined||state.completed[p.id])return;state.completed[p.id]=true;state.pending+=p.reward;refreshStage(false);document.querySelector(`#receipt-${p.id}`)?.focus({preventScroll:true});return;}
 if(a==='react'){state.reaction[p.id]=state.reaction[p.id]===el.dataset.reaction?null:el.dataset.reaction;(card||document).querySelectorAll('[data-action="react"]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.reaction===state.reaction[p.id])));return;}
 if(a==='save-poll'){state.saved.has(p.id)?state.saved.delete(p.id):state.saved.add(p.id);refreshStage();document.querySelector(`#poll-${p.id} [data-action=save-poll]`)?.focus({preventScroll:true});toast(state.saved.has(p.id)?'Saved. Come back to this perspective anytime.':'Removed from saved polls.');return;}
 if(a==='topic'){route(state.view,{topic:el.dataset.topic});return;}
 if(a==='clear-filters'){route(state.view,{query:'',topic:'For you'});return;}
 if(a==='sort'){openDialog('Find your next poll',`<div class="classic-options">${[['recommended','Recommended for you'],['quick','Quickest to answer'],['reward','Highest reward']].map(([v,l])=>`<button class="classic-choice" data-action="sort-pick" data-sort="${v}" aria-pressed="${state.sort===v}">${mark(state.sort===v)}${l}</button>`).join('')}</div>`);return;}
 if(a==='sort-pick'){closeDialog();route(state.view,{sort:el.dataset.sort});return;}
 if(a==='preview-rank'){const opts=state.editor.options,order=Array.isArray(state.previewAnswers.ranking)?[...state.previewAnswers.ranking]:opts.map((_,i)=>i),i=Number(el.dataset.index),j=i+Number(el.dataset.direction);if(j<0||j>=order.length)return;[order[i],order[j]]=[order[j],order[i]];state.previewAnswers.ranking=order;if(dialog.open)dialog.querySelector('.dialog-body').innerHTML=editorPreview();else refreshEditorPreview();dialog.querySelector(`[data-action=preview-rank][data-index="${j}"]:not(:disabled)`)?.focus({preventScroll:true});return;}
 if(a==='preview-confirm-rank'){toast('Preview order selected.');return;}
 if(a==='rank'){const order=Array.isArray(state.answers[p.id])?[...state.answers[p.id]]:p.options.map((_,i)=>i);const i=Number(el.dataset.index),j=i+Number(el.dataset.direction);if(j<0||j>=order.length)return;[order[i],order[j]]=[order[j],order[i]];state.answers[p.id]=order;refreshStage();document.querySelector(`#poll-${p.id} [data-action=rank][data-index="${j}"]:not(:disabled)`)?.focus({preventScroll:true});return;}
 if(a==='confirm-rank'){state.answers[p.id]??=p.options.map((_,i)=>i);(card||document).querySelector('[data-action="submit"]').disabled=false;toast('Order selected. Submit when you’re ready.');return;}
 if(a==='report'){openDialog('Report this poll',`<p>Help keep this a thoughtful place to participate.</p><fieldset class="classic-options"><legend class="sr-only">Reason for reporting</legend>${['Misleading or inaccurate','Harmful or offensive','Spam or repetitive','Unlabelled AI content','Something else'].map((l,i)=>`<label class="classic-choice"><input type="radio" name="report-reason" value="${i}" style="accent-color:var(--accent);width:20px;height:20px">${l}</label>`).join('')}</fieldset>`,`${button('Cancel','close-dialog')}${button('Send report','send-report','primary','disabled')}`);return;}
 if(a==='send-report'){closeDialog();toast('Sample report received. Thank you for looking out for the community.');return;}
 if(a==='close-dialog'){closeDialog();return;}
 if(a==='interests'||a==='profile'){route('settings',{settings:a==='profile'?'profile':'interests'});return;}
 if(a==='discover'){route('discover');return;}
 if(a==='new-poll'){state.editor=editorDefaults();route('create');return;}
 if(a==='polls-tab'){route('polls',{tab:el.dataset.tab});return;}
 if(a==='settings-section'){route('settings',{settings:el.dataset.section});return;}
 if(a==='theme'){state.theme=el.dataset.theme;render();return;}
 if(a==='motion'){state.motion=!state.motion;document.documentElement.style.setProperty('--motion',state.motion?'1':'0');document.documentElement.dataset.motion=String(state.motion);render();return;}
 if(a==='interest'||a==='format-pref'){const set=a==='interest'?state.interests:state.allowed;const v=a==='interest'?el.dataset.topic:el.dataset.format;if(set.has(v)&&set.size===1){toast('Keep at least one selected.');return;}set.has(v)?set.delete(v):set.add(v);render();return;}
 if(a==='ai-pref'){state.ai=el.dataset.pref;render();return;}
 if(a==='save-preferences'){state.appliedInterests=new Set(state.interests);state.appliedFormats=new Set(state.allowed);state.appliedAI=state.ai;toast('Preferences saved for this preview.');return;}
 if(a==='save-tagline'){state.tagline=document.querySelector('#tagline').value;toast('Your tagline is updated for this preview.');return;}
 if(a==='redeem'){openDialog('Redeem your points',`<span class="badge">${state.points.toLocaleString()} points available</span><h3>A little thank-you for your time.</h3><p style="margin-top:12px">Cash-out options will appear here when payments are connected. This preview won’t move money.</p><div class="card soft"><div class="row between"><span>Sample redemption</span><strong>2,000 pts</strong></div></div>`,`${button('Close','close-dialog')}${button('Preview redemption','sample-redeem','primary')}`);return;}
 if(a==='sample-redeem'){openDialog('Redemption preview',empty('You made your time count.','In the live app, you’ll track the status of your cash-out here. No points were deducted.','','','rewards'),button('Done','close-dialog','primary'));return;}
 if(a==='credits'){openDialog('Add publishing credits',`<p>Choose a sample pack. Checkout is simulated.</p><div class="classic-options">${[500,1500,5000].map((n,i)=>`<button class="classic-choice" data-action="credit-pack" data-credits="${n}" aria-pressed="${i===1}">${mark(i===1)}${n.toLocaleString()} credits</button>`).join('')}</div>`,button('Preview checkout','sample-credits','primary'));return;}
 if(a==='credit-pack'){dialog.querySelectorAll('[data-action="credit-pack"]').forEach(b=>{const yes=b===el;b.setAttribute('aria-pressed',String(yes));b.querySelector('.choice-mark').innerHTML=icon(yes?'check-circle-bold':'circle-linear');});return;}
 if(a==='sample-credits'){closeDialog();toast('Checkout preview complete. No charge or balance change.');return;}
 if(a==='publisher-results'){const created=state.published.find(x=>x.id===el.dataset.id);if(created){openDialog('Poll results',empty('Your question is ready','Responses will appear here when people answer. This sample has no responses yet.','','','empty-polls'),button('Done','close-dialog','primary'));return;}openDialog('Poll results',`<span class="badge">48 of 100 responses · Sample data</span><h3>The canvas tote is the early favourite.</h3><p style="margin-top:12px">Participants lean toward its simplicity and everyday usefulness. These are illustrative insights, not live AI analysis.</p><div class="result-option"><div class="result-label"><span>Canvas tote</span><strong>64%</strong></div><div class="bar-track"><div class="bar-fill" style="width:64%"></div></div></div><div class="result-option"><div class="result-label"><span>Daily bag</span><strong>36%</strong></div><div class="bar-track"><div class="bar-fill" style="width:36%"></div></div></div>`,button('Done','close-dialog','primary'));return;}
 if(a==='editor-format'){state.audienceOpen=document.querySelector('.audience-details')?.open||false;const type=el.dataset.format;state.editor.type=type;state.previewAnswers={};state.editor.options=type==='ranking'?['Time outdoors','A good meal','A creative project']:['image','ab'].includes(type)?['Canvas tote','Daily bag']:['Yes, absolutely','Maybe, with a few changes','Not for me'];state.editor.seconds=type==='audio'||type==='video'?40:20;render();return;}
 if(a==='editor-topic'){state.audienceOpen=true;state.editor.topic=el.dataset.topic;render();return;}
 if(a==='add-option'){state.editor.options.push('');render();return;}
 if(a==='remove-option'){state.editor.options.splice(Number(el.dataset.index),1);render();return;}
 if(a==='rephrase'){openDialog('Rephrase question',`<span class="subtle-badge">Sample suggestion · No AI request</span><p style="margin-top:18px">Keep it short, neutral, and easy to answer.</p><div class="card soft"><h3>Which of these would fit your everyday life better?</h3></div>`,`${button('Keep mine','close-dialog')}${button('Use this version','apply-rephrase','primary')}`);return;}
 if(a==='apply-rephrase'){state.editor.title='Which of these would fit your everyday life better?';closeDialog();render();return;}
 if(a==='preview-choice'){state.previewAnswers[state.editor.type]=Number(el.dataset.index);dialog.querySelectorAll('[data-action=preview-choice]').forEach(b=>{const yes=b.dataset.index===el.dataset.index;b.setAttribute('aria-pressed',String(yes));const mark=b.querySelector('.choice-mark');if(mark)mark.innerHTML=icon(yes?'check-circle-bold':'circle-linear');});return;}
 if(a==='preview-editor'){if(!validateEditor())return;openDialog('Respondent preview',editorPreview(),button('Back to editing','close-dialog'));return;}
 if(a==='save-draft'){if(!validateEditor())return;const draft={...structuredClone(state.editor),id:state.editor.id||`draft-${Date.now()}`};state.editor.id=draft.id;const at=state.drafts.findIndex(x=>x.id===draft.id);at<0?state.drafts.push(draft):state.drafts.splice(at,1,draft);toast('Draft saved in this preview. Find it in My polls.');return;}
 if(a==='edit-draft'){const d=state.drafts.find(x=>x.id===el.dataset.id);if(d){state.editor=structuredClone(d);route('create');}return;}
 if(a==='review-poll'){if(!validateEditor())return;openDialog('Review poll',`<span class="badge">${formats[state.editor.type][0]} · ${state.editor.topic}</span><h3>${esc(state.editor.title)}</h3><p style="margin-top:12px">${state.editor.count} responses · About ${state.editor.seconds} seconds per answer</p><div class="budget-summary">${budgetSummary()}</div><p class="prototype-note">This publishes a sample poll inside this preview only. No credits are spent.</p>`,`${button('Keep editing','close-dialog')}${button('Publish sample poll','publish-sample','primary')}`);return;}
 if(a==='publish-sample'){const copy={...structuredClone(state.editor),id:`published-${Date.now()}`};state.published.push(copy);state.drafts=state.drafts.filter(d=>d.id!==state.editor.id);closeDialog();route('polls',{tab:'live'});toast('Your sample poll is live in this preview.');return;}
});
document.addEventListener('input',e=>{
 const t=e.target;
 if(t.id==='workspace-search'){updateCommandResults(t.value);}
 if(t.id==='poll-search'){state.query=t.value;history.replaceState(null,'',routeHash(state));currentHash=location.hash;refreshQueue();const caption=document.querySelector('.search-caption');if(caption)caption.textContent=state.query?matches().length+' matching '+(matches().length===1?'poll':'polls'):'Explore polls';}
 if(t.id==='preview-opinion-scale'){state.previewAnswers.slider=Number(t.value);t.closest('.slider-card').querySelector('.slider-value').textContent=t.value;}
 if(t.id==='opinion-scale'){const card=t.closest('[data-poll-id]');state.poll=card.dataset.pollId;state.answers[state.poll]=Number(t.value);card.querySelector('.slider-value').textContent=polls.find(p=>p.id===state.poll)?.options[Number(t.value)]||t.value;card.querySelector('[data-action="submit"]').disabled=false;}
 if(t.id==='editor-title'){state.editor.title=t.value;const count=document.querySelector('#question-count');if(count)count.textContent=t.value.length+'/180';refreshEditorPreview();}
 if(t.matches('#editor-title,.editor-option'))clearEditorError(t);
 if(t.classList.contains('editor-option')){state.editor.options[Number(t.dataset.index)]=t.value;refreshEditorPreview();}
 if(t.id==='response-count'||t.id==='completion-time'){state.editor[t.id==='response-count'?'count':'seconds']=Number(t.value);document.querySelector('#budget-summary').innerHTML='<p>Updated estimate shown when you review your poll.</p>';refreshEditorPreview();}
});
document.addEventListener('change',e=>{
 const t=e.target;if(t.name==='report-reason'){dialog.querySelector('[data-action="send-report"]').disabled=false;}
 if(t.matches('input[type=file]')&&t.files[0]){const file=t.files[0];if(file.size>25*1024*1024){toast('Choose a file under 25 MB for this preview.');return;}if(t.dataset.image!==undefined){if(!file.type.startsWith('image/')){toast('Choose an image file.');return;}const url=URL.createObjectURL(file);editorFileURLs.push(url);state.editor.images[Number(t.dataset.image)]=url;render();}else{state.editor.mediaName=file.name;const url=URL.createObjectURL(file);editorFileURLs.push(url);state.editor.mediaURL=url;refreshEditorPreview();document.querySelector('#media-filename').textContent=file.name;toast('Media attached locally. Nothing was uploaded.');}}
});
document.addEventListener('toggle',e=>{if(e.target.isConnected&&e.target.matches('details[data-transcript],details[data-reason],.audience-details,details[data-authorship],details[data-targeting]'))rememberDisclosures(app,state);},true);
document.addEventListener('submit',e=>e.preventDefault());
window.addEventListener('beforeunload',()=>editorFileURLs.forEach(url=>URL.revokeObjectURL(url)));
function commandResults(query=''){const q=query.toLowerCase().trim();return [...navLinks,['settings','Settings','settings-linear']].filter(x=>x[1].toLowerCase().includes(q)).map(([v,l,ic])=>`<button class="command-result" data-action="command-nav" data-view="${v}">${icon(ic)}${l}${icon('alt-arrow-right-linear')}</button>`).join('')+polls.filter(p=>p.title.toLowerCase().includes(q)).slice(0,q?7:2).map(p=>`<button class="command-result" data-action="command-poll" data-id="${p.id}">${icon(formats[p.type][1])}${esc(p.title)}</button>`).join('');}
function updateCommandResults(q){const el=dialog.querySelector('#command-results');if(el)el.innerHTML=commandResults(q)||empty('No matching pages or polls','Try another search.','','','discover',true);}
function openSearch(){openDialog('Search your workspace',`<label class="search">${icon('magnifer-linear')}<input id="workspace-search" aria-label="Search pages and polls" placeholder="Find a page or a poll…" autocomplete="off"></label><div class="command-results" id="command-results">${commandResults()}</div>`);dialog.querySelector('input').focus();}
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openSearch();}});

let popoverReturn=null;
function closePopover(restore=true){const pop=document.querySelector('#thread-popover');if(pop){pop.dataset.silent='true';pop.hidePopover();pop.remove();if(restore)popoverReturn?.focus?.();}}
function openPopover(anchor,body,width=240){closePopover(false);popoverReturn=anchor;const pop=document.createElement('div');pop.id='thread-popover';if(width===320)pop.className='appearance-popover';pop.setAttribute('popover','auto');pop.setAttribute('role','menu');pop.setAttribute('aria-label','Options');pop.innerHTML=body;document.body.append(pop);const r=anchor.getBoundingClientRect();pop.style.width=width+'px';pop.showPopover();const h=pop.getBoundingClientRect().height;pop.style.left=Math.min(innerWidth-width-8,Math.max(8,r.left>80?r.right-width:8))+'px';pop.style.top=Math.max(8,Math.min(innerHeight-h-8,r.bottom+1))+'px';pop.addEventListener('toggle',e=>{if(e.newState==='closed'&&pop.dataset.silent!=='true')popoverReturn?.focus?.();});pop.querySelector('button,a')?.focus();pop.addEventListener('keydown',e=>{const items=[...pop.querySelectorAll('button,a')],i=items.indexOf(document.activeElement);if(e.key==='Escape'){e.preventDefault();closePopover();}if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();items[e.key==='Home'?0:e.key==='End'?items.length-1:(i+(e.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();}if(e.key==='Tab')closePopover(false);});}
const menuRow=(label,action,ic='',extra='')=>`<button role="menuitem" class="popover-row" data-action="${action}" ${extra}>${label}${ic?icon(ic):''}</button>`;
function appearanceControl(){return `<div class="appearance-control">${[['light','sun-2-linear','Light'],['dark','moon-linear','Dark'],['system','','Auto']].map(([v,ic,l])=>`<button data-action="theme" data-theme="${v}" aria-label="${l}" aria-pressed="${state.theme===v}">${ic?icon(ic):''}<span class="theme-label">${l}</span></button>`).join('')}</div>`;}
function threadAction(a,el){
 if(a==='search-page'){route('search');document.querySelector('#poll-search')?.focus();return true;}
 if(a==='thread-menu'||a==='menu-main'){openPopover(a==='menu-main'?popoverReturn:el,menuRow('Appearance','menu-appearance','alt-arrow-right-linear')+menuRow('Settings','settings-home','settings-linear')+menuRow('Your polls','my-polls','chart-square-linear')+'<div class="popover-separator"></div>'+menuRow('About Poll Pilled','prototype-info','question-circle-linear'));return true;}
 if(a==='menu-appearance'){openPopover(popoverReturn,`<div class="popover-heading">${ib('arrow-left-linear','Back to menu','menu-main')}<strong>Appearance</strong></div>${appearanceControl()}`,320);return true;}
 if(a==='settings-home'){route('settings',{settings:'menu'});return true;}
 if(a==='my-polls'){route('polls');return true;}
 if(a==='wallet-page'){route('wallet');return true;}
 if(a==='saved-page'){route('saved');return true;}
 if(a==='workspace-tab'){state.rightTab=el.dataset.tab;render();return true;}
 if(a==='feed-tab'){state.feedTab=el.dataset.tab;render();return true;}
 if(a==='column-menu'){openPopover(el,menuRow('Hide this column','toggle-column','widget-2-linear')+menuRow('My polls','my-polls','chart-square-linear')+menuRow('Settings','settings-home','settings-linear'));return true;}
 if(a==='toggle-column'){state.sideColumn=!state.sideColumn;render();return true;}
 if(a==='poll-options'){openPopover(el,menuRow('Open poll','open-poll','alt-arrow-right-linear',`data-id="${state.poll}"`)+(state.completed[state.poll]?menuRow(state.saved.has(state.poll)?'Remove from saved':'Save poll','save-poll','bookmark-linear'):'')+'<div class="popover-separator"></div>'+menuRow('Report poll','report','flag-2-linear'));return true;}
 if(a==='feed-preferences'){openPopover(el,'<div class="popover-caption">Topics</div>'+['For you','Design','Work','Lifestyle'].map(t=>menuRow(t,'topic',state.topic===t?'check-circle-linear':'',`data-topic="${t}"`)).join('')+'<div class="popover-separator"></div>'+menuRow('Sort polls','sort','tuning-2-linear')+menuRow('Your interests','interests','alt-arrow-right-linear')+(state.view==='discover'&&matchMedia('(min-width:1001px)').matches?'<div class="popover-separator"></div>'+menuRow(state.sideColumn?'Hide workspace':'Show workspace','toggle-column','widget-2-linear'):''));return true;}
 if(a==='prototype-info'){openDialog('About Poll Pilled','<p>Explore Poll Pilled with sample polls, rewards, and publishing credits.</p><p>Answers and drafts stay in memory for this preview. No payments, AI requests, or external submissions are made.</p>',button('Got it','close-dialog','primary'));return true;}
 return false;
}

const connected=createConnected({state,polls,formats,render,context,route,readHash,toast,openDialog,closeDialog,dialog,esc,button,icon,ib,empty,threadSingle,refreshStage,refreshEditorPreview,editorDefaults});
installMediaLoading(app);installMediaLoading(dialog);
readHash();
connected.start();

// Arrow-key tab selection follows the same route and render paths as clicks.
// Refocus the replacement node after render so keyboard navigation stays in place.
document.addEventListener('keydown',event=>{
 const tab=event.target.closest('[role=tab]'),list=tab?.closest('[role=tablist]');
 if(!list||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
 const tabs=[...list.querySelectorAll('[role=tab]:not(:disabled)')],index=tabs.indexOf(tab);
 const next=tabs[event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length];
 event.preventDefault();const id=next.id;next.click();document.getElementById(id)?.focus({preventScroll:true});
});
