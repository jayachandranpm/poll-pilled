import React,{useEffect,useId,useRef,useState} from 'react';
import {Icon,IconButton,Select} from './ui.jsx';
import {topics} from './pollModel.js';

const labels={all:'All formats',classic:'Classic',visual:'Image',audio:'Audio',slider:'Scale',rank:'Ranking',ab:'A/B comparison',video:'Video',pairwise:'This or that',allocation:'Allocate 100%'};
const rewards={0:'Any reward',200:'200+ points',300:'300+ points',400:'400+ points'};
export function DiscoveryToolbar({route,formats,count,onChange,focusRequest=0,interests=[],onInterests,onSaved}){
 const input=useRef();
 const topicNav=useRef();
 const [showExplanation,setShowExplanation]=useState(false);
 const explanationId=useId();
 useEffect(()=>{if(focusRequest)input.current?.focus()},[focusRequest]);
 useEffect(()=>{
  const nav=topicNav.current,active=nav?.querySelector('[aria-pressed="true"]');
  if(!active)return;
  const bounds=nav.getBoundingClientRect(),item=active.getBoundingClientRect();
  if(item.left<bounds.left)nav.scrollLeft-=bounds.left-item.left;
  else if(item.right>bounds.right)nav.scrollLeft+=item.right-bounds.right;
 },[route.circle]);
 const choices=['all',...formats.filter(f=>labels[f])];
 const filtered=route.format!=='all'||route.reward>0;
 const clearQuery=()=>{onChange({query:'',poll:''},true);input.current?.focus()};
 return <section className="discover-toolbar" aria-label="Browse polls">
  <div className="discovery-control-row">
   <form className="poll-search" role="search" aria-label="Find polls" onSubmit={e=>e.preventDefault()}>
    <Icon name="magnifer-linear" size={20}/>
    <input ref={input} type="search" aria-label="Search polls" placeholder="Search polls" value={route.query} maxLength={150} onChange={e=>onChange({query:e.target.value,poll:''},true)} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();clearQuery()}}}/>
    {route.query&&<IconButton label="Clear search" name="close-circle-linear" onClick={clearQuery}/>}
   </form>
   <div className="discover-filter-group">
    <Select label="Filter poll format" value={labels[route.format]} options={choices.map(f=>labels[f])} onChange={value=>onChange({format:choices.find(f=>labels[f]===value),poll:''})}/>
    <Select label="Minimum reward" value={rewards[route.reward||0]} options={Object.values(rewards)} onChange={value=>onChange({reward:Number(Object.keys(rewards).find(key=>rewards[key]===value)),poll:''})}/>
   </div>
  </div>
  <div className="discover-topic-row">
   <nav ref={topicNav} className="topic-filter-nav" aria-label="Filter by topic">
    <button type="button" aria-pressed={route.circle==='for-you'} onClick={()=>onChange({circle:'for-you',poll:''})}>All topics</button>
    {topics.filter(t=>interests.includes(t.id)||t.id===route.circle).map(t=><button type="button" key={t.id} aria-pressed={route.circle===t.id} onClick={()=>onChange({circle:t.id,poll:''})}>{t.name}</button>)}
   </nav>
   <IconButton label="Edit interests" name="settings-linear" onClick={onInterests}/>
  </div>
  <div className="discover-context">
   <span className="discover-count" role="status">{count} {count===1?'poll':'polls'}{route.query?' found':''}</span>
   <button type="button" onClick={onSaved}><Icon name="bookmark-linear" size={16}/>Saved polls</button>
   <button type="button" aria-expanded={showExplanation} aria-controls={explanationId} onClick={()=>setShowExplanation(v=>!v)}>Why these polls?<Icon name="alt-arrow-down-linear" size={16}/></button>
  </div>
  <p id={explanationId} className="feed-explanation" hidden={!showExplanation}>Your followed topics rank polls higher. Format, language and AI choices exclude polls you don’t want.</p>
  {(filtered||route.query)&&<div className="active-filters" aria-label="Active filters">{filtered&&<button onClick={()=>onChange({format:'all',reward:0,poll:''})}>Clear filters</button>}{route.query&&<button onClick={clearQuery}>“{route.query}”<Icon name="close-circle-linear" size={14}/></button>}{route.format!=='all'&&<button onClick={()=>onChange({format:'all'})}>{labels[route.format]}<Icon name="close-circle-linear" size={14}/></button>}{route.reward>0&&<button onClick={()=>onChange({reward:0})}>{rewards[route.reward]}<Icon name="close-circle-linear" size={14}/></button>}</div>}
 </section>;
}
