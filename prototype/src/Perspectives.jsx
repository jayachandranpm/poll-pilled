import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Illustration,Icon,IconButton,Button,Segmented,useMediaQuery,usePanelFocus} from './ui.jsx';
import {api,community,DEMO_MODE} from './api.js';

function Person({name}){
 const file=name==='River Slope'?'river':name==='Soft Willow'?'willow':name==='Quiet Orbit'?'orbit':'otter';
 return <img className="thread-avatar" src={`/assets/avatar-${file}.png`} alt=""/>;
}

export function PerspectivePanel({poll,initialTab='Conversation',onClose,notify,refresh,AudioPlayer,MediaInput}){
 const ref=useRef(),input=useRef(),scroll=useRef(),opener=useRef(document.activeElement),overlay=useMediaQuery('(max-width:1399px)');
 usePanelFocus(ref,overlay,onClose);
 const [data,setData]=useState(null),[tab,setTab]=useState(initialTab),[note,setNote]=useState(''),[audio,setAudio]=useState(''),[voiceOpen,setVoiceOpen]=useState(false),[replyTo,setReplyTo]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[selectedSource,setSelectedSource]=useState(''),[aiNote,setAiNote]=useState('');
 useEffect(()=>{setTab(initialTab);setSelectedSource('')},[initialTab]);
 const load=useCallback(async()=>{const d=await community(`/polls/${poll.id}/details`);setData(d);setError('');return d},[poll.id]);
 useEffect(()=>{let alive=true;community(`/polls/${poll.id}/details`).then(d=>{if(alive)setData(d)}).catch(e=>{if(alive)setError(e.message)});return()=>{alive=false}},[poll.id,poll.responses,poll.comments]);
 useEffect(()=>{if(selectedSource&&tab==='Conversation'){const el=ref.current?.querySelector(`[data-response="${selectedSource}"]`);el?.scrollIntoView({behavior:'smooth',block:'center'});el?.focus({preventScroll:true})}},[selectedSource,tab]);
 useEffect(()=>{ref.current?.querySelector('button')?.focus();return()=>{if(opener.current?.isConnected)opener.current.focus()}},[]);
 const run=async fn=>{setBusy(true);try{await fn();await load();await refresh()}catch(e){notify(e.message)}finally{setBusy(false)}};
 const send=()=>run(async()=>{await community(`/polls/${poll.id}/comments`,{text:(replyTo?`@${replyTo} `:'')+note.trim(),audio});setNote('');setAudio('');setReplyTo('');setVoiceOpen(false);notify('Your perspective was added.');requestAnimationFrame(()=>scroll.current?.scrollTo({top:scroll.current.scrollHeight,behavior:'smooth'}))});
 const answers=data?.responses.map(r=>({...r,audio:r.public_audio||r.mine||poll.mine?r.audio:''})).filter(r=>r.status==='accepted'&&(r.text||r.audio))||[];
 const brief=data?.brief;
 return <aside ref={ref} className="perspectives conversation-panel" role={overlay?'dialog':undefined} aria-modal={overlay||undefined} aria-label="Perspectives" onKeyDown={e=>{if(e.key==='Escape'&&!e.defaultPrevented){e.preventDefault();onClose()}}}>
  <header className="conversation-header">
   <div className="conversation-title"><div><h2>Perspectives</h2><span>{data?`${data.comments.length} in the conversation`:'Loading conversation…'}</span></div><IconButton label="Close perspectives" name="close-circle-linear" onClick={onClose}/></div>
   <p className="conversation-context">{poll.title}</p>
   <Segmented label="Perspective view" options={['Conversation','Insights']} value={tab} onChange={value=>{setTab(value);setSelectedSource('')}}/>
  </header>
  <div ref={scroll} className="conversation-body">
   {error?<div className="conversation-empty"><h3>Couldn’t load the conversation</h3><p>{error}</p><Button kind="secondary" onClick={()=>load().catch(e=>setError(e.message))}>Try again</Button></div>:!data?<p role="status">Loading perspectives…</p>:tab==='Conversation'?<>
    {!data.comments.length&&!answers.length&&<div className="conversation-empty"><Illustration name="voice-lounge" alt=""/><h3>Be the first perspective.</h3><p>What made you choose?</p><Button kind="soft" onClick={()=>input.current?.focus()}>Start the conversation</Button></div>}
    {data.comments.length>1&&<Button kind="soft" icon="stars-linear" disabled={busy} onClick={()=>run(async()=>setAiNote((await api('/api/ai/assist',{task:'common_ground',prompt:JSON.stringify({question:poll.title,perspectives:data.comments.slice(-20).map(c=>c.text).filter(Boolean)})})).text))}>Find common ground</Button>}
    {aiNote&&<section className="feature-card"><span className="eyebrow">AI SUGGESTION</span><p>{aiNote}</p><Button kind="ghost" onClick={()=>setAiNote('')}>Dismiss</Button></section>}
    <div className="conversation-threads">{data.comments.map(c=><article className="conversation-thread" key={c.id}><Person name={c.name}/><div className="thread-content"><div className="thread-byline"><b>{c.name}</b><span>Community member</span></div>{c.text&&<p>{c.text}</p>}<AudioPlayer src={c.audio}/><div className="thread-actions"><button disabled={busy} aria-pressed={c.liked} aria-label={`Like perspective by ${c.name}`} onClick={()=>run(()=>community(`/comments/${c.id}/like`,{liked:!c.liked}))}><Icon name={c.liked?'heart-bold':'heart-linear'} size={18}/><span>{c.likes||'Like'}</span></button><button onClick={()=>{setReplyTo(c.name);input.current?.focus()}}><Icon name="chat-round-line-linear" size={18}/>Reply</button>{c.text&&<button disabled={busy} onClick={()=>run(async()=>setAiNote((await api('/api/ai/assist',{task:'clarify',prompt:c.text})).text))}><Icon name="stars-linear" size={18}/>Clarify</button>}</div></div></article>)}</div>
    {answers.length>0&&<section className="response-notes"><h3>Behind the choices <span>{answers.length}</span></h3>{answers.map(r=><article data-response={r.id} tabIndex={-1} className={`conversation-thread response-thread ${selectedSource===r.id?'highlighted':''}`} key={r.id}><Person name={r.name}/><div className="thread-content"><div className="thread-byline"><b>{r.name}</b><span>Accepted response</span></div><span className="thread-choice">{Array.isArray(r.answer)?`Top choice: ${poll.options[r.answer[0]]}`:poll.options[r.answer]}</span>{r.text&&<p>{r.text}</p>}<AudioPlayer src={r.audio} transcript={r.transcript}/></div></article>)}</section>}
   </>:<section className="conversation-insights"><div className="results-heading"><h3>How people voted</h3><span>{poll.responses} responses</span></div><div className="conversation-results">{poll.options.map((option,i)=><div className="conversation-result" key={option}><div><span>{option}</span><b>{poll.responses?Math.round(poll.totals[i]/poll.responses*100):0}%</b></div><progress aria-label={option} value={poll.totals[i]} max={Math.max(1,poll.responses)}/></div>)}</div><p className="conversation-caption">{poll.format==='rank'?'First-choice results. ':''}This sample’s views, not a population estimate.</p>
    {poll.mine&&<Button kind="soft" icon="stars-linear" disabled={busy||answers.length<2} onClick={()=>run(()=>community(`/polls/${poll.id}/insights`,{}))}>{busy?'Preparing brief…':brief?'Refresh insight brief':'Generate insight brief'}</Button>}
    {brief?<><div className="brief-label"><Icon name="stars-linear" size={18}/><span>{brief.demo?'Example AI brief':'AI-created brief'} · {brief.sample_size} explanations</span></div>{['themes','disagreements'].map(key=><section className="conversation-findings" key={key}><h3>{key==='themes'?'What people value':'Different perspectives'}</h3>{brief[key].length?brief[key].map((finding,index)=><article key={index}><h4>{finding.title}</h4><p>{finding.summary}</p><div className="finding-evidence">{finding.sources.map((id,i)=><button key={id} onClick={()=>{setTab('Conversation');setSelectedSource(id)}}><Icon name="chat-round-line-linear" size={16}/>Evidence {i+1}</button>)}</div></article>):<p>More explanations will help reveal differences.</p>}</section>)}</>:<div className="insight-pending"><Icon name="stars-linear" size={24}/><div><h3>{poll.mine?(answers.length>=2?'Ready to find themes':'A little more context'):'Insights are taking shape'}</h3><p>{poll.mine?(answers.length>=2?'Generate a brief to compare the reasons behind each choice.':'A brief needs at least two written explanations.'):'The publisher can share a brief once enough explanations arrive.'}</p></div></div>}
   </section>}
  </div>
  {tab==='Conversation'&&<footer className="conversation-composer">
   {replyTo&&<div className="reply-context"><span>Replying to <b>{replyTo}</b></span><IconButton label="Cancel reply" name="close-circle-linear" onClick={()=>setReplyTo('')}/></div>}
   <label className="sr-only" htmlFor="perspective-text">Your perspective</label><textarea ref={input} id="perspective-text" rows={2} value={note} maxLength={3000} onChange={e=>setNote(e.target.value)} placeholder="What’s your take?" onKeyDown={e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)&&!busy&&(note.trim()||audio)){e.preventDefault();send()}}}/>
   {voiceOpen&&<div className="composer-voice"><MediaInput value={audio} onChange={setAudio} notify={notify} onTranscript={transcript=>setNote(current=>current.trim()?current+'\n'+transcript:transcript)}/></div>}
   <div className="composer-actions"><button className={`composer-voice-toggle ${voiceOpen?'active':''}`} aria-expanded={voiceOpen} onClick={()=>setVoiceOpen(!voiceOpen)}><Icon name="microphone-3-linear" size={20}/>{audio?'Voice attached':'Add voice'}</button><Button disabled={busy||(!note.trim()&&!audio)} onClick={send}>{busy?'Posting…':'Post'}</Button></div>
   <Button kind="soft" icon="stars-linear" disabled={busy||!note.trim()} onClick={()=>run(async()=>{setNote((await api('/api/ai/assist',{task:'reply',prompt:JSON.stringify({question:poll.title,user_draft:note})})).text);input.current?.focus()})}>Help refine my reply</Button><small>Public · shared with your anonymous name. AI suggestions are editable and never posted automatically.</small>
  </footer>}
 </aside>;
}
