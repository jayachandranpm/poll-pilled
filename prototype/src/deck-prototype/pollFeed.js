export function pollFeed(polls,state,formats){
 const pref=state.preferences||{};
 const result=polls.filter(p=>{
  if(p.removed||(state.view==='discover'&&p.mine))return false;
  if(state.view==='discover'&&!p.my_response&&(p.eligible===false||p.remaining===0))return false;
  if(state.feedTab==='following'&&!p.followed_creator)return false;
  if(pref.languages?.length&&p.language&&!pref.languages.includes(p.language))return false;
  if(['text','image','audio','video'].some((kind,i)=>pref[['generated_polls','generated_images','generated_audio','generated_video'][i]]===false&&p[kind+'_origin']==='generated'))return false;
  if(state.appliedFormats&&!state.appliedFormats.has(p.type))return false;
  const topics=p.topics||[p.topic];
  if(state.topic!=='For you'&&!topics.includes(state.topic))return false;
  return `${p.title} ${topics.join(' ')} ${formats[p.type]?.[0]||''}`.toLowerCase().includes((state.query||'').toLowerCase());
 });
 if(state.feedTab==='following')result.sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||'')||b.id.localeCompare(a.id));
 if(state.sort==='quick')result.sort((a,b)=>a.seconds-b.seconds);
 if(state.sort==='reward')result.sort((a,b)=>b.reward-a.reward);
 return result;
}
