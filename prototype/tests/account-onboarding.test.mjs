import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
const source=fileURLToPath(new URL('../src/deck-prototype/',import.meta.url));
const icons=readdirSync(fileURLToPath(new URL('../public/assets/icons/',import.meta.url))).filter(x=>x.endsWith('.svg')).map(x=>x.slice(0,-4));
const bundle=await build({stdin:{contents:`import {mountAuth} from './signin.js';import {mountOnboarding} from './onboarding.js';window.mountAuth=mountAuth;window.mountOnboarding=mountOnboarding;`,resolveDir:source},bundle:true,write:false,format:'iife',platform:'browser',plugins:[{name:'test-boundaries',setup(b){
 b.onLoad({filter:/\.css$/},()=>({contents:'',loader:'js'}));
 b.onLoad({filter:/deck-prototype\/icons\.js$/},()=>({contents:`const names=${JSON.stringify(icons)};export function icon(name){if(!names.includes(name))throw Error('Missing bundled icon '+name);return '<svg class="icon" aria-hidden="true"></svg>';}`,loader:'js'}));
 b.onLoad({filter:/deck-prototype\/brand\.js$/},()=>({contents:'export const logo=()=>"<span class=brand-mark></span>";',loader:'js'}));
 b.onLoad({filter:/src\/api\.js$/},()=>({contents:'export const liveRequest=()=>{throw Error("Unexpected API")};export const configureSession=()=>{};',loader:'js'}));
 b.onLoad({filter:/src\/turnstile\.js$/},()=>({contents:'export const challenge=()=>{throw Error("Unexpected challenge")};export const preloadTurnstile=()=>{};',loader:'js'}));
}}]});
const tick=()=>new Promise(r=>setTimeout(r,0));
async function wait(fn){for(let i=0;i<50;i++){if(fn())return;await tick();}assert.ok(fn(),'UI did not reach expected state');}
function response(data,status=200){return {ok:status<400,status,headers:{get:()=> 'application/json'},json:async()=>structuredClone(data)};}
function setup(url='https://app.test/sign-in'){
 const dom=new JSDOM('<main id="root"></main>',{url,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.fetch=async()=>{throw Error('Unmocked request')};w.matchMedia=()=>({matches:false});w.AbortController=AbortController;
 w.HTMLElement.prototype.showPopover=function(){this.setAttribute('data-open','')};w.HTMLElement.prototype.hidePopover=function(){this.removeAttribute('data-open')};
 w.eval(bundle.outputFiles[0].text);return {dom,w,root:w.document.querySelector('#root'),q:s=>w.document.querySelector(s),click:s=>w.document.querySelector(s).click(),input:(s,v)=>{const e=w.document.querySelector(s);e.value=v;e.dispatchEvent(new w.Event('input',{bubbles:true}));},submit:s=>w.document.querySelector(s).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}))};
}
async function auth(url,handler,session={}){
 const x=setup(url),calls=[],nav=[],checks=[];
 const auth=x.w.mountAuth(x.root,{navigate:u=>nav.push(u),challengeFn:async(c,a)=>{checks.push(a);return 'single-token'},fetcher:async(path,opt)=>{const data=opt.body?JSON.parse(opt.body):undefined;calls.push({path,data,opt});if(path.endsWith('/session'))return response({csrf:'csrf',ready:true,security:{turnstile_enabled:true,site_key:'public'},...session});return handler(path,data);}});
 await wait(()=>!x.q('.auth-submit').disabled);return {...x,calls,nav,checks,close(){auth.destroy();x.dom.window.close();}};
}
test('registration is explicit, verifies email and never offers an admin role',async()=>{
 const x=await auth('https://app.test/create-account',(path,data)=>path.endsWith('/register')?response({challenge_id:'one',resend_after:60,verification_security_required:false}):response({verified:true,created:true,redirect:'/welcome'}));
 try{
  assert.match(x.q('h1').textContent,/Create your account/);assert.equal(x.q('#password').autocomplete,'new-password');assert.equal(x.q('#password').minLength,15);assert.doesNotMatch(x.root.textContent,/administrator|admin role/i);
  x.input('#email','new@example.com');x.input('#password','violet stars make tiny gardens');x.submit('form');await wait(()=>x.q('#code'));
  assert.equal(x.q('#password'),null);assert.equal(x.nav.length,0);assert.equal(x.q('#resend').disabled,true);assert.match(x.root.textContent,/new@example.com/);
  x.input('#code','123456');x.submit('form');await wait(()=>x.nav.length);assert.equal(x.nav[0],'/welcome');
  assert.deepEqual(x.calls.filter(c=>c.data).map(c=>c.path),['/api/auth/register','/api/auth/verify-code']);assert.deepEqual(x.checks,['poll_login']);
  for(const c of x.calls.filter(c=>c.data)){assert.equal(c.opt.headers['X-CSRF-Token'],'csrf');assert.equal(c.opt.headers['X-Turnstile-Token'],c.path.endsWith('/register')?'single-token':undefined);}
  assert.equal(x.w.localStorage.length,0);assert.equal(x.w.sessionStorage.length,0);
 }finally{x.close()}
});
test('password sign-in errors retain inputs, show/hide works, retry navigates',async()=>{
 let fail=true;const x=await auth('https://app.test/sign-in',()=>fail?response({error:'Email or password is incorrect.'},403):response({redirect:'/'}));
 try{
  assert.equal(x.q('#password').autocomplete,'current-password');x.input('#email','member@example.com');x.input('#password','a private sample passphrase');x.click('.password-reveal');assert.equal(x.q('#password').type,'text');assert.equal(x.q('.password-reveal').getAttribute('aria-pressed'),'true');
  x.submit('form');await wait(()=>x.q('#auth-status').dataset.error==='true');assert.equal(x.q('#password').value,'a private sample passphrase');assert.equal(x.q('#auth-status').getAttribute('role'),'alert');assert.equal(x.q('.auth-submit').disabled,false);
  fail=false;x.submit('form');await wait(()=>x.nav.length);assert.equal(x.nav[0],'/');assert.equal(x.q('#password').value,'');
 }finally{x.close()}
});
test('password recovery verifies email before displaying a new-password form',async()=>{
 const x=await auth('https://app.test/sign-in?mode=reset',path=>response(path.endsWith('/request-code')?{challenge_id:'reset',resend_after:60,verification_security_required:false}:path.endsWith('/verify-code')?{verified:true,reset_required:true,verification_security_required:false}:{redirect:'/'}));
 try{x.input('#email','member@example.com');x.submit('form');await wait(()=>x.q('#code'));x.input('#code','123456');x.submit('form');await wait(()=>x.q('#password'));assert.match(x.q('h1').textContent,/new password/);assert.equal(x.nav.length,0);x.input('#password','brand new private passphrase');x.submit('form');await wait(()=>x.nav.length);assert.equal(x.calls.find(c=>c.path.endsWith('/request-code')).data.purpose,'reset');assert.equal(x.calls.at(-1).path,'/api/auth/reset-password');assert.deepEqual(x.checks,['poll_login']);}finally{x.close()}
});
test('resend never needs the password again and an email-mode switch clears credentials',async()=>{
 const x=await auth('https://app.test/create-account',path=>response({challenge_id:path.endsWith('/resend-code')?'two':'one',resend_after:0}));
 try{x.input('#email','person@example.com');x.input('#password','secret violet and lilac rivers');x.submit('form');await wait(()=>x.q('#code'));await tick();x.click('#resend');await wait(()=>x.calls.some(c=>c.path.endsWith('/resend-code')));assert.deepEqual(x.calls.at(-1).data,{challenge_id:'one'});await tick();x.click('[data-mode=login]');assert.equal(x.q('#password').value,'');assert.equal(x.q('#email').value,'person@example.com');x.click('[data-mode=email]');assert.equal(x.q('#password'),null);assert.match(x.q('h1').textContent,/with a code/);}finally{x.close()}
});
test('double submit cannot duplicate a registration request and network errors recover',async()=>{
 let resolve;const x=await auth('https://app.test/create-account',()=>new Promise(r=>resolve=r));
 try{x.input('#email','person@example.com');x.input('#password','a safe and long sample phrase');x.submit('form');x.submit('form');await wait(()=>resolve);assert.equal(x.calls.filter(c=>c.path.endsWith('/register')).length,1);assert.equal(x.q('#email').disabled,true);resolve(response({error:'The email could not be delivered.'},503));await wait(()=>x.q('#auth-status').dataset.error==='true');assert.equal(x.q('#password').disabled,false);assert.equal(x.q('#password').value,'a safe and long sample phrase');}finally{x.close()}
});
const preferences={interests:['design','everyday'],languages:['English'],formats:['classic','visual','audio','ab','video','slider','rank','pairwise','allocation','regions'],theme:'light',motion:false,avatar:'otter',tagline:'Here for a fresh perspective.',notifications:true,generated_polls:true,generated_media:true,generated_images:true,generated_audio:true,generated_video:true};
async function welcome({step=0,complete=false,prefs=preferences,handler}={}){
 const x=setup('https://app.test/welcome'),calls=[],nav=[];
 x.w.mountOnboarding(x.root,{initial:async()=>response({csrf:'csrf',identity:{author:'Curious Otter ABC123',id:'opaque'},preferences:prefs,onboarding:{step,complete},security:{}}),configure:()=>{},navigate:u=>nav.push(u),request:async(path,data)=>{calls.push({path,data:structuredClone(data)});return handler?handler(path,data):{preferences:data.preferences,redirect:data.preferences?.intent==='create'?'/#create':'/#discover'};}});
 await wait(()=>x.q('#welcome-title'));return {...x,calls,nav,close(){x.dom.window.close()}};
}
test('onboarding completes all four steps and persists the actual selections',async()=>{
 const x=await welcome();try{
  x.submit('form');assert.match(x.q('#welcome-status').textContent,/Choose/);x.click('[data-choice=intent][data-value=both]');x.submit('form');await wait(()=>x.q('#welcome-language'));assert.equal(x.calls[0].data.preferences.intent,'both');assert.match(x.w.location.hash,/step-2/);
  x.click('[data-choice=interests][data-value=technology]');x.click('.select-trigger');x.click('.select-option[data-value=Tamil]');x.submit('form');await wait(()=>x.q('.welcome-ai'));assert.deepEqual(x.calls[1].data.preferences.interests,['design','everyday','technology']);assert.deepEqual(x.calls[1].data.preferences.languages,['Tamil']);
  x.click('[data-choice=formats][data-value=video]');x.click('[data-pref=generated_audio]');x.submit('form');await wait(()=>x.q('#welcome-tagline'));assert.equal(x.calls[2].data.preferences.formats.includes('video'),false);assert.equal(x.calls[2].data.preferences.generated_audio,false);
  assert.match(x.root.textContent,/Curious Otter ABC123/);assert.doesNotMatch(x.root.textContent,/admin role|administrator/i);x.click('[data-choice=avatar][data-value=river]');x.input('#welcome-tagline','Choosing a little more thoughtfully');x.click('[data-pref=notifications]');x.submit('form');await wait(()=>x.nav.length);assert.equal(x.calls[3].data.action,'complete');assert.equal(x.calls[3].data.preferences.avatar,'river');assert.equal(x.calls[3].data.preferences.notifications,false);assert.equal(x.calls[3].data.preferences.tagline,'Choosing a little more thoughtfully');assert.equal(x.nav[0],'/#discover');
 }finally{x.close()}
});
test('onboarding resumes, preserves unsaved choices on Back, and prevents empty feeds',async()=>{
 const x=await welcome({step:1});try{
  assert.equal(x.q('.welcome-progress').getAttribute('aria-valuenow'),'2');x.click('[data-choice=interests][data-value=design]');x.click('[data-choice=interests][data-value=everyday]');x.submit('form');assert.match(x.q('#welcome-status').textContent,/at least one topic/);assert.equal(x.calls.length,0);
  x.click('[data-choice=interests][data-value=food]');x.click('[data-welcome=back]');x.click('[data-choice=intent][data-value=answer]');x.submit('form');await wait(()=>x.q('#welcome-language'));assert.equal(x.q('[data-value=food]').getAttribute('aria-pressed'),'true');
 }finally{x.close()}
});
test('onboarding error preserves values and skip only navigates after a server save',async()=>{
 let fail=true;const x=await welcome({step:3,handler:async(path,data)=>{if(fail)throw Error('Connection lost. Try again.');return {redirect:'/#discover'}}});try{
  x.input('#welcome-tagline','My unsaved thoughtful tagline');x.submit('form');await wait(()=>x.q('#welcome-status').dataset.error==='true');assert.equal(x.q('#welcome-tagline').value,'My unsaved thoughtful tagline');assert.equal(x.nav.length,0);assert.equal(x.q('[type=submit]').disabled,false);fail=false;x.click('[data-welcome=skip]');await wait(()=>x.nav.length);assert.equal(x.calls.at(-1).data.action,'skip');
 }finally{x.close()}
});
test('old human-only preference remains selected and initialization failures offer retry',async()=>{
 const x=await welcome({step:2,prefs:{...preferences,generated_media:false}});try{assert.equal(x.q('[data-pref=generated_audio]').checked,false);assert.equal(x.q('[data-pref=generated_images]').checked,false);assert.equal(x.q('[data-pref=generated_polls]').checked,true);}finally{x.close()}
 const y=setup('https://app.test/welcome');let loads=0;y.w.mountOnboarding(y.root,{initial:async()=>{loads++;if(loads===1)throw Error('Offline');return response({identity:{author:'Quiet Owl 123ABC'},preferences,onboarding:{step:0,complete:false}})},configure:()=>{}});await wait(()=>y.q('[data-welcome=retry]'));y.click('[data-welcome=retry]');await wait(()=>y.q('#welcome-title'));assert.equal(loads,2);y.dom.window.close();
});
test('a widget failure preserves the form and never sends credentials without a valid token',async()=>{
 const x=setup('https://app.test/sign-in'),calls=[];
 const mounted=x.w.mountAuth(x.root,{challengeFn:async()=>{throw Error('This website address is not enabled. Reference: 110200.');},fetcher:async(path)=>{calls.push(path);return response({csrf:'csrf',ready:true,security:{turnstile_enabled:true,site_key:'test'}})}});
 try{x.input('#email','private@example.com');x.input('#password','private violet river passphrase');await wait(()=>!x.q('.auth-submit').disabled);x.submit('form');await wait(()=>x.q('#auth-status').dataset.error==='true');assert.match(x.q('#auth-status').textContent,/110200/);assert.equal(x.q('#email').value,'private@example.com');assert.equal(x.q('#password').value,'private violet river passphrase');assert.equal(x.q('.auth-submit').disabled,false);assert.deepEqual(calls,['/api/auth/session']);}finally{mounted.destroy();x.dom.window.close()}
});

test('returning to completed onboarding opens the app instead of restarting setup',async()=>{
 const x=setup('https://app.test/welcome'),nav=[];
 try{
  x.w.mountOnboarding(x.root,{initial:async()=>response({identity:{author:'Curious Otter'},preferences:{...preferences,intent:'answer'},onboarding:{step:3,complete:true}}),configure:()=>{},navigate:url=>nav.push(url)});
  await wait(()=>nav.length);assert.equal(nav[0],'/#discover');assert.equal(x.q('#welcome-form'),null);
 }finally{x.dom.window.close()}
});

test('sign-in startup offers retry without losing typed credentials',async()=>{
 const x=setup('https://app.test/sign-in');let attempt=0;
 const mounted=x.w.mountAuth(x.root,{fetcher:async()=>{if(++attempt===1)return response(null,503);return response({csrf:'csrf',ready:true,security:{turnstile_enabled:false}})}});
 try{
  x.input('#email','member@example.com');x.input('#password','a private sample passphrase');
  await wait(()=>!x.q('#auth-retry').hidden);assert.match(x.q('#auth-status').textContent,/incomplete response/);
  x.click('#auth-retry');await wait(()=>!x.q('.auth-submit').disabled);
  assert.equal(x.q('#email').value,'member@example.com');assert.equal(x.q('#password').value,'a private sample passphrase');assert.equal(attempt,2);assert.equal(x.q('#auth-retry').hidden,true);
 }finally{mounted.destroy();x.dom.window.close()}
});

test('full server onboarding snapshots do not erase unsaved later-step choices after Back',async()=>{
 const x=await welcome({step:1,handler:async(path,data)=>({preferences:{...preferences,...data.preferences}})});
 try{
  x.click('[data-choice=interests][data-value=food]');x.click('[data-welcome=back]');x.click('[data-choice=intent][data-value=answer]');x.submit('form');
  await wait(()=>x.q('#welcome-language'));assert.equal(x.q('[data-choice=interests][data-value=food]').getAttribute('aria-pressed'),'true');
 }finally{x.close()}
});

test('sign-in connection and submit expose busy states without clearing typed credentials',async()=>{
 const x=setup();let session,login;const mounted=x.w.mountAuth(x.root,{challengeFn:async()=>'',fetcher:path=>new Promise(r=>{if(path.endsWith('/session'))session=r;else login=r;})});
 assert.equal(x.q('#auth-status').getAttribute('aria-busy'),'true');x.input('#email','reader@example.com');
 session(response({ready:true,csrf:'qa',security:{}}));await wait(()=>!x.q('.auth-submit').disabled);
 assert.equal(x.q('#auth-status').getAttribute('aria-busy'),null);assert.equal(x.q('#email').value,'reader@example.com');
 x.input('#password','a long private phrase');x.submit('form');await wait(()=>login);assert.ok(x.q('.auth-submit').classList.contains('is-loading'));
 login(response({error:'Try again'},503));await wait(()=>!x.q('.auth-submit').disabled);assert.equal(x.q('.auth-submit').classList.contains('is-loading'),false);assert.equal(x.q('#password').value,'a long private phrase');mounted.destroy();x.dom.window.close();
});
test('onboarding has a skeleton throughout initialization and shows progress while saving',async()=>{
 const x=setup('https://app.test/welcome');let initial,save;
 x.w.mountOnboarding(x.root,{initial:()=>new Promise(r=>initial=r),configure:()=>{},request:()=>new Promise(r=>save=r)});
 assert.equal(x.q('[data-loading-region]').getAttribute('aria-busy'),'true');assert.equal(x.q('form'),null);
 initial(response({identity:{author:'Curious Otter'},preferences,onboarding:{step:0,complete:false}}));await wait(()=>x.q('#welcome-title'));
 assert.equal(x.q('[data-loading-region]'),null);x.click('[data-choice=intent][data-value=answer]');x.submit('form');
 assert.ok(x.q('[type=submit]').classList.contains('is-loading'));save({preferences:{intent:'answer'}});await wait(()=>x.q('#welcome-language'));assert.equal(x.q('.is-loading'),null);x.dom.window.close();
});


test('explicit managed-browser fallback signs in and resends without invoking Turnstile',async()=>{
 const x=await auth('https://app.test/sign-in?method=email',path=>response(path.endsWith('/verify-code')?{verified:true,redirect:'/'}:{challenge_id:'code',resend_after:0,verification_security_required:false}),{email_fallback_enabled:true});
 try{
  assert.equal(x.q('#password'),null);assert.match(x.q('.auth-intro').textContent,/managed browser/);assert.match(x.q('.auth-footnote').textContent,/Verified email/);assert.doesNotMatch(x.q('.auth-footnote').textContent,/Cloudflare/);
  x.input('#email','reader@example.com');x.submit('form');await wait(()=>x.q('#code'));await tick();x.click('#resend');await wait(()=>x.calls.some(c=>c.path.endsWith('/resend-code')));await tick();
  x.input('#code','123456');x.submit('form');await wait(()=>x.nav.length);
  assert.deepEqual(x.checks,[]);assert.equal(x.nav[0],'/');
  assert.deepEqual(x.calls.filter(c=>c.data).map(c=>c.path),['/api/auth/email-fallback/request-code','/api/auth/email-fallback/resend-code','/api/auth/email-fallback/verify-code']);
  for(const call of x.calls.filter(c=>c.data)){assert.equal(call.opt.headers['X-CSRF-Token'],'csrf');assert.equal(call.opt.headers['X-Turnstile-Token'],undefined);}
 }finally{x.close()}
});

test('switching registration to email verification preserves form entries and never submits automatically',async()=>{
 const x=await auth('https://app.test/create-account',path=>response(path.endsWith('/register')?{challenge_id:'one',resend_after:60}:{verified:true,redirect:'/welcome'}),{email_fallback_enabled:true});
 try{
  x.input('#email','new@example.com');x.input('#password','violet skies and wild rivers');x.click('#email-fallback');
  assert.equal(x.q('#email').value,'new@example.com');assert.equal(x.q('#password').value,'violet skies and wild rivers');assert.equal(x.calls.length,1);assert.match(x.w.location.search,/method=email/);
  x.submit('form');await wait(()=>x.q('#code'));x.input('#code','123456');x.submit('form');await wait(()=>x.nav.length);
  assert.deepEqual(x.checks,[]);assert.equal(x.calls[1].path,'/api/auth/email-fallback/register');assert.equal(x.calls[1].data.password,'violet skies and wild rivers');assert.equal(x.nav[0],'/welcome');
  assert.equal(x.w.localStorage.length,0);assert.equal(x.w.sessionStorage.length,0);
 }finally{x.close()}
});

test('fallback recovery stays on its own routes through password reset',async()=>{
 const x=await auth('https://app.test/sign-in?mode=reset&method=email',path=>response(path.endsWith('/request-code')?{challenge_id:'reset',resend_after:60}:path.endsWith('/verify-code')?{verified:true,reset_required:true}:{redirect:'/'}),{email_fallback_enabled:true});
 try{
  x.input('#email','reader@example.com');x.submit('form');await wait(()=>x.q('#code'));x.input('#code','123456');x.submit('form');await wait(()=>x.q('#password'));x.input('#password','new violet tides and skies');x.submit('form');await wait(()=>x.nav.length);
  assert.deepEqual(x.checks,[]);assert.ok(x.calls.filter(c=>c.data).every(c=>c.path.startsWith('/api/auth/email-fallback/')));
 }finally{x.close()}
});

test('a failed normal challenge offers explicit fallback with the email intact',async()=>{
 const x=setup('https://app.test/sign-in'),calls=[];
 const mounted=x.w.mountAuth(x.root,{challengeFn:async()=>{throw Error('Reference: 600010.');},fetcher:async(path)=>{calls.push(path);return response({csrf:'csrf',ready:true,email_fallback_enabled:true,security:{turnstile_enabled:true,site_key:'test'}})}});
 try{
  await wait(()=>!x.q('.auth-submit').disabled);x.input('#email','reader@example.com');x.input('#password','violet skies and wild rivers');x.submit('form');await wait(()=>x.q('#auth-status').dataset.error==='true');
  assert.equal(calls.length,1);x.click('#email-fallback');assert.equal(x.q('#email').value,'reader@example.com');assert.equal(x.q('#password'),null);assert.equal(calls.length,1);assert.match(x.w.location.search,/method=email/);
  x.click('#email-fallback');assert.equal(x.q('#password').value,'');assert.equal(x.w.location.search,'');assert.match(x.q('.auth-footnote').textContent,/Cloudflare/);
 }finally{mounted.destroy();x.dom.window.close()}
});

test('fallback works when normal widget configuration is unavailable',async()=>{
 const x=await auth('https://app.test/sign-in?method=email',()=>response({challenge_id:'one',resend_after:60}),{ready:false,email_fallback_enabled:true});
 try{x.input('#email','reader@example.com');x.submit('form');await wait(()=>x.q('#code'));assert.deepEqual(x.checks,[]);assert.equal(x.calls.at(-1).path,'/api/auth/email-fallback/request-code');}finally{x.close()}
});

test('disabled fallback never silently sends a normal CAPTCHA-free request',async()=>{
 const x=setup('https://app.test/sign-in?method=email'),calls=[];
 const mounted=x.w.mountAuth(x.root,{fetcher:async path=>{calls.push(path);return response({csrf:'csrf',ready:true,email_fallback_enabled:false,security:{}})}});
 try{
  await wait(()=>x.q('#auth-status').textContent.includes('not available'));assert.equal(x.q('.auth-submit').disabled,true);x.input('#email','reader@example.com');x.submit('form');await tick();assert.deepEqual(calls,['/api/auth/session']);x.click('#email-fallback');assert.equal(x.q('.auth-submit').disabled,false);assert.equal(x.q('#email-fallback').hidden,true);
 }finally{mounted.destroy();x.dom.window.close()}
});
