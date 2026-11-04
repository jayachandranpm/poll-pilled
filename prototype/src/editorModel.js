// Keep format exploration local. Publishing still validates on the server.
const copy=value=>JSON.parse(JSON.stringify(value));
const formatFields=['options','images','image_origin','audio','audio_origin','transcript','videos','video_origin','video_descriptions'];
export function changeFormat(draft,format,saved={}){
 const drafts={...saved,[draft.format]:copy(Object.fromEntries(formatFields.map(key=>[key,draft[key]??(['options','images','videos','video_descriptions'].includes(key)?[]:'')])))};
 const compatible=['classic','audio','video','rank','pairwise','allocation'];
 const options=format==='slider'?['Not much','A little','Quite a bit','A lot','Everything']:
  ['visual','ab'].includes(format)?['Option A','Option B']:
  compatible.includes(draft.format)?[...draft.options]:['rank','allocation'].includes(format)?['Ease of use','Quality','Price']:format==='pairwise'?['Option A','Option B','Option C']:format==='video'?['Version A','Version B']:['Yes','No'];
 const next=drafts[format]||{options,images:['visual','ab'].includes(format)?['/assets/tote.png','/assets/crossbody.png']:[],image_origin:['visual','ab'].includes(format)?'generated':'human',audio:'',audio_origin:'human',transcript:'',videos:[],video_origin:'human',video_descriptions:[]};
 return {drafts,patch:{...copy(next),format}};
}

export function editorIssue(draft){
 if(draft.title.trim().length<8)return {target:'question',message:'Add a question with at least 8 characters.',action:'Edit question'};
 if(draft.options.length<2||draft.options.length>5)return {target:'options',message:'Use between 2 and 5 choices.',action:'Edit choices'};
 const options=draft.options.map(option=>option.trim().toLowerCase());
 if(options.some(option=>!option))return {target:'options',message:'Give every choice a label.',action:'Edit choices'};
 if(new Set(options).size!==options.length)return {target:'options',message:'Use a different label for each choice.',action:'Edit choices'};
 if(['visual','ab'].includes(draft.format)&&draft.options.some((_,i)=>!draft.images?.[i]))return {target:'images',message:'Add an image for each choice.',action:'Add images'};
 if(draft.format==='audio'&&!draft.audio)return {target:'audio',message:'Add question audio to finish this poll.',action:'Add audio'};
 if(draft.format==='ab'&&draft.options.length!==2)return {target:'options',message:'An A/B comparison needs exactly two choices.',action:'Edit choices'};
 if(draft.tags&&(!draft.tags.length||draft.tags.length>5))return {target:'topics',message:'Choose one to five topics.',action:'Choose topics'};
 if(draft.format==='video'&&draft.options.some((_,i)=>!draft.videos?.[i]||!draft.video_descriptions?.[i]?.trim()))return {target:'videos',message:'Add a video and a text description for each choice.',action:'Add videos'};
 return null;
}

export function estimateInput(draft){
 const {format,title,options,responses,reach,audience}=draft;
 return {format,title,options,responses,reach,audience};
}

export const formatGuidance={
 ab:{title:'Compare two versions',description:'Add two images. People can slide between them before choosing.'},
 video:{title:'Give each clip a clear label',description:'Add short clips with text descriptions. No autoplay.'},
 pairwise:{title:'Build a shortlist',description:'People choose a winner in each round until one remains.'},
 allocation:{title:'What deserves the most?',description:'People distribute 100 points across your priorities.'},
 classic:{title:'Make the choices clear',description:'Keep each option short, specific, and different.'},
 visual:{title:'Name each image',description:'These labels appear beneath your images.'},
 audio:{title:'Add audio, then choices',description:'People can listen or read before they answer.'},
 slider:{title:'Define your scale',description:'Label each step, from lowest to highest.'},
 rank:{title:'What should people rank?',description:'Add the choices people will put in order.'}
};
