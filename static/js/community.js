/* Personal, actionable participation; every receipt comes from a saved reward. */
'use strict';
const memberName=()=>state.profile.name&&state.profile.name!=='Curious human'?state.profile.name.trim().split(/\s+/)[0]:'';
let featuredIndex=0;
function renderPersonalCommunity(){
  const market=state.market;if(!market)return;
  const isHome=state.view==='explore';
  const focused=isHome&&!state.q&&state.category==='All topics'&&!state.mode;
  $('#hero').hidden=!focused;
  $$('.poll-card[data-card]').forEach(el=>el.hidden=false);
  if($('#header-points'))$('#header-points').textContent=formatNumber(market.points)+' pts';
  if(isHome){
    state.workspace='participant';$('#workspace-label').textContent='Participant workspace';
    $('#page-title').textContent=memberName()?`For you, ${memberName()}`:'For you';
    $('#page-description').textContent=market.rewarded_responses?`${market.rewarded_responses} polls answered · ${formatNumber(market.earned)} points earned`:'A quick vote. A fresh perspective.';
    $('#feed-title').textContent=focused?'More polls':'Polls';
  }else{
    const copy={lounge:['Voice lounge','Listen. Vote. Have your say.'],mine:['My polls',''],saved:['Saved polls',''],voted:['My votes','']};
    if(copy[state.view]){const [title,description]=copy[state.view];$('#page-title').textContent=title;$('#page-description').textContent=description;$('#feed-title').textContent='Polls';}
  }
  const target=$('.reward-hero-copy');if(!target||!focused)return;
  const receipt=state.contributionReceipt;
  if(receipt){
    target.innerHTML=`<div class="contribution-receipt" role="status"><span class="contribution-points">${icon('check-circle-linear')}+${receipt.points} points</span><h2>${memberName()?`Thanks, ${escapeHTML(memberName())}.`:'Thanks for sharing.'}</h2><p>Your pick: <strong>${escapeHTML(receipt.choice)}</strong></p><div class="featured-actions"><button class="button coral" data-action="next-question">Next poll${icon('arrow-right-linear')}</button><button class="text-button" data-open="${escapeHTML(receipt.id)}">${icon(receipt.voice_bonus?'microphone-3-linear':'chat-round-line-linear')}${receipt.voice_bonus?'Add a voice · +100 pts':'Perspectives'}</button></div>${receipt.milestone?`<div class="contribution-milestone">${icon('medal-ribbon-linear')}<span>500 points reached. Ready to redeem.</span><button data-action="redeem">Review demo redemption${icon('arrow-right-linear')}</button></div>`:''}</div>`;
    return;
  }
  const candidates=state.polls.filter(p=>p.reward?.eligible&&!p.my_vote).sort((a,b)=>Number(market.interests.includes(b.category))-Number(market.interests.includes(a.category)));
  const poll=candidates.length?candidates[featuredIndex%candidates.length]:null;
  if(!poll){
    target.innerHTML=`<span class="reward-eyebrow">${icon('check-circle-linear')}ALL CAUGHT UP</span><h2>Your voice made a difference.</h2><div class="featured-actions"><button class="button coral" data-action="create">Ask a question${icon('add-linear')}</button><button class="text-button" data-view="voted">My votes${icon('arrow-right-linear')}</button></div>`;
    return;
  }
  const duplicate=$$('.poll-card[data-card]').find(el=>el.dataset.card===poll.id);if(duplicate)duplicate.hidden=true;
  target.innerHTML=`<div class="featured-meta"><span class="reward-eyebrow">${icon('medal-ribbon-linear')}+${poll.reward.points} POINTS · ${poll.estimated_seconds}s</span><span>${escapeHTML(poll.category)}</span>${provenanceBadge(poll)}</div><h2 class="featured-question"><button data-open="${escapeHTML(poll.id)}">${escapeHTML(poll.title)}</button></h2><div class="featured-vote">${poll.mode==='image'?visualOptions(poll):voteOptions(poll)}</div><div class="featured-actions"><button class="text-button" data-open="${escapeHTML(poll.id)}">${icon('chat-round-line-linear')}${poll.takes_count} perspectives${icon('arrow-right-linear')}</button><button class="text-button" data-action="skip-question">Skip${icon('arrow-right-linear')}</button></div>`;
}
const communityFeedRenderer=renderFeed;
renderFeed=function(){communityFeedRenderer();renderPersonalCommunity();};
const communityMarketUpdated=marketUpdated;
marketUpdated=function(){communityMarketUpdated();renderPersonalCommunity();};
const communitySetView=setView;
setView=function(view){if(['explore','lounge','mine','saved','voted'].includes(view)){state.workspace='participant';localStorage.setItem('pollpilled-workspace','participant');}communitySetView(view);renderPersonalCommunity();};
const campaignStarters=[
  {name:'Compare two ideas',note:'Find out which direction people prefer.',title:'Which would help you more: a weekly planner or an automatic task sorter?',options:['A weekly planner','An automatic task sorter'],category:'Design',mode:'text',icon:'widget-2-linear'},
  {name:'Understand a habit',note:'Learn when and why a decision happens.',title:'When do you usually decide what to eat for dinner?',options:['Before lunchtime','When I’m already hungry'],category:'Food & drink',mode:'text',icon:'clock-circle-linear'},
  {name:'Hear their reasons',note:'Invite a voice note behind each answer.',title:'What makes you trust a new app enough to try it?',options:['Someone I know recommends it','The maker explains it clearly'],category:'Tech & AI',mode:'voice',icon:'microphone-3-linear'}
];
function publisherDraftPanel(){return `<section class="publisher-start"><div class="market-section-head"><h2>Ask your audience</h2></div><form id="publisher-quick-draft"><label class="sr-only" for="publisher-question">Your research question</label><input class="input" id="publisher-question" name="question" minlength="8" maxlength="180" placeholder="What would you like to know?" required><button class="button coral" type="submit">Continue${icon('arrow-right-linear')}</button></form><div class="campaign-starters">${campaignStarters.map((s,i)=>`<button data-campaign-starter="${i}">${icon(s.icon)}<strong>${s.name}</strong>${icon('arrow-right-up-linear')}</button>`).join('')}</div></section>`;}
function campaignDraft(starter){openComposer(starter.mode||'text',{description:'',images:['',''],hours:24,funding:'publisher',audience:'Everyone',response_cap:50,...starter});}
document.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.dataset.action==='skip-question'){featuredIndex++;renderPersonalCommunity();}
  if(button.dataset.action==='next-question'){state.contributionReceipt=null;renderPersonalCommunity();}
  if(button.dataset.campaignStarter!==undefined)campaignDraft(campaignStarters[Number(button.dataset.campaignStarter)]);
});
document.addEventListener('submit',event=>{if(event.target.id==='publisher-quick-draft'){event.preventDefault();campaignDraft({title:$('#publisher-question').value.trim(),options:['',''],category:'Culture',mode:'text'});}});
