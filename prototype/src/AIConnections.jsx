import {getCapabilityChecks,subscribeCapabilityChecks,capabilityLabel} from './aiCapabilityState.js';
import React,{useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {api} from './api.js';
import {Button,Icon,Toggle} from './ui.jsx';

export function Connections({state,refresh,notify}) {
 const [connection,setConnection]=useState(state.ai),[busy,setBusy]=useState(''),[hasKey,setHasKey]=useState(false),[limit,setLimit]=useState(String(state.ai?.usage?.daily_limit??1)),[message,setMessage]=useState('');
 const keyInput=useRef(null);const checks=useSyncExternalStore(subscribeCapabilityChecks,getCapabilityChecks);
 const load=async()=>{const result=await api('/api/ai/connections');setConnection(result.connections);setLimit(String(result.connections.usage.daily_limit));return result;};
 useEffect(()=>{load().catch(e=>setMessage(e.message));},[]);
 const run=async(name,fn)=>{setBusy(name);setMessage('');try{const result=await fn();if(result?.connections){setConnection(result.connections);setLimit(String(result.connections.usage.daily_limit));}await refresh();setMessage(result?.message||'Saved.');}catch(e){setMessage(e.message);notify(e.message);}finally{setBusy('');}};
 const save=()=>run('save',async()=>{const key=keyInput.current.value;keyInput.current.value='';setHasKey(false);return api('/api/ai/connections',{provider:'meta',key});});
 const connected=connection?.meta?.configured,usage=connection?.usage;
 return <section className="settings-section ai-connections">
  <div className="connection-intro"><p>AI runs only when you ask. Manage your key and spending here.</p><span className={`badge ${connected?'ai-connected':''}`}>{connected?'Key saved':'Not connected'}</span></div>
  <section className="feature-card ai-key-card"><div className="feature-heading"><Icon name="shield-check-linear" size={28}/><div><h3>Meta Model API</h3><small>{connected?'Your key is encrypted on this server.':'Add the key from dev.meta.ai.'}</small></div></div>
   <form onSubmit={e=>{e.preventDefault();if(hasKey&&!busy)save();}}>
    <label htmlFor="meta-api-key">{connected?'Replace API key':'API key'}<input ref={keyInput} id="meta-api-key" type="password" autoComplete="new-password" spellCheck="false" placeholder={connected?'Paste a replacement key':'Paste your Meta API key'} onChange={e=>setHasKey(Boolean(e.target.value.trim()))} disabled={Boolean(busy)}/></label>
    <div className="inline-actions"><Button type="submit" disabled={Boolean(busy)||!hasKey} icon="shield-check-linear">{busy==='save'?'Saving securely…':connected?'Replace key':'Save securely'}</Button><Button kind="secondary" disabled={Boolean(busy)||!connected} onClick={()=>run('test',()=>api('/api/ai/connections/test',{provider:'meta'}))}>{busy==='test'?'Checking…':'Test language'}</Button>{connected&&<Button kind="ghost" disabled={Boolean(busy)} onClick={()=>run('remove',()=>api('/api/ai/connections',{provider:'meta',remove:true}))}>Remove saved key</Button>}</div>
   </form>
   <small>Never saved in browser storage or returned by the API. Testing makes one small paid request.</small>
   {connection?.meta?.checked_at&&<small>Language verified {new Date(connection.meta.checked_at).toLocaleString()}. Other model access is checked when used.</small>}
   {connection?.meta?.source==='environment'&&<small>A server environment key is active. Remove it from the server environment to disconnect.</small>}
  </section>
  {message&&<p className="ai-status-message" role="status">{message}</p>}
  <section className="feature-card ai-budget-card"><div className="feature-heading"><div><h3>Usage & budget</h3></div><Icon name="stars-linear" size={26}/></div>
   <div className="ai-usage-metrics"><div><strong>${(usage?.spent_usd||0).toFixed(4)}</strong><small>Estimated today</small></div><div><strong>{usage?.cache_hits||0}</strong><small>Calls avoided today</small></div></div>
   <progress aria-label="Daily AI budget used" max={usage?.daily_limit||1} value={Math.min(usage?.spent_usd||0,usage?.daily_limit||1)}/>
   <div className="ai-budget-controls"><label>Daily AI limit · USD<input aria-label="Daily AI limit in dollars" type="number" min="0.01" max="100" step="0.01" value={limit} onChange={e=>setLimit(e.target.value)}/></label><Button kind="secondary" disabled={Boolean(busy)||!usage||!Number.isFinite(Number(limit))||Number(limit)<.01||Number(limit)>100||Number(limit)===usage?.daily_limit} onClick={()=>run('limit',()=>api('/api/ai/preferences',{daily_limit:Number(limit)}))}>Save limit</Button></div>
   <div className="setting-row"><div><b>Allow AI requests</b><small>Pause new requests without removing your key.</small></div><Toggle label="Allow AI requests" disabled={Boolean(busy)||!usage} checked={usage?.enabled??true} onChange={enabled=>run('pause',()=>api('/api/ai/preferences',{enabled}))}/></div>
   <small>Resets at midnight UTC. Estimates cover this session’s requests through Poll Pilled, not your entire Meta or Cloudflare account. Reward points and publishing credits are separate.</small>
   <details><summary>How usage is reduced<Icon name="alt-arrow-down-linear" size={16}/></summary><ul><li>Identical results are reused for 24 hours within your session.</li><li>Short prompts, capped output and minimal reasoning for simple tasks.</li><li>One image at a time, compressed visual inputs, and voice clips up to 60 seconds.</li><li>Duplicate requests are blocked; paid calls are never silently retried.</li></ul><p>Uses Muse Spark standard mode. Contributor data sharing is not enabled.</p><p>Timeouts retain a conservative estimate because the provider may have processed the request. Your provider invoices are authoritative.</p><Button kind="secondary" disabled={Boolean(busy)||!usage} onClick={()=>run('cache',()=>api('/api/ai/cache/clear',{}))}>Clear saved AI results</Button></details>
  </section>
  <h3 className="capability-heading">Model access</h3><p className="fine-print">Expand for details. Models are checked only when you use them.</p>
  <div className="ai-capability-list">{[['language','text-field-linear','Language','Drafts, rephrasing, follow-ups and insights.','Muse Spark 1.3'],['image','gallery-linear','Image generation','Create an image for a poll option.','Muse Image'],['vision','gallery-linear','Visual understanding','Compare uploaded images.','Muse Spark'],['segmentation','target-linear','Object selection','Locate an object in an image.','SAM 3.1'],['transcription','microphone-3-linear','Speech to text','Transcribe briefs and recorded answers.','Muse Voice Transcribe']].map(([id,icon,title,description,model])=><details className="settings-disclosure capability-row" key={id}>
   <summary><Icon name={icon} size={22}/><span><b>{title}</b><small>{model}</small></span><small className="capability-indicator">{!connected?'Not connected':checks[id]?.state==='failed'?'Failed':checks[id]?.cached?'Cached':checks[id]?.state==='success'?'Verified':id==='language'&&connection.meta.checked_at?'Verified':'Not checked'}</small><Icon name="alt-arrow-down-linear" size={18}/></summary>
   <div className="capability-details"><p>{description}</p><p>{!connected?'Add a Meta key above to use this model.':capabilityLabel(checks[id],id==='language'&&connection.meta.checked_at?`Language verified ${new Date(connection.meta.checked_at).toLocaleString()}`:undefined)}</p>{checks[id]?.state==='failed'?<p>Check this model’s access in your Meta dashboard, then retry from the editor. Your existing content is kept.</p>:<p>{id==='language'?'Test language above makes one small paid request.':'No automatic paid checks. Access is verified when you use this capability.'}</p>}</div>
  </details>)}</div>
  <p className="fine-print">Meta Model API handles transcription. Generate labelled AI voices through <a href="?view=settings&section=voice">Cloudflare Workers AI settings</a>. {connection?.audio_conversion===false?'Audio conversion is unavailable on this server.':''}</p>
  <p className="fine-print">This is a local connection tied to your browser session. Remote use requires the app’s Cloudflare Access configuration. Polls and money remain demo data; AI requests use your real Meta quota.</p>
 </section>;
}

export function AIUsageNote(){
 const [usage,setUsage]=useState(null);
 useEffect(()=>{const update=e=>setUsage(e.detail);window.addEventListener('pollpilled:ai-usage',update);return()=>window.removeEventListener('pollpilled:ai-usage',update)},[]);
 return usage?<small className="ai-result-usage" role="status">{usage.cached?'Reused a saved result · no new model call':`Last AI request · about $${Number(usage.estimated_usd).toFixed(4)}`}</small>:null;
}
