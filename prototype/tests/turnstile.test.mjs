import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {challenge,runChallenge,securityFailure} from '../src/turnstile.js';
const tick=()=>new Promise(r=>setTimeout(r,0));
async function wait(fn){for(let i=0;i<60;i++){if(fn())return;await tick();}assert.ok(fn(),'Expected widget state');}
function setup({render,width=330}={}){
 const dom=new JSDOM('<button id="opener">Sign in</button>',{url:'https://poll.example/sign-in',pretendToBeVisual:true}),w=dom.window;
 const old={window:globalThis.window,document:globalThis.document};globalThis.window=w;globalThis.document=w.document;
 const renders=[],removed=[],reset=[];let open=0,maximum=0;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;maximum=Math.max(maximum,++open)};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;open--};
 Object.defineProperty(w.HTMLElement.prototype,'clientWidth',{get(){return width}});
 w.document.querySelector('#opener').focus();
 w.turnstile={render(container,options){const id=renders.length+1;renders.push({container,options,id});render?.(options);return id;},remove:id=>removed.push(id),reset:id=>reset.push(id)};
 return {w,renders,removed,reset,get open(){return open},get maximum(){return maximum},q:s=>w.document.querySelector(s),close(){globalThis.window=old.window;globalThis.document=old.document;w.close();}};
}
const config={turnstile_enabled:true,site_key:'test',hostname:'poll.example'};
test('concurrent writes receive distinct tokens, and a fatal error releases the queue',async()=>{
 const x=setup();try{
  const first=challenge(config),second=challenge(config);await wait(()=>x.renders.length===1);
  x.renders[0].options.callback('first-token');assert.equal(await first,'first-token');await wait(()=>x.renders.length===2);
  x.renders[1].options.callback('second-token');assert.equal(await second,'second-token');assert.equal(x.maximum,1);assert.equal(x.open,0);assert.deepEqual(x.removed,[1,2]);
  const failed=challenge(config),next=challenge(config),rejection=assert.rejects(failed,/Reference: 110200/);await wait(()=>x.renders.length===3);x.renders[2].options['error-callback']('110200');await rejection;
  await wait(()=>x.renders.length===4);x.renders[3].options.callback('fresh-token');assert.equal(await next,'fresh-token');assert.equal(x.maximum,1);assert.equal(x.q('#opener'),x.w.document.activeElement);
 }finally{x.close()}
});
test('recoverable errors keep the dialog alive and replace the failed widget',async()=>{
 const x=setup();try{
  const p=runChallenge(config,'poll_login',{retryDelays:[0,0]});await wait(()=>x.renders.length);
  const o=x.renders[0].options;assert.equal(o.retry,'never');assert.equal(o.action,'poll_login');assert.equal(o['response-field'],false);
  o['error-callback']('200500');o['error-callback']('200500');assert.equal(x.open,1);assert.equal(x.removed.length,0);await wait(()=>x.renders.length===2);
  x.renders[1].options['error-callback']('200500');await wait(()=>x.renders.length===3);x.renders[2].options.callback('verified-on-retry');assert.equal(await p,'verified-on-retry');assert.deepEqual(x.removed,[1,2,3]);
 }finally{x.close()}
});
test('two automatic retries are bounded; a manual retry can recover without losing the dialog',async()=>{
 const x=setup();try{
  const p=runChallenge(config,'poll_login',{retryDelays:[0,0]});await wait(()=>x.renders.length);const o=x.renders[0].options;
  o['error-callback']('200500');await wait(()=>x.renders.length===2);x.renders[1].options['error-callback']('200500');await wait(()=>x.renders.length===3);x.renders[2].options['error-callback']('200500');await tick();
  assert.equal(x.renders.length,3);assert.equal(x.q('.security-retry').hidden,false);assert.match(x.q('#security-check-status').textContent,/200500/);assert.equal(x.w.document.activeElement,x.q('.security-retry'));
  // A late callback from a failed attempt must not submit anything.
  o.callback('late-token');assert.equal(x.open,1);x.q('.security-retry').click();assert.equal(x.renders.length,4);assert.equal(x.q('.security-retry').hidden,true);o.callback('stale-token-after-retry');assert.equal(x.open,1);x.renders[3].options.callback('manual-token');assert.equal(await p,'manual-token');
 }finally{x.close()}
});
test('configuration, browser and clock errors are specific and never retried automatically',async()=>{
 for(const [code,pattern] of [['110100',/widget needs/],['110200',/website address/],['110500',/browser/],['200100',/clock/],['400070',/widget needs/]]){
  const x=setup();try{const p=runChallenge(config,'poll_login',{retryDelays:[0,0]});const rejected=assert.rejects(p,e=>e.code===code&&pattern.test(e.message));await wait(()=>x.renders.length);x.renders[0].options['error-callback'](code);await rejected;assert.equal(x.reset.length,0);assert.equal(x.open,0);}finally{x.close()}
 }
 assert.equal(securityFailure('<script>alert(1)</script>').code,'unknown');
});
test('cancelling during recovery clears timers and late provider callbacks cannot resolve',async()=>{
 const x=setup();try{const p=runChallenge(config,'poll_login',{retryDelays:[20]});const rejected=assert.rejects(p,/Reference: 200500/);await wait(()=>x.renders.length);const o=x.renders[0].options;o['error-callback']('200500');x.q('.security-cancel').click();await rejected;await new Promise(r=>setTimeout(r,30));o.callback('late-token');assert.equal(x.reset.length,0);assert.deepEqual(x.removed,[1]);assert.equal(x.open,0);}finally{x.close()}
});
test('timeouts and expiry recover while unsupported browsers fail with a reference',async()=>{
 const x=setup();try{const p=runChallenge(config,'poll_login',{retryDelays:[0,0]});const rejected=assert.rejects(p,/110500/);await wait(()=>x.renders.length);const o=x.renders[0].options;o['expired-callback']();await wait(()=>x.renders.length===2);x.renders[1].options['timeout-callback']();await wait(()=>x.renders.length===3);x.renders[2].options['unsupported-callback']();await rejected;assert.equal(x.open,0);}finally{x.close()}
});
test('synchronous callbacks cannot leak the returned widget and empty tokens are rejected',async()=>{
 const x=setup({render:o=>o.callback('instant-token')});try{assert.equal(await runChallenge(config,'poll_login'),'instant-token');assert.deepEqual(x.removed,[1]);assert.equal(x.open,0);}finally{x.close()}
 const y=setup({render:o=>o.callback('')});try{await assert.rejects(runChallenge(config,'poll_login'),/empty-token/);assert.deepEqual(y.removed,[1]);}finally{y.close()}
});
test('wrong hostname or missing sitekey fails closed before loading a widget; narrow screens use compact',async()=>{
 const x=setup({width:260});try{await assert.rejects(runChallenge({...config,hostname:'different.example'},'poll_login'),/hostname-mismatch/);await assert.rejects(runChallenge({...config,site_key:''},'poll_login'),/missing-sitekey/);assert.equal(x.renders.length,0);const p=runChallenge(config,'poll_login');await wait(()=>x.renders.length);assert.equal(x.renders[0].options.size,'compact');x.renders[0].options.callback('small-screen-token');assert.equal(await p,'small-screen-token');}finally{x.close()}
});
test('overall deadline always releases the UI even if the provider never calls back',async()=>{
 const x=setup();try{await assert.rejects(runChallenge(config,'poll_login',{timeout:10}),/check-timeout/);assert.equal(x.open,0);assert.deepEqual(x.removed,[1]);}finally{x.close()}
});
test('async script onload initializes without calling Cloudflare ready(), including after a load failure',async()=>{
 const x=setup();try{
  const api=x.w.turnstile;delete x.w.turnstile;const failed=runChallenge(config,'poll_login');const rejected=assert.rejects(failed,/script-load/);await wait(()=>x.q('script'));x.q('script').onerror();await rejected;assert.equal(x.q('script'),null);
  const recovered=runChallenge(config,'poll_login');await wait(()=>x.q('script'));let readyCalls=0;api.ready=()=>{readyCalls++;throw Error('Remove async/defer before using turnstile.ready() [3857]');};x.w.turnstile=api;x.q('script').onload();await wait(()=>x.renders.length);assert.equal(readyCalls,0);x.renders[0].options.callback('loaded-token');assert.equal(await recovered,'loaded-token');
 }finally{x.close()}
});

test('a silent provider stops waiting, offers recovery, and ignores the abandoned widget',async()=>{
 const x=setup();try{
  const p=runChallenge(config,'poll_login',{retryDelays:[0],attemptTimeout:8,timeout:1000});await wait(()=>x.renders.length===2);await wait(()=>!x.q('.security-retry').hidden);
  assert.match(x.q('#security-check-status').textContent,/check-stalled/);x.q('.security-retry').click();assert.equal(x.renders.length,3);
  x.renders[0].options.callback('stale-token');x.renders[1].options.callback('another-stale-token');assert.equal(x.open,1);
  x.renders[2].options.callback('fresh-token');assert.equal(await p,'fresh-token');assert.equal(x.open,0);
 }finally{x.close()}
});

test('assessment failures preserve the failed iframe and immediately offer manual recovery',async()=>{
 for(const code of ['600010','300030']){
  const x=setup();try{
   const p=runChallenge(config,'poll_login',{retryDelays:[0],timeout:25,attemptTimeout:1000});await wait(()=>x.renders.length);
   const failed=x.renders[0].options;failed['error-callback'](code);
   assert.equal(x.q('.security-retry').hidden,false);assert.equal(x.q('.security-help').hidden,false);
   assert.equal(x.w.document.activeElement,x.q('.security-retry'));assert.deepEqual(x.removed,[]);
   await new Promise(r=>setTimeout(r,40));assert.equal(x.open,1);assert.equal(x.renders.length,1);
   failed.callback('late-untrusted-token');assert.equal(x.open,1);
   x.q('.security-retry').click();assert.equal(x.renders.length,2);assert.deepEqual(x.removed,[1]);
   x.renders[1].options.callback('new-verified-token');assert.equal(await p,'new-verified-token');assert.equal(x.open,0);
  }finally{x.close()}
 }
});

test('a manual retry receives a fresh bounded deadline instead of the expired original deadline',async()=>{
 const x=setup();try{
  const p=runChallenge(config,'poll_login',{retryDelays:[],timeout:20,attemptTimeout:1000});await wait(()=>x.renders.length);
  x.renders[0].options['error-callback']('600010');await new Promise(r=>setTimeout(r,30));assert.equal(x.open,1);
  const rejected=assert.rejects(p,/check-timeout/);x.q('.security-retry').click();await rejected;
  assert.deepEqual(x.removed,[1,2]);assert.equal(x.open,0);
 }finally{x.close()}
});

test('interactive completion is not interrupted by the earlier passive-check deadline',async()=>{
 const x=setup();try{
  const p=runChallenge(config,'poll_login',{timeout:20,attemptTimeout:15,interactiveTimeout:1000});await wait(()=>x.renders.length);
  const o=x.renders[0].options;o['before-interactive-callback']();await new Promise(r=>setTimeout(r,35));
  assert.equal(x.open,1);assert.equal(x.renders.length,1);assert.deepEqual(x.removed,[]);
  o['after-interactive-callback']();o.callback('completed-interactive-check');assert.equal(await p,'completed-interactive-check');
 }finally{x.close()}
});

test('cancelling an assessment failure releases the serialized queue without accepting a late token',async()=>{
 const x=setup();try{
  const first=challenge(config,'poll_login'),second=challenge(config,'poll_write');
  const rejected=assert.rejects(first,/600010/);await wait(()=>x.renders.length===1);
  const o=x.renders[0].options;o['error-callback']('600010');x.q('.security-cancel').click();await rejected;
  await wait(()=>x.renders.length===2);o.callback('cancelled-check');assert.equal(x.open,1);
  x.renders[1].options.callback('separate-write-token');assert.equal(await second,'separate-write-token');assert.equal(x.maximum,1);
 }finally{x.close()}
});
