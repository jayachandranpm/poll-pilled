import React,{useEffect,useState} from 'react';
import {Icon,Button,IconButton} from './ui.jsx';
import {Empty} from './Features.jsx';
import {formats,mediaURL,community} from './api.js';

export function PollList({items,onOpen,onExplore,onUnsave,emptyAction='Explore polls',title='No matching polls yet',description='Try another format or circle.'}) {
  const [workload,setWorkload]=useState({});const owned=items.filter(p=>p.mine),key=owned.map(p=>`${p.id}:${p.responses}`).join('|');
  useEffect(()=>{let active=true;Promise.all(owned.map(async p=>{try{const d=await community(`/polls/${p.id}/details`);return [p.id,d.responses.filter(r=>['pending','rejected','appealed'].includes(r.status)).length]}catch{return [p.id,null]}})).then(entries=>{if(active)setWorkload(Object.fromEntries(entries))});return()=>{active=false}},[key]);
  if(!items.length)return <Empty title={title} action={<Button onClick={onExplore}>{emptyAction}</Button>}>{description}</Empty>;
  return <div className="poll-list refined-poll-list">{items.map(poll=><div className="poll-list-row" key={poll.id}><button className={`poll-list-item ${poll.mine?'publisher-list-item':''}`} key={poll.id} onClick={()=>onOpen(poll)}>
    {poll.images?.[0]?<img src={mediaURL(poll.images[0])} alt=""/>:<span className="list-format"><Icon name={formats[poll.format][1]} size={28}/></span>}
    <div className="poll-list-copy"><div className="poll-row-meta"><span>{formats[poll.format][0]}</span><span>{poll.mine?poll.status:`${poll.seconds} sec`}</span></div><h3>{poll.title}</h3><p>{poll.mine?`${poll.responses} of ${poll.cap} accepted · ${workload[poll.id]??'…'} need review`:poll.my_response?poll.my_response.status==='accepted'?'Completed · results saved':`Reward ${poll.my_response.status}`:poll.eligibility_reason||`${poll.remaining} places available`}</p>{poll.mine&&<small className="poll-row-detail">Closes {new Date(poll.closes_at).toLocaleDateString(undefined,{day:'numeric',month:'short'})} · {poll.remaining} funded places left · {poll.funding==='Boost'?`${poll.remaining*(poll.reward/100+2)} credits in unused places`:'Community funded'}</small>}{poll.mine&&<progress aria-label={`Responses for ${poll.title}`} value={poll.responses} max={Math.max(poll.cap,poll.responses)}/>}</div>
    <div className="poll-list-trailing">{!poll.mine&&<span className="poll-reward">{poll.my_response?.status==='accepted'?'Earned ':poll.my_response?.status==='rejected'?'Disputed ':poll.my_response?.status==='declined'?'Not earned ':poll.my_response?'In review ':'+'}{poll.reward}<small>points</small></span>}<Icon name="alt-arrow-right-linear" size={20}/></div>
  </button>{onUnsave&&<IconButton className="remove-saved" name="bookmark-linear" label={`Remove ${poll.title} from saved polls`} onClick={()=>onUnsave(poll)}/>}</div>)}</div>;
}
