import React,{useRef} from 'react';
import {Icon,IconButton,NavButton,usePanelFocus} from './ui.jsx';

function NavigationIcon({name,count=0}) {
 return <span className="navigation-icon" aria-hidden="true"><Icon name={name} size={24}/>{count>0&&<span className="nav-count">{count>99?'99+':count}</span>}</span>;
}

export function WorkspaceSidebar({view,publisherWorkspace,identity={author:'Bright Otter',tagline:'A little curious about everything.'},nav,onCreate,invitations=[],attentionCount=invitations.length,inert,menuOpen=false,onMenuClose=()=>{}}) {
 const drawer=useRef();usePanelFocus(drawer,menuOpen,onMenuClose);
 const go=(...args)=>{onMenuClose();nav(...args)};
 const home=()=>go('discover',{circle:'for-you',poll:'',layout:'feed',format:'all',reward:0,sort:'for-you'});
 const links=[
  ['discover','home-smile-linear','Discover',home],
  ['polls','chart-square-linear','My polls',()=>go('polls')],
  ['wallet','wallet-money-linear','Wallet',()=>go('wallet')],
  ['saved','bookmark-linear','Saved',()=>go('saved')],
  ['settings','settings-linear','Settings',()=>go('settings',{section:'Menu'})],
 ];
 const isActive=id=>id==='create'?view==='editor':id==='polls'?view==='polls'||publisherWorkspace:id==='settings'?view==='settings':id==='discover'?view==='discover'&&!publisherWorkspace:view===id;
 const mobileLinks=['discover','polls','create','wallet','settings'].map(id=>id==='create'?['create','poll-linear','Create',onCreate]:links.find(link=>link[0]===id));
 const renderLinks=(tooltips=true)=>links.map(([id,icon,label,action])=><NavButton key={id} className="workspace-link" tooltips={tooltips} label={label} aria-description={id==='wallet'&&attentionCount?`${attentionCount} ${attentionCount===1?'item needs':'items need'} your attention`:undefined} active={isActive(id)} onClick={action}><NavigationIcon name={isActive(id)&&id==='discover'?'home-filled':isActive(id)&&id==='saved'?'bookmark-filled':isActive(id)&&id==='settings'?'settings-filled':icon} count={id==='wallet'?attentionCount:0}/><span className="workspace-link-label">{label}</span></NavButton>);
 return <>
  <aside className="workspace-sidebar" aria-label="Workspace navigation" inert={inert||menuOpen}>
   <button className="wordmark" aria-label="Poll Pilled home" onClick={home}><img src="/assets/avatar-otter.png" alt=""/><span>Poll Pilled</span></button>
   <nav className="workspace-pill" aria-label="Main navigation">{renderLinks()}</nav>
   <button className="sky-create" aria-label="Create poll" onClick={onCreate}><Icon name="poll-linear" size={20}/><span>New poll</span></button>
  </aside>
  <nav className="sky-bottom-nav" aria-label="Mobile navigation" inert={inert||menuOpen}>{mobileLinks.map(([id,icon,label,action])=><button key={id} aria-label={id==='create'?'Create poll':label} aria-description={id==='wallet'&&attentionCount?`${attentionCount} ${attentionCount===1?'item needs':'items need'} your attention`:undefined} aria-current={isActive(id)?'page':undefined} onClick={action}><NavigationIcon name={isActive(id)&&id==='discover'?'home-filled':icon} count={id==='wallet'?attentionCount:0}/><span>{label}</span></button>)}</nav>
  {['discover','polls','saved'].includes(view)&&!publisherWorkspace&&<button className="sky-mobile-create" aria-label="Create poll" onClick={onCreate} inert={inert||menuOpen}><Icon name="poll-linear" size={26}/></button>}
  {menuOpen&&<div className="sky-drawer-shade"><button className="sky-drawer-backdrop" aria-label="Dismiss navigation" onClick={onMenuClose}/><aside className="sky-drawer" ref={drawer} role="dialog" aria-modal="true" aria-label="Navigation"><div className="sky-drawer-profile"><IconButton className="drawer-close" name="close-circle-linear" label="Close navigation" onClick={onMenuClose}/><img src="/assets/avatar-otter.png" alt=""/><b>{identity.author}</b><span>{identity.tagline}</span></div><nav aria-label="All pages">{renderLinks(false)}</nav><button className="sky-create" onClick={()=>{onMenuClose();onCreate()}}><Icon name="poll-linear" size={20}/>New poll</button></aside></div>}
 </>;
}
