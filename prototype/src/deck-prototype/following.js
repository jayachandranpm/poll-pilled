import {personalTagline} from './copy.js';
import './following.css';

export const reactionOptions=[['Love it','relatable','love'],['Interesting','helpful','interesting'],['Surprising','surprising','surprise']];
export function reactionCards(p,state,esc){
 return `<div class="poll-reactions" role="group" aria-label="React to the results">${reactionOptions.map(([label,key,art])=>{
  const selected=state.reaction[p.id]===label,count=p.reactions?.[key]||0;
  return `<button type="button" class="poll-reaction" title="${label}" data-action="react" data-id="${esc(p.id)}" data-reaction="${label}" aria-pressed="${selected}" aria-label="${label}, ${count} ${count===1?'reaction':'reactions'}"><span class="reaction-art reaction-art-${art}" aria-hidden="true"></span><span class="reaction-label">${label}</span><span class="reaction-count">${count}<span class="reaction-check" aria-hidden="true">${selected?'✓':''}</span></span></button>`;
 }).join('')}</div>`;
}

export function createFollowing(c){
 const {state,polls,community,refresh,formDialog,closeDialog,dialog,render,route,button,icon,esc,toast,empty}=c;
 const actions=new Set(['publisher-profile','follow-publisher','publisher-alerts','manage-following','notifications','notification-open','read-notifications','publication-open','feed-tab','find-publishers']);
 let profile=null,timer=null,inflight=false,started=false,viewVersion=0;
 window.addEventListener('poll-navigation',()=>{viewVersion++;});
 dialog.addEventListener('close',()=>{viewVersion++;});
 dialog.addEventListener('poll-dialog-replace',()=>{viewVersion++;});
 const unread=()=>state.preferences?.notifications===false?0:(state.notifications||[]).filter(n=>!n.read).length;
 function updateBadges(){
  const count=unread();
  document.querySelectorAll('[data-notification-badge]').forEach(el=>{el.textContent=count>99?'99+':String(count);el.hidden=!count;});
  document.querySelectorAll('[data-action=notifications]').forEach(el=>el.setAttribute('aria-label',count?`Notifications, ${count} unread`:'Notifications'));
 }
 async function loadNotices(){const data=await community('/notifications');state.notifications=data.notifications;if(typeof data.enabled==='boolean')state.preferences={...state.preferences,notifications:data.enabled};updateBadges();}
 function schedule(){clearTimeout(timer);if(started&&!document.hidden)timer=setTimeout(tick,30000);}
 async function tick(){
  if(inflight||document.hidden||c.isBusy?.()){schedule();return;}
  inflight=true;try{await loadNotices();}catch{/* Keep the current inbox; foreground actions show actionable errors. */}finally{inflight=false;schedule();}
 }
 function start(){if(started)return;started=true;updateBadges();schedule();}
 function stop(){started=false;clearTimeout(timer);}
 document.addEventListener('visibilitychange',()=>{clearTimeout(timer);if(started&&!document.hidden)void tick();});
 window.addEventListener('pagehide',stop);
 window.addEventListener('pageshow',e=>{if(e.persisted)start();});

 const profileActions=p=>p.mine?'':`<div class="publisher-actions">${button(p.following?'Following':'Follow publisher','follow-publisher',p.following?'':'primary',`data-id="${esc(p.identity.id)}" data-following="${p.following}" data-profile="true" aria-pressed="${p.following}"`)}${p.following?`<button class="btn" data-action="publisher-alerts" data-id="${esc(p.identity.id)}" aria-pressed="${p.notify_new_polls}">${icon('bell-linear','sm')}${p.notify_new_polls?'Alerts on':'Alerts off'}</button>`:''}</div>`;
 function renderProfile(p){
  profile=p;
  formDialog('Publisher',`<section class="publisher-summary"><img src="/assets/avatar-${esc(p.identity.avatar)}.png" alt="" width="64" height="64"><div><h2>${esc(p.identity.author)}</h2>${personalTagline(p.identity.tagline)?`<p>${esc(personalTagline(p.identity.tagline))}</p>`:''}<small>Anonymous identity</small></div></section>${profileActions(p)}${p.following?'<p class="format-note">New matching polls appear in your inbox when alerts are on.</p>':''}<div class="publisher-polls"><h3>Open polls</h3>${p.polls.length?p.polls.map(poll=>`<button class="publisher-poll-link" data-action="publication-open" data-id="${esc(poll.id)}"><span><strong>${esc(poll.title)}</strong><small>${poll.seconds} sec · +${poll.reward} points</small></span>${icon('arrow-right-linear','sm')}</button>`).join(''):empty('A little quiet here','New polls will appear here.','','','drafts',true)}</div>`,button('Done','close-dialog'));
 }
 async function showProfile(id){const version=++viewVersion,p=await community('/people/'+encodeURIComponent(id));if(version===viewVersion)renderProfile(p);}
 async function openPoll(id){
  const version=viewVersion;await refresh();if(version!==viewVersion)return;const p=polls.find(p=>p.id===id);
  if(!p||p.removed)throw new Error('This poll is no longer available.');
  closeDialog();state.topic='For you';state.query='';route('discover',{poll:id,mobileAnswer:true});
  document.querySelector('.thread-question')?.focus({preventScroll:true});
 }
 function renderInbox(){
  const notices=state.notifications||[],unreadCount=notices.filter(n=>!n.read).length;
  formDialog('Notifications',`<div class="inbox-heading"><span>${unreadCount?unreadCount+' unread':'You’re up to date'}</span>${button('Following','manage-following','small')}</div>${notices.length?`<div class="inbox-list">${notices.map(n=>`<button class="inbox-notice ${n.read?'':'is-unread'}" data-action="notification-open" data-id="${esc(n.id)}">${n.avatar?`<img src="/assets/avatar-${esc(n.avatar)}.png" alt="" width="36" height="36">`:`<span class="inbox-icon">${icon(n.kind==='publication'?'checklist-minimalistic-linear':'bell-linear')}</span>`}<span class="inbox-copy"><strong>${esc(n.title)}</strong><span>${esc(n.detail)}</span><time datetime="${esc(n.created_at)}">${esc(new Date(n.created_at).toLocaleDateString(undefined,{month:'short',day:'numeric'}))}</time></span>${n.read?'':'<span class="notice-dot" aria-label="Unread"></span>'}</button>`).join('')}</div>`:empty('You’re all caught up','Follow publishers to hear about their next poll.','Find polls','find-publishers','notifications')}`,unreadCount?button('Mark all read','read-notifications'):'');
 }
 function renderFollowing(){
  const people=state.following||[];
  formDialog('Following',people.length?`<div class="following-list">${people.map(p=>`<div class="following-row"><button class="following-person" data-action="publisher-profile" data-id="${esc(p.identity.id)}"><img src="/assets/avatar-${esc(p.identity.avatar)}.png" alt="" width="40" height="40"><span><strong>${esc(p.identity.author)}</strong>${personalTagline(p.identity.tagline)?`<small>${esc(personalTagline(p.identity.tagline))}</small>`:''}</span></button><button class="icon-btn" data-action="publisher-alerts" data-id="${esc(p.identity.id)}" data-list="true" aria-label="${p.notify_new_polls?'Mute':'Enable'} new-poll alerts for ${esc(p.identity.author)}" aria-pressed="${p.notify_new_polls}">${icon('bell-linear')}</button></div>`).join('')}</div>`:empty('Find your kind of curious','Follow a publisher from one of their polls.','Explore polls','find-publishers','following'),button('Done','close-dialog'));
 }
 async function action(el){
  const {action:a,id}=el.dataset,version=viewVersion;
  if(a==='publisher-profile')return showProfile(id);
  if(a==='follow-publisher'){
   const following=el.dataset.following!=='true';await community('/people/'+encodeURIComponent(id)+'/follow',{following,notify:true});await refresh();updateBadges();if(version!==viewVersion)return;render();
   toast(following?'Following. New-poll alerts are on.':'Publisher unfollowed.');
   if(el.dataset.profile==='true'&&dialog.open)return showProfile(id);
   document.querySelector(`[data-action="follow-publisher"][data-id="${id}"]`)?.focus({preventScroll:true});return;
  }
  if(a==='publisher-alerts'){
   const current=(state.following||[]).find(p=>p.identity.id===id)||(profile?.identity.id===id?profile:null);
   if(!current?.following)throw new Error('Follow this publisher before enabling alerts.');
   const notify=!current.notify_new_polls;await community('/people/'+encodeURIComponent(id)+'/alerts',{notify});await refresh();updateBadges();if(version!==viewVersion)return;
   toast(notify?'New-poll alerts are on.':'New-poll alerts muted.');
   if(el.dataset.list==='true')renderFollowing();else await showProfile(id);return;
  }
  if(a==='manage-following'){const version=++viewVersion;await refresh();if(version===viewVersion)renderFollowing();return;}
  if(a==='notifications'){const version=++viewVersion;await loadNotices();if(version===viewVersion)renderInbox();return;}
  if(a==='read-notifications'){
   const version=viewVersion,ids=(state.notifications||[]).filter(n=>!n.read).map(n=>n.id);if(ids.length)await community('/notifications/read',{ids});await loadNotices();if(version===viewVersion)renderInbox();return;
  }
  if(a==='notification-open'){
   const n=state.notifications.find(n=>n.id===id);if(!n)return;
   await community('/notifications/read',{ids:[id]});n.read=true;updateBadges();if(version!==viewVersion)return;
   if(n.poll_id)return openPoll(n.poll_id);closeDialog();route(n.target);return;
  }
  if(a==='publication-open')return openPoll(id);
  if(a==='feed-tab'){await refresh();if(version!==viewVersion)return;route('discover',{feedTab:el.dataset.tab==='following'?'following':'foryou',topic:'For you',query:'',sort:'recommended'});document.querySelector(`[data-action="feed-tab"][data-tab="${state.feedTab}"]`)?.focus({preventScroll:true});return;}
  if(a==='find-publishers'){await refresh();if(version!==viewVersion)return;closeDialog();state.feedTab='foryou';state.topic='For you';state.query='';route('discover');}
 }
 return {handles:a=>actions.has(a),action,start,stop,updateBadges};
}
