export const formats={classic:['Classic poll','text-field-linear'],visual:['Image selection','gallery-linear'],ab:['A/B comparison','gallery-linear'],audio:['Audio poll','microphone-3-linear'],video:['Video poll','play-linear'],slider:['Opinion scale','tuning-2-linear'],rank:['Ranking poll','list-linear'],pairwise:['This or that','arrow-right-linear'],allocation:['Allocate 100%','chart-square-linear']};
export const topics=[{id:'everyday',name:'Everyday life',description:'Small decisions, better days',icon:'home-smile-linear'},{id:'design',name:'Design',description:'Products, visuals & experiences',icon:'paint-linear'},{id:'food',name:'Food & culture',description:'Tastes worth sharing',icon:'cup-hot-linear'},{id:'work',name:'Work',description:'Tools, teams & better routines',icon:'case-round-linear'},{id:'technology',name:'Technology',description:'What comes next',icon:'laptop-linear'},{id:'entertainment',name:'Entertainment',description:'Watch, listen & play',icon:'play-linear'},{id:'travel',name:'Travel',description:'Places & adventures',icon:'compass-linear'},{id:'wellbeing',name:'Wellbeing',description:'Life at your own pace',icon:'heart-linear'}];
export const topicIds=topics.map(t=>t.id);
export const initialAnswer=p=>p.format==='rank'?p.options.map((_,i)=>i):p.format==='allocation'?p.options.map(()=>0):null;
export function validAnswer(p,value){const n=p.options.length;if(p.format==='rank')return Array.isArray(value)&&value.length===n&&[...value].sort((a,b)=>a-b).every((v,i)=>Number.isInteger(v)&&v===i);if(p.format==='allocation')return Array.isArray(value)&&value.length===n&&value.every(v=>Number.isInteger(v)&&v>=0&&v<=100)&&value.reduce((a,b)=>a+b,0)===100;return Number.isInteger(value)&&value>=0&&value<n;}
export const isGenerated=p=>['text_origin','image_origin','audio_origin','video_origin'].some(k=>p[k]==='generated');
export function matchesPreferences(p,pref){return pref.formats.includes(p.format)&&pref.languages.includes(p.language)&&(!pref.human_only||!isGenerated(p))&&(pref.generated_polls||p.text_origin!=='generated')&&(pref.generated_media||!['image_origin','audio_origin','video_origin'].some(k=>p[k]==='generated'));}
export const topicMatch=(p,pref)=>(p.tags?.length?p.tags:[p.circle]).filter(tag=>pref.interests.includes(tag)).length;
export const answerLabel=(p,value)=>p.format==='allocation'?p.options.map((o,i)=>`${o}: ${value?.[i]||0}%`).join(' · '):Array.isArray(value)?value.map(i=>p.options[i]).join(' → '):p.options[value];

export function allocatePoints(values,index,amount){
 const next=values.map((v,i)=>i===index?Math.max(0,Math.min(100,Math.round(amount))):v);
 const total=next.reduce((a,b)=>a+b,0);if(total<=100)return next;
 const available=100-next[index],others=total-next[index];
 const balanced=next.map((v,i)=>i===index?v:Math.floor(v*available/others));
 let remainder=100-balanced.reduce((a,b)=>a+b,0);
 for(let i=0;remainder>0&&i<balanced.length;i++)if(i!==index){balanced[i]++;remainder--;}
 return balanced;
}

export function comparePolls(a,b,{sort,preferences,answered}){
 return Number(answered.has(a.id))-Number(answered.has(b.id)) || (sort==='reward'?b.reward-a.reward:sort==='quick'?a.seconds-b.seconds:topicMatch(b,preferences)-topicMatch(a,preferences));
}
