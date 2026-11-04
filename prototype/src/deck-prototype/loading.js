import './loading.css';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const block=(kind='line',width='')=>`<span class="skeleton skeleton-${kind}"${width?` style="width:${width}"`:''}></span>`;
const lines=()=>`<div class="skeleton-copy">${block('line','65%')}${block('line','90%')}</div>`;
const row=()=>`<div class="skeleton-row">${block('avatar')}${lines()}</div>`;
const options=()=>`<div class="skeleton-stack">${block('control')}${block('control')}${block('control')}</div>`;
const poll=(visual=false)=>`<div class="skeleton-poll">${block('avatar')}<div class="skeleton-post">${block('line','50%')}${block('heading','90%')}${block('line','35%')}${visual?`<div class="skeleton-pair">${block('image')}${block('image')}</div>`:options()}<div class="skeleton-row skeleton-footer">${block('line','45%')}${block('button')}</div></div></div>`;
const status=label=>`<p class="loading-status" role="status"><span class="loading-spinner" aria-hidden="true"></span>${escape(label)}</p>`;

// Skeletons contain no fake records, balances or focusable controls. One status
// describes the whole region; its visual placeholders are hidden from AT.
export function skeletonContent(kind='list'){
 if(kind==='poll')return poll(true);
 if(kind==='form')return `<div class="skeleton-stack">${block('heading','62%')}${block('line','85%')}${options()}${block('button')}</div>`;
 if(kind==='wallet')return `<div class="skeleton-stack">${block('line','35%')}${block('amount','55%')}<div class="skeleton-pair">${block('control')}${block('control')}</div>${block('button')}${row()}${row()}${row()}</div>`;
 if(kind==='overview')return `<div class="skeleton-stack"><div class="skeleton-pair">${block('amount')}${block('amount')}</div>${block('chart')}${row()}${row()}</div>`;
 if(kind==='profile')return `${row()}${block('control')}<div class="skeleton-stack">${row()}${row()}</div>`;
 return `<div class="skeleton-stack">${row()}${row()}${row()}${row()}</div>`;
}
export function loadingRegion(label='Loading…',kind='list'){
 return `<div class="loading-region" data-loading-region aria-busy="true">${status(label)}<div class="skeleton-content" aria-hidden="true">${skeletonContent(kind)}</div></div>`;
}
export function pageSkeleton(state){
 const titles={discover:state.mobileAnswer?'Poll':state.feedTab==='following'?'Following':'For you',search:'Search',create:'New poll',polls:'My polls',wallet:'Wallet',saved:'Saved polls',overview:'Insights',settings:({profile:'Your identity',interests:'Interests',appearance:'Appearance',privacy:'Privacy'})[state.settings]||'Settings'};
 const title=titles[state.view]||'Poll Pilled';
 const head=text=>`<header class="thread-column-head"><div class="page-heading"><h1>${text}</h1></div><span class="loading-spinner" aria-hidden="true"></span></header>`;
 const announcement=`<span class="loading-sr" role="status">Loading ${title.toLowerCase()}…</span>`;
 const panel=body=>`<div class="thread-panel skeleton-panel" aria-hidden="true">${body}</div>`;
 if(state.view==='discover'&&!state.mobileAnswer)return `<main class="thread-columns ${state.sideColumn?'':'one-column'}" id="main" aria-busy="true" data-page-loading="discover">${announcement}<section class="thread-column">${head(title)}${panel(`<div class="skeleton-tabs">${block('line','24%')}${block('line','24%')}</div>${poll(true)}${poll()}`)}</section>${state.sideColumn?`<aside class="thread-column workspace-column">${head('Your workspace')}${panel(`<div class="skeleton-inset">${skeletonContent('profile')}</div>`)}</aside>`:''}</main>`;
 const kind=state.view==='discover'?'poll':['create','settings'].includes(state.view)?'form':['wallet','overview'].includes(state.view)?state.view:'list';
 return `<main class="thread-single ${state.view==='settings'?'settings-single':state.view==='create'?'creation-page':''}" id="main" aria-busy="true" data-page-loading="${state.view}">${announcement}${head(title)}${panel(`<div class="skeleton-inset">${skeletonContent(kind)}</div>`)}</main>`;
}

const activities=new Map();let sequence=0;
function activityNode(){
 let el=document.getElementById('app-activity');
 if(!el){el=document.createElement('div');el.id='app-activity';el.className='app-activity';el.innerHTML='<span class="activity-track" aria-hidden="true"></span><span class="loading-sr" role="status" aria-live="polite"></span>';el.hidden=true;document.body.append(el);}
 return el;
}
function updateActivity(){
 const visible=[...activities.values()].filter(a=>a.visible),el=activityNode();
 el.hidden=!visible.length;el.querySelector('[role=status]').textContent=visible.at(-1)?.label||'';
}
export function beginActivity(el,label='Working…'){
 const id=++sequence,entry={label,visible:false};activities.set(id,entry);
 const disabled=el?.disabled,wasBusy=el?.getAttribute?.('aria-busy');
 if(el){el.disabled=true;el.setAttribute?.('aria-busy','true');el.classList?.add('is-loading');}
 const timer=setTimeout(()=>{entry.visible=true;updateActivity();},180);
 let finished=false;
 return ()=>{
  if(finished)return;finished=true;clearTimeout(timer);activities.delete(id);updateActivity();
  if(el){el.disabled=disabled;el.classList?.remove('is-loading');if(wasBusy==null)el.removeAttribute?.('aria-busy');else el.setAttribute?.('aria-busy',wasBusy);}
 };
}

// Observe only media that reserves its own size. No changes to image sources,
// lazy-loading priority, audio playback, private caching or form state.
export function installMediaLoading(root){
 const tracked=new WeakSet();
 const settle=(img,failed)=>{
  img.classList.remove('media-pending');img.classList.toggle('media-failed',failed);
  const wrap=img.closest('.image-wrap');
  if(wrap){wrap.classList.remove('media-pending');wrap.querySelector('.media-load-error')?.remove();
   if(failed){const note=document.createElement('span');note.className='media-load-error';note.textContent='Image unavailable';wrap.append(note);}}
 };
 const scan=node=>{
  const images=[...(node.matches?.('img')?[node]:[]),...(node.querySelectorAll?.('img')||[])];
  for(const img of images){if(tracked.has(img)||!img.getAttribute('src'))continue;tracked.add(img);
   img.addEventListener('load',()=>settle(img,false),{once:true});img.addEventListener('error',()=>settle(img,true),{once:true});
   if(img.complete)settle(img,!img.naturalWidth);else{img.classList.add('media-pending');img.closest('.image-wrap')?.classList.add('media-pending');}
  }
 };
 scan(root);const observer=new MutationObserver(records=>{for(const r of records){if(r.type==='attributes'){tracked.delete(r.target);scan(r.target);}else for(const node of r.addedNodes)scan(node);}});
 observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});
 return ()=>observer.disconnect();
}

// Only non-sensitive display preferences are cached, never account/poll data.
export function rememberAppearance(theme,motion=true){
 try{localStorage.setItem('poll-pilled-appearance',JSON.stringify({theme,motion}));}catch{/* Storage can be unavailable in private browsing. */}
}
