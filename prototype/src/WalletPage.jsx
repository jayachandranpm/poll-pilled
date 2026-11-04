import React, {useState,useEffect} from 'react';
import {Button, Icon, Segmented, Illustration} from './ui.jsx';
import {Avatar, Empty, MediaInput, Modal} from './Features.jsx';
import {community, DEMO_MODE,mediaURL} from './api.js';
import {answerLabel} from './pollModel.js';
import {actionableCount,reviewDeadline,dateTime} from './interactionState.js';
const walletDrafts=new Map();

const number = value => Number(value || 0).toLocaleString();
const date = value => new Date(value).toLocaleDateString(undefined, {month:'short', day:'numeric'});
const statusLabel = {pending:'In review', rejected:'Action needed', appealed:'Appeal in review',accepted:'Reward available',declined:'Review complete'};

export function WalletPage({state, refresh, notify, onRedeem, onBuy, onExplore, onOpenPoll,responseId,onCloseReview}) {
  const [tab,setTab] = useState('Points'),[receipt,setReceipt]=useState(null);
  const [detail,setDetail] = useState(null);
  const [text,setText] = useState('');
  const [audio,setAudio] = useState('');
  const [busy,setBusy] = useState(false);
  const {wallet} = state;
  const invitations = state.invitations.filter(item => !item.answered_at && item.status === 'open' && new Date(item.expires_at)>new Date());
  const reviews = state.responses.filter(item => ['pending','rejected','appealed'].includes(item.status));
  const needsAction = actionableCount(state);
  const waiting=reviews.filter(item=>item.status!=='rejected');
  const transactions = wallet.ledger.filter(item => item.currency === tab.toLowerCase());
  const open = (type,item) => {const draft=walletDrafts.get(item.id);setText(draft?.text||'');setAudio(draft?.audio||'');setDetail({type,id:item.id});};
  useEffect(()=>{if(responseId&&state.responses.some(r=>r.id===responseId))open('review',{id:responseId})},[responseId]);
  useEffect(()=>{if(detail)walletDrafts.set(detail.id,{text,audio})},[detail,text,audio]);
  const close=()=>{if(!busy){setDetail(null);onCloseReview?.()}};
  const selected = detail && (detail.type === 'invitation' ? state.invitations : state.responses).find(item => item.id === detail.id);
  const run = async (action,message) => {
    if(busy)return;
    setBusy(true);
    try {await action();await refresh();walletDrafts.delete(detail.id);setDetail(null);onCloseReview?.();notify(message);}
    catch(error){notify(error.message);}
    finally{setBusy(false);}
  };
  const copyInvite = async () => {
    try {await navigator.clipboard.writeText(`${location.origin}${location.pathname}?ref=${state.referral.code}`);notify('Invitation link copied.');}
    catch {notify('Invitation code: '+state.referral.code);}
  };
  return <div className="page-body wallet-overview">
    <div className="wallet-balances">
      <section className="earnings-card" aria-label="Your earnings">
        <div className="card-overline"><span><span className="card-icon warm"><Icon name="medal-ribbon-linear" size={26}/></span>Your earnings</span><span className="quiet-label">{DEMO_MODE?'Demo balance':'Available balance'}</span></div>
        <div className="earnings-main"><div><strong className="wallet-number">{number(wallet.points)}<span>points</span></strong><p>₹{(wallet.points/100).toFixed(2)} gross reward value</p><small>100 points = ₹1 · 5% redemption fee · minimum 500 points</small>{wallet.points<500&&<small className="reward-minimum">{500-wallet.points} more points to redeem</small>}</div><Button icon="arrow-right-up-linear" disabled={wallet.points<500} onClick={onRedeem}>Redeem points</Button></div>
        <div className="earnings-status"><div><span className="status-mark"><Icon name="clock-circle-linear" size={18}/></span><span><b>{number(wallet.pending)} points</b><small>Awaiting review</small></span></div><div><span className="status-mark"><Icon name="check-circle-linear" size={18}/></span><span><b>₹{(wallet.paid/100).toFixed(2)}</b><small>{DEMO_MODE?'Redeemed · simulated':'Redeemed'}</small></span></div></div>
      </section>
      <section className="publishing-balance" aria-label="Publishing credits">
        <div className="card-overline"><span><span className="card-icon"><Icon name="wallet-money-linear" size={26}/></span>Publishing credits</span></div>
        <strong className="wallet-number">{number(wallet.credits)}<span>credits</span></strong>
        <p>Put your next question in front of people.</p>
        <Button kind="secondary" icon="add-linear" onClick={onBuy}>Add credits</Button>
      </section>
    </div>
    <div className="wallet-columns"><div className="wallet-primary">
      <section className={`workspace-card wallet-inbox ${!invitations.length&&!reviews.length?'is-clear':''}`} aria-labelledby="wallet-inbox-title">
        <header className="section-heading"><div><h3 id="wallet-inbox-title">Your next steps</h3><p>{needsAction?`${needsAction} ${needsAction===1?'thing':'things'} for your attention`:'You’re all caught up'}</p></div></header>
        {invitations.map(item => <button className="inbox-row" key={item.id} onClick={()=>open('invitation',item)}><span className="inbox-icon"><Icon name="chat-round-line-linear"/></span><span className="inbox-copy"><span className="row-kicker">Paid follow-up <b>+100 pts</b></span><strong>{item.question}</strong><small>About 1 min · Reply by {date(item.expires_at)}</small></span><Icon name="alt-arrow-right-linear" size={20}/></button>)}
        {reviews.filter(item=>item.status==='rejected').map(item => <button className="inbox-row" key={item.id} onClick={()=>open('review',item)}><span className={`inbox-icon ${item.status==='rejected'?'attention':''}`}><Icon name={item.status==='pending'?'clock-circle-linear':item.status==='appealed'?'shield-check-linear':'chat-round-line-linear'}/></span><span className="inbox-copy"><span className="row-kicker">{statusLabel[item.status]}</span><strong>{item.title}</strong><small>{item.status==='rejected'?'Read the feedback or request a review':item.status==='appealed'?'Your reward stays reserved during review':'We’ll let you know when your reward is ready'}</small></span><Icon name="alt-arrow-right-linear" size={20}/></button>)}
        {!needsAction&&<div className="wallet-clear"><Icon name="check-circle-linear" size={32}/><p>No actions needed. Rewards under review are tracked below.</p></div>}
      </section>
      {waiting.length>0&&<section className="workspace-card waiting-rewards"><h3>Rewards in review <span className="badge">{waiting.length}</span></h3>{waiting.map(item=><button className="inbox-row" key={item.id} onClick={()=>open('review',item)}><Icon name="clock-circle-linear"/><span className="inbox-copy"><strong>{item.title}</strong><small>{item.status==='appealed'?'Appeal in review · reward reserved':`Review window ends ${dateTime(reviewDeadline(item))}`}</small></span><Icon name="alt-arrow-right-linear" size={18}/></button>)}</section>}
      <section className="workspace-card wallet-ledger" aria-labelledby="wallet-activity-title"><header className="section-heading"><h3 id="wallet-activity-title">Activity</h3><Segmented label="Activity type" options={['Points','Credits']} value={tab} onChange={setTab} compact/></header>
        {transactions.length?<><div className="ledger-caption"><span>Transaction</span><span>{tab}</span></div>{transactions.map(item=>{
          let title='';try{title=item.data?JSON.parse(item.data).title:'';}catch{/* An older activity entry may have no details. */}
          return <button className="ledger-row" key={item.id} onClick={()=>setReceipt(item)} aria-label={`View receipt: ${item.kind}, ${item.amount} ${item.currency}`}><span className="ledger-symbol"><Icon name={item.amount>0?'add-linear':'arrow-right-up-linear'} size={20}/></span><div><b>{item.kind.replace(/^(Demo|Sample) /,'').replace(/^./,letter=>letter.toUpperCase())}</b><small>{title&&<>{title} · </>}{dateTime(item.created_at)}</small></div><strong className={item.amount>0?'positive':''}>{item.amount>0?'+':'−'}{number(Math.abs(item.amount))}</strong></button>;
        })}</>:<Empty kind="no-results" title="A fresh start">Your {tab.toLowerCase()} activity will appear here.</Empty>}
      </section>
    </div><aside className="wallet-secondary" aria-label="Your impact and rewards">
      {state.preferences.notifications&&state.updates.map(update=><article className="impact-card" key={update.poll_id}><div className="impact-art">{update.image?<img src={mediaURL(update.image)} alt="Publisher’s decision"/>:<Illustration name="empty-polls" alt=""/>}</div><span className="eyebrow">YOU HELPED DECIDE</span><h3>Your voice made it into the design.</h3><p>{update.body}</p><button className="text-link" onClick={()=>onOpenPoll(state.polls.find(poll=>poll.id===update.poll_id))}>See the poll<Icon name="arrow-right-linear" size={18}/></button><div className="impact-signature"><Avatar name={state.polls.find(poll=>poll.id===update.poll_id)?.creator} size={28}/><span>{state.polls.find(poll=>poll.id===update.poll_id)?.creator||'The publisher'} · Poll creator</span></div></article>)}
      <section className="wallet-guide"><h3>Good to know</h3><details><summary>How points work<Icon name="alt-arrow-down-linear" size={18}/></summary><p>100 points = ₹1. Redeem from 500 points, with a 5% platform fee. {DEMO_MODE?'Balances and payouts are simulated in this preview.':''}</p></details><details><summary>When rewards arrive<Icon name="alt-arrow-down-linear" size={18}/></summary><p>Rewards move from pending to available after acceptance, or after 48 hours without a review. You can appeal a rejected response.</p></details><details><summary>Invite a curious friend<Icon name="alt-arrow-down-linear" size={18}/></summary><p>Earn 200 points when a verified friend completes three accepted polls.</p><Button kind="secondary" icon="link-linear" onClick={copyInvite}>Copy invite link</Button><small>{state.referral.qualified} qualified referrals · demo</small></details></section>
    </aside></div>
    <p className="workspace-footnote"><Icon name="shield-check-linear" size={16}/>{DEMO_MODE?'Preview balances only. No real payments or transfers.':'Public activity uses your anonymous name.'}</p>
    {receipt&&<Modal title="Activity receipt" onClose={()=>setReceipt(null)}><p>{receipt.kind.replace(/^(Demo|Sample) /,'')}</p><div className="receipt"><div><span>Amount</span><b>{receipt.amount>0?'+':''}{receipt.amount} {receipt.currency}</b></div><div><span>Date</span><b>{dateTime(receipt.created_at)}</b></div><div><span>Reference</span><b>{receipt.id}</b></div></div><p>{DEMO_MODE?'Simulated marketplace activity. No money was transferred.':'This entry is part of your activity ledger.'}</p></Modal>}
    {selected&&<Modal title={detail.type==='invitation'?'A little more of your perspective':selected.status==='rejected'?'Let’s take another look':selected.status==='appealed'?'Your appeal is in review':selected.status==='accepted'?'Your reward is available':selected.status==='declined'?'Review complete':'Your reward is in review'} onClose={close}>
      <div className="wallet-detail"><span className="badge">{detail.type==='invitation'?'+100 points · about 1 min':statusLabel[selected.status]}</span><h3>{selected.question||selected.title}</h3>
      {detail.type==='invitation'?<><p>Your reply is shared with the publisher. Reply by {date(selected.expires_at)}.</p><label>Your answer<textarea maxLength={3000} placeholder="What would make the biggest difference for you?" value={text} onChange={event=>setText(event.target.value)}/></label><details className="voice-alternative"><summary><Icon name="microphone-3-linear" size={20}/>Answer with your voice<Icon name="alt-arrow-down-linear" size={18}/></summary><MediaInput value={audio} onChange={setAudio} notify={notify} onTranscript={transcript=>setText(current=>current.trim()?current+'\n'+transcript:transcript)}/></details><Button disabled={busy||(text.trim().length<10&&!audio)} onClick={()=>run(()=>community(`/followups/${selected.id}/answer`,{text,audio}),'Your perspective was sent. 100 demo points added.')}>{busy?'Sending…':'Send & earn 100 points'}</Button></>:<>
        <div className="review-timeline"><b>{state.polls.find(p=>p.id===selected.poll_id)?.reward||0} points {selected.status==='accepted'?'available':selected.status==='declined'?'not credited':'reserved'}</b><small>Submitted {dateTime(selected.created_at)}</small><small>{selected.status==='pending'?`Standard review window ends ${dateTime(reviewDeadline(selected))}`:selected.status==='rejected'?'You can request an independent review':selected.status==='appealed'?'Independent review · tracked here until resolved':'Review finished'}</small></div><details className="original-response"><summary>Your original answer<Icon name="alt-arrow-down-linear" size={18}/></summary><p>{state.polls.find(p=>p.id===selected.poll_id)?answerLabel(state.polls.find(p=>p.id===selected.poll_id),selected.answer):'Answer recorded'}</p>{selected.text&&<blockquote>{selected.text}</blockquote>}</details><div className="review-note"><Icon name="shield-check-linear"/><p>{selected.reason||(selected.status==='accepted'?'This reward has been added to your available points.':'Your reward becomes available after acceptance, or after 48 hours without a review.')}</p></div>
        {selected.status==='rejected'?<><p>An independent reviewer can take another look. Your reward stays reserved while they review it.</p><label>Explain your appeal<textarea maxLength={2000} placeholder="Add any context that could help the reviewer…" value={text} onChange={event=>setText(event.target.value)}/></label><Button disabled={busy||text.trim().length<10} onClick={()=>run(()=>community(`/responses/${selected.id}/appeal`,{reason:text}),'Appeal sent. You can track its progress here.')}>{busy?'Sending…':'Send for independent review'}</Button></>:selected.status==='accepted'?<p>Your points are available in Wallet.</p>:selected.status==='declined'?<p>The independent review is complete. This reward was not credited.</p>:selected.status==='appealed'?<p>No action needed. We’ll keep the outcome here with your response.</p>:<p>You don’t need to do anything else. This response’s reward is included in your pending points.</p>}
        {DEMO_MODE&&['pending','appealed'].includes(selected.status)&&<details className="demo-controls"><summary>Explore this demo<Icon name="alt-arrow-down-linear" size={18}/></summary><p>Preview how the balance changes when this response is accepted.</p><Button kind="soft" disabled={busy} onClick={()=>run(()=>community(selected.status==='pending'?`/responses/${selected.id}/review`:`/moderation/${selected.id}`,{action:'accept',reason:'Sample independent reviewer accepted your appeal.'}),'Reward released to your demo balance.')}>{selected.status==='pending'?'Preview reward release':'Preview an accepted appeal'}</Button></details>}
      </>}
      </div>
    </Modal>}
  </div>;
}
