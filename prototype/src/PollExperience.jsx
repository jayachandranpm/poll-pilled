import React from 'react';
import {Icon} from './ui.jsx';

export function AnswerJourney({step}){
 return <ol className="answer-journey" aria-label="Answer progress">{['Choose','Add why','Done'].map((label,index)=><li key={label} className={index===step?'current':index<step?'complete':''} aria-current={index===step?'step':undefined}><span>{index<step?<Icon name="check-linear" size={13}/>:index+1}</span><b>{label}</b>{index===1&&<small>optional</small>}</li>)}</ol>;
}

export function ResponseReceipt({poll,celebrate,onInsights,onWallet}){
 const status=poll.my_response.status;
 const accepted=status==='accepted';
 const disputed=['rejected','appealed','declined'].includes(status);
 const title=accepted?'You’ve added your perspective.':status==='declined'?'Your review is complete.':status==='appealed'?'Your appeal is being reviewed.':status==='rejected'?'Your response needs a review.':'Thanks. Your reward is in review.';
 const selected=Array.isArray(poll.my_response.answer)?poll.my_response.answer.map(index=>poll.options[index]).join(' → '):poll.options[poll.my_response.answer];
 return <section className={`response-receipt ${celebrate&&accepted?'celebrate':''}`} aria-label="Your response receipt">
  <div className="receipt-emblem"><Icon name={accepted?'check-circle-bold':status==='declined'?'close-circle-linear':'clock-circle-linear'} size={32}/>{celebrate&&accepted&&<span className="receipt-sparks" aria-hidden="true">{[0,1,2,3,4,5].map(i=><i key={i} style={{'--spark':i}}/>)}</span>}</div>
  <div className="response-receipt-copy"><span className="receipt-kicker">{accepted?'PERSPECTIVE RECEIVED':disputed?'REVIEW FEEDBACK':'RESPONSE RECEIVED'}</span><h2>{title}</h2><p>{Array.isArray(poll.my_response.answer)?'Your ranking:':'You chose'} <b>{selected}</b></p><div className="receipt-reward"><Icon name="medal-ribbon-linear" size={20}/><strong>{accepted?'+':''}{poll.reward} points</strong><span>{accepted?'added to your wallet':status==='declined'?'not added to your wallet':'reserved during review'}</span></div><div className="receipt-links"><button onClick={onInsights}>Explore the results<Icon name="arrow-right-linear" size={16}/></button><button onClick={onWallet}>{disputed?'Review feedback':'View wallet'}</button></div></div>
 </section>;
}
