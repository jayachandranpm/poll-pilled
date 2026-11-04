const views=['overview','discover','search','create','polls','wallet','saved','settings'];
const sections=['menu','profile','interests','appearance','privacy'];
export function routeHash(state){
 let path=state.view, query=new URLSearchParams();
 if(path==='settings'&&state.settings!=='menu')path+='/'+state.settings;
 if(state.view==='polls'&&state.tab==='drafts')query.set('tab','drafts');
 if(['discover','search'].includes(state.view)){
  if(state.view==='discover'&&state.mobileAnswer&&state.poll)path+='/'+encodeURIComponent(state.poll);
  if(state.feedTab==='following')query.set('feed','following');
  if(state.topic&&state.topic!=='For you')query.set('topic',state.topic);
  if(state.query)query.set('q',state.query);
  if(state.sort&&state.sort!=='recommended')query.set('sort',state.sort);
 }
 return '#'+path+(query.size?'?'+query:'');
}
export function parseRoute(hash){
 const [path,search='']=hash.replace(/^#/,'').split('?'),[requested,detail]=path.split('/');
 const view=views.includes(requested)?requested:'discover',query=new URLSearchParams(search);
 const result={view,mobileAnswer:false};
 if(view==='settings')result.settings=sections.includes(detail)?detail:'menu';
 if(view==='polls')result.tab=query.get('tab')==='drafts'?'drafts':'live';
 if(['discover','search'].includes(view)){
  Object.assign(result,{feedTab:query.get('feed')==='following'?'following':'foryou',topic:query.get('topic')||'For you',query:query.get('q')||'',sort:['quick','reward'].includes(query.get('sort'))?query.get('sort'):'recommended'});
  if(view==='discover'&&detail&&/^[A-Za-z0-9_-]+$/.test(detail))Object.assign(result,{poll:detail,mobileAnswer:true});
 }
 return result;
}
