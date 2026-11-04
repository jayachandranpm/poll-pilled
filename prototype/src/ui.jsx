import React, {createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';

import {blueskyIcons} from './blueskyIcons.js';

export const AppearanceContext = createContext('reference');
const illustrationAssets=import.meta.glob('./assets/illustrations/*.svg',{query:'?raw',import:'default',eager:true});
export function Illustration({name,alt='',className='',...props}) {
 const source=illustrationAssets[`./assets/illustrations/${name}.svg`];
 const instance=useId().replace(/:/g,'');
 if(!source)return null;
 const viewBox=source.match(/viewBox="([^"]+)"/)?.[1];
 // Trusted, bundled artwork only. Namespace patterns when multiple illustrations render.
 const artwork=source.slice(source.indexOf('>')+1,source.lastIndexOf('</svg>')).replace(/id="([^"]+)"/g,`id="${instance}-$1"`).replace(/url\(#([^)]+)\)/g,`url(#${instance}-$1)`);
 return <svg {...props} className={`illustration ${className}`} viewBox={viewBox} role={alt?'img':undefined} aria-label={alt||undefined} aria-hidden={alt?undefined:true} focusable="false" dangerouslySetInnerHTML={{__html:artwork}}/>;
}

export function Icon({name, size=22, ...props}) {
  const reference=useContext(AppearanceContext)==='reference';
  const source = reference&&blueskyIcons[name]?`url(/assets/bluesky/icons/${blueskyIcons[name]}.svg)`:`url(/assets/icons/${name}.svg)`;
  return <span aria-hidden="true" className="icon" style={{width:size,height:size,maskImage:source,WebkitMaskImage:source}} {...props}/>;
}

export function ChoiceMark({selected=false,size=22,multiple=false}) {
 return <span aria-hidden="true" className={`pool-choice-mark ${selected?'checked':''} ${multiple?'multiple':''}`} style={{width:size,height:size}}>{multiple&&selected&&<Icon name="check-linear" size={15}/>}</span>;
}

export function Button({children, icon, kind='primary', className='', ...props}) {
  return <button type="button" className={`button ${kind} ${className}`} {...props}>
    {icon && <Icon name={icon}/>}<span>{children}</span>
  </button>;
}

export function IconButton({name,label,active=false,className='',...props}) {
  return <button type="button" className={`icon-button ${active?'active':''} ${className}`} aria-label={label} title={label} {...props}>
    <Icon name={name}/>
  </button>;
}

export function Segmented({label, options, value, onChange, compact=false, className='', icons={}}) {
  return <div className={`segmented ${compact?'compact':''} ${className}`} role="group" aria-label={label}>
    {options.map(option=><button type="button" key={option} className={value===option?'selected':''} aria-pressed={value===option} onClick={()=>onChange(option)}>{icons[option]&&<Icon name={icons[option]} size={18}/>}<span>{option}</span></button>)}
  </div>;
}

export function Checkbox(props) {
  return <span className="pool-checkbox"><input type="checkbox" {...props}/><span className="central-checkbox" aria-hidden="true"><Icon name="check-linear" size={15}/></span></span>;
}

export function Toggle({label,checked,onChange,disabled=false}) {
  return <button type="button" className={`switch ${checked?'on':''}`} role="switch" disabled={disabled} aria-checked={checked} aria-label={label} onClick={()=>onChange(!checked)}><span className="central-checkbox"><Icon name="check-linear" size={15}/></span></button>;
}

export function Select({label,value,options,onChange,icon}) {
  const [open,setOpen]=useState(false);
  const [focused,setFocused]=useState(0);
  const [position,setPosition]=useState({});
  const root=useRef();
  const trigger=useRef();
  const menu=useRef();
  const items=useRef([]);
  const search=useRef({text:'',time:0});
  const id=useId();
  const close=(restoreFocus=false)=>{setOpen(false);if(restoreFocus)trigger.current?.focus({preventScroll:true})};
  const show=()=>{const rect=trigger.current.getBoundingClientRect();const width=Math.min(Math.max(rect.width,180),window.innerWidth-32);const roomBelow=window.innerHeight-rect.bottom-12;const roomAbove=rect.top-12;const below=roomBelow>=Math.min(options.length*45+16,260)||roomBelow>=roomAbove;setPosition({position:'fixed',width,left:Math.max(16,Math.min(rect.left,window.innerWidth-width-16)),...(below?{top:rect.bottom+6,maxHeight:Math.max(100,Math.min(320,roomBelow))}:{bottom:window.innerHeight-rect.top+6,maxHeight:Math.max(100,Math.min(320,roomAbove))})});search.current={text:'',time:0};setFocused(Math.max(0,options.indexOf(value)));setOpen(true)};
  useEffect(()=>{
    const outside=e=>{if(!root.current?.contains(e.target)&&!menu.current?.contains(e.target))setOpen(false)};
    document.addEventListener('pointerdown',outside);
    return()=>document.removeEventListener('pointerdown',outside);
  },[]);
  useEffect(()=>{if(open){const item=items.current[focused],list=menu.current;item?.focus({preventScroll:true});if(item&&list){const row=item.getBoundingClientRect(),bounds=list.getBoundingClientRect();if(row.top<bounds.top)list.scrollTop-=bounds.top-row.top;else if(row.bottom>bounds.bottom)list.scrollTop+=row.bottom-bounds.bottom}}},[open,focused]);
  useEffect(()=>{if(!open)return;const dismiss=e=>{if(e.type==='scroll'&&menu.current?.contains(e.target))return;setOpen(false)};window.addEventListener('resize',dismiss);document.addEventListener('scroll',dismiss,true);return()=>{window.removeEventListener('resize',dismiss);document.removeEventListener('scroll',dismiss,true)}},[open]);
  const keyboard=e=>{
    if(e.key==='Escape'&&open){e.preventDefault();e.stopPropagation();close(true)}
    else if(e.key==='Tab'&&open){e.preventDefault();close(true);if(!e.shiftKey){const focusable=[...document.querySelectorAll('a[href],button,input,textarea,select,[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length&&!menu.current?.contains(el));focusable[focusable.indexOf(trigger.current)+1]?.focus({preventScroll:true})}}
    else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){
      e.preventDefault();
      if(!open){show();return}
      setFocused(i=>e.key==='Home'?0:e.key==='End'?options.length-1:(i+(e.key==='ArrowDown'?1:-1)+options.length)%options.length);
    }
    else if(open&&e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&e.key!==' '){
      e.preventDefault();const now=Date.now();search.current={text:(now-search.current.time<600?search.current.text:'')+e.key.toLowerCase(),time:now};
      const matches=options.map((option,index)=>({option,index})).filter(({option})=>option.toLowerCase().startsWith(search.current.text));
      if(matches.length)setFocused(matches.find(({index})=>index>focused)?.index??matches[0].index);
    }
  };
  return <div className="custom-select" ref={root} onKeyDown={keyboard} onBlur={e=>{if(!root.current?.contains(e.relatedTarget)&&!menu.current?.contains(e.relatedTarget))setOpen(false)}}>
    <button ref={trigger} type="button" className="select-trigger" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={open?id:undefined} onClick={()=>open?close():show()}>
      {icon&&<Icon name={icon}/>}<span>{value}</span><Icon name="alt-arrow-down-linear" size={18}/>
    </button>
    {open&&createPortal(<div ref={menu} id={id} role="listbox" aria-label={label} className="select-menu" style={position}>
      {options.map((option,i)=><button ref={el=>items.current[i]=el} type="button" role="option" aria-selected={value===option} tabIndex={focused===i?0:-1} key={option} onClick={()=>{onChange(option);close(true)}}>
        {option}<span aria-hidden="true" className={`select-radio ${value===option?'selected':''}`}/>
      </button>)}
    </div>,root.current.closest('.reference-app')||document.body)}
  </div>;
}

// Sidebar tooltips remain hoverable, work on keyboard focus, and dismiss with Escape.
export function NavButton({label, children, className='', active=false, onClick, tooltips=true, ...props}) {
  const [open,setOpen]=useState(false);
  const id=useId();
  useEffect(()=>{if(!open)return;const dismiss=e=>{if(e.key==='Escape')setOpen(false)};document.addEventListener('keydown',dismiss);return()=>document.removeEventListener('keydown',dismiss)},[open]);
  return <button type="button" className={`nav-trigger ${className} ${active?'active':''}`}
    aria-label={label} aria-current={active?'page':undefined} aria-describedby={open?id:undefined}
    onPointerEnter={e=>{if(tooltips&&e.pointerType!=='touch')setOpen(true)}} onPointerLeave={()=>setOpen(false)}
    onFocus={e=>{if(tooltips&&e.currentTarget.matches(':focus-visible'))setOpen(true)}} onBlur={()=>setOpen(false)}
    onKeyDown={e=>{if(e.key==='Escape'&&open){e.preventDefault();setOpen(false)}}}
    onClick={e=>{setOpen(false);onClick?.(e)}} {...props}>
    {children}
    {open&&<span id={id} role="tooltip" className="nav-tooltip">{label}</span>}
  </button>;
}

export function Breadcrumbs({items}) {
  return <nav className="breadcrumbs" aria-label="Breadcrumb"><ol>
    {items.map((item,index)=><li key={`${item.label}-${index}`}>
      {index>0&&<Icon name="alt-arrow-right-linear" size={15}/>}
      {item.onClick?<a href={item.href||'#'} onClick={e=>{if(!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&!e.altKey){e.preventDefault();item.onClick()}}}>{item.label}</a>:<span aria-current="page">{item.label}</span>}
    </li>)}
  </ol></nav>;
}

export function SectionNav({label,options,value,onChange}) {
  const ref=useRef();
  useLayoutEffect(()=>{
    const nav=ref.current,active=nav?.querySelector('[aria-current="page"]');
    if(!active)return;
    const edge=nav.getBoundingClientRect(),item=active.getBoundingClientRect();
    if(item.left<edge.left)nav.scrollLeft-=edge.left-item.left+16;
    else if(item.right>edge.right)nav.scrollLeft+=item.right-edge.right+16;
  },[value]);
  return <nav ref={ref} className="page-tabs" aria-label={label}>
    {options.map(option=>{const item=typeof option==='string'?{label:option}:option;return <button type="button" key={item.label} className={value===item.label?'active':''} aria-current={value===item.label?'page':undefined} onClick={()=>onChange(item.label)}>{item.label}{item.count!==undefined&&<span>{item.count}</span>}</button>})}
  </nav>;
}

export function useMediaQuery(query) {
  const [matches,setMatches]=useState(()=>window.matchMedia(query).matches);
  useEffect(()=>{const media=window.matchMedia(query);const update=()=>setMatches(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update)},[query]);
  return matches;
}

export function usePanelFocus(ref,open,onClose) {
  const close=useRef(onClose);close.current=onClose;
  useEffect(()=>{
    if(!open)return;
    const previous=document.activeElement;
    const focusable=()=>[...(ref.current?.querySelectorAll('a[href],button,input,textarea,select,[tabindex="0"]')||[])].filter(el=>!el.disabled&&el.getClientRects().length);
    focusable()[0]?.focus();
    const key=e=>{
      if(e.defaultPrevented)return;
      const dialogs=[...document.querySelectorAll('[role=dialog]')];
      if(dialogs.at(-1)!==ref.current)return;
      if(e.key==='Escape'){e.preventDefault();close.current()}
      if(e.key==='Tab'){
        const elements=focusable();const first=elements[0],last=elements.at(-1);
        if(e.shiftKey&&(document.activeElement===first||!ref.current?.contains(document.activeElement))){e.preventDefault();last?.focus()}
        else if(!e.shiftKey&&(document.activeElement===last||!ref.current?.contains(document.activeElement))){e.preventDefault();first?.focus()}
      }
    };
    document.addEventListener('keydown',key);
    return()=>{document.removeEventListener('keydown',key);if(previous?.isConnected)previous.focus({preventScroll:true});else document.querySelector('#main')?.focus({preventScroll:true})};
  },[open,ref]);
}
