/* Meta-powered creation and a calmer, progressive community workspace. */
'use strict';
function connectionReady(provider='meta'){return Boolean(state.connections?.[provider]?.configured);}
function connectionPrompt(provider='meta'){
  toast(`Add your ${provider==='meta'?'Meta API key':'Wit.ai token'} in AI connections.`,false);
  if($('#create-form')){
    let note=$('#composer-connection-note');
    if(!note){note=document.createElement('div');note.id='composer-connection-note';note.className='inline-connection';$('.composer-step:not([hidden])').append(note);}
    note.innerHTML=`${icon('stars-linear')}<span>${provider==='meta'?'Meta Model API':'Wit.ai'} needs a connection.</span><button type="button" class="text-button" data-meta-action="connections">Add key</button>`;
  }else openSettings('ai');
}
function providerCard(id,title,description,iconName,href){
  const c=state.connections?.[id]||{},configured=c.configured;
  return `<section class="provider-panel"><div class="provider-heading"><span class="provider-mark">${icon(iconName)}</span><div><h2>${title}</h2><p>${description}</p></div><span class="status-pill ${c.checked_at?'live':''}">${c.checked_at?'Tested':configured?'Key saved':'Not connected'}</span></div>
  <form class="provider-form" data-provider="${id}"><label class="form-label" for="${id}-key">${id==='meta'?'API key':'Server access token'}</label><div class="key-input"><input class="input" id="${id}-key" type="password" autocomplete="off" spellcheck="false" minlength="8" maxlength="4096" placeholder="${configured?'Enter a new key to replace it':'Paste your '+(id==='meta'?'Meta API key':'Wit.ai token')}" required><button class="icon-button" type="button" data-key-visibility="${id}" aria-label="Show ${title} key" aria-pressed="false">Show</button></div><div class="provider-actions"><button class="button coral" type="submit">${configured?'Replace key':'Save key'}${icon('arrow-right-linear')}</button>${configured?`<button class="button outline" type="button" data-test-provider="${id}">Test connection</button>`:''}<a class="text-button" href="${href}" target="_blank" rel="noopener noreferrer">Get a key${icon('arrow-right-up-linear')}</a>${c.source==='workspace'?`<button class="text-button disconnect-button" type="button" data-remove-provider="${id}">Remove</button>`:''}</div><div id="${id}-connection-result" class="connection-result" role="status"></div></form>${c.source==='environment'?'<p class="provider-footnote">Using the server environment key. A workspace key overrides it.</p>':''}</section>`;
}
aiSettings=function(){return `<div class="ai-settings-lead"><p>Connect Meta for language, speech, and visuals.</p></div><div class="capability-list">${[['text-field-linear','Write & rephrase','meta'],['microphone-3-linear','Speech to text','meta'],['gallery-linear','Generate & understand images','meta'],['headphones-round-linear','Text to speech','wit']].map(([ico,label,provider])=>`<div>${icon(ico)}<span>${label}</span><i class="capability-dot ${connectionReady(provider)?'ready':''}" title="${connectionReady(provider)?'Key configured · model access checked on use':'Connection needed'}"></i></div>`).join('')}</div>${providerCard('meta','Meta Model API','Language · vision · images · transcription','stars-linear','https://dev.meta.ai/')}${providerCard('wit','Meta Wit.ai','Spoken audio · a separate token is required','headphones-round-linear','https://wit.ai/')}<div class="connection-security">${icon('shield-check-linear')}<p>Keys are encrypted on this server and never returned to the browser. Saving a key doesn’t verify model access.</p></div><details class="poll-context ai-details"><summary>Models & data use${icon('alt-arrow-down-linear')}</summary><p>Muse Spark 1.3 for language and vision. Muse Image 1.0 for images. Muse Voice Transcribe 1.0 for transcription. Wit.ai’s Charlie voice for speech.</p><p>Only the content needed for an action is sent when you request it. Generated questions, images, and audio get a label. Rephrasing your own question doesn’t.</p><p>${state.connections?.audio_conversion?'Audio conversion is ready.':'Install ffmpeg on this server to enable audio transcription.'} Voice clips are limited to 60 seconds.</p></details>${state.returnToComposer?'<button class="button outline" data-meta-action="return-draft">Back to your draft'+icon('arrow-right-linear')+'</button>':''}`;};

// Reuse the validated publishing fields, but show one decision at a time.
const continuousComposerHTML=composerHTML;
composerHTML=function(){
  const c=state.composer,step=c.step||0;
  const doc=document.createElement('template');doc.innerHTML=continuousComposerHTML();
  const form=doc.content.querySelector('#create-form');
  doc.content.querySelectorAll('.option-image-input').forEach((label,i)=>{label.tabIndex=0;label.setAttribute('role','button');label.setAttribute('aria-label',`Upload image for choice ${i+1}`);});
  const sections=[0,1,2].map(i=>{const el=document.createElement('section');el.className='composer-step';el.dataset.step=i;el.hidden=i!==step;return el;});
  [...form.children].forEach(el=>{
    if(el.id==='create-error'||el.classList.contains('form-footer'))return;
    let i=0;
    if(el.querySelector('#choice-inputs')||el.classList.contains('question-audio-upload')||el.classList.contains('info-box'))i=1;
    if(el.classList.contains('form-row')||el.classList.contains('provenance-controls')||el.classList.contains('campaign-setup')||el.classList.contains('publishing-terms'))i=2;
    sections[i].append(el);
  });
  if(c.mode==='voice'){
    const tools=document.createElement('div');tools.className='media-workbench';
    tools.innerHTML=`<span class="mini-label">LET THEM HEAR IT</span><h3>Put a voice to your question.</h3><p>Record it yourself or create spoken audio with Meta.</p><div class="media-tool-row"><button type="button" class="button outline" data-meta-action="record-question">${icon('microphone-3-linear')}Record question</button><button type="button" class="button outline" data-meta-action="speak-question">${icon('stars-linear')}Generate audio</button></div><div id="meta-voice-status" role="status"></div>`;
    sections[1].prepend(tools);
  }
  if(c.mode==='image'){
    const tools=document.createElement('div');tools.className='visual-workbench';
    tools.innerHTML=`<div class="workbench-heading"><div><span class="mini-label">A PICTURE OR A THOUSAND WORDS?</span><h3>Make the choices visual.</h3></div></div><p>Upload each image below, or describe one to Meta.</p><div class="image-maker"><label class="sr-only" for="image-prompt">Image description</label><input class="input" id="image-prompt" maxlength="1500" placeholder="A quiet café with warm morning light"><label class="sr-only" for="image-slot">Choice for generated image</label><select id="image-slot" class="select" aria-label="Choice for generated image">${c.options.map((_,i)=>`<option value="${i}">Choice ${String.fromCharCode(65+i)}</option>`).join('')}</select><button type="button" class="button outline" data-meta-action="generate-image">${icon('stars-linear')}Generate</button></div><div id="image-generation-status" role="status"></div>`;
    sections[1].prepend(tools);
    sections[1].insertAdjacentHTML('beforeend',`<div class="vision-assist"><button type="button" class="assist-button" data-meta-action="understand-images">${icon('magnifer-linear')}Compare with Meta</button><div id="vision-description" role="status"></div></div>`);
  }
  sections[0].insertAdjacentHTML('beforeend','<div id="meta-dictation" role="status"></div>');
  sections[2].insertAdjacentHTML('afterbegin',`<div class="publish-peek"><span class="mini-label">READY FOR THE COMMUNITY</span><h3>${escapeHTML(c.title||'Your question')}</h3><div>${icon(formats.find(f=>f[0]===c.mode)[2])}${formats.find(f=>f[0]===c.mode)[1]}<span>·</span>${c.options.length} choices ${provenanceBadge(c)}</div></div>`);
  if(c.mode==='voice'&&c.audio_origin==='generated'&&c.audio_url)sections[1].querySelector('.question-audio-upload')?.insertAdjacentHTML('afterbegin',provenanceBadge({audio_origin:'generated'}));
  if(c.mode==='image'&&c.image_origin==='generated')sections[1].insertAdjacentHTML('beforeend',provenanceBadge({image_origin:'generated'}));
  form.innerHTML='';form.noValidate=true;sections.forEach(el=>form.append(el));
  form.insertAdjacentHTML('beforeend',`<div id="create-error" role="alert"></div><div class="composer-nav"><button class="text-button" type="button" ${step?'data-compose-back':'data-action="close-modal"'}>${step?icon('arrow-left-linear')+'Back':'Cancel'}</button><span>${step+1} of 3</span>${step<2?`<button class="button coral" type="button" data-compose-next>${step===0?'Add choices':'Audience & rewards'}${icon('arrow-right-linear')}</button>`:`<button class="button coral" type="submit">Publish poll${icon('arrow-right-linear')}</button>`}</div>`);
  doc.content.querySelector('.modal-header').innerHTML=`<div class="composer-heading"><span class="mini-label">START A CONVERSATION</span><h2 id="modal-title">${['What’s on your mind?','Give them a choice.','Make it count.'][step]}</h2></div><ol class="composer-progress" aria-label="Poll creation steps">${['Question','Choices','Publish'].map((label,i)=>`<li ${i===step?'aria-current="step"':''} class="${i<=step?'reached':''}"><span>${i<step?icon('check-linear'):i+1}</span>${label}</li>`).join('')}</ol>`;
  return doc.innerHTML;
};
function validComposerStep(step){
  if(step===0){const question=$('#poll-question');if(question.value.trim().length<8){errorIn('#create-error','Give your question at least 8 characters.');question.focus();return false;}}
  if(step===1){const choices=$$('.choice-input');if(choices.some(x=>!x.value.trim())||new Set(choices.map(x=>x.value.trim().toLowerCase())).size!==choices.length){errorIn('#create-error','Add a different answer to each choice.');choices.find(x=>!x.value.trim())?.focus();return false;}if(state.composer.mode==='image'&&state.composer.options.some((_,i)=>!state.composer.images[i])){errorIn('#create-error','Add an image for every visual choice.');return false;}}
  return true;
}
function advanceComposer(){gatherComposer();const step=state.composer.step||0;if(!validComposerStep(step))return;state.composer.step=Math.min(2,step+1);rerenderComposer();$('.modal').scrollTop=0;$('.composer-step:not([hidden]) input,.composer-step:not([hidden]) button')?.focus();}
const publishReviewedPoll=publishPoll;
publishPoll=async function(form){
  const step=state.composer.step||0;if(step<2){advanceComposer();return;}
  for(const input of $$('[data-step="2"] input,[data-step="2"] select')){if(!input.checkValidity()){input.reportValidity();return;}}
  await publishReviewedPoll(form);
};

// Record locally, explicitly send to Meta on review. No browser speech service.
let metaRecorder=null,metaStream=null,metaTimer=null,metaBlob=null,metaAudioURL=null,metaPurpose='dictate';
function stopMetaCapture(discard=false){clearTimeout(metaTimer);if(discard&&metaRecorder)metaRecorder.onstop=null;if(metaRecorder?.state==='recording'){if(discard)metaRecorder.onstop=null;metaRecorder.stop();}metaStream?.getTracks().forEach(t=>t.stop());metaStream=null;if(discard){metaRecorder=null;metaBlob=null;if(metaAudioURL)URL.revokeObjectURL(metaAudioURL);metaAudioURL=null;}}
async function recordMeta(purpose='dictate'){
  if(purpose==='dictate'&&!connectionReady())return connectionPrompt();
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){toast('Microphone recording is unavailable. Upload an audio file instead.',true);return;}
  if(metaRecorder?.state==='recording'){stopMetaCapture();return;}
  stopMetaCapture(true);metaPurpose=purpose;
  const target=purpose==='question'?$('#meta-voice-status'):$('#meta-dictation');
  if(!target)return;
  try{
    metaStream=await navigator.mediaDevices.getUserMedia({audio:true});
    if(!target.isConnected){stopMetaCapture(true);return;}
    const chunks=[];metaRecorder=new MediaRecorder(metaStream);
    metaRecorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    metaRecorder.onerror=()=>{stopMetaCapture(true);target.textContent='Recording stopped. Please try again.';};
    metaRecorder.onstop=()=>{metaBlob=new Blob(chunks,{type:metaRecorder.mimeType});metaAudioURL=URL.createObjectURL(metaBlob);metaStream?.getTracks().forEach(t=>t.stop());metaStream=null;if(!target.isConnected){stopMetaCapture(true);return;}target.innerHTML=`<div class="voice-review"><audio controls src="${metaAudioURL}" aria-label="Review your recording"></audio><div><button type="button" class="button coral" data-meta-action="use-recording">${purpose==='question'?'Use audio question':'Transcribe with Meta'}${icon('arrow-right-linear')}</button><button class="text-button" type="button" data-meta-action="discard-recording">Discard</button></div>${purpose==='dictate'?'<small>This sends the clip to Meta for transcription.</small>':''}</div>`;};
    metaRecorder.start();target.innerHTML=`<div class="recording-live"><span class="recording-dot"></span>Recording · up to 60 seconds<button class="button outline" type="button" data-meta-action="stop-recording">Stop & review</button></div>`;metaTimer=setTimeout(()=>stopMetaCapture(),60000);
  }catch{stopMetaCapture(true);target.textContent='Microphone access is unavailable. You can still type or upload audio.';}
}
startDictation=function(){recordMeta('dictate');};
const closeMetaModal=closeModal;
closeModal=function(){stopMetaCapture(true);closeMetaModal();};
const renderMetaComposer=rerenderComposer;
rerenderComposer=function(){stopMetaCapture(true);renderMetaComposer();};

openStudio=function(){
  gatherComposer();if(!state.composer)state.composer={title:'',description:'',options:['',''],images:['',''],category:'Culture',hours:24,mode:'text'};
  modal(`<div class="modal-header"><span class="mini-label">META POLL STUDIO</span><h2 id="modal-title">Start with a spark.</h2><p>An idea in. A question worth asking out.</p></div><div class="modal-body"><form id="studio-form"><label class="form-label" for="studio-prompt">What are you curious about?</label><textarea class="textarea" id="studio-prompt" maxlength="2000" rows="4" required placeholder="Would our team trade Friday meetings for a four-day week?">${escapeHTML(state.composer.title||'')}</textarea><div class="studio-sparks">${['Life without notifications','The perfect workweek','What makes a city feel like home?'].map(s=>`<button class="category-chip" type="button" data-studio-spark="${escapeHTML(s)}">${escapeHTML(s)}</button>`).join('')}</div><p class="generation-note">${icon('stars-linear')}Generated polls are labelled. You review before publishing.</p>${!state.ai?`<div class="inline-connection">${icon('stars-linear')}<span>Add your Meta key to start.</span><button type="button" class="text-button" data-meta-action="connections">Connect Meta</button></div>`:''}<div id="studio-error" role="alert"></div><div class="form-footer"><button class="text-button" type="button" data-action="back-composer">Back to draft</button><button class="button coral" type="submit" ${state.ai?'':'disabled'}>${icon('stars-linear')}Create a draft</button></div></form></div>`,{type:'studio'});
};

// Four formats are visible in both the desktop workspace and the mobile community list.
function discoveryFormats(){return formats.map(([mode,label,ico])=>`<button class="discovery-format format-${mode}" data-discovery-mode="${mode}" aria-pressed="${state.mode===mode}"><span>${icon(ico)}</span><strong>${label}</strong><small>${{text:'Pick your side',voice:'Hear a perspective',image:'See the difference',interactive:'Find your place'}[mode]}</small></button>`).join('');}
const communityExperience=renderPersonalCommunity;
renderPersonalCommunity=function(){communityExperience();
  $$('[data-workspace]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.workspace===state.workspace)));
  if(!$('#discovery-formats'))$('.page-intro')?.insertAdjacentHTML('afterend','<nav class="discovery-formats" id="discovery-formats" aria-label="Explore poll formats"></nav>');
  const bar=$('#discovery-formats');if(bar){bar.hidden=!['explore','lounge'].includes(state.view);bar.innerHTML=discoveryFormats();}
  const shortcuts=$('.mobile-channel-shortcuts');if(shortcuts)shortcuts.innerHTML=discoveryFormats();
  if(state.view==='explore'){$('#page-title').textContent='A little curiosity goes a long way.';$('#page-description').textContent='Your perspective belongs here.';}
};
const metaRoom=renderRoom;
renderRoom=function(){metaRoom();
  const tools=$('.ai-tool-buttons');if(tools&&!$('[data-meta-action="read-poll"]',tools))tools.insertAdjacentHTML('beforeend',`<button data-meta-action="read-poll">${icon('headphones-round-linear')}Listen</button>`);
  if(!$('#spoken-poll')&&$('.thread-ai-tools'))$('.thread-ai-tools').insertAdjacentHTML('beforeend','<div id="spoken-poll" role="status"></div>');
};

async function metaAction(action,button){
  if(action==='connections'){gatherComposer();state.returnToComposer=['create','studio'].includes(state.modal);openSettings('ai');return;}
  if(action==='return-draft'){state.returnToComposer=false;setView('explore');openComposer(state.composer.mode,state.composer);return;}
  if(action==='record-question')return recordMeta('question');
  if(action==='stop-recording')return stopMetaCapture();
  if(action==='discard-recording'){stopMetaCapture(true);$('#meta-dictation')?.replaceChildren();$('#meta-voice-status')?.replaceChildren();return;}
  const provider=['speak-question','read-poll'].includes(action)?'wit':'meta';
  if(action!=='use-recording'||metaPurpose==='dictate'){if(!connectionReady(provider))return connectionPrompt(provider);}
  const surface=$('#create-form');
  const original=button.innerHTML;button.disabled=true;button.innerHTML='<span class="inline-spinner"></span>Working…';
  try{
    if(action==='use-recording'){
      if(!metaBlob)throw new Error('Record a clip first.');
      const form=new FormData();form.append('file',metaBlob,'recording');form.append('kind','audio');
      const {url}=await api('/api/upload',{method:'POST',data:form});
      if(metaPurpose==='question'){if(state.modal!=='create'||!surface?.isConnected)return;gatherComposer();state.composer.audio_url=url;state.composer.audio_origin='human';rerenderComposer();toast('Audio question added.');}
      else{const {transcript}=await api('/api/ai/transcribe',{method:'POST',data:{url}});if(state.modal!=='create'||!surface?.isConnected)return;$('#poll-question').value=transcript.slice(0,180);gatherComposer();stopMetaCapture(true);$('#meta-dictation').innerHTML='<p class="success-note">Transcribed. Give your question a quick read.</p>';}
    }
    if(action==='speak-question'){gatherComposer();const {url}=await api('/api/ai/speech',{method:'POST',data:{text:state.composer.title}});if(state.modal!=='create'||!surface?.isConnected)return;state.composer.audio_url=url;state.composer.audio_origin='generated';rerenderComposer();toast('Generated audio added. Listen before publishing.');}
    if(action==='read-poll'){const id=state.room.id;const {url}=await api('/api/ai/speech',{method:'POST',data:{text:state.room.title}});if(state.room?.id!==id)return;$('#spoken-poll').innerHTML=`<div class="spoken-poll"><span class="origin-badge">${icon('stars-linear')}AI-generated audio</span><audio controls src="${safeMedia(url)}" aria-label="Listen to the poll question"></audio></div>`;}
    if(action==='generate-image'){
      gatherComposer();const index=Number($('#image-slot').value),prompt=$('#image-prompt').value;
      $('#image-generation-status').textContent='Creating your image. This can take a little while…';
      const {url}=await api('/api/ai/image',{method:'POST',data:{prompt}});if(state.modal!=='create'||!surface?.isConnected)return;state.composer.images[index]=url;state.composer.image_origin='generated';rerenderComposer();toast(`Image added to choice ${String.fromCharCode(65+index)}.`);
    }
    if(action==='understand-images'){gatherComposer();const images=state.composer.images.filter(Boolean);const {description}=await api('/api/ai/vision',{method:'POST',data:{images,prompt:'Compare these poll choices using visible details. Question: '+state.composer.title}});if($('#vision-description'))$('#vision-description').innerHTML=`<div class="vision-result"><span class="mini-label">META’S PERSPECTIVE</span><p>${escapeHTML(description)}</p></div>`;}
  }catch(error){toast(error.message,true);if($('#image-generation-status'))$('#image-generation-status').textContent=error.message;}
  finally{button.disabled=false;button.innerHTML=original;}
}
document.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.dataset.metaAction)await metaAction(button.dataset.metaAction,button);
  if(button.hasAttribute('data-compose-next'))advanceComposer();
  if(button.hasAttribute('data-compose-back')){gatherComposer();state.composer.step=Math.max(0,(state.composer.step||0)-1);rerenderComposer();$('.modal').scrollTop=0;}
  if(button.dataset.studioSpark){$('#studio-prompt').value=button.dataset.studioSpark;$('#studio-prompt').focus();}
  if(button.dataset.discoveryMode){const mode=button.dataset.discoveryMode,next=state.mode===mode?'':mode;if(state.view!=='explore')setView('explore');state.mode=next;setFormatTabs();loadFeed();}
  if(button.dataset.keyVisibility){const input=$('#'+button.dataset.keyVisibility+'-key'),show=input.type==='password';input.type=show?'text':'password';button.textContent=show?'Hide':'Show';button.setAttribute('aria-pressed',String(show));button.setAttribute('aria-label',(show?'Hide':'Show')+' '+button.dataset.keyVisibility+' key');}
  const provider=button.dataset.testProvider||button.dataset.removeProvider;
  if(provider){button.disabled=true;const result=$('#'+provider+'-connection-result');result.textContent=button.dataset.testProvider?'Checking connection…':'Removing workspace key…';
    try{const data=await api('/api/ai/connections'+(button.dataset.testProvider?'/test':''),{method:'POST',data:{provider,remove:!!button.dataset.removeProvider}});state.connections=data.connections;state.ai=connectionReady();renderSettings();$('#'+provider+'-connection-result').textContent=data.message||'Workspace key removed.';}catch(error){result.textContent=error.message;}finally{button.disabled=false;}}
});
document.addEventListener('submit',async event=>{
  const form=event.target;if(!form.matches('.provider-form'))return;event.preventDefault();
  const button=$('button[type="submit"]',form),provider=form.dataset.provider,result=$('#'+provider+'-connection-result');button.disabled=true;
  try{const data=await api('/api/ai/connections',{method:'POST',data:{provider,key:$('#'+provider+'-key').value}});$('#'+provider+'-key').value='';state.connections=data.connections;state.ai=connectionReady();renderSettings();$('#'+provider+'-connection-result').textContent='Key saved. Test the connection when you’re ready.';}catch(error){result.textContent=error.message;}finally{button.disabled=false;}
});
window.addEventListener('beforeunload',()=>stopMetaCapture(true));

document.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)&&event.target.matches('.option-image-input')){event.preventDefault();$('input',event.target)?.click();}});
