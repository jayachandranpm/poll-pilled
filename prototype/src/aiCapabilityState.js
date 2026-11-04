// Session-only diagnostics: never store keys, prompts, media, or provider responses.
let checks={};const listeners=new Set();
export const getCapabilityChecks=()=>checks;
export const subscribeCapabilityChecks=listener=>{listeners.add(listener);return()=>listeners.delete(listener)};
export function capabilityFor(path,data){
 if(data===undefined)return null;
 if(path==='/api/ai/connections/test')return data.provider==='meta'?'language':null;
 return ({'/api/ai':'language','/api/ai/assist':'language','/api/ai/insights':'language','/api/ai/image':'image','/api/ai/vision':'vision','/api/ai/segment':'segmentation','/api/ai/transcribe':'transcription','/api/cloudflare/speech':'voice'})[path]||null;
}
export function recordCapability(capability,state,cached=false){
 if(!['language','image','vision','segmentation','transcription','voice'].includes(capability))return;
 checks={...checks,[capability]:{state,cached:Boolean(cached),at:new Date().toISOString()}};listeners.forEach(listener=>listener());
}
export function capabilityLabel(check,fallback='Not verified · access checked on first use'){
 if(!check)return fallback;
 return `${check.state==='failed'?'Last attempt failed':check.cached?'Saved result reused · provider not rechecked':'Last request succeeded'} · ${new Date(check.at).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}`;
}
