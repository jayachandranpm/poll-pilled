// The feed must agree with the input controls after a render or navigation.
// The server still validates the complete response and reward eligibility.
export function canSubmitAnswer(p,answer){
 const count=p.options.length;
 if(p.type==='allocation')return Array.isArray(answer)&&answer.length===count&&answer.every(n=>Number.isInteger(n)&&n>=0&&n<=100)&&answer.reduce((a,b)=>a+b,0)===100;
 if(p.type==='ranking')return Array.isArray(answer)&&answer.length===count&&new Set(answer).size===count&&answer.every(n=>Number.isInteger(n)&&n>=0&&n<count);
 if(p.type==='pairwise')return answer?.rounds?.length===count*(count-1)/2;
 return Number.isInteger(answer)&&answer>=0&&answer<count;
}
