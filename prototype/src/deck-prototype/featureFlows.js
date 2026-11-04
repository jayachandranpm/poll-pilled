import {createViewScope} from './viewScope.js';
import {personalTagline} from './copy.js';
import {selectControl,disclosure} from './controls.js';
import {upload} from '../api.js';
const countries=['India','United States','United Kingdom','Canada','Australia','Singapore','Other'];
const ages=['18–24','25–34','35–44','45–54','55+'];
const aiKinds=[['generated_polls','Questions'],['generated_images','Images'],['generated_audio','Audio'],['generated_video','Video']];
const origins=[{value:'human',label:'Human-created'},{value:'rephrased',label:'AI-assisted edit'},{value:'generated',label:'AI-generated'}];
export function createFeatureFlows(c){
 const {state,polls,button,icon,esc,render,route,toast,dialog,openDialog,closeDialog,formDialog,community,req,refresh,snapshot,saveDraft,showPublisher,topicToId,empty}=c;
 const captureView=c.captureView||createViewScope(dialog);
 let recording=null;
 const field=(id,label,value='',type='text')=>`<label class="form-field"><span class="field-label">${label}</span><input class="field" id="${id}" type="${type}" value="${esc(value)}"></label>`;
 const prefs=()=>({...snapshot()?.preferences,...state.preferenceEdits});
 const select=(id,label,value,options)=>selectControl({id,label,value,options});
 const actions=new Set(['avatar','editor-topic','starter','duplicate-draft','delete-draft','confirm-delete-draft','pair-choice','pair-back','region-choice','suggest-regions','record-question','record-brief','record-followup','stop-creator-recording','transcribe-response','close-followup','admin-reviews','review-report','resolve-report','resolve-appeal','submit-appeal-review','admin-usage','invite-friends','copy-invite','apply-invite','dismiss-setup','audience-preview','sessions','revoke-session','delete-account','confirm-delete-account','demo-credits','admin-schedule','enable-schedule']);
 function starter(){return `<div class="decision-starters" role="group" aria-label="Start with a decision">${[['design','Choose a design'],['idea','Test an idea'],['why','Understand why']].map(([id,label])=>button(label,'starter','small',`data-id="${id}"`)).join('')}</div><span id="draft-save-status" role="status">${state.editor.id?'Saved draft':'Drafts save automatically'}</span>`;}
 function editorExtras(){const e=state.editor,origin=e.type==='audio'?'audio':e.type==='video'?'video':'image';return `<div class="editor-extras">
 ${e.type==='audio'?button(recording?'Stop recording':'Record question',recording?'stop-creator-recording':'record-question','small'):''}
 ${e.type==='video'?e.options.map((o,i)=>`<label class="form-field"><span class="field-label">${esc(o||'Video '+(i+1))} · transcript / description</span><textarea class="field" maxlength="1000" data-video-description="${i}">${esc(e.video_descriptions?.[i]||'')}</textarea></label>`).join(''):''}
 ${e.type==='regions'?`<label class="upload-box">${e.images?.[0]?`<img src="${esc(e.images[0])}" alt="Image to mark">`:icon('gallery-linear')}<span>Upload one image</span><input type="file" accept="image/*" data-image="0"></label>${e.images?.[0]?`${field('region-prompt','Object to find',e.regionPrompt||'')}<p class="format-note">Use a short object name, such as chair or notebook. Check suggested boxes before publishing.</p>${button('Suggest regions with Meta','suggest-regions','small')}<p class="format-note">Adjust each box in percent. Each region is also available as a labelled button.</p><div class="region-preview"><img src="${esc(e.images[0])}" alt="Region preview">${(e.regions||[]).map((r,i)=>`<span style="left:${r.x*100}%;top:${r.y*100}%;width:${r.width*100}%;height:${r.height*100}%">${i+1}</span>`).join('')}</div>${e.options.map((o,i)=>`<fieldset><legend>${esc(o||'Region '+(i+1))}</legend><div class="region-fields">${['x','y','width','height'].map(k=>`<label><span class="field-label">${k}</span><input class="field" type="number" min="${['width','height'].includes(k)?1:0}" max="100" data-region="${i}" data-coordinate="${k}" value="${Math.round((e.regions?.[i]?.[k]??({x:.05,y:.1+i*.15,width:.4,height:.12}[k]))*100)}"></label>`).join('')}</div></fieldset>`).join('')}`:''}`:''}
 ${disclosure({kind:'authorship',id:'editor',open:state.editorDisclosures?.authorship,label:'Content authorship',icon:'stars-linear',body:`${select('origin-text','Question',e.text_origin||'human',origins)}${['image','ab','regions','audio','video'].includes(e.type)?select('origin-media',origin[0].toUpperCase()+origin.slice(1),e[origin+'_origin']||'human',origins.filter(x=>x.value!=='rephrased')):''}<p class="format-note">Declare content generated elsewhere too. Rephrasing alone does not add an AI label.</p>`})}
 ${disclosure({kind:'targeting',id:'editor',open:state.editorDisclosures?.targeting,label:'Audience profile',icon:'tuning-2-linear',body:`${select('target-country','Country',e.targeting?.country?.[0]||'',['',...countries].map(v=>({value:v,label:v||'Any country'})))}${select('target-age','Age range',e.targeting?.age_band?.[0]||'',['',...ages].map(v=>({value:v,label:v||'Any adult age'})))}<p class="format-note">Optional, self-reported profiles. No verified demographic claims.</p>${button('Check matching profiles','audience-preview','small')}<p id="audience-estimate" role="status"></p>`})}</div>`;}
 function pairRounds(n){const pairs=[];for(let a=0;a<n;a++)for(let b=a+1;b<n;b++)pairs.push([a,b]);return pairs;}
 function answerControls(p,preview){
  const a=preview?state.previewAnswers[p.type]:state.answers[p.id];
  if(p.type==='pairwise'){const pairs=pairRounds(p.options.length),rounds=a?.rounds||[],pair=pairs[rounds.length];return `<div class="pairwise" data-pair-id="${p.id}" data-preview="${preview}"><p class="format-note" aria-live="polite">${pair?`Round ${rounds.length+1} of ${pairs.length} · Which do you prefer?`:'All comparisons complete'}</p>${pair?`<div class="pair-choices">${pair.map(i=>button(esc(p.options[i]),'pair-choice','',`data-id="${p.id}" data-index="${i}" data-preview="${preview}"`)).join('')}</div>`:`<p>${rounds.length} choices recorded. Submit when you’re ready.</p>`}${rounds.length?button('Previous round','pair-back','quiet small',`data-id="${p.id}" data-preview="${preview}"`):''}</div>`;}
  if(p.type==='regions')return `<div class="region-answer"><img src="${esc(p.images?.[0]||'')}" alt="Choose one of the labelled image regions">${(p.regions||[]).map((r,i)=>`<button type="button" data-action="${preview?'preview-choice':'choose'}" data-index="${i}" aria-label="${esc(p.options[i])}" aria-pressed="${a===i}" style="left:${r.x*100}%;top:${r.y*100}%;width:${r.width*100}%;height:${r.height*100}%"><span>${i+1}</span><span class="choice-mark sr-only"></span></button>`).join('')}</div><div class="classic-options" role="group" aria-label="Image regions">${p.options.map((o,i)=>`<button type="button" class="classic-choice" data-action="${preview?'preview-choice':'choose'}" data-index="${i}" aria-pressed="${a===i}"><span class="choice-mark">${icon(a===i?'check-circle-bold':'circle-linear')}</span>${i+1}. ${esc(o)}</button>`).join('')}</div>`;
  return null;
 }
 function settingsBody(){
  if(state.settings==='appearance')return `<fieldset><legend>Color mode</legend><div class="theme-previews">${['light','dark','system'].map(v=>`<button data-action="theme" data-theme="${v}" aria-pressed="${state.theme===v}"><span class="theme-mini ${v}"><i></i><span><b></b><b></b><b></b></span></span><span>${v==='system'?'Automatic':v[0].toUpperCase()+v.slice(1)} ${state.theme===v?icon('check-circle-bold','sm'):''}</span></button>`).join('')}</div></fieldset><div class="setting-row"><h3>Subtle motion</h3><button class="switch" role="switch" aria-label="Subtle motion" aria-checked="${state.motion}" data-action="motion"></button></div>`;
  if(state.settings==='profile')return `<div class="profile-card"><img src="/assets/avatar-${state.avatar}.png" alt="Your avatar"><div><h2>${esc(state.name)}</h2><p>Your public, anonymous identity.</p></div></div><fieldset><legend>Choose your avatar</legend><div class="avatar-picker">${['otter','orbit','river','willow'].map(v=>`<button data-action="avatar" data-id="${v}" aria-label="${v} avatar" aria-pressed="${state.avatar===v}"><img src="/assets/avatar-${v}.png" alt=""></button>`).join('')}</div></fieldset>${field('tagline','Tagline (optional)',personalTagline(state.tagline))}<div class="action-row">${button('Cancel','cancel-preferences')}${button('Save changes','save-tagline','primary')}</div>`;
  if(state.settings==='interests')return `<fieldset><legend>Your topics</legend><div class="preference-grid">${Object.keys(topicToId).map(t=>`<button class="preference" data-action="interest" data-topic="${t}" aria-pressed="${state.interests.has(t)}">${t}${icon(state.interests.has(t)?'check-circle-bold':'add-circle-linear')}</button>`).join('')}</div></fieldset><fieldset><legend>Ways to answer</legend><div class="preference-grid">${Object.entries(c.formats).map(([k,[l]])=>`<button class="preference" data-action="format-pref" data-format="${k}" aria-pressed="${state.allowed.has(k)}">${l}${icon(state.allowed.has(k)?'check-circle-bold':'add-circle-linear')}</button>`).join('')}</div></fieldset><fieldset><legend>Include AI-generated content</legend>${aiKinds.map(([k,l])=>`<label class="consent-row"><input type="checkbox" id="pref-${k}" ${prefs()[k]!==false?'checked':''}>${l}</label>`).join('')}<p class="format-note">Human content is always included. AI-assisted rephrasing is treated as human-created.</p></fieldset>${select('interest-language','Poll language',prefs().languages?.[0]||'English',['English','Hindi','Tamil','Spanish'])}<p class="format-note">Filters polls by language. App controls are currently in English.</p>${select('profile-country','Country (optional)',prefs().country||'',['',...countries].map(v=>({value:v,label:v||'Prefer not to say'})))}${select('profile-age','Age range (optional)',prefs().age_band||'',['',...ages].map(v=>({value:v,label:v||'Prefer not to say'})))}<label class="consent-row"><input id="followup-preference" type="checkbox" ${prefs().followups?'checked':''}>Allow paid follow-up invitations for responses I opt into</label><label class="consent-row"><input id="notification-preference" type="checkbox" ${prefs().notifications?'checked':''}>Show unread notification counts</label><div class="action-row">${button('Cancel','cancel-preferences')}${button('Save preferences','save-preferences','primary')}</div>`;
  if(state.settings==='privacy')return `<div class="settings-copy"><h2>Your data</h2><p>Polls and responses are collected for research and platform improvement. Free community polls permit platform reuse. Publishers see anonymous names and taglines; recordings can identify your voice.</p></div><div class="action-row"><a class="btn" href="/api/community/export/archive" download>Download data & media</a><a class="btn quiet" href="/api/community/export" download="poll-pilled-data.json">JSON only</a>${button('Active sessions','sessions')}${state.admin?button('Open admin','open-admin'):button('Delete account','delete-account')}</div><p class="format-note">Deleting your account removes your profile and access. Anonymous votes and transaction audit records may remain; no real cash-outs are active.</p>`;
  return null;
 }
 async function savePreferences(){const val=id=>document.querySelector('#'+id);await community('/preferences',{interests:[...state.interests].map(t=>topicToId[t]),formats:[...state.allowed].map(t=>({image:'visual',ranking:'rank'})[t]||t),...Object.fromEntries(aiKinds.map(([k])=>[k,val('pref-'+k).checked])),generated_media:true,languages:[val('interest-language').value],country:val('profile-country').value,age_band:val('profile-age').value,followups:val('followup-preference').checked,notifications:val('notification-preference').checked});state.preferenceEdits={};await refresh({keepEdits:false});render();toast('Preferences saved.');}
 function workspaceExtras(){const s=snapshot();if(!s)return '';const tasks=[['Choose your interests','interests',prefs().interests.join(',')!=='everyday,design'],['Answer your first poll','discover',s.responses.length>0],['Publish your first question','new-poll',state.published.length>0]].filter(x=>!x[2]);return `<section class="workspace-next"><div class="workspace-actions">${button(icon('bell-linear')+'<span>Notifications</span>','notifications')}${button(icon('users-group-rounded-linear')+'<span>Invite friends</span>','invite-friends')}</div>${!prefs().onboarding_dismissed&&tasks.length?`<h3>Make this space yours · ${tasks.length} to try</h3>${tasks.map(([l,a])=>button(l,a,'quiet small')).join('')}${button('Dismiss checklist','dismiss-setup','quiet small')}`:''}</section>`;}
 function followups(items){return items.length?`<section class="followup-list"><h3>Follow-up conversations</h3>${items.map(f=>`<article class="review-row"><h4>${esc(f.question)}</h4><p>${f.replies.filter(r=>r.answered_at).length} / ${f.replies.length} replies · ${esc(f.status)}</p>${f.replies.filter(r=>r.answered_at).map(r=>`<div><strong>${esc(r.name)}</strong><p>${esc(r.text)}</p>${r.audio?`<audio controls preload="metadata" src="${esc(r.audio)}"></audio>${r.audio_origin==='generated'?'<span class="ai-label">AI voice</span>':''}`:''}</div>`).join('')}${f.status==='open'?button('Close & refund unused invitations','close-followup','small',`data-id="${f.id}"`):''}</article>`).join('')}</section>`:'';}
 function cancelRecording(){
  if(!recording)return;
  recording.cancelled=true;clearTimeout(recording.timer);
  if(recording.recorder?.state==='recording')recording.recorder.stop();
  recording.stream?.getTracks().forEach(t=>t.stop());
  recording=null;
 }
 dialog.addEventListener('close',()=>{if(recording?.target!=='question')cancelRecording();});
 dialog.addEventListener('poll-dialog-replace',()=>{if(recording?.target!=='question')cancelRecording();});
 for(const event of ['poll-navigation','popstate','pagehide'])window.addEventListener(event,cancelRecording);
 async function record(target){
  if(!navigator.mediaDevices?.getUserMedia)throw new Error('Use an uploaded recording in this browser.');
  cancelRecording();
  const session={target,cancelled:false,draft:state.editor,anchor:target==='brief'?dialog.querySelector('#ai-brief'):target==='followup'?dialog.querySelector('#followup-answer'):null};
  recording=session;
  try{
   const stream=await navigator.mediaDevices.getUserMedia({audio:true});session.stream=stream;
   if(session.cancelled){stream.getTracks().forEach(t=>t.stop());return;}
   const recorder=new MediaRecorder(stream),chunks=[];session.recorder=recorder;
   const current=()=>!session.cancelled&&(target==='question'?session.draft===state.editor:session.anchor?.isConnected&&dialog.open);
   recorder.ondataavailable=e=>chunks.push(e.data);
   recorder.onstop=async()=>{
    clearTimeout(session.timer);stream.getTracks().forEach(t=>t.stop());
    if(recording===session)recording=null;
    if(!current())return;
    const control=dialog.querySelector('[data-action=stop-creator-recording]');
    if(control){control.dataset.action=target==='brief'?'record-brief':'record-followup';control.textContent=target==='brief'?'Record brief':'Record voice answer';}
    try{
     const mime=recorder.mimeType,url=await upload(new File([new Blob(chunks,{type:mime})],'recording.webm',{type:mime}),'audio');
     if(!current())return;
     if(target==='brief'){
      const r=await req('/api/ai/transcribe',{url});
      if(!current())return;
      session.anchor.value=r.transcript;toast('Brief transcribed. Review it before generating.');
     }else if(target==='followup'){
      state.followupAudio=url;state.followupOrigin='human';const check=dialog.querySelector('#followup-ai-voice');if(check){check.disabled=false;check.checked=false;}const status=dialog.querySelector('#followup-upload-status');if(status)status.textContent='Voice answer recorded';
     }else{
      session.draft.mediaURL=url;session.draft.mediaName='Recorded question';session.draft.audio_origin='human';session.draft.transcript='';await saveDraft();render();
     }
    }catch(e){if(current())toast(e.message);}
   };
   recorder.start();session.timer=setTimeout(()=>recorder.state==='recording'&&recorder.stop(),60000);
   toast('Recording · maximum 60 seconds');
   if(target==='question')render();else{const b=dialog.querySelector('[data-action=record-brief],[data-action=record-followup]');if(b){b.dataset.action='stop-creator-recording';b.textContent='Stop recording';}}
  }catch(e){cancelRecording();throw e;}
 }
 async function adminReviews(){
  const current=captureView(),d=await community('/admin/reviews');if(!current())return;state.reviewQueue=d;
  const reports=d.reports.map(r=>`<article class="review-row"><h4>${esc(r.title)}</h4><p>${esc(r.reason)} · ${esc(r.detail)}</p>${button('Review report','review-report','small',`data-id="${r.id}"`)}</article>`).join('');
  const appeals=d.appeals.map(r=>`<article class="review-row"><h4>${esc(r.title)}</h4><p>${esc(r.text)}</p><p>Publisher: ${esc(r.reason)}</p><p>Appeal: ${esc(r.appeal||'None submitted')}</p>${button('Resolve independently','resolve-appeal','small',`data-id="${r.id}"`)}</article>`).join('');
  const pending=reports||appeals?`<h3>Poll reports · ${d.reports.length}</h3>${reports||'<p>No open reports.</p>'}<h3>Response reviews · ${d.appeals.length}</h3>${appeals||'<p>No pending reviews.</p>'}`:empty('All reviews are up to date','New reports and appeals will appear here.','','','notifications',true);
  formDialog('Reports & appeals',pending+(d.audit.length?`<h3>Recent decisions</h3>${d.audit.map(a=>`<p>${esc(a.reason)}</p>`).join('')}`:''),button('Back','open-admin'));
 }

 async function action(el){const a=el.dataset.action,id=el.dataset.id,current=captureView(),pollId=state.poll;
  if(a==='avatar'){state.tagline=document.querySelector('#tagline')?.value||'';state.avatar=id;render();return;}
  if(a==='editor-topic'){const id=topicToId[el.dataset.topic],tags=state.editor.tags||[];state.editor.tags=tags.includes(id)?tags.filter(x=>x!==id):[...tags,id].slice(-5);state.editor.topic=Object.keys(topicToId).find(t=>topicToId[t]===state.editor.tags[0])||'Design';await saveDraft();render();return;}
  if(a==='starter'){const presets={design:{type:'ab',title:'Which design would you choose?',options:['Design A','Design B']},idea:{type:'classic',title:'Would this idea make your day easier?',options:['Yes, I would use it','Maybe, with changes','Not for me']},why:{type:'audio',title:'What matters most to you about this idea?',options:['Ease of use','Value','Something else']}};Object.assign(state.editor,presets[id]);await saveDraft();render();toast('A starting point — make the question your own.');return;}
  if(a==='duplicate-draft'){cancelRecording();await c.flushDrafts();await saveDraft();const original=state.drafts.find(d=>d.id===id);if(!original)throw new Error('This draft is no longer available.');const d=structuredClone(original);d.id=crypto.randomUUID();d.title=(d.title+' (copy)').slice(0,180);state.editor=d;await saveDraft();await refresh();render();return;}
  if(a==='delete-draft'){state.deleteDraft=id;formDialog('Delete draft?',`<p>This removes the saved draft. Published polls are unaffected.</p>`,button('Cancel','close-dialog')+button('Delete draft','confirm-delete-draft','primary'));return;}
  if(a==='confirm-delete-draft'){cancelRecording();await c.removeDraft(state.deleteDraft);if(current())closeDialog();await refresh();render();return;}
  if(a==='pair-choice'||a==='pair-back'){const preview=el.dataset.preview==='true',p=preview?state.editor:polls.find(p=>p.id===id),current=preview?state.previewAnswers[p.type]:state.answers[id],rounds=[...(current?.rounds||[])],pairs=pairRounds(p.options.length);if(a==='pair-back')rounds.pop();else{const pair=pairs[rounds.length];if(!pair)return;rounds.push({a:pair[0],b:pair[1],winner:Number(el.dataset.index)});}const wins=p.options.map(()=>0);rounds.forEach(r=>wins[r.winner]++);const value={rounds,winner:wins.indexOf(Math.max(...wins))};if(preview){state.previewAnswers[p.type]=value;dialog.querySelector('.dialog-body').innerHTML=`<h3>${esc(p.title)}</h3>${c.api.answerControls({...p,id:'preview'},true)}`;dialog.querySelector('[data-action=pair-choice],[data-action=pair-back]')?.focus();}else{state.answers[id]=value;state.poll=id;c.refreshStage();const submit=document.querySelector(`#poll-${id} [data-action=submit]`);if(submit)submit.disabled=rounds.length!==pairs.length;document.querySelector(`#poll-${id} [data-action=pair-choice]`)?.focus({preventScroll:true});if(rounds.length===pairs.length)submit?.focus({preventScroll:true});}return;}
  if(a==='suggest-regions'){
   const e=state.editor,prompt=document.querySelector('#region-prompt').value.trim();
   if(prompt.length<2||prompt.length>100)throw new Error('Name an object in 2–100 characters.');
   e.regionPrompt=prompt;
   const r=await req('/api/ai/segment',{url:e.images[0],prompt}),boxes=r.boxes||[];
   if(!current()||state.editor!==e)return;
   if(!boxes.length)throw new Error('No matching object found. Try another object name or adjust the boxes manually.');
   if(boxes.length===1){e.regions[0]=boxes[0];e.options[0]=prompt;}
   else{e.regions=boxes.slice(0,5);e.options=e.regions.map((_,i)=>prompt+' '+(i+1));}
   await saveDraft();render();toast(boxes.length===1?'First region updated. Adjust the other region before publishing.':'Regions suggested. Review each box before publishing.');return;
  }
  if(['record-question','record-brief','record-followup'].includes(a))return record(a==='record-brief'?'brief':a==='record-followup'?'followup':'question');
  if(a==='stop-creator-recording'){if(recording?.recorder?.state==='recording')recording.recorder.stop();return;}
  if(a==='transcribe-response'){await community(`/responses/${id}/transcribe`,{});if(current())return showPublisher(pollId);return;}
  if(a==='close-followup'){await community(`/followups/${id}/close`,{});await refresh();if(current())return showPublisher(pollId);return;}
  if(a==='admin-reviews')return adminReviews();
  if(a==='review-report'){state.reportReview=id;const r=state.reviewQueue.reports.find(r=>r.id===id);formDialog('Review report',`<h3>${esc(r.title)}</h3><p>${esc(r.options.join(' · '))}</p>${r.images.map(u=>`<img src="${esc(u)}" alt="Reported poll option">`).join('')}<p>${esc(r.reason)} · ${esc(r.detail)}</p>${select('report-decision','Decision','dismiss',[{value:'dismiss',label:'Keep poll'},{value:'remove',label:'Remove poll and refund unused places'}])}<label><span class="field-label">Reason shared with reporter</span><textarea class="field" id="moderator-reason" maxlength="1000"></textarea></label>`,button('Save decision','resolve-report','primary'));return;}
  if(a==='resolve-report'){await community(`/admin/reports/${state.reportReview}`,{decision:dialog.querySelector('#report-decision').value,reason:dialog.querySelector('#moderator-reason').value});await refresh();if(current())return adminReviews();return;}
  if(a==='resolve-appeal'){state.appealReview=id;formDialog('Independent review',`${select('appeal-decision','Decision','accept',[{value:'accept',label:'Accept and release reward'},{value:'decline',label:'Decline with explanation'}])}<label><span class="field-label">Reason</span><textarea class="field" id="moderator-reason" maxlength="1000"></textarea></label>`,button('Resolve review','submit-appeal-review','primary'));return;}
  if(a==='submit-appeal-review'){await community(`/moderation/${state.appealReview}`,{action:dialog.querySelector('#appeal-decision').value,reason:dialog.querySelector('#moderator-reason').value});await refresh();if(current())return adminReviews();return;}
  if(a==='admin-schedule'){const d=await community('/admin/schedule');if(!current())return;formDialog('Scheduled settlement',`<p>${d.configured?'Hourly settlement is configured.':'Configure hourly settlement for review deadlines and unused-budget refunds.'}</p><p>Last successful run: ${esc(d.last_run||'Not recorded')}</p>`,d.configured?button('Back','open-admin'):button('Enable hourly settlement','enable-schedule','primary'));return;}
  if(a==='enable-schedule'){await community('/admin/schedule',{});if(current())return action({dataset:{action:'admin-schedule'}});return;}
  if(a==='admin-usage'){const d=await community('/admin/usage');if(!current())return;formDialog('AI usage',`<p>Today’s estimated provider cost. Cache hits cost $0. These are estimates, not invoices.</p>${d.summary.map(r=>`<div class="usage-row"><strong>${esc(r.task)}</strong><span>${r.requests} ${esc(r.state)} · $${r.estimated_usd.toFixed(4)}</span></div>`).join('')||empty('A fresh start today','AI activity appears here when a request is made.','','','insights',true)}<h3>Recent requests</h3>${d.history.map(r=>`<div class="usage-row"><span>${esc(r.task)} · ${esc(r.state)}</span><small>${new Date(r.started*1000).toLocaleString()} · $${r.estimated_usd.toFixed(4)}</small></div>`).join('')}`,button('Back','open-admin'));return;}
  if(a==='invite-friends'){formDialog('Invite friends',`<p>Earn 200 simulated points after a verified invitee has three accepted responses.</p>${field('invite-code','Your invitation code',snapshot().referral.code)}${button('Copy invitation','copy-invite','small')}${field('apply-invite-code','Have an invitation code?')}<p>${snapshot().referral.qualified} qualified invitations</p>`,button('Apply code','apply-invite','primary'));return;}
  if(a==='copy-invite'){await navigator.clipboard.writeText(snapshot().referral.code);toast('Invitation code copied.');return;}
  if(a==='apply-invite'){await community('/referral',{code:dialog.querySelector('#apply-invite-code').value.trim()});if(current())closeDialog();toast('Invitation linked to your account.');return;}
  if(a==='dismiss-setup'){await community('/preferences',{onboarding_dismissed:true});await refresh();render();return;}
  if(a==='audience-preview'){const draft=state.editor,data=c.editorData(),fingerprint=JSON.stringify(data);const d=await community('/audience-preview',data);if(!current()||draft!==state.editor||fingerprint!==JSON.stringify(c.editorData()))return;const target=document.querySelector('#audience-estimate');if(target)target.textContent=`${d.matching_accounts} matching profiles. ${d.note}`;return;}
  if(a==='sessions'){const d=await req('/api/community/sessions');if(!current())return;formDialog('Active sessions',d.sessions.map(s=>`<article class="review-row"><strong>${s.current?'This device':esc(s.device)}</strong><p>Expires ${new Date(s.expires*1000).toLocaleString()}</p>${s.current?'':button('Sign out device','revoke-session','small',`data-id="${s.id}"`)}</article>`).join('')||'<p>Session management requires email-code sign-in.</p>');return;}
  if(a==='revoke-session'){await req('/api/community/sessions/revoke',{id});toast('Device signed out.');if(current())return action({dataset:{action:'sessions'}});return;}
  if(a==='delete-account'){formDialog('Delete your account?',`<p>Your profile, drafts, saved polls, notifications and sign-in access will be removed. Your open polls will close. Anonymous votes and transaction records are retained for research and audit.</p>${field('delete-confirmation','Type DELETE to confirm')}`,button('Cancel','close-dialog')+button('Delete account','confirm-delete-account','primary'));return;}
  if(a==='confirm-delete-account'){await req('/api/community/account/delete',{confirmation:dialog.querySelector('#delete-confirmation').value});location.assign('/sign-in');return;}
  if(a==='demo-credits'){await community('/credits',{amount:250,idempotency_key:crypto.randomUUID()});if(current())closeDialog();await refresh();render();toast('250 simulated credits added. No payment was taken.');}
 }
 function change(t,ev){if(t.id.startsWith('pref-')){state.preferenceEdits||={};state.preferenceEdits[t.id.slice(5)]=t.checked;}if(['interest-language','profile-country','profile-age','followup-preference','notification-preference'].includes(t.id)){state.preferenceEdits||={};const keys={'interest-language':'languages','profile-country':'country','profile-age':'age_band','followup-preference':'followups','notification-preference':'notifications'};state.preferenceEdits[keys[t.id]]=t.id==='interest-language'?[t.value]:t.type==='checkbox'?t.checked:t.value;}
  if(t.dataset.followupAudio){
   ev.stopImmediatePropagation();const f=t.files?.[0],id=state.followupId,current=captureView();
   if(f)c.run(t,async()=>{try{
    const url=await upload(f,'audio');if(!current()||id!==state.followupId)return;
    state.followupAudio=url;state.followupOrigin='human';
    const check=dialog.querySelector('#followup-ai-voice');if(check){check.disabled=false;check.checked=false;}
    const status=dialog.querySelector('#followup-upload-status');if(status)status.textContent='Voice answer attached';
   }finally{t.value='';}});return true;
  }
  const e=state.editor;
  if(t.id==='region-prompt')e.regionPrompt=t.value;
  if(t.id==='origin-text')e.text_origin=t.value;
  if(t.id==='origin-media')e[(e.type==='audio'?'audio':e.type==='video'?'video':'image')+'_origin']=t.value;
  if(t.id==='target-country'||t.id==='target-age'){e.targeting||={};e.targeting[t.id==='target-country'?'country':'age_band']=t.value?[t.value]:[];}
  if(t.dataset.videoDescription!==undefined){e.video_descriptions||=[];e.video_descriptions[Number(t.dataset.videoDescription)]=t.value;}
  if(t.dataset.region!==undefined){e.regions||=[];const i=Number(t.dataset.region);e.regions[i]||={x:.05,y:.1+i*.15,width:.4,height:.12};e.regions[i][t.dataset.coordinate]=Number(t.value)/100;const box=document.querySelectorAll('.region-preview>span')[i];if(box){const r=e.regions[i];Object.assign(box.style,{left:r.x*100+'%',top:r.y*100+'%',width:r.width*100+'%',height:r.height*100+'%'});}}
  return false;
 }
 function payments(a){if(a==='credits')formDialog('Publishing credits · simulation','<p>Payments are a placeholder. Add virtual credits to try audience reservations and follow-ups. These credits have no cash value.</p>',button('Add 250 simulated credits','demo-credits','primary'));else formDialog('Cash-outs · coming later','<p>Cash redemption is not connected. Your simulated points stay in your wallet; no points will be deducted.</p>',button('Done','close-dialog'));}
 return {cancelRecording,handles:a=>actions.has(a),action,change,starter,editorExtras,answerControls,settingsBody,savePreferences,workspaceExtras,followups,payments};
}
