/* Discord-inspired mobile shell, sharing the real Flask-backed poll flows. */
'use strict';
const mobileTopicIcons={'Tech & AI':['stars-linear','lilac'],'Work & life':['sun-2-linear','peach'],'Culture':['chat-round-line-linear','rose'],'Design':['widget-2-linear','blue'],'Food & drink':['heart-linear','mint']};
let mobileSearchTimer;
function mobileRow(p){
  const r=p.reward,detail=`${formatNumber(p.total_votes)} votes · ${p.takes_count} ${p.takes_count===1?'reply':'replies'}`;
  return `<button class="mobile-poll-row" data-open="${escapeHTML(p.id)}">${avatar(p.initials,p.color)}<span class="mobile-poll-copy"><strong>${escapeHTML(p.title)}</strong><span>${p.mode==='voice'?icon('microphone-3-linear'):p.mode==='image'?icon('gallery-linear'):''}${escapeHTML(detail)} · ${p.estimated_seconds}s${p.ai_generated?' · AI':''}</span></span><span class="mobile-poll-reward${r?.earned?' earned':''}">${r?.earned?icon('check-linear')+'<span class="sr-only">Reward earned</span>':r?.eligible?'+'+r.points:icon('alt-arrow-right-linear')}<small>${r?.eligible&&!r?.earned?'pts':''}</small></span></button>`;
}
function renderMobileFeed(){
  const list=$('#mobile-poll-list');if(!list)return;
  list.innerHTML=state.polls.length?state.polls.map(mobileRow).join(''):emptyState();
  list.setAttribute('aria-label',state.q?`Polls matching ${state.q}`:'Poll conversations');
  $('#mobile-result-label').textContent=state.q?`${state.polls.length} ${state.polls.length===1?'result':'results'} for “${state.q}”`:state.category!=='All topics'?state.category:state.view==='lounge'?'Voice conversations':state.view==='saved'?'Saved polls':state.view==='mine'?'Your polls':state.view==='voted'?'Your votes':'Conversations';
}
function renderMobileChrome(){
  if(!state.icons['home-smile-linear'])return;
  const rail=$('#mobile-rail');if(!rail)return;
  const main=state.view,room=!!state.room||state.modal==='room',settings=main==='settings';
  if(!rail.children.length){rail.innerHTML=`<button class="mobile-rail-item rail-home" data-view="explore" aria-label="All polls" title="All polls">${icon('chat-round-line-linear')}</button><span class="mobile-rail-divider"></span>${Object.entries(mobileTopicIcons).map(([topic,[ico,color]])=>`<button class="mobile-rail-item rail-${color}" data-topic="${escapeHTML(topic)}" aria-label="${escapeHTML(topic)} polls" title="${escapeHTML(topic)}">${icon(ico)}<small>${escapeHTML({'Tech & AI':'Tech','Work & life':'Life','Food & drink':'Food'}[topic]||topic)}</small></button>`).join('')}<span class="mobile-rail-divider"></span><button class="mobile-rail-item" data-view="wallet" aria-label="My rewards" title="My rewards">${icon('wallet-money-linear')}</button><button class="mobile-rail-item" data-view="publisher" aria-label="Publisher studio" title="Publisher studio">${icon('target-linear')}</button><button class="mobile-rail-item rail-add" data-action="create" aria-label="Create a poll" title="Create a poll">${icon('add-linear')}</button>`;}
  $$('button',rail).forEach(b=>{const active=b.dataset.topic?['explore','lounge'].includes(main)&&b.dataset.topic===state.category:b.dataset.view==='explore'?['explore','lounge','saved','voted','mine'].includes(main)&&state.category==='All topics':(b.dataset.view===main||(main==='credits'&&b.dataset.view==='publisher')); b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  const heading=room?'Perspectives':settings?(settingsPages.find(p=>p[1]===state.settingsSection)?.[2]||'Settings'):({wallet:'My rewards',publisher:'Publisher studio',credits:'Credits',lounge:'Voice lounge',saved:'Saved polls',mine:'My polls',voted:'My votes'}[main]||(state.category==='All topics'?'Polls':state.category));
  $('#mobile-page-title').textContent=heading;
  $('#mobile-back').hidden=!room&&!settings;
  $('#mobile-actions').hidden=room||settings||['wallet','publisher','credits'].includes(main);
  $('#mobile-room-reply').hidden=!room;
  if(room||settings||['wallet','publisher','credits'].includes(main))$('#mobile-search-box').hidden=true;
  $('#mobile-search-toggle').setAttribute('aria-expanded',String(!$('#mobile-search-box').hidden));
  $('#mobile-profile-name').textContent=state.profile.anonymous_name||state.profile.name||'Your profile';
  $('#mobile-profile-avatar').innerHTML=avatar(initials(state.profile.anonymous_name||state.profile.name||'You'),'blue');
  const publishing=state.workspace==='publisher',unit=publishing?'credits':'points',balance=publishing?state.market?.credits:state.market?.points;
  $('#mobile-profile-subtitle').textContent=`${formatNumber(balance||0)} ${unit} · Demo`;
  $('#mobile-wallet-value').textContent=formatNumber(balance||0);
  $('.mobile-profile-wallet').dataset.view=publishing?'credits':'wallet';
  $('.mobile-profile-wallet').setAttribute('aria-label',publishing?'Publisher credits':'My rewards');
  $$('.mobile-channel-shortcut').forEach(b=>{const active=b.dataset.view===main; b.setAttribute('aria-pressed',String(active));});
  const blocking=!!state.modal&&state.modal!=='room';
  rail.inert=blocking;$('#mobile-profile-bar').inert=blocking;
  $('#mobile-profile-bar').hidden=blocking;
  document.body.classList.toggle('mobile-dialog-open',blocking);
}
function openMobileProfile(){
  const m=state.market||{},p=state.profile;
  modal(`<div class="mobile-profile-summary">${avatar(initials(p.anonymous_name||p.name),'blue')}<h2 id="modal-title">${escapeHTML(p.anonymous_name||p.name)}</h2>${p.bio?`<p>${escapeHTML(p.bio)}</p>`:''}<span>${formatNumber(m.points||0)} points · Local demo</span></div><div class="mobile-profile-links"><button data-view="voted">${icon('check-circle-linear')}My votes<span>${state.stats.votes||0}</span>${icon('alt-arrow-right-linear')}</button><button data-view="saved">${icon('bookmark-linear')}Saved polls<span>${state.stats.saved||0}</span>${icon('alt-arrow-right-linear')}</button><button data-view="mine">${icon('chart-square-linear')}My polls<span>${state.stats.polls||0}</span>${icon('alt-arrow-right-linear')}</button><button data-view="publisher">${icon('target-linear')}Publisher studio${icon('alt-arrow-right-linear')}</button><button data-mobile-setting="profile">${icon('users-group-rounded-linear')}Edit profile${icon('alt-arrow-right-linear')}</button><button data-mobile-setting="appearance">${icon('sun-2-linear')}Appearance${icon('alt-arrow-right-linear')}</button><button data-mobile-setting="interests">${icon('heart-linear')}Interests${icon('alt-arrow-right-linear')}</button><button data-mobile-setting="ai">${icon('stars-linear')}AI studio${icon('alt-arrow-right-linear')}</button><button data-mobile-setting="privacy">${icon('shield-check-linear')}Data & privacy${icon('alt-arrow-right-linear')}</button><button data-action="help">${icon('question-circle-linear')}Help${icon('alt-arrow-right-linear')}</button></div>`,{type:'mobile-profile'});
}
const mobileFeedBase=renderFeed;
renderFeed=function(){mobileFeedBase();renderMobileFeed();renderMobileChrome();};
const mobileMarketBase=marketUpdated;
marketUpdated=function(){mobileMarketBase();renderMobileFeed();renderMobileChrome();};
const mobileViewBase=setView;
setView=function(view){$('#mobile-search-box').hidden=true;mobileViewBase(view);renderMobileChrome();};
const mobileSettingsBase=renderSettings;
renderSettings=function(){mobileSettingsBase();renderMobileChrome();};
const mobileSyncBase=syncNavigation;
syncNavigation=function(){mobileSyncBase();renderMobileChrome();};
const mobileRoomBase=renderRoom;
renderRoom=function(){mobileRoomBase();renderMobileChrome();};
document.addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b)return;
  if(b.dataset.mobileSetting){closeModal();openSettings(b.dataset.mobileSetting);return;}
  const action=b.dataset.mobileAction;
  if(action==='profile')openMobileProfile();
  if(action==='back'){if(state.modal==='room')closeModal();else setView(state.settingsReturn||'explore');renderMobileChrome();}
  if(action==='search'){
    const box=$('#mobile-search-box');box.hidden=!box.hidden;b.setAttribute('aria-expanded',String(!box.hidden));
    if(!box.hidden){$('#mobile-search').value=state.q;$('#mobile-search').focus();}
  }
  if(action==='clear-search'){$('#mobile-search').value='';$('#search').value='';state.q='';loadFeed();$('#mobile-search').focus();}
});
$('#mobile-search').addEventListener('input',event=>{clearTimeout(mobileSearchTimer);mobileSearchTimer=setTimeout(()=>{state.q=event.target.value;$('#search').value=state.q;loadFeed();},180);});
$('#mobile-search').addEventListener('keydown',event=>{if(event.key==='Escape'){$('#mobile-search-box').hidden=true;$('#mobile-search-toggle').setAttribute('aria-expanded','false');$('#mobile-search-toggle').focus();}});
mobileNavigation.addEventListener('change',()=>{renderMobileChrome();if(!mobileNavigation.matches&&state.modal==='mobile-profile')closeModal();});

let mobileListScroll=0;
const mobileOpenRoomBase=openRoom;
openRoom=async function(id,options){if(mobileNavigation.matches&&state.modal!=='room')mobileListScroll=window.scrollY;return mobileOpenRoomBase(id,options);};
const mobileCloseBase=closeModal;
closeModal=function(){const room=state.modal==='room',id=state.room?.id;mobileCloseBase();if(room&&!state.modal){renderMobileFeed();if(mobileNavigation.matches){const row=$$('#mobile-poll-list [data-open]').find(b=>b.dataset.open===id);row?.focus({preventScroll:true});window.scrollTo({top:mobileListScroll});}if(['explore','lounge','saved','voted','mine'].includes(state.view))loadFeed();}renderMobileChrome();};
