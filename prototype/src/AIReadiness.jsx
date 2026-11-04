import React,{useState,useEffect} from 'react';
import {api} from './api.js';
import {Button} from './ui.jsx';
export function useAIReadiness(){
 const [status,setStatus]=useState(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{const update=()=>setAttempt(n=>n+1);window.addEventListener('pollpilled:ai-usage',update);return()=>window.removeEventListener('pollpilled:ai-usage',update)},[]);
 useEffect(()=>{let live=true;Promise.all([api('/api/ai/connections'),api('/api/cloudflare/settings')]).then(([a,c])=>{if(live){setStatus({meta:a.connections.meta,usage:a.connections.usage,voice:c.voice});setError('')}}).catch(e=>{if(live)setError(e.message)});return()=>{live=false}},[attempt]);
 return {status,error,retry:()=>{setError('');setAttempt(n=>n+1)}};
}
export function AIBudgetHint({status,error,onRetry,provider='meta'}){return <div className="ai-budget-hint" role="status">{error?<><span>Connection status unavailable. Your text is kept here.</span>{onRetry&&<Button kind="text" onClick={onRetry}>Retry status check</Button>}</>:!status?'Checking AI availability…':<><span>{status.usage?.enabled===false?'AI requests are paused':!status[provider]?.configured?`${provider==='voice'?'AI voice':'Meta'} is not connected`:`$${Math.max(0,(status.usage?.daily_limit||0)-(status.usage?.spent_usd||0)).toFixed(2)} estimated daily allowance left`}</span><small>AI runs only when requested. Provider usage is separate from poll credits.</small></>}</div>}
