import {beginActivity,loadingRegion,installMediaLoading,rememberAppearance} from './loading.js';
import {personalTagline} from './copy.js';
import './threads.css';
import './signin.css';
import './onboarding.css';
import {logo} from './brand.js';
import {welcomeArtwork} from './welcomeArtwork.js';
import {icon} from './icons.js';
import {selectControl} from './controls.js';
import {liveRequest,configureSession} from '../api.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const topics=[['everyday','Everyday life','sun-2-linear'],['design','Design','gallery-linear'],['technology','Technology','widget-2-linear'],['food','Food & culture','heart-linear'],['work','Work','card-linear'],['travel','Travel','compass-linear'],['entertainment','Entertainment','play-bold'],['wellbeing','Wellbeing','heart-linear']];
const formats=[['classic','Quick choices','checklist-minimalistic-linear'],['visual','Image picks','gallery-linear'],['ab','A/B tests','layers-minimalistic-linear'],['audio','Audio polls','headphones-round-linear'],['video','Video polls','videocamera-record-linear'],['slider','Sliders','tuning-2-linear'],['rank','Rankings','list-linear'],['pairwise','Head to head','transfer-horizontal-linear'],['allocation','Point allocation','chart-square-linear'],['regions','Image regions','gallery-linear']];
const aiKinds=[['generated_polls','AI-created questions'],['generated_images','AI images'],['generated_audio','AI voices'],['generated_video','AI videos']];
const artworkScenes=['signin','interests','formats','identity'];
const steps=[['Your space','How would you like to start?','Take a poll, ask a question, or do a little of both.'],['Your interests','What are you curious about?','Pick a few topics. We’ll use them to shape your feed.'],['Your feed','Your choice of polls.','Choose the formats and content you want to see.'],['Your identity','Meet your public self.','An anonymous name. A perspective that’s entirely yours.']];
export function mountOnboarding(root,{initial=()=>fetch('/api/community/onboarding',{credentials:'same-origin',cache:'no-store'}),request=liveRequest,configure=configureSession,navigate=url=>location.assign(url)}={}){
 let step=0,pref={},identity={},busy=false,loaded=false,loading=false;
 root.classList.add('welcome-layout');
 const $=q=>root.querySelector(q);
 const stopMedia=installMediaLoading(root);window.addEventListener('pagehide',stopMedia,{once:true});
 function message(text,error=false){const s=$('#welcome-status');if(!s)return;s.textContent=text;s.dataset.error=String(error);s.setAttribute('role',error?'alert':'status');}
 const check=selected=>`<span class="welcome-check">${icon(selected?'check-circle-bold':'circle-linear')}</span>`;
 function content(){
  if(step===0)return `<div class="welcome-intents" role="group" aria-label="How you want to use Poll Pilled">${[['answer','Take polls','Share your perspective. Unlock the results.','checklist-minimalistic-linear'],['create','Create polls','Find out what people really think.','chart-square-linear'],['both','A little of both','Explore and ask whenever inspiration strikes.','stars-linear']].map(([id,label,note,ic])=>`<button type="button" class="welcome-option intent-option" data-choice="intent" data-value="${id}" aria-pressed="${pref.intent===id}"><span class="welcome-option-icon">${icon(ic)}</span><span><strong>${label}</strong><small>${note}</small></span>${check(pref.intent===id)}</button>`).join('')}</div><p class="welcome-note">Everyone can answer and create. This just chooses where you start.</p>`;
  if(step===1)return `<fieldset><legend class="sr-only">Topics you enjoy</legend><div class="welcome-topics">${topics.map(([id,label,ic])=>`<button type="button" class="welcome-option" data-choice="interests" data-value="${id}" aria-pressed="${pref.interests.includes(id)}">${icon(ic)}<strong>${label}</strong>${check(pref.interests.includes(id))}</button>`).join('')}</div></fieldset><div class="welcome-language">${selectControl({id:'welcome-language',label:'Poll language',value:pref.languages[0],options:['English','Hindi','Tamil','Spanish']})}<p class="welcome-note">App controls are currently in English.</p></div>`;
  if(step===2)return `<fieldset><legend>Ways to answer</legend><div class="welcome-formats">${formats.map(([id,label,ic])=>`<button type="button" class="welcome-option" data-choice="formats" data-value="${id}" aria-pressed="${pref.formats.includes(id)}">${icon(ic)}<strong>${label}</strong>${check(pref.formats.includes(id))}</button>`).join('')}</div></fieldset><fieldset class="welcome-ai"><legend>Include AI-generated content</legend><p class="welcome-note">Human-created polls are always included. Lightly rephrased human text stays human.</p>${aiKinds.map(([id,label])=>`<label class="welcome-toggle"><span>${label}</span><input type="checkbox" data-pref="${id}" ${pref[id]!==false?'checked':''}><span class="welcome-switch" aria-hidden="true"></span></label>`).join('')}</fieldset>`;
  return `<div class="welcome-identity"><img src="/assets/avatar-${esc(pref.avatar)}.png" alt="" width="64" height="64"><div><small>Your anonymous name</small><h2>${esc(identity.author)}</h2><p>Assigned once. Yours to keep.</p></div></div><fieldset><legend>Choose your avatar</legend><div class="welcome-avatars">${['otter','orbit','river','willow'].map(id=>`<button type="button" data-choice="avatar" data-value="${id}" aria-label="${id} avatar" aria-pressed="${pref.avatar===id}"><img src="/assets/avatar-${id}.png" alt="" width="48" height="48">${check(pref.avatar===id)}</button>`).join('')}</div></fieldset><label class="welcome-field"><span class="field-label">Tagline (optional)</span><input class="field" id="welcome-tagline" maxlength="70" value="${esc(pref.tagline)}" aria-describedby="tagline-help"><small id="tagline-help">A short introduction, without your real name or email.</small></label><label class="welcome-toggle"><span>New-poll notifications<small>In-app alerts from people you follow.</small></span><input type="checkbox" data-pref="notifications" ${pref.notifications?'checked':''}><span class="welcome-switch" aria-hidden="true"></span></label><div class="welcome-privacy">${icon('shield-check-linear')}<p>Your email stays private. Your anonymous name and tagline appear with your polls. Polls and answers are collected for research and platform improvement.</p></div>`;
 }
 function render(focus=true){
  if(!loaded)return;
  document.documentElement.dataset.theme=pref.theme==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):pref.theme||'light';
  document.documentElement.dataset.motion=String(pref.motion!==false);rememberAppearance(pref.theme||'light',pref.motion!==false);
  document.title=`${steps[step][0]} · Poll Pilled`;
  root.innerHTML=`<header class="welcome-top"><a class="auth-brand" href="/">${logo()}<span>Poll Pilled</span></a><a class="welcome-exit" href="/sign-in" data-welcome="signout">Sign out</a></header><div class="welcome-shell"><aside class="welcome-sidebar"><p class="welcome-eyebrow">MAKE YOURSELF AT HOME</p><h2>A space for<br>your perspective.</h2>${welcomeArtwork(artworkScenes[step],'welcome-sidebar-art')}<ol class="welcome-steps">${steps.map(([label],i)=>`<li ${step===i?'aria-current="step"':''} class="${i<step?'done':''}"><span>${i<step?icon('check-linear'):i+1}</span><strong>${label}</strong></li>`).join('')}</ol><p>You can change these preferences<br>in Settings anytime.</p></aside><section class="welcome-card" aria-labelledby="welcome-title"><div class="welcome-progress" role="progressbar" aria-label="Setup progress" aria-valuemin="1" aria-valuemax="4" aria-valuenow="${step+1}">${steps.map((_,i)=>`<span class="${i<=step?'complete':''}"></span>`).join('')}</div><div class="welcome-step-heading"><span class="welcome-step-label">Step ${step+1} of 4</span>${welcomeArtwork(artworkScenes[step],'welcome-mobile-art')}</div><h1 id="welcome-title" tabindex="-1">${steps[step][1]}</h1><p class="welcome-intro">${steps[step][2]}</p><form id="welcome-form"><div class="welcome-body">${content()}</div><p id="welcome-status" role="status" aria-live="polite"></p><footer class="welcome-actions">${step?'<button type="button" class="btn" data-welcome="back">Back</button>':'<span></span>'}<button type="submit" class="btn primary">${step===3?(pref.intent==='create'?'Create my first poll':'Find my first poll'):'Continue'}${icon('arrow-right-linear')}</button></footer></form><button class="welcome-later" type="button" data-welcome="skip">I’ll personalize this later</button></section></div>`;
  if(focus)$('#welcome-title').focus({preventScroll:true});
 }
 function syncURL(){history.replaceState(null,'',`/welcome#step-${step+1}`);}
 async function save(action='save'){
  if(busy)return;busy=true;const finish=beginActivity(action==='skip'?$('.welcome-later'):$('.welcome-actions button[type=submit]'),'Saving your preferences…');message('Saving your preferences…');$('#welcome-form').setAttribute('aria-busy','true');root.querySelectorAll('button,input').forEach(x=>x.disabled=true);
  try{
   const keys=[['intent'],['interests','languages'],['formats',...aiKinds.map(([k])=>k)],['avatar','tagline','notifications']][step];
   const preferences=Object.fromEntries(keys.map(k=>[k,pref[k]]));
   const result=await request('/api/community/onboarding',{action,step,preferences});
   if(action==='skip'||action==='complete'){navigate(result.redirect);return;}
   // A full server snapshot must not erase unsaved choices from later steps after Back.
   for(const key of keys)if(result.preferences?.[key]!==undefined)pref[key]=result.preferences[key];
   step=Math.min(3,step+1);syncURL();render();
  }catch(e){message(e.message,true);}finally{busy=false;$('#welcome-form')?.removeAttribute('aria-busy');root.querySelectorAll('button,input').forEach(x=>x.disabled=false);finish();}
 }
 root.addEventListener('submit',e=>{if(e.target.id!=='welcome-form')return;e.preventDefault();
  if(step===0&&!pref.intent){message('Choose how you’d like to start.',true);return;}
  if(step===1&&!pref.interests.length){message('Choose at least one topic.',true);return;}
  if(step===2&&!pref.formats.length){message('Choose at least one way to answer.',true);return;}
  save(step===3?'complete':'save');
 });
 root.addEventListener('click',e=>{const t=e.target.closest('[data-choice],[data-welcome]');if(!t)return;e.preventDefault();if(busy)return;
  if(t.dataset.choice){const {choice:k,value:v}=t.dataset;if(Array.isArray(pref[k]))pref[k]=pref[k].includes(v)?pref[k].filter(i=>i!==v):[...pref[k],v];else pref[k]=v;render(false);root.querySelector(`[data-choice="${k}"][data-value="${v}"]`)?.focus({preventScroll:true});return;}
  if(t.dataset.welcome==='back'){step=Math.max(0,step-1);syncURL();render();return;}
  if(t.dataset.welcome==='skip'){save('skip');return;}
  if(t.dataset.welcome==='retry'){load();return;}
  if(t.dataset.welcome==='signout'){busy=true;request('/api/auth/logout',{}).then(r=>navigate(r.redirect)).catch(e=>message(e.message,true)).finally(()=>busy=false);}
 });
 root.addEventListener('change',e=>{const t=e.target;if(t.dataset.pref)pref[t.dataset.pref]=t.checked;if(t.id==='welcome-language')pref.languages=[t.value];});
 root.addEventListener('input',e=>{if(e.target.id==='welcome-tagline')pref.tagline=e.target.value;});
 async function load(){
  if(loading)return;loading=true;root.innerHTML=`<section class="welcome-loading">${loadingRegion('Preparing your space…','form')}</section>`;
  try{
   const response=await initial();
   if(response.status===401){navigate('/sign-in');return;}
   const data=await response.json();if(!response.ok)throw Error(data.error||'Your setup could not be loaded. Try again.');
   configure(data);identity=data.identity;pref={...data.preferences,tagline:personalTagline(data.preferences.tagline)};if(pref.generated_media===false)for(const k of ['generated_images','generated_audio','generated_video'])pref[k]=false;
   if(data.onboarding.complete){navigate(pref.intent==='create'?'/#create':'/#discover');return;}
   step=Math.max(0,Math.min(3,data.onboarding.step||0));loaded=true;syncURL();render();
  }catch(e){root.innerHTML=`<section class="welcome-card welcome-load-error"><h1>Let’s try that again.</h1><p role="alert">${esc(e.message)}</p><button class="btn primary" data-welcome="retry">Try again</button><a class="btn" href="/sign-in">Back to sign in</a></section>`;}finally{loading=false;}
 }
 load();
}
if(document.querySelector('#onboarding-app'))mountOnboarding(document.querySelector('#onboarding-app'));
