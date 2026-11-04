// Pure state transformations used by the editor and regression tests.
export const toEditorType = type => ({visual:'image',rank:'ranking'})[type]||type;
export const toApiFormat = type => ({image:'visual',ranking:'rank'})[type]||type;
export function applyProposal(editor, p, references=[]){
 const type=toEditorType(p.format);
 return {...editor,title:p.title,type,options:[...p.options],tags:[...p.tags],language:p.language,
  text_origin:'generated',image_origin:'human',audio_origin:'human',video_origin:'human',
  images:['image','ab','regions'].includes(type)?references.slice(0,type==='regions'?1:p.options.length):[],
  videos:[],mediaURL:'',mediaName:'',transcript:p.transcript||'',
  regions:type==='regions'?p.options.map((_,i)=>({x:.06,y:.08+i*.16,width:.4,height:.12})):[],
  imagePrompts:[...p.image_prompts],creationNote:p.rationale,answerInstructions:p.instructions};
}
export const voiceFingerprint=(text,speaker)=>JSON.stringify([text.trim(),speaker]);
export function canApplyVoice(v){
 return Boolean(v.result?.url && (v.result.audio_origin==='human'
  ? v.mode==='original'
  : v.mode!=='original' && v.result.fingerprint===voiceFingerprint(v.text,v.speaker)));
}
export function voiceAttachment(result){
 return {audio:result.url,transcript:result.transcript||'',audio_origin:result.audio_origin==='generated'?'generated':'human',voiceLocked:result.audio_origin==='generated'};
}
