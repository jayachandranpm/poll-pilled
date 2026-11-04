import {formats,validAnswer,topicIds} from './pollModel.js';
import {editorIssue} from './editorModel.js';
// Isolated UI fixture store. Never reads or writes the Flask database or calls AI.
const KEY='pollpilled-ui-demo-v1';
const clone=value=>JSON.parse(JSON.stringify(value));
const stamp=()=>new Date().toISOString();
const later=days=>new Date(Date.now()+days*86400000).toISOString();
const id=prefix=>prefix+'-'+crypto.randomUUID().slice(0,8);
const allFormats=Object.keys(formats);
export function recommendFormat(brief=''){
 const b=brief.toLowerCase();
 if(/video|clip|trailer|motion/.test(b))return {format:'video',title:'Video poll',reason:'Compare short clips with text alternatives.'};
 if(/budget|allocate|100 points|distribute/.test(b))return {format:'allocation',title:'Allocate 100',reason:'See how people divide their priorities.'};
 if(/a\/b|before and after|before.*after/.test(b))return {format:'ab',title:'A/B comparison',reason:'Slide between two versions before choosing.'};
 if(/this or that|tournament|head.to.head/.test(b))return {format:'pairwise',title:'This or that',reason:'Make one clear choice each round.'};
 if(/rank|prioriti|priority|order of|most important/.test(b))return {format:'rank',title:'Ranking',reason:'Learn what matters most by letting people put the options in order.'};
 if(/audio|voice|sound|listen|jingle|spoken/.test(b))return {format:'audio',title:'Audio',reason:'Let people listen before choosing, then explain their reaction in their own voice.'};
 if(/image|photo|design|logo|packag|visual|colour|color|bag/.test(b))return {format:'visual',title:'Image comparison',reason:'A side-by-side comparison makes visual preferences easier to express.'};
 if(/how much|rate|rating|scale|satisf|useful|likely/.test(b))return {format:'slider',title:'Rating slider',reason:'A five-point scale captures strength of feeling, beyond a yes or no.'};
 return {format:'classic',title:'Classic choice',reason:'A short set of clear choices is a good starting point for this decision.'};
}
export function demoDraft(brief,format=recommendFormat(brief).format){
 const common={name:'A new perspective',circle:'design',format,reach:'Community',audience:'Everyone',responses:20,hours:168,language:'English',images:[],audio:'',transcript:'',text_origin:'generated',image_origin:'human',audio_origin:'human'};
 const drafts={
  visual:{title:'Which design would you choose for everyday use?',options:['The everyday tote','The hands-free favourite'],images:['/assets/tote.png','/assets/crossbody.png'],image_origin:'generated'},
  rank:{title:'Which improvements would make the biggest difference to you?',options:['Ease of use','Reliability','More flexibility','Better support']},
  slider:{title:'How useful would this idea be in your everyday life?',options:['Not useful','A little','Somewhat','Very useful','Essential']},
  audio:{title:'What makes a place feel like home?',options:['The people','The little rituals','The space itself'],audio:'/assets/question-sample.mp3',transcript:'What makes a place feel like home? The people, the little rituals, or the space itself?',audio_origin:'generated'},
  classic:{title:'What matters most when trying something new?',options:['Ease of use','Quality','Price','A personal recommendation']}
 };
 return {...common,...drafts[format]};
}
export function demoQuote(d){
 const seconds=Math.max(20,Math.ceil((({classic:10,visual:25,audio:45,slider:20,rank:35,ab:30,video:75,pairwise:35,allocation:45}[d.format]||10)+(d.title||'').split(/\s+/).length/3+Math.max(0,(d.options?.length||2)-2)*3)/5)*5);
 const reward=(2+Number(d.format!=='classic')+Math.max(0,Math.ceil((seconds-30)/30)))*100;
 const cap=Number(d.responses||20);
 if(!Number.isInteger(cap)||cap<1||cap>(d.reach==='Community'?50:500))throw new Error('Choose 1–50 community responses or 1–500 boosted responses.');
 return {seconds,reward,cap,reward_credits:reward/100,fee_credits:2,response_credits:reward/100+2,credits:d.reach==='Boost'?cap*(reward/100+2):0,community_reserve:d.reach==='Boost'?0:cap*reward,matched_audience:d.audience==='Everyone'?1240:380,delivery:'Most sample campaigns fill in 1–3 days'};
}
function seed(){
 const make=(pid,circle,format,title,options,extra={})=>({id:pid,circle,format,title,name:title,options,images:[],audio:'',transcript:'',creator:'Quiet Orbit',tagline:'Curious about the everyday.',avatar:'otter',mine:false,sample:true,status:'active',cap:50,funding:'Community',audience:'Everyone',closes_at:later(7),text_origin:'human',image_origin:'human',audio_origin:'human',language:'English',saved:false,claim:null,outcome:null,base:[12,8,4,3,2].slice(0,options.length),...extra});
 const polls=[
  make('home','everyday','visual','Which corner would you call home?',['A little sunlight','A little colour'],{images:['/assets/sunroom.png','/assets/reading-nook.png'],image_origin:'generated'}),
  make('bag','design','visual','Which bag goes everywhere with you?',['The everyday tote','The hands-free favourite'],{images:['/assets/tote.png','/assets/crossbody.png'],image_origin:'generated',saved:true}),
  make('breakfast','food','classic','Your perfect slow Sunday starts with…',['Coffee and a croissant','A homemade breakfast','A visit to the market','Sleeping in']),
  make('week','work','slider','How much would a four-day week change your life?',['Not much','A little','Quite a bit','A lot','Everything']),
  make('voice','everyday','audio','What makes a place feel like home?',['The people','The little rituals','The space itself'],{audio:'/assets/question-sample.mp3',transcript:'What makes a place feel like home? The people, the little rituals, or the space itself?',audio_origin:'generated'}),
  make('priorities','work','rank','What matters most in your next work tool?',['Ease of use','Reliability','Flexibility','Support']),
  make('design-study','design','visual','Which everyday bag should we make next?',['The everyday tote','The hands-free favourite'],{mine:true,creator:'Bright Otter',tagline:'Making things with your perspective.',images:['/assets/tote.png','/assets/crossbody.png'],image_origin:'generated',funding:'Boost',audience:'design',cap:30,base:[0,0]}),
  make('tamil','food','classic','உங்கள் காலை உணவில் எது பிடிக்கும்?',['இட்லி','தோசை','பொங்கல்'],{language:'Tamil'}),
 ];
 const response=(rid,pid,name,answer,text,status='accepted',extra={})=>({id:rid,poll_id:pid,name,tagline:'Here for a different perspective.',answer,text,audio:'',transcript:'',status,reason:'',appeal:'',consent:true,created_at:stamp(),mine:false,...extra});
 const responses=[
  response('r1','design-study','Soft Willow',0,'I carry books and groceries. The wider opening makes the tote easier to use.'),
  response('r2','design-study','River Slope',1,'A zip and a hands-free strap matter most on a busy train.', 'accepted',{audio:'/assets/voice-sample.mp3',transcript:'Example transcript: I like having my hands free on the train, and a zip feels more secure.'}),
  response('r3','design-study','Quiet Orbit',0,'The tote looks more versatile, but I would add an inside pocket.'),
  response('r4','design-study','Mellow Finch',1,'I usually cycle to work, so the strap is useful.','pending'),
  response('r5','design-study','Amber Fox',0,'A washable fabric would make the tote ideal for groceries.','pending'),
  response('r6','design-study','Blue Cedar',0,'A zipped pocket would solve the issue for me.','appealed',{reason:'Initially flagged as a repeated answer.',appeal:'I described the feature I need. My answer is about the inside pocket, not the bag shape.'}),
  response('mine-pending','week','Bright Otter',3,'An extra day would give me time for family.','pending',{mine:true}),
  response('mine-review','priorities','Bright Otter',[1,0,2,3],'Reliability matters most when I am working to a deadline.','rejected',{mine:true,reason:'The sample reviewer asked for more detail about this ranking.'}),
  response('mine-accepted','bag','Bright Otter',0,'A tote has room for my books and lunch.','accepted',{mine:true})
 ];
 return {version:1,reactions:{},reports:[],polls,responses,comments:{home:[{id:'c1',name:'River Slope',text:'The sunlight makes it feel like a place I could slow down.',audio:'',likes:8,liked:false}], 'design-study':[{id:'c2',name:'Soft Willow',text:'An inside pocket would be a lovely addition.',audio:'',likes:3,liked:false}]},briefs:{},replacements:[{id:'replacement-1',poll_id:'design-study',status:'searching',reason:'One duplicate sample response was removed.',created_at:stamp()}],audit:[],
  preferences:{interests:['everyday','design'],formats:allFormats,languages:['English'],generated_polls:true,generated_media:true,followups:true,tagline:'A little curious about everything.',notifications:true},
  draft:{...demoDraft('compare two bag designs','visual'),name:'The everyday carry',text_origin:'human'},
  wallet:{points:1840,credits:1250,paid:475,redemptions:[{id:'paid-example',points:500,fee:25,net:475,status:'simulated',created_at:stamp()}],ledger:[{id:'l1',currency:'points',amount:300,kind:'Accepted response',data:JSON.stringify({title:'Which bag goes everywhere with you?'}),created_at:stamp()},{id:'l2',currency:'points',amount:-500,kind:'Demo redemption',created_at:stamp()},{id:'l3',currency:'credits',amount:1500,kind:'Demo credit purchase',created_at:stamp()},{id:'l4',currency:'credits',amount:-250,kind:'Sample campaign reserve',created_at:stamp()}]},
  invitations:[{id:'invite-1',poll_id:'bag',question:'What would make your everyday bag even more useful?',expires_at:later(5),status:'open',text:'',audio:'',answered_at:'',mine:true}],
  followups:[{id:'sent-1',poll_id:'design-study',question:'Which pocket would you add to your chosen bag?',status:'open',expires_at:later(5),replies:[{name:'Soft Willow',text:'An inside pocket with a zip for my keys.',audio:'',answered_at:stamp()},{name:'River Slope',text:'',audio:'',answered_at:''}]}],
  updates:[{poll_id:'bag',body:'You asked for an inside pocket. It is now part of our next sample design—thank you for helping shape it.',created_at:stamp()}],pool:945000,referral:{code:'curious-demo',qualified:3,requires_verified_identity:true},receipts:{}};
}
export function createDemoClient(storage){
 let initial;
 try{initial=JSON.parse(storage?.getItem(KEY)||'null')}catch{}
 let store=initial?.version===1?initial:seed();
 if(!store.pollFirst){store.preferences.formats=[...new Set([...store.preferences.formats,'ab','video','pairwise','allocation'])];store.pollFirst=true;}
 store.reactions??={};store.reports??=[];
 if(!store.pollFirstSamples){
  const common={...store.polls.find(p=>p.id==='breakfast'),mine:false,saved:false,my_response:null,claim:null,base:[0,0,0],tags:['everyday'],cap:50};
  store.polls.splice(1,0,
   {...common,id:'focus-pairwise',format:'pairwise',title:'A free hour appears. How would you spend it?',options:['A long walk','A good book','Making something'],circle:'everyday'},
   {...common,id:'focus-ab',format:'ab',title:'Which everyday bag feels more like you?',options:['Room for everything','Hands-free and light'],images:['/assets/tote.png','/assets/crossbody.png'],image_origin:'generated',base:[0,0],circle:'design',tags:['design']},
   {...common,id:'focus-allocation',format:'allocation',title:'How would you divide your ideal workday?',options:['Deep focus','Team time','Time to recharge'],circle:'work',tags:['work','wellbeing']},
   {...common,id:'focus-video',format:'video',title:'Which product preview would make you stop scrolling?',options:['A closer look','A little movement'],videos:['/assets/poll-preview-a.mp4','/assets/poll-preview-b.mp4'],video_descriptions:['A slow close-up of the everyday tote. No spoken audio.','A slow close-up of the hands-free bag. No spoken audio.'],video_origin:'generated',base:[0,0],circle:'design',tags:['design','entertainment']});store.pollFirstSamples=true;
 }

 // Update only the original bundled sample wording; never edit authored questions.
 const allocationSample=store.polls.find(p=>p.id==='focus-allocation'&&!p.mine);
 if(allocationSample?.title==='Give your ideal workday 100 points. What matters?')allocationSample.title='How would you divide your ideal workday?';

 const save=()=>{try{storage?.setItem(KEY,JSON.stringify(store))}catch{throw new Error('This demo’s local storage is full. Use the sample media instead of another upload.')}};
 const poll=pid=>{const p=store.polls.find(p=>p.id===pid);if(!p)throw new Error('This demo poll is no longer available.');return p};
 const response=rid=>{const r=store.responses.find(r=>r.id===rid);if(!r)throw new Error('Choose a demo response.');return r};
 const addLedger=(currency,amount,kind,pid)=>{store.wallet[currency]+=amount;store.wallet.ledger.unshift({id:id('ledger'),currency,amount,kind,created_at:stamp(),data:pid?JSON.stringify({title:poll(pid).title}):null})};
 const describe=p=>{
  const q=demoQuote({...p,responses:Math.min(p.cap,50),reach:p.funding});const accepted=store.responses.filter(r=>r.poll_id===p.id&&r.status==='accepted');const totals=[...(p.base||p.options.map(()=>0))];
  accepted.forEach(r=>p.format==='allocation'?r.answer.forEach((n,i)=>totals[i]+=n):totals[Array.isArray(r.answer)?r.answer[0]:r.answer]++);
  const count=p.format==='allocation'?accepted.length:totals.reduce((a,b)=>a+b,0);const my=store.responses.find(r=>r.mine&&r.poll_id===p.id)||null;
  const reason=p.mine?'Your own poll':p.status!=='active'?'Campaign '+p.status:p.audience!=='Everyone'&&!store.preferences.interests.includes(p.audience)?'Outside your selected interests':'';
  const used=store.responses.filter(r=>r.poll_id===p.id&&r.status!=='declined').length;
  const unlocked=!!my||p.mine; const {base,...safe}=p;
  return {...safe,tags:p.tags||[p.circle],results_unlocked:unlocked,reactions:unlocked?(store.reactions[p.id]||{}):{},my_reaction:p.my_reaction||'',reported:store.reports.some(r=>r.poll_id===p.id),ai:[p.text_origin,p.image_origin,p.audio_origin,p.video_origin].includes('generated'),reward:q.reward,seconds:q.seconds,positions:unlocked&&p.format==='rank'?p.options.map((_,i)=>accepted.length?Number((accepted.reduce((sum,r)=>sum+r.answer.indexOf(i)+1,0)/accepted.length).toFixed(1)):i+1):[],totals:unlocked?totals:[],responses:unlocked?count:0,comments:0,remaining:Math.max(0,p.cap-used-(p.base?.reduce((a,b)=>a+b,0)||0)),eligible:!reason,eligibility_reason:reason,my_response:my,outcome:unlocked?store.updates.find(u=>u.poll_id===p.id)||null:null};
 };
 const state=()=>({csrf:'demo-only',demo:true,polls:store.polls.map(describe).sort((a,b)=>Number(store.preferences.interests.includes(b.circle))-Number(store.preferences.interests.includes(a.circle))),preferences:store.preferences,draft:store.draft,
  wallet:{...store.wallet,pending:store.responses.filter(r=>r.mine&&['pending','rejected','appealed'].includes(r.status)).reduce((sum,r)=>sum+describe(poll(r.poll_id)).reward,0),points_per_rupee:100,demo:true},identity:{author:'Bright Otter',tagline:store.preferences.tagline},responses:store.responses.filter(r=>r.mine).map(r=>({...r,title:poll(r.poll_id).title})),invitations:store.invitations,updates:store.updates,referral:store.referral,pool:store.pool,
  ai:{meta:{configured:false},wit:{configured:false},demo:true},security:{access_enabled:false,turnstile_enabled:false,mode:'UI demonstration'}});
 const details=pid=>{const p=poll(pid);return {poll:describe(p),responses:store.responses.filter(r=>r.poll_id===pid&&(p.mine||r.mine)),comments:[],followups:p.mine?store.followups.filter(f=>f.poll_id===pid):[],brief:p.mine?store.briefs[pid]||null:null,replacements:p.mine?store.replacements.filter(r=>r.poll_id===pid):[],audit:p.mine?store.audit.filter(r=>r.poll_id===pid):[]};};
 function generateBrief(pid){
  const p=poll(pid),rows=store.responses.filter(r=>r.poll_id===pid&&r.status==='accepted'&&(r.text||r.transcript));
  if(rows.length<2)throw new Error('Add two sample responses first using “Load example responses”.');
  const groups=p.options.map((option,index)=>({option,rows:rows.filter(r=>(Array.isArray(r.answer)?r.answer[0]:r.answer)===index)})).filter(g=>g.rows.length);
  if(pid==='design-study'&&['r1','r2','r3'].every(id=>rows.some(r=>r.id===id)))return {demo:true,ai:true,sample_size:rows.length,generated_at:stamp(),themes:[{title:'Room for everyday essentials',summary:'Tote supporters value space for books and groceries. An inside pocket would make that flexibility more useful.',sources:['r1','r3']},{title:'Security on the move',summary:'The crossbody appeals to people who want a zip and a hands-free strap while commuting.',sources:['r2']}],disagreements:[{title:'More capacity or easier movement?',summary:'One respondent prioritises a wide opening and room for daily items; another values security and keeping their hands free on the train.',sources:['r1','r2']}]};
  return {demo:true,ai:true,sample_size:rows.length,generated_at:stamp(),themes:groups.map(g=>({title:g.option,summary:`${g.rows.length} sample participant${g.rows.length===1?'':'s'} chose this option. Their explanations below illustrate the evidence behind a finding.`,sources:g.rows.map(r=>r.id)})),disagreements:groups.length>1?[{title:'Different choices, different priorities',summary:'These sample respondents chose different options. Compare their original explanations to understand why.',sources:[groups[0].rows[0].id,groups[1].rows[0].id]}]:[]};
 }
 async function execute(path,data){
  const d=data||{};let m;
  if(path==='/api/community/state')return state();
  if((m=path.match(/^\/api\/community\/responses\/([^/]+)$/)))return {...response(m[1])};
  if((m=path.match(/^\/api\/community\/responses\/([^/]+)\/transcript-result$/))){const r=response(m[1]);if(typeof d.transcript!=='string')throw new Error('No transcript returned.');r.transcript=d.transcript;return {saved:true};}
  if((m=path.match(/^\/api\/community\/polls\/([^/]+)\/insights-result$/))){poll(m[1]);if(!d.brief||!Array.isArray(d.brief.themes)||!Array.isArray(d.brief.disagreements))throw new Error('No valid brief returned.');store.briefs[m[1]]=d.brief;return {saved:true};}

  if(path==='/api/community/demo/reset'){store=seed();return {saved:true}}
  if(path==='/api/community/quote')return {quote:demoQuote(d)};
  if(path==='/api/community/preferences'){
   for(const k of ['interests','formats','languages'])if(k in d&&(!Array.isArray(d[k])||!d[k].length))throw new Error('Keep at least one '+k+' selection.');
   store.preferences={...store.preferences,...d};return {preferences:store.preferences};
  }
  if(path==='/api/community/draft'){store.draft=d.draft;return {saved:true}}
  if(path==='/api/community/publish'){
   const issue=editorIssue(d);if(issue)throw new Error(issue.message); const q=demoQuote(d);if(!d.data_use_accepted)throw new Error('Confirm the demo publishing terms.');
   if(d.title.trim().length<8||d.options.some(o=>!o.trim())||new Set(d.options.map(o=>o.toLowerCase())).size!==d.options.length)throw new Error('Use a clear question and distinct options.');
   if(d.format==='visual'&&d.options.some((_,i)=>!d.images[i]))throw new Error('Choose an image for each option.');
   if(q.credits>store.wallet.credits)throw new Error('Add demo credits before publishing.');
   if(q.community_reserve>store.pool)throw new Error('Choose a smaller community allocation.');
   const pid=id('poll');store.polls.unshift({...d,id:pid,base:d.options.map(()=>0),creator:'Bright Otter',tagline:store.preferences.tagline,mine:true,sample:true,status:'active',funding:d.reach,cap:q.cap,closes_at:later(d.hours/24),claim:null});
   if(q.credits)addLedger('credits',-q.credits,'Demo campaign reserve',pid);else store.pool-=q.community_reserve;
   store.draft={};return {id:pid};
  }
  if((m=path.match(/^\/api\/community\/polls\/([^/]+)\/(.+)$/))){
   const [,pid,action]=m,p=poll(pid),current=describe(p);
   if(action==='details')return details(pid);
   if(action==='claim'){if(!current.eligible)throw new Error(current.eligibility_reason);if(!current.remaining)throw new Error('This sample campaign is full.');p.claim={expires_at:new Date(Date.now()+900000).toISOString(),reward:current.reward};return p.claim}
   if(action==='answer'){
    if(current.my_response)return {response:current.my_response};if(!p.claim||new Date(p.claim.expires_at).getTime()<=Date.now())throw new Error('Your place expired. Reserve a demo place again.');
    if(!validAnswer(p,d.answer))throw new Error('Complete your answer before submitting.');
    const r={audio_origin:d.audio_origin==='generated'?'generated':'human',id:id('answer'),poll_id:pid,name:'Bright Otter',mine:true,answer:d.answer,text:d.text||'',audio:d.audio||'',public_audio:!!d.public_audio,transcript:d.transcript||'',consent:!!d.consent,status:'accepted',reason:'',appeal:'',created_at:stamp()};store.responses.push(r);p.claim=null;addLedger('points',current.reward,'Demo accepted response',pid);return {response:r};
   }
   if(action==='save'){p.saved=d.saved;return {saved:p.saved}}
   if(action==='comments')throw new Error('Comments are not part of Poll Pilled.');
   if(action==='react'){if(!current.my_response)throw new Error('Answer the poll to react to its results.');if(!['','helpful','surprising','relatable'].includes(d.reaction))throw new Error('Choose a supported reaction.');const counts=store.reactions[pid]??={};if(p.my_reaction)counts[p.my_reaction]=Math.max(0,(counts[p.my_reaction]||0)-1);p.my_reaction=d.reaction;if(d.reaction)counts[d.reaction]=(counts[d.reaction]||0)+1;return {saved:true};}
   if(action==='report'){if(!['Misleading','Harmful or offensive','Spam or abuse','Unlabelled AI content','Other'].includes(d.reason))throw new Error('Choose a report reason.');if(!store.reports.some(r=>r.poll_id===pid))store.reports.push({poll_id:pid,reason:d.reason,detail:(d.detail||'').slice(0,1000),created_at:stamp()});return {saved:true,demo:true};}
   if(action==='insights'){store.briefs[pid]=generateBrief(pid);return {brief:store.briefs[pid]}}
   if(action==='examples'){
    if(store.responses.some(r=>r.poll_id===pid))return {saved:true};
    for(let i=0;i<3;i++)store.responses.push({id:id('example'),poll_id:pid,name:['Soft Willow','River Slope','Quiet Orbit'][i],answer:p.format==='allocation'?p.options.map((_,j)=>j===i%p.options.length?100:0):p.format==='rank'?p.options.map((_,j)=>(j+i)%p.options.length):i%p.options.length,text:['This option fits my everyday routine.','I would choose something easier to carry.','A small improvement in convenience would help.'][i],audio:'',transcript:'',status:'accepted',consent:true,reason:'',appeal:'',created_at:stamp()});return {saved:true};
   }
   if(action==='outcome'){store.updates=store.updates.filter(u=>u.poll_id!==pid);store.updates.unshift({poll_id:pid,body:d.text,image:d.image||'',created_at:stamp()});return {saved:true}}
   if(action==='status'){if(p.status==='ended')throw new Error('This demo campaign has ended.');p.status=d.status;if(d.status==='ended'){const refund=current.remaining*(current.reward/100+2);if(p.funding==='Boost')addLedger('credits',refund,'Demo unused-place refund',pid);else store.pool+=current.remaining*current.reward}return {saved:true}}
   if(action==='boost'){const cost=d.responses*(current.reward/100+2);if(cost>store.wallet.credits)throw new Error('Add more demo credits first.');addLedger('credits',-cost,'Demo audience boost',pid);p.cap=current.responses+Number(d.responses);p.funding='Boost';p.audience=d.audience;return {saved:true}}
   if(action==='followups'){
    if(!d.response_ids?.length)throw new Error('Choose a consenting sample participant.');
    const selected=d.response_ids.map(response);if(selected.some(r=>!r.consent||r.status!=='accepted'))throw new Error('Choose accepted, consenting participants.');
    const cost=selected.length*2;if(cost>store.wallet.credits)throw new Error('Add more demo credits.');addLedger('credits',-cost,'Demo follow-up reserve',pid);
    const fid=id('followup');store.followups.unshift({id:fid,poll_id:pid,question:d.question,status:'open',expires_at:later(7),replies:selected.map(r=>({name:r.name,text:'',audio:'',answered_at:''}))});return {id:fid};
   }
  }
  if((m=path.match(/^\/api\/community\/responses\/([^/]+)\/(review|appeal|transcribe)$/))){
   const r=response(m[1]);
   if(m[2]==='transcribe'){r.transcript='Example transcript: I like having my hands free, and a secure pocket would make it even better.';return {transcript:r.transcript}}
   if(m[2]==='appeal'){r.status='appealed';r.appeal=d.reason;return {saved:true}}
   const previous=r.status;r.status=d.action==='accept'?'accepted':'rejected';r.reason=d.reason||'';if(r.mine&&r.status==='accepted'&&previous!=='accepted')addLedger('points',describe(poll(r.poll_id)).reward,'Demo reward released',r.poll_id);return {saved:true};
  }
  if((m=path.match(/^\/api\/community\/moderation\/([^/]+)$/))){
   const r=response(m[1]);if(!['rejected','appealed'].includes(r.status))throw new Error('This case has already been resolved.');
   r.status=d.action==='accept'?'accepted':'declined';r.reason=d.reason;
   store.audit.unshift({id:id('audit'),poll_id:r.poll_id,name:r.name,decision:r.status,reason:d.reason,created_at:stamp()});
   if(r.mine&&r.status==='accepted')addLedger('points',describe(poll(r.poll_id)).reward,'Demo appeal accepted',r.poll_id);
   if(r.status==='declined')store.replacements.push({id:id('replacement'),poll_id:r.poll_id,status:'searching',reason:'Invalid sample response removed; its place is being refilled.',created_at:stamp()});return {saved:true};
  }
  if((m=path.match(/^\/api\/community\/replacements\/([^/]+)\/fill$/))){
   const replacement=store.replacements.find(r=>r.id===m[1]);if(!replacement)throw new Error('Replacement not found.');if(replacement.status==='filled')return {saved:true};
   replacement.status='filled';const p=poll(replacement.poll_id);store.responses.push({id:id('replacement-answer'),poll_id:p.id,name:'Silver Maple',answer:p.format==='allocation'?p.options.map((_,i)=>i===0?100:0):p.format==='rank'?p.options.map((_,i)=>i):0,text:'The simpler design fits what I use every day.',audio:'',transcript:'',status:'accepted',consent:true,reason:'',appeal:'',created_at:stamp()});return {saved:true};
  }
  if((m=path.match(/^\/api\/community\/followups\/([^/]+)\/(answer|close|sample-reply)$/))){
   const [,fid,action]=m;
   if(action==='answer'){const f=store.invitations.find(f=>f.id===fid);if(f.answered_at)return {saved:true};if(!d.audio&&(d.text||'').trim().length<10)throw new Error('Add a little more detail.');Object.assign(f,{text:d.text,audio:d.audio,answered_at:stamp()});addLedger('points',100,'Demo paid follow-up',f.poll_id);return {saved:true}}
   const f=store.followups.find(f=>f.id===fid);if(!f)throw new Error('Follow-up not found.');
   if(action==='sample-reply'){const r=f.replies.find(r=>!r.answered_at);if(r)Object.assign(r,{text:'A zipped inside pocket would be useful for my keys.',answered_at:stamp()});return {saved:true}}
   if(f.status==='open'){addLedger('credits',f.replies.filter(r=>!r.answered_at).length*2,'Demo unused-invitation refund',f.poll_id);f.status='closed'}return {saved:true};
  }
  if((m=path.match(/^\/api\/community\/comments\/([^/]+)\/like$/)))throw new Error('Comments are disabled.');
  if(path==='/api/community/credits'){addLedger('credits',d.amount,'Demo credit purchase');return {simulated:true}}
  if(path==='/api/community/redeem'){if(!Number.isInteger(d.points)||d.points<500)throw new Error('Redeem at least 500 whole points.');if(store.wallet.points<d.points)throw new Error('Not enough available demo points.');addLedger('points',-d.points,'Demo redemption');const net=d.points-Math.ceil(d.points*.05);store.wallet.paid+=net;store.wallet.redemptions.unshift({id:id('redemption'),points:d.points,fee:d.points-net,net,status:'simulated',created_at:stamp()});return {simulated:true}}
  if(path==='/api/community/export')return {demo:true,preferences:store.preferences,wallet:state().wallet,responses:store.responses.filter(r=>r.mine)};
  if(path==='/api/community/referral')return {saved:true,demo:true};
  if(path==='/api/ai')return d.task==='draft'?{draft:demoDraft(d.prompt,d.format)}:{question:d.prompt.trim().replace(/\?*$/,'')+'?',text_origin:d.text_origin||'rephrased',demo:true};
  if(path==='/api/ai/transcribe')return {transcript:'Compare two bag designs for everyday use, and learn why people prefer one.',demo:true};
  if(path==='/api/ai/speech')return {url:'/assets/question-sample.mp3',audio_origin:'generated',demo:true};
  if(path==='/api/ai/image')return {url:'/assets/sunroom.png',image_origin:'generated',demo:true};
  if(path==='/api/ai/vision')return {description:'Example comparison: the first option has an open, spacious shape; the second is compact and easier to carry hands-free.',demo:true};
  throw new Error('This action is not available in the UI demonstration.');
 }
 return {async request(path,data){
  const before=clone(store);
  try{const result=await execute(path,data);if(data!==undefined)save();return clone(result)}catch(error){store=before;throw error}
 }};
}
let browserClient;
export function demoRequest(path,data){if(!browserClient){let storage;try{storage=window.localStorage}catch{}browserClient=createDemoClient(storage)}return browserClient.request(path,data)}
