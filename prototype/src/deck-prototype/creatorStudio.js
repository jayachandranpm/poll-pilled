import {loadingRegion} from './loading.js';
import {createViewScope} from './viewScope.js';
import {selectControl} from './controls.js';
import {upload} from '../api.js';
import {applyProposal,toApiFormat,voiceFingerprint,canApplyVoice,voiceAttachment} from './studioState.js';
import './creatorStudio.css';

export function createCreatorStudio(c){
 const {state,dialog,button,icon,esc,req,formDialog,closeDialog,render,toast,saveDraft,notes}=c;
 const captureView=c.captureView||createViewScope(dialog);
 let proposal=null, references=[], voice=null, recorder=null, painting=false, studioOpen=false;
 const actions=new Set(['ai-draft','studio-propose','studio-apply','studio-back','studio-review','studio-images','voice-editor','voice-answer','voice-followup','voice-mode','voice-select','voice-generate','voice-sample','voice-record','voice-stop','voice-use','voice-transcribe','voice-retry','voice-admin','voice-save','voice-disconnect']);
 const field=(id,label,value='',extra='')=>`<label class="form-field"><span class="field-label">${label}</span><input class="field" id="${id}" value="${esc(value)}" ${extra}></label>`;
 const area=(id,label,value='',max=600)=>`<label class="form-field"><span class="field-label">${label}</span><textarea class="field studio-script" id="${id}" maxlength="${max}">${esc(value)}</textarea></label>`;
 const chip=(label,action,extra='')=>button(label,action,'small',extra);
 const select=(id,label,value,options)=>selectControl({id,label,value,options});
 const alive=v=>voice===v&&dialog.open;
 function paint(title,body,footer){painting=true;try{formDialog(title,body,footer);}finally{painting=false;}}
 function stop(cancel=false){if(!recorder)return;recorder.cancelled=cancel;clearTimeout(recorder.timer);recorder.stream?.getTracks().forEach(t=>t.stop());if(recorder.rec?.state==='recording')recorder.rec.stop();if(cancel)recorder=null;}
 function dismiss(){if(painting)return;stop(true);voice=null;studioOpen=false;}
 dialog.addEventListener('close',dismiss);dialog.addEventListener('poll-dialog-replace',dismiss);
 for(const event of ['poll-navigation','popstate','pagehide'])window.addEventListener(event,dismiss);
 function status(message){const p=dialog.querySelector('#studio-status');if(p)p.textContent=message;}
 const statusMarkup='<p class="studio-status" id="studio-status" role="status" aria-live="polite"></p>';
 function showAssistant(keep=false){
  studioOpen=true;const brief=keep?state.studioBrief:state.editor.title;
  paint('Create with Meta',`<div class="studio-heading">${icon('stars-linear')}<div><h3>Draft a poll</h3><p>Choose a format, then review the draft.</p></div></div>
   ${area('ai-brief','What are you deciding?',brief||'',4000)}
   <div class="action-row">${chip('Record brief','record-brief')}</div>
   <div class="studio-fields">${select('studio-goal','Your goal',state.studioGoal||'decide',[{value:'decide',label:'Make a decision'},{value:'compare',label:'Compare designs'},{value:'prioritize',label:'Set priorities'},{value:'understand',label:'Understand an opinion'}])}
   ${select('studio-format','Interaction',state.studioFormat||'auto',[{value:'auto',label:'Let Meta suggest'},...Object.entries(c.formats).map(([k,[label]])=>({value:toApiFormat(k),label}))])}</div>
   <label class="studio-reference"><span>${icon('gallery-linear')} Add a reference image <small>Optional · up to 2</small></span><input class="sr-only" type="file" data-studio-reference accept="image/*" aria-label="Add reference image"></label>
   <div class="studio-reference-list">${references.map((u,i)=>`<img src="${esc(u)}" alt="Reference ${i+1}">`).join('')}</div>
   <p class="format-note">Generated questions and visuals are labeled AI. Rephrasing your own question keeps it human-created.</p>${statusMarkup}`,
   button('Suggest a poll','studio-propose','primary'));
 }
 function showProposal(){const p=proposal;
  paint('Review your draft',`<div class="studio-proposal"><div class="studio-kicker"><span>${esc(c.formats[({visual:'image',rank:'ranking'})[p.format]||p.format][0])}</span><span class="ai-label">AI-created question</span></div><h3>${esc(p.title)}</h3><ol>${p.options.map(o=>`<li>${esc(o)}</li>`).join('')}</ol><div class="studio-insight"><strong>Why this format</strong><p>${esc(p.rationale)}</p><small>${esc(p.instructions)}</small></div>${p.image_prompts.length?'<p class="format-note">Matching image briefs are included. Generate visuals from the editor when you’re ready.</p>':''}<p class="format-note">This replaces the question and options in your current draft. It does not publish.</p></div>${statusMarkup}`,chip('Adjust brief','studio-back')+button('Use this draft','studio-apply','primary'));
 }
 function showVoice(){const v=voice;if(!v)return;
  const synthetic=v.mode!=='original',ready=v.config.configured;
  paint('Voice studio',`<div class="studio-heading">${icon('microphone-3-linear')}<div><h3>${v.target==='editor'?'Let your question speak':'Say it your way'}</h3><p>Listen first. Nothing is submitted automatically.</p></div></div>
   <div class="voice-modes" role="group" aria-label="Voice source">${[['type','Type → AI voice'],['speak','Speak → AI voice'],['original','My own voice']].map(([id,label])=>`<button type="button" data-action="voice-mode" data-mode="${id}" aria-pressed="${v.mode===id}" ${v.pending?'disabled':''}>${esc(label)}</button>`).join('')}</div>
   ${synthetic?`<fieldset><legend>Choose a voice <span class="format-note">English</span></legend><div class="voice-grid" role="group" aria-label="AI voice presets">${v.config.voices.map(s=>`<button type="button" class="voice-preset" data-action="voice-select" data-voice="${s.id}" aria-pressed="${v.speaker===s.id}"><span class="voice-glyph" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span>${esc(s.name)}</span>${v.speaker===s.id?icon('check-circle-bold','sm'):''}</button>`).join('')}</div>${chip('Hear selected voice','voice-sample',!ready?'disabled':'')}<div id="voice-sample-player"></div></fieldset>`:''}
   ${v.mode==='type'?area('voice-script','Your words',v.text):`<div class="voice-recording"><p>${v.mode==='original'?'Keep your natural voice. No AI conversion.':'Record up to 60 seconds. Muse transcribes, then your chosen AI voice reads your words.'}</p><div class="action-row">${button(recorder?'Stop recording':v.mode==='original'?'Record my voice':'Record → AI voice',recorder?'voice-stop':'voice-record','',synthetic&&!ready?'disabled':'')}<label class="btn small">Upload recording<input class="sr-only" type="file" data-studio-audio accept="audio/*" aria-label="Upload voice recording" ${synthetic&&!ready?'disabled':''}></label></div></div>${v.text?area('voice-script','Transcript · review your words',v.text,synthetic?600:3000):''}${v.source&&v.transcriptionFailed?chip('Retry transcription','voice-retry'):''}`}
   ${synthetic&&!ready?`<div class="studio-notice">AI voices need a Workers AI connection. You can still record your own voice.${state.admin?chip('Connect AI voices','voice-admin'):''}</div>`:''}
   ${synthetic?`<p class="format-note">AI voice · synthesized by Cloudflare. Changing the words or voice requires a new generation.</p>`:'<p class="format-note">Human-created audio · your recording is kept as-is.</p>'}
   <div id="voice-result">${v.result?`<div class="voice-result"><span class="ai-label">${v.result.audio_origin==='generated'?'AI voice':'Human-created audio'}</span><audio controls preload="metadata" src="${esc(v.result.url)}" aria-label="Voice preview"></audio>${!synthetic?chip('Transcribe with Meta','voice-transcribe'):''}</div>`:''}</div>${statusMarkup}`,
   (synthetic?button('Generate voice','voice-generate','',!ready?'disabled':''):'')+button('Use this audio','voice-use','primary',canApplyVoice(v)?'':'disabled'));
  if(v.pending)dialog.querySelectorAll('.dialog-body input,.dialog-body textarea,.dialog-body button,.dialog-footer button').forEach(el=>{el.disabled=true;});
 }
 async function openVoice(target,pid){
  let seed={};if(target==='editor')seed={text:state.editor.transcript||state.editor.title};
  if(target==='answer')seed={text:notes.get(pid)?.text||''};
  if(target==='followup'){state.followupText=dialog.querySelector('#followup-answer')?.value??state.followupText??'';seed={text:state.followupText};}
  const draft=state.editor,view=state.view;paint('Voice studio',loadingRegion('Loading voices…','form'));const current=captureView();
  let config;try{config=await req('/api/cloudflare/voices');}catch(e){if(current())paint('Voice studio',`<p role="alert">${esc(e.message)}</p>`,button('Try again',target==='editor'?'voice-editor':target==='answer'?'voice-answer':'voice-followup','primary',`data-id="${esc(pid||'')}"`));return;}
  if(!current()||state.view!==view||state.editor!==draft)return;
  voice={target,pid,draft:state.editor,config,mode:'type',speaker:'luna',text:seed.text, result:null};showVoice();
 }
 async function generate(v,sample=false){
  const mode=v.mode;const text=sample?'A good question starts with you. Which option would you choose?':v.text.trim(),speaker=v.speaker;
  if(text.length<3||text.length>600)throw new Error('Use 3–600 characters for an AI voice. Your transcript is kept so you can shorten it.');
  status(sample?'Preparing a voice sample…':'Generating your AI voice…');
  const r=await req('/api/cloudflare/speech',{text,speaker});if(!alive(v)||v.mode!==mode||(!sample&&(v.text.trim()!==text||v.speaker!==speaker)))return;
  if(sample){const root=dialog.querySelector('#voice-sample-player');if(root)root.innerHTML=`<audio controls autoplay src="${esc(r.url)}" aria-label="${esc(speaker)} voice sample"></audio>`;status('Voice sample ready.');return;}
  v.result={...r,fingerprint:voiceFingerprint(text,speaker)};showVoice();status('Ready to preview. Your audio is labeled AI voice.');
 }
 async function acceptRecording(v,file){
  if(v.pending)return;v.pending=true;
  try{return await processRecording(v,file);}finally{v.pending=false;if(alive(v)){const message=dialog.querySelector('#studio-status')?.textContent;showVoice();status(message||'Recording ready.');}}
 }
 async function processRecording(v,file){
  const mode=v.mode;status('Uploading recording…');const url=await upload(file,'audio');if(!alive(v)||v.mode!==mode)return;
  if(v.mode==='original'){v.result={url,audio_origin:'human',transcript:''};v.text='';showVoice();status('Original recording ready.');return;}
  // Keep the source for retrying transcription without another upload.
  v.source=url;v.transcriptionFailed=false;status('Transcribing with Muse…');
  let r;try{r=await req('/api/ai/transcribe',{url});}catch(e){if(alive(v)){v.transcriptionFailed=true;showVoice();status(e.message);}throw e;}if(!alive(v)||v.mode!==mode)return;v.text=r.transcript;
  showVoice();await generate(v);
 }
 async function recordVoice(){
  const v=voice;if(!navigator.mediaDevices?.getUserMedia)throw new Error('Microphone unavailable. Use Upload recording instead.');
  const attempt={cancelled:false};recorder=attempt;
  try{
   attempt.stream=await navigator.mediaDevices.getUserMedia({audio:true});
   if(attempt.cancelled||!alive(v)){attempt.stream.getTracks().forEach(t=>t.stop());return;}
   const rec=new MediaRecorder(attempt.stream),chunks=[];attempt.rec=rec;
   rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
   rec.onstop=async()=>{
    clearTimeout(attempt.timer);attempt.stream.getTracks().forEach(t=>t.stop());if(recorder===attempt)recorder=null;
    if(attempt.cancelled||!alive(v))return;
    showVoice();const blob=new Blob(chunks,{type:rec.mimeType});
    try{await acceptRecording(v,new File([blob],rec.mimeType.includes('mp4')?'voice.m4a':'voice.webm',{type:blob.type}));}
    catch(e){if(alive(v))status(e.message);}
   };
   rec.start();attempt.timer=setTimeout(()=>stop(),60000);showVoice();status('Recording… stops at 60 seconds.');
  }catch(e){stop(true);throw new Error('Microphone access was not available. Upload a recording instead.');}
 }
 async function adminVoice(){
  const current=captureView(),d=await req('/api/cloudflare/settings');if(!current())return;
  paint('AI voice connection',`<p>Cloudflare Workers AI supplies preset voices. Meta Muse handles transcription. Credentials are encrypted and visible only to the administrator.</p>${field('voice-account','Cloudflare account ID',d.voice.account_id,'autocomplete="off"')}${field('voice-token','Workers AI API token','','type="password" autocomplete="new-password" placeholder="Leave blank to keep the saved token"')}<p class="format-note">Token permissions: Account → Workers AI → Read and Edit, scoped to your account. Voice generation shares the platform AI budget and has its own daily limit.</p><p role="status">${d.voice.configured?'Connection saved. Generate a sample in Voice studio to verify access.':'Not connected yet.'}</p>`,(d.voice.configured?chip('Disconnect','voice-disconnect'):'')+button('Save voice connection','voice-save','primary'));
 }
 async function action(el){const a=el.dataset.action;
  if(a==='ai-draft'){proposal=null;references=[];showAssistant();return;}
  if(a==='studio-back'){showAssistant(true);return;}
  if(a==='studio-propose'){
   c.cancelRecording();const draft=state.editor,anchor=dialog.querySelector('#ai-brief');
   state.studioBrief=anchor.value;state.studioGoal=dialog.querySelector('#studio-goal').value;state.studioFormat=dialog.querySelector('#studio-format').value;
   status('Meta is shaping your question and interaction…');
   const r=await req('/api/ai/studio',{brief:state.studioBrief,goal:state.studioGoal,format:state.studioFormat,language:draft.language,images:references});
   if(!studioOpen||draft!==state.editor||!anchor.isConnected)return;
   proposal=r.proposal;showProposal();return;
  }
  if(a==='studio-apply'){state.editor=applyProposal(state.editor,proposal,references);state.editor.topic=c.idToTopic[state.editor.tags[0]];state.previewAnswers={};await saveDraft();closeDialog();render();toast('Draft ready. Preview it and add any media before publishing.');return;}
  if(a==='studio-review'){
   const r=await req('/api/ai/studio/review',{title:state.editor.title,options:state.editor.options,format:toApiFormat(state.editor.type)});
   paint('Question quality check',`<p>${esc(r.review.summary)}</p>${r.review.findings.map(f=>`<article class="studio-insight"><h3>${esc(f.issue)}</h3><p>${esc(f.suggestion)}</p></article>`).join('')}<p class="format-note">Suggestions only. Your question and its authorship are unchanged.</p>`,button('Back to editing','close-dialog'));return;
  }
  if(a==='studio-images'){
   const e=state.editor;let created=0;
   try{
    for(let i=0;i<(e.imagePrompts||[]).length;i++){
     if(e.images[i])continue;
     el.textContent=`Generating image ${i+1} of ${e.imagePrompts.length}…`;
     const r=await req('/api/ai/image',{prompt:e.imagePrompts[i]});
     if(state.editor!==e)return;
     e.images[i]=r.url;e.image_origin='generated';created++;await saveDraft();
    }
    toast(created?'Visuals ready. Review every image before publishing.':'Your visuals are already in place.');
   }finally{if(state.editor===e)render();}
   return;
  }
  if(a==='voice-editor'||a==='voice-answer'||a==='voice-followup')return openVoice(a.replace('voice-',''),el.dataset.id);
  if(a==='voice-admin')return adminVoice();
  if(a==='voice-save'){await req('/api/cloudflare/voice',{account_id:dialog.querySelector('#voice-account').value,token:dialog.querySelector('#voice-token').value});dialog.querySelector('#voice-token').value='';toast('Voice connection saved securely.');return adminVoice();}
  if(a==='voice-disconnect'){await req('/api/cloudflare/voice',{remove:true});return adminVoice();}
  const v=voice;if(!v)return;if(v.pending){status('Finishing your voice. You can close this window to cancel.');return;}
  if(a==='voice-mode'){stop(true);if(v.mode==='type')v.typedText=v.text;v.mode=el.dataset.mode;v.text=v.mode==='type'?v.typedText||'':'';v.result=null;v.source='';v.transcriptionFailed=false;showVoice();return;}
  if(a==='voice-select'){v.speaker=el.dataset.voice;showVoice();return;}
  if(a==='voice-generate'||a==='voice-sample')return generate(v,a==='voice-sample');
  if(a==='voice-record')return recordVoice();
  if(a==='voice-stop'){stop();return;}
  if(a==='voice-retry'){const r=await req('/api/ai/transcribe',{url:v.source});if(!alive(v))return;v.transcriptionFailed=false;v.text=r.transcript;showVoice();return generate(v);}
  if(a==='voice-transcribe'){const r=await req('/api/ai/transcribe',{url:v.result.url});if(!alive(v))return;v.text=r.transcript;v.result.transcript=r.transcript;showVoice();return;}
  if(a==='voice-use'){
   if(!canApplyVoice(v))throw new Error('Generate a preview of your current words and selected voice first.');
   if(v.target==='editor'){
    if(v.draft!==state.editor)throw new Error('This draft has changed. Reopen Voice studio.');
    Object.assign(state.editor,{mediaURL:v.result.url,mediaName:v.result.audio_origin==='generated'?`AI voice · ${v.speaker}`:'Your recording',transcript:v.text||v.result.transcript||'',audio_origin:v.result.audio_origin});await saveDraft();
   }else if(v.target==='answer'){notes.set(v.pid,{...(notes.get(v.pid)||{}),...voiceAttachment(v.result)});state.openReasons||={};state.openReasons[v.pid]=true;}
   else {state.followupAudio=v.result.url;state.followupOrigin=v.result.audio_origin;state.followupText=v.text||state.followupText;}
   const target=v.target;closeDialog();render();if(target==='followup')c.showFollowup(state.followupId,true);toast('Audio attached. Review before submitting.');
  }
 }
 document.addEventListener('input',e=>{if(e.target.id==='voice-script'&&voice){voice.text=e.target.value;if(voice.result?.audio_origin==='human')voice.result.transcript=voice.text;const b=dialog.querySelector('[data-action=voice-use]');if(b)b.disabled=!canApplyVoice(voice);}},true);
 document.addEventListener('change',e=>{
  const t=e.target;
  if(!t.matches('[data-studio-reference],[data-studio-audio]'))return;
  e.stopImmediatePropagation();const file=t.files?.[0];if(!file)return;
  c.run(t,async()=>{
   if(t.matches('[data-studio-reference]')){
    if(references.length>=2)throw new Error('Use up to two reference images. Reopen the assistant to start again.');
    const anchor=dialog.querySelector('#ai-brief');status('Uploading reference…');const url=await upload(file,'image');
    if(!anchor?.isConnected)return;
    references.push(url);dialog.querySelector('.studio-reference-list').innerHTML=references.map((u,i)=>`<img src="${esc(u)}" alt="Reference ${i+1}">`).join('');status('Reference attached.');
   }else if(voice)await acceptRecording(voice,file);
  });
 },true);
 return {handles:a=>actions.has(a),action:async el=>{try{return await action(el);}catch(e){status(e.message);throw e;}},cancel:dismiss};
}
