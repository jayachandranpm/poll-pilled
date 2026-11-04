import {challenge} from './turnstile.js';
import {capabilityFor,recordCapability} from './aiCapabilityState.js';
import {demoRequest} from './demo.js';
export const DEMO_MODE=import.meta.env?.VITE_DATA_MODE!=='live';
// Marketplace state may be a demo; AI always goes through the authenticated Flask proxy.
let csrf = '', security = {}, booting;
const preparedMedia = new Map(), mutations = new Map();
export function configureSession(state) {
  if(state.csrf==='demo-only')return;
  if(state.csrf!==undefined)csrf=state.csrf||'';
  if(state.security)security=state.security;
}
async function fetchJSON(path, options={}, timeout=20000) {
  const controller=new AbortController();
  const abort=()=>controller.abort();
  if(options.signal?.aborted)abort();else options.signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,timeout);
  try {
    const response=await fetch(path,{...options,signal:controller.signal});
    if(response.redirected&&/\/(?:sign-in|__catalyst\/auth\/login)(?:[/?#]|$)/.test(response.url)){
      const error=new Error('Your session expired. Sign in again.');error.status=401;error.loginRequired=true;throw error;
    }
    let result;
    try{result=await response.json();}catch{
      // A hosting gateway can preserve an auth error's status but drop its
      // body. Never mistake an expired session for a failed CAPTCHA or AI key.
      const error=new Error(response.status===401?'Your session expired. Sign in again.':response.status===403?'Your session changed. Refresh the page and try again.':'The server could not confirm this action. Your work is kept; please try again.');
      error.status=response.status;error.loginRequired=response.status===401;error.unconfirmed=true;throw error;
    }
    if(!result||typeof result!=='object'||Array.isArray(result)){
      const error=new Error(response.status===401?'Your session expired. Sign in again.':response.status===403?'Your session changed. Refresh the page and try again.':'The server could not confirm this action. Your work is kept; please try again.');
      error.status=response.status;error.loginRequired=response.status===401;error.unconfirmed=true;throw error;
    }
    if(!response.ok){
      if(result.security_check_required&&result.security)configureSession({security:result.security});
      const error=new Error((result.error||'The app could not complete this request. Please try again.')+(result.reference?' Reference: '+result.reference:''));
      error.status=response.status;error.loginRequired=response.status===401||result.login_required===true;error.retryable=result.retryable===true;throw error;
    }
    return result;
  }catch(error){
    if(error.name==='AbortError')throw new Error('The app took too long to respond. Your action was not confirmed. Please try again.');
    if(error instanceof TypeError){const offline=new Error('The app service could not be reached. Check your connection and try again.');offline.networkError=true;throw offline;}
    throw error;
  }finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}
}
async function sessionReady() {
  if(csrf)return;
  if(!booting)booting=fetchJSON('/api/session',{credentials:'same-origin',cache:'no-store'})
    .then(data=>{if(!data.csrf)throw new Error('Your session could not be loaded. Please sign in again.');configureSession(data);})
    .finally(()=>{booting=null});
  await booting;
}
function routinePost(path) {
  // This list is supplied by the authenticated server session. It is only a
  // UI hint: the server independently checks the route, identity and method.
  // Missing policy (including an older server) keeps the secure default.
  if(security.captcha_policy?.version!==1)return false;
  const parts=path.split('?')[0].split('/');
  return (security.captcha_policy.free_posts||[]).some(rule=>{
    const expected=rule.split('/');
    return expected.length===parts.length&&expected.every((part,i)=>
      /^<[a-z_]+>$/.test(part)?/^[A-Za-z0-9_-]+$/.test(parts[i]):part===parts[i]);
  });
}
async function server(path,data,options={}) {
  const mutation=data!==undefined,headers={};let mutationKey;
  if(mutation)await sessionReady();
  if(mutation){
    headers['X-CSRF-Token']=csrf;
    const token=options.token||(routinePost(path)||['/api/auth/logout','/api/cloudflare/turnstile'].includes(path)?'':await challenge(security));if(token)headers['X-Turnstile-Token']=token;
    if(!(data instanceof FormData)){
      headers['Content-Type']='application/json';
      if(!path.startsWith('/api/ai')){
        mutationKey=path+JSON.stringify(data);
        if(!mutations.has(mutationKey))mutations.set(mutationKey,crypto.randomUUID());
        data={...data,idempotency_key:data.idempotency_key||mutations.get(mutationKey)};
      }
    }
  }
  let result;
  try {
    const request=()=>fetchJSON(path,{method:mutation?'POST':'GET',credentials:'same-origin',cache:'no-store',headers,body:mutation?(data instanceof FormData?data:JSON.stringify(data)):undefined,signal:options.signal},options.timeout??(mutation?(path.startsWith('/api/ai')||path==='/api/cloudflare/speech'?120000:45000):20000));
    try{result=await request();}catch(error){
      // Recover one temporary read failure. Never replay a write or a timed-out
      // operation; its outcome may already be committed or billed.
      if(mutation||options.signal?.aborted||!([502,503,504].includes(error.status)||error.networkError))throw error;
      await new Promise(resolve=>setTimeout(resolve,200));
      if(options.signal?.aborted)throw error;
      result=await request();
    }
  }catch(error){
    // An empty/truncated success may already have committed. Keep its operation
    // key for a deliberate retry, so publishing cannot charge or publish twice.
    if(mutationKey&&!error.unconfirmed&&error.status>=400&&error.status<500)mutations.delete(mutationKey);
    if(error.status===401||error.status===403)csrf='';
    throw error;
  }
  if(mutationKey)mutations.delete(mutationKey);
  configureSession(result);
  if(result.ai_usage&&typeof window!=='undefined')window.dispatchEvent(new CustomEvent('pollpilled:ai-usage',{detail:result.ai_usage}));
  return result;
}
export const mediaURL=url=>!url?'':url.startsWith('/')||url.startsWith('blob:')||url.startsWith('data:')?url:'/assets/'+url;
export async function upload(file,kind){
  if(file.size>8*1024*1024)throw new Error('Choose a file smaller than 8 MB.');
  const form=new FormData();form.append('file',file);form.append('kind',kind);
  return (await server('/api/upload',form)).url;
}
async function prepareMedia(url,kind){
  if(typeof url!=='string'||!url)throw new Error('Choose a media file first.');
  if(url.startsWith('/uploads/'))return url;
  if(!url.startsWith('/assets/')&&!url.startsWith('data:')&&!url.startsWith('blob:'))throw new Error('Upload the media file before using AI.');
  if(preparedMedia.has(url))return preparedMedia.get(url);
  const response=await fetch(url);if(!response.ok)throw new Error('That media file could not be read.');
  const blob=await response.blob();
  const suffix=kind==='image'?'png':blob.type.includes('webm')?'webm':blob.type.includes('wav')?'wav':blob.type.includes('ogg')?'ogg':'mp3';
  const owned=await upload(new File([blob],`media.${suffix}`,{type:blob.type}),kind);preparedMedia.set(url,owned);return owned;
}
export async function api(path,data,options={}) {
  const capability=capabilityFor(path,data);
  try{const result=await requestAPI(path,data,options);if(capability)recordCapability(capability,'success',result.ai_usage?.cached);return result;}catch(error){if(capability)recordCapability(capability,'failed');throw error;}
}
async function requestAPI(path,data,options={}) {
  if(path.startsWith('/api/cloudflare/'))return server(path,data,options);
  if(path==='/api/ai'||path.startsWith('/api/ai/')){
    if(data&&['/api/ai/vision','/api/ai/transcribe','/api/ai/segment'].includes(path)){
      const connection=(await server('/api/ai/connections')).connections;
      if(!connection.meta.configured)throw new Error('Add your Meta key in Settings → AI connections first.');
      data={...data};
      if(path==='/api/ai/vision')data.images=await Promise.all(data.images.map(url=>prepareMedia(mediaURL(url),'image')));
      else data.url=await prepareMedia(mediaURL(data.url),path.endsWith('segment')?'image':'audio');
    }
    return server(path,data,options);
  }
  if(!DEMO_MODE)return server(path,data,options);
  if(path==='/api/community/state'){
    const result=await demoRequest(path,data);
    try{result.ai=(await server('/api/ai/connections')).connections;result.security={...result.security,...security}}catch(e){result.ai={meta:{configured:false},wit:{configured:false},offline:true,error:e.message};}
    return result;
  }
  const insight=path.match(/^\/api\/community\/polls\/([^/]+)\/insights$/);
  if(insight){
    const detail=await demoRequest(`/api/community/polls/${insight[1]}/details`);
    const responses=detail.responses.filter(r=>r.status==='accepted'&&(r.text||r.transcript)).slice(0,100).map(r=>({id:r.id,answer:r.answer,text:[r.text,r.transcript].filter(Boolean).join(' ')}));
    const result=await api('/api/ai/insights',{question:detail.poll.title,responses});
    await demoRequest(`/api/community/polls/${insight[1]}/insights-result`,{brief:result.brief});return result;
  }
  const transcription=path.match(/^\/api\/community\/responses\/([^/]+)\/transcribe$/);
  if(transcription){
    const r=await demoRequest(`/api/community/responses/${transcription[1]}`);
    const result=await api('/api/ai/transcribe',{url:r.audio});
    await demoRequest(`/api/community/responses/${transcription[1]}/transcript-result`,result);return result;
  }
  if(data&&security.turnstile_enabled&&!routinePost(path))await server('/api/cloudflare/verify',{});
  return demoRequest(path,data);
}
export const community=(path,data)=>api('/api/community'+path,data);
// The deployed Threads interface always uses the server, independently of legacy demo mode.
export {server as liveRequest};
export {formats} from './pollModel.js';
export const circles=[{id:'everyday',name:'Everyday choices',color:'var(--circle-everyday)',subtitle:'Small decisions. Different perspectives.'},{id:'design',name:'Design people',color:'var(--circle-design)',subtitle:'Help shape what comes next.'},{id:'food',name:'Food & culture',color:'var(--circle-food)',subtitle:'A little taste of what matters.'},{id:'work',name:'Future of work',color:'var(--circle-work)',subtitle:'Better questions about how we work.'}];
export const templates=[
 {name:'Choose a design',title:'Which design would you choose, and why?',format:'visual',circle:'design',options:['The everyday tote','The hands-free favourite'],images:['/assets/tote.png','/assets/crossbody.png'],image_origin:'generated'},
 {name:'Test an idea',title:'How useful would this idea be in your everyday life?',format:'slider',circle:'everyday',options:['Not useful','A little','Somewhat','Very useful','Essential']},
 {name:'Understand why',title:'What matters most when choosing something new?',format:'classic',circle:'everyday',options:['Quality','Price','Convenience','Something else']},
 {name:'Set priorities',title:'What should we improve first?',format:'rank',circle:'work',options:['Ease of use','Reliability','More features','Support']},
];
export function makeDraft(template=templates[0]){return {name:template.name,title:template.title,format:template.format,circle:template.circle,options:[...template.options],images:template.images||[],reach:'Community',audience:'Everyone',responses:20,hours:168,language:'English',text_origin:'human',image_origin:template.image_origin||'human',audio_origin:'human',audio:'',transcript:'',videos:[],video_origin:'human',tags:[template.circle]};}

export async function activateTurnstile(pending){const token=await challenge({turnstile_enabled:true,site_key:pending.site_key},'poll_setup');return server('/api/cloudflare/turnstile/activate',{}, {token});}
