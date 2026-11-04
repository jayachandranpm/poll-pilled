import React from 'react';
import {Icon} from './ui.jsx';
import {topics} from './pollModel.js';
export function DiscoveryRail({state,nav,view}){
 const discover=patch=>nav('discover',{circle:'for-you',poll:'',layout:'feed',format:'all',reward:0,sort:'for-you',...patch});
 return <aside className="discovery-rail" aria-label="Your poll preferences"><section className="rail-card"><h3><Icon name="hashtag-linear" size={18}/>Topics you follow</h3>{topics.filter(t=>state.preferences.interests.includes(t.id)).map(topic=><button className="rail-topic" key={topic.id} onClick={()=>discover({circle:topic.id,query:''})}><span>{topic.name}</span><small>{state.polls.filter(p=>(p.tags||[p.circle]).includes(topic.id)).length}</small><Icon name="alt-arrow-right-linear" size={16}/></button>)}<button className="rail-link" onClick={()=>nav('settings',{section:'Interests'})}>Manage interests<Icon name="alt-arrow-right-linear" size={16}/></button></section></aside>;
}
