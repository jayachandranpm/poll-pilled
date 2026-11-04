import {initialAnswer} from './pollModel.js';
// Private, unfinished responses live only in memory for this page session.
const drafts=new Map(),listeners=new Set();
const signature=p=>JSON.stringify([p.format,p.options]);
export function readResponseDraft(p){const key=signature(p);let entry=drafts.get(p.id);if(!entry||entry.signature!==key){entry={signature:key,answer:initialAnswer(p),text:'',audio:'',origin:'human',transcript:'',consent:false,mode:'Text',progress:[]};drafts.set(p.id,entry)}return entry;}
export function updateResponseDraft(p,patch){const current=readResponseDraft(p);drafts.set(p.id,{...current,...(typeof patch==='function'?patch(current):patch)});listeners.forEach(fn=>fn());}
export function clearResponseDraft(id){drafts.delete(id);}
export const subscribeResponseDraft=fn=>{listeners.add(fn);return()=>listeners.delete(fn)};
export const statusLabel={accepted:'Reward available',pending:'Awaiting review',rejected:'Reward needs review',appealed:'Appeal in review',declined:'Review complete'};
export const reviewDeadline=r=>r.review_deadline||r.auto_accept_at||(r.created_at?new Date(new Date(r.created_at).getTime()+48*3600000).toISOString():null);
export const dateTime=value=>value?new Date(value).toLocaleString(undefined,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'Time unavailable';
export const actionableCount=s=>s.invitations.filter(i=>i.status==='open'&&!i.answered_at&&new Date(i.expires_at)>new Date()).length+s.responses.filter(r=>r.status==='rejected').length;
export function redemptionQuote(points){const fee=Math.ceil(points*.05);return {points,fee,net:points-fee,valid:Number.isInteger(points)&&points>=500};}
export function campaignMetrics(p){const remaining=Math.max(0,p.remaining||0);return {remaining,refund:p.funding==='Boost'?remaining*(p.reward/100+2):0,community:remaining*p.reward,progress:Math.min(100,Math.round((p.responses||0)/Math.max(1,p.cap)*100))};}
