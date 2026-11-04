import React,{useState} from 'react';
import {Icon,Toggle,ChoiceMark} from './ui.jsx';
import {SettingsHeading} from './SettingsControls.jsx';
import {topics,formats,matchesPreferences} from './pollModel.js';

export function TopicPicker({value=[],onChange,compact=false,dense=false}){
 const [query,setQuery]=useState('');
 const visible=topics.filter(t=>(t.name+' '+t.description).toLowerCase().includes(query.toLowerCase().trim()));
 return <div className={dense?'settings-topic-picker':`topic-picker ${compact?'compact':''}`}>
  {!compact&&<label className={dense?'settings-search':'topic-search'}><Icon name="magnifer-linear" size={20}/><input type="search" aria-label="Find a topic" placeholder="Find a topic" value={query} onChange={e=>setQuery(e.target.value)}/></label>}
  <div className={dense?'preference-options':'topic-grid'} aria-label="Topics">{visible.map(t=><button key={t.id} aria-pressed={value.includes(t.id)} onClick={()=>onChange(value.includes(t.id)?value.filter(x=>x!==t.id):[...value,t.id])}><Icon name={t.icon} size={20}/><span><b>{t.name}</b>{!compact&&!dense&&<small>{t.description}</small>}</span><ChoiceMark multiple selected={value.includes(t.id)} size={20}/></button>)}</div>
  {!visible.length&&<p className="settings-search-empty" role="status">No topics found. Try a different word.</p>}
 </div>;
}

const shortFormats={classic:'Classic',visual:'Images',ab:'A/B test',audio:'Audio',video:'Video',slider:'Slider',rank:'Ranking',pairwise:'This or that',allocation:'Allocate 100%'};
export function InterestsSettings({value,onChange,polls=[]}){
 const toggle=(key,item)=>onChange({...value,[key]:value[key].includes(item)?value[key].filter(x=>x!==item):[...value[key],item]});
 const matchCount=polls.filter(p=>!p.mine&&!p.my_response&&matchesPreferences(p,value)).length;
 const mixed=value.generated_polls!==value.generated_media;
 return <div className="interests-settings">
  <section className="settings-block"><SettingsHeading title="Topics you follow" description="See more polls about the things you care about." meta={`${value.interests.length} selected`}/><TopicPicker dense value={value.interests} onChange={interests=>onChange({...value,interests})}/></section>
  <section className="settings-block"><SettingsHeading title="Poll formats" description="Choose the ways you like to answer." meta={`${value.formats.length} selected`}/><div className="preference-options" role="group" aria-label="Poll formats">{Object.entries(formats).map(([id,[label,icon]])=><button key={id} aria-label={label} aria-pressed={value.formats.includes(id)} onClick={()=>toggle('formats',id)}><Icon name={icon} size={20}/><span>{shortFormats[id]}</span><ChoiceMark multiple selected={value.formats.includes(id)} size={20}/></button>)}</div></section>
  <section className="settings-block"><SettingsHeading title="AI content" description="Generated questions and media are always labelled." meta={mixed?'Custom':undefined}/><div className="settings-radio-list" role="group" aria-label="AI content">{[['all','Include AI-created polls'],['human','Human-created only']].map(([id,label])=>{const selected=id==='all'?value.generated_polls&&value.generated_media:!value.generated_polls&&!value.generated_media;return <button key={id} aria-pressed={selected} onClick={()=>onChange({...value,generated_polls:id==='all',generated_media:id==='all'})}><span>{label}</span><ChoiceMark selected={selected} size={20}/></button>})}</div>
   <details className="settings-disclosure"><summary>Customize AI preferences<Icon name="alt-arrow-down-linear" size={18}/></summary><div>{[['generated_polls','AI-created questions'],['generated_media','AI-created images, video & audio']].map(([key,label])=><div className="settings-toggle-row" key={key}><span>{label}</span><Toggle label={label} checked={value[key]} onChange={v=>onChange({...value,[key]:v})}/></div>)}</div></details>
   <p className="settings-help">Rephrasing a human-written question doesn’t make it AI-created.</p>
  </section>
  <section className="settings-block"><SettingsHeading title="Languages" description="Only polls in your selected languages will appear."/><div className="settings-languages" role="group" aria-label="Languages">{['English','Hindi','Tamil','Spanish'].map(language=><button key={language} aria-pressed={value.languages.includes(language)} onClick={()=>toggle('languages',language)}><ChoiceMark multiple selected={value.languages.includes(language)} size={18}/>{language}</button>)}</div></section>
  <section className="settings-block"><div className="settings-toggle-row"><div><b>Paid follow-ups</b><small>Get invitations to share more after you answer.</small></div><Toggle label="Paid follow-up invitations" checked={value.followups} onChange={followups=>onChange({...value,followups})}/></div></section>
  <p className="settings-match-note" role="status"><Icon name="magnifer-linear" size={18}/>{matchCount?`${matchCount} unanswered ${matchCount===1?'poll matches':'polls match'} your format, language and AI preferences.`:'New polls will follow your format, language and AI preferences.'}</p>
 </div>;
}
