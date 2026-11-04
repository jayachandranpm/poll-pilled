import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/deck-prototype/creatorStudio.js',import.meta.url))],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'test-boundaries',setup(b){
 b.onLoad({filter:/\.css$/},()=>({contents:'',loader:'js'}));
 b.onLoad({filter:/deck-prototype\/icons\.js$/},()=>({contents:'export const icon=()=>"<svg></svg>";',loader:'js'}));
 b.onLoad({filter:/src\/api\.js$/},()=>({contents:'export const upload=(...args)=>globalThis.__studioUpload(...args);',loader:'js'}));
}}]});
const bootDOM=new JSDOM('');Object.assign(globalThis,{document:bootDOM.window.document,window:bootDOM.window});
const {createCreatorStudio}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const esc=v=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
function setup(handler=async()=>({})){
 const dom=new JSDOM('<dialog></dialog>',{url:'https://test.invalid/'}),{window}=dom;
 Object.assign(globalThis,{window,document:window.document,Event:window.Event,File:window.File});
 const dialog=document.querySelector('dialog'),notes=new Map(),calls=[],saved=[];
 const state={editor:{title:'Which option would you choose?',type:'classic',options:['One','Two'],language:'English',images:[],count:20,reach:'Community'},view:'create',admin:true,previewAnswers:{}};
 const btn=(label,action,cls='',extra='')=>`<button class="${cls}" data-action="${action}" ${extra}>${label}</button>`;
 const close=()=>{dialog.removeAttribute('open');dialog.dispatchEvent(new Event('close'));};
 let pending=Promise.resolve();
 const studio=createCreatorStudio({state,dialog,notes,button:btn,icon:()=>'<svg></svg>',esc,
 req:async(path,data)=>{calls.push([path,data]);if(path==='/api/cloudflare/voices')return {configured:true,voices:[{id:'luna',name:'Luna'},{id:'iris',name:'Iris'}]};return handler(path,data);},
 formDialog:(title,body,footer)=>{dialog.dispatchEvent(new Event('poll-dialog-replace'));dialog.setAttribute('open','');dialog.innerHTML=`<h2>${title}</h2><div class="dialog-body">${body}</div><footer class="dialog-footer">${footer}</footer>`;},
 closeDialog:close,render:()=>{},toast:()=>{},saveDraft:async()=>saved.push(structuredClone(state.editor)),cancelRecording:()=>{},showFollowup:()=>{},idToTopic:{design:'Design'},formats:{classic:['Classic'],ab:['A/B'],ranking:['Rank'],audio:['Audio']},
 run:(el,work)=>{pending=work();return pending;}});
 const action=(a,extra={})=>studio.action({dataset:{action:a,...extra}});
 const input=(id,value)=>{const e=document.getElementById(id);e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));};
 const upload=async()=>{const e=document.querySelector('[data-studio-audio]');Object.defineProperty(e,'files',{value:[new File(['audio'],'recording.wav',{type:'audio/wav'})]});e.dispatchEvent(new Event('change',{bubbles:true}));await pending;};
 return {state,dialog,notes,calls,saved,action,input,upload,close,dom};
}
const proposal={title:'Which design works better?',format:'ab',options:['Warm','Cool'],tags:['design'],image_prompts:['Warm box on white','Cool box on white'],rationale:'Compare color.',instructions:'Pick one.',language:'English',transcript:''};
test('proposal review does not replace the draft until explicitly applied',async()=>{
 const x=setup(async()=>({proposal}));await x.action('ai-draft');x.input('ai-brief','Compare warm and cool packaging.');await x.action('studio-propose');
 assert.equal(x.state.editor.type,'classic');assert.match(x.dialog.textContent,/Why this format/);await x.action('studio-apply');assert.equal(x.state.editor.type,'ab');assert.equal(x.state.editor.text_origin,'generated');assert.equal(x.saved.length,1);assert.equal(x.dialog.open,false);x.dom.window.close();
});
test('closing the assistant while Meta runs cannot reopen it or replace the draft',async()=>{
 let finish;const x=setup(()=>new Promise(r=>finish=r));await x.action('ai-draft');const running=x.action('studio-propose');await Promise.resolve();x.close();finish({proposal});await running;assert.equal(x.dialog.open,false);assert.equal(x.saved.length,0);x.dom.window.close();
});
test('typed AI voice needs a matching preview and attaches server provenance',async()=>{
 const x=setup(async(path,d)=>({url:'/uploads/generated.mp3',transcript:d.text,audio_origin:'generated'}));await x.action('voice-answer',{id:'poll'});x.input('voice-script','My own written opinion.');await x.action('voice-generate');
 assert.equal(x.dialog.querySelector('[data-action=voice-use]').disabled,false);x.input('voice-script','Changed opinion.');assert.equal(x.dialog.querySelector('[data-action=voice-use]').disabled,true);await x.action('voice-generate');await x.action('voice-use');assert.equal(x.notes.get('poll').audio_origin,'generated');assert.equal(x.notes.get('poll').voiceLocked,true);assert.equal(x.notes.get('poll').transcript,'Changed opinion.');x.dom.window.close();
});
test('own voice upload never calls an AI provider and stays human',async()=>{
 const x=setup();globalThis.__studioUpload=async()=>'/uploads/original.wav';await x.action('voice-editor');await x.action('voice-mode',{mode:'original'});await x.upload();await x.action('voice-use');
 assert.equal(x.state.editor.audio_origin,'human');assert.equal(x.state.editor.mediaURL,'/uploads/original.wav');assert.deepEqual(x.calls.map(c=>c[0]),['/api/cloudflare/voices']);x.dom.window.close();
});
test('spoken AI voice chains Muse transcription and synthesis before explicit attachment',async()=>{
 const x=setup(async(path,d)=>path==='/api/ai/transcribe'?{transcript:'My spoken opinion.'}:{url:'/uploads/generated.mp3',transcript:d.text,audio_origin:'generated'});globalThis.__studioUpload=async()=>'/uploads/original.wav';await x.action('voice-editor');await x.action('voice-mode',{mode:'speak'});await x.upload();
 assert.deepEqual(x.calls.map(c=>c[0]),['/api/cloudflare/voices','/api/ai/transcribe','/api/cloudflare/speech']);assert.equal(x.state.editor.mediaURL,undefined);await x.action('voice-use');assert.equal(x.state.editor.audio_origin,'generated');assert.equal(x.state.editor.transcript,'My spoken opinion.');x.dom.window.close();
});
test('failed transcription keeps source audio for retry without uploading twice',async()=>{
 let fail=true,uploads=0;const x=setup(async(path,d)=>{if(path==='/api/ai/transcribe'){if(fail)throw Error('Provider unavailable');return {transcript:'Recovered words.'};}return {url:'/uploads/generated.mp3',transcript:d.text,audio_origin:'generated'};});
 globalThis.__studioUpload=async()=>{uploads++;return '/uploads/original.wav'};await x.action('voice-editor');await x.action('voice-mode',{mode:'speak'});await assert.rejects(x.upload());assert.ok(x.dialog.querySelector('[data-action=voice-retry]'));fail=false;await x.action('voice-retry');assert.equal(uploads,1);assert.equal(x.dialog.querySelector('[data-action=voice-use]').disabled,false);x.dom.window.close();
});
test('partial visual generation persists progress and retries only missing images',async()=>{
 let attempt=0;const x=setup(async()=>{attempt++;if(attempt===2)throw Error('Provider unavailable');return {url:'/uploads/'+attempt+'.webp'};});x.state.editor.imagePrompts=['First','Second'];
 await assert.rejects(x.action('studio-images'));assert.deepEqual(x.state.editor.images,['/uploads/1.webp']);await x.action('studio-images');assert.equal(attempt,3);assert.equal(x.saved.length,2);assert.equal(x.state.editor.image_origin,'generated');x.dom.window.close();
});
