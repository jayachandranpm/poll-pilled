import {beginActivity,installMediaLoading} from './loading.js';
import './threads.css';
import './signin.css';
import {icon} from './icons.js';
import {logo} from './brand.js';
import {welcomeArtwork} from './welcomeArtwork.js';
import {challenge,preloadTurnstile} from '../turnstile.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const descriptions={login:['Welcome back','Your next perspective is waiting.'],signup:['Create your account','One account to answer polls and publish your own.'],email:['Sign in with a code','A password-free way back into your account.'],reset:['Set or reset your password','Verify your email to choose a new password.'],code:['Check your inbox',''],password:['Choose a new password','This will sign out your other devices.']};
export function mountAuth(root,{fetcher=fetch,challengeFn=challenge,navigate=url=>location.assign(url)}={}){
 let emailFallback=new URLSearchParams(location.search).get('method')==='email';
 let loading=false,destroyed=false,config,cid,continuationNeedsCheck=true,busy=false,mode=location.pathname==='/create-account'?'signup':new URLSearchParams(location.search).get('mode')==='reset'?'reset':emailFallback?'email':'login',purpose=mode,emailValue='',resendAt=0,timer;
 root.classList.add('auth-layout');
 const $=q=>root.querySelector(q);
 const stopMedia=installMediaLoading(root);
 const canSubmit=()=>emailFallback?config?.email_fallback_enabled===true:config?.ready===true;
 function syncMethod(){
  const control=$('#email-fallback');
  if(control){control.hidden=!emailFallback&&config?.email_fallback_enabled!==true;control.textContent=emailFallback?'Use standard sign-in':'Security check blocked? Use email instead';control.setAttribute('aria-pressed',String(emailFallback));}
  const note=$('.auth-footnote');if(note)note.innerHTML=icon('shield-check-linear')+(emailFallback?'Verified email · Single-use codes':'Protected by Cloudflare Turnstile');
  if(mode==='email')$('.auth-intro').textContent=emailFallback?'Verify your email to sign in, even on a managed browser.':'A password-free way back into your account.';
  if(!busy)$('.auth-submit').disabled=!canSubmit();
 }
 function updateAddress(){const base=mode==='signup'?'/create-account':'/sign-in';const query=new URLSearchParams();if(mode==='reset')query.set('mode','reset');if(emailFallback)query.set('method','email');history.replaceState(null,'',base+(query.size?'?'+query:''));}
 function tell(message,error=false){const s=$('#auth-status');s.textContent=message;s.dataset.error=String(error);s.setAttribute('role',error?'alert':'status');}
 const emailField=()=>`<label for="email">Email address</label><input class="field" id="email" name="email" type="email" autocomplete="email" maxlength="254" required placeholder="you@example.com" value="${escape(emailValue)}">`;
 const passwordField=newPassword=>`<div class="auth-label-row"><label for="password">${newPassword?'Password':'Your password'}</label>${!newPassword?'<button class="auth-link" type="button" data-mode="reset">Forgot password?</button>':''}</div><div class="password-control"><input class="field" id="password" name="password" type="password" autocomplete="${newPassword?'new-password':'current-password'}" ${newPassword?'minlength="15"':''} maxlength="128" required aria-describedby="password-help"><button type="button" class="password-reveal" aria-label="Show password" aria-pressed="false">Show</button></div><p class="auth-hint" id="password-help">${newPassword?'15–128 characters. Try a few unrelated words.':'Previously signed in with a code? You can still use one below.'}</p>`;
 function render(focus=true){
  const [title,intro]=descriptions[mode],signup=mode==='signup';
  document.title=`${title} · Poll Pilled`;
  root.innerHTML=`<a class="auth-brand" href="/sign-in">${logo()}<span>Poll Pilled</span></a><div class="auth-shell"><aside class="auth-story" aria-label="About Poll Pilled"><span class="auth-eyebrow">A little perspective goes a long way.</span><h2>Good questions.<br>Real people.<br>Better decisions.</h2>${welcomeArtwork('signin','auth-hero-art',true)}<p>Different perspectives. A clearer picture.</p></aside><section class="auth-card" aria-labelledby="auth-title">${['login','signup'].includes(mode)?welcomeArtwork('signin','auth-mobile-art',true):''}<div class="auth-symbol ${['login','signup'].includes(mode)?'auth-symbol-with-art':''}" aria-hidden="true">${icon(mode==='code'?'letter-linear':signup?'users-group-rounded-linear':'lock-keyhole-linear')}</div><h1 id="auth-title" tabindex="-1">${title}</h1><p class="auth-intro">${mode==='code'?`If this email is eligible, a six-digit code is on its way to <strong>${escape(emailValue)}</strong>. It expires in 10 minutes.`:intro}</p><form id="auth-form">${['login','signup','email','reset'].includes(mode)?emailField():''}${['login','signup','password'].includes(mode)?passwordField(mode!=='login'):''}${mode==='code'?'<label for="code">Verification code</label><input class="field auth-code" id="code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required placeholder="000000">':''}<button class="btn primary auth-submit" type="submit" ${!canSubmit()?'disabled':''}>${({login:'Sign in',signup:'Create account',email:'Send sign-in code',reset:'Send verification code',code:purpose==='signup'?'Verify & create account':purpose==='reset'?'Verify email':'Verify & sign in',password:'Save password & sign in'})[mode]}</button></form><p id="auth-status" class="auth-connection-state" role="status" aria-live="polite"></p><button type="button" class="btn auth-retry" id="auth-retry" hidden>Retry connection</button>${mode==='login'?'<div class="auth-divider"><span>or</span></div><button type="button" class="btn auth-alternative" data-mode="email">Use an email code</button>':mode==='code'?'<div class="auth-secondary"><button type="button" class="auth-link" data-mode="back">Change email</button><button type="button" class="auth-link" id="resend" disabled>Resend code</button></div>':''}${['login','signup','email','reset'].includes(mode)?'<button type="button" id="email-fallback" class="auth-link auth-fallback" hidden></button>':''}<div class="auth-switch">${signup?'Already have an account? <a href="/sign-in" data-mode="login">Sign in</a>':mode==='login'||mode==='email'?'New to Poll Pilled? <a href="/create-account" data-mode="signup">Create an account</a>':'<a href="/sign-in" data-mode="login">Back to sign in</a>'}</div>${signup?'<p class="auth-data-note">Your email stays private. Your public identity is an assigned anonymous name. Polls and answers are collected for research and platform improvement.</p>':''}<p class="auth-footnote">${icon('shield-check-linear')}Protected by Cloudflare Turnstile</p></section></div>`;
  syncMethod();
  if(focus)$('#auth-title').focus({preventScroll:true});
  if(mode==='code')countdown();
 }
 function countdown(){const b=$('#resend');if(!b)return;const remaining=Math.max(0,Math.ceil((resendAt-Date.now())/1000));b.textContent=remaining?`Resend in ${remaining}s`:'Resend code';b.disabled=busy||remaining>0;if(!remaining)clearInterval(timer);}
 async function request(path,data){
  let token;
  if(data){if(!emailFallback&&(!['verify-code','reset-password'].includes(path)||continuationNeedsCheck)){tell('Checking your connection securely…');token=await challengeFn(config.security,'poll_login');}tell(path==='login'?'Signing you in…':path==='verify-code'?'Verifying your email…':path==='reset-password'?'Saving your password…':'Sending your verification code…');}
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),60000);
  try{
   const response=await fetcher('/api/auth/'+(data&&emailFallback?'email-fallback/':'')+path,{method:data?'POST':'GET',credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:data?{'Content-Type':'application/json','X-CSRF-Token':config.csrf,...(token?{'X-Turnstile-Token':token}:{})}:{},body:data?JSON.stringify(data):undefined});
   if(!response.headers.get('content-type')?.includes('application/json'))throw Error('Refresh this page to check your session, then try again.');
   const result=await response.json();if(!result||typeof result!=='object'||Array.isArray(result))throw Error('The sign-in service returned an incomplete response. Please try again.');if(!response.ok)throw Error(result.error||'We couldn’t complete that request. Please try again.');return result;
  }catch(e){if(e.name==='AbortError')throw Error('This is taking longer than expected. Reload to check your session, or try again.');throw e;}finally{clearTimeout(timeout);}
 }
 async function run(work){if(busy||!canSubmit())return;busy=true;const finish=beginActivity($('.auth-submit'),'Signing in…'),form=$('#auth-form');form.setAttribute('aria-busy','true');root.querySelectorAll('button,input').forEach(b=>b.disabled=true);try{await work()}catch(e){tell(e.message,true)}finally{busy=false;$('#auth-form').removeAttribute('aria-busy');root.querySelectorAll('button,input').forEach(b=>b.disabled=false);countdown();syncMethod();finish();}}
 function showCode(result){continuationNeedsCheck=result.verification_security_required!==false;cid=result.challenge_id;mode='code';resendAt=Date.now()+result.resend_after*1000;clearInterval(timer);render();timer=setInterval(countdown,1000);$('#code').focus();tell('Check your inbox and spam folder.');}
 root.addEventListener('submit',e=>{if(e.target.id!=='auth-form')return;e.preventDefault();run(async()=>{
  emailValue=$('#email')?.value.trim()||emailValue;
  if(mode==='login'){const r=await request('login',{email:emailValue,password:$('#password').value});$('#password').value='';navigate(r.redirect);return;}
  if(mode==='password'){const r=await request('reset-password',{password:$('#password').value});$('#password').value='';navigate(r.redirect);return;}
  if(mode==='code'){const r=await request('verify-code',{challenge_id:cid,code:$('#code').value});if(r.reset_required){continuationNeedsCheck=r.verification_security_required!==false;clearInterval(timer);mode='password';render();$('#password').focus();}else{tell('You’re verified. Opening your space…');navigate(r.redirect);}return;}
  purpose=mode;
  const result=await request(mode==='signup'?'register':'request-code',{email:emailValue,...(mode==='signup'?{password:$('#password').value}:{purpose:mode==='reset'?'reset':'signin'})});
  showCode(result);
 });});
 root.addEventListener('click',e=>{const t=e.target.closest('[data-mode],.password-reveal,#resend,#auth-retry,#email-fallback');if(!t)return;e.preventDefault();if(busy)return;
  if(t.id==='email-fallback'){
   if(!emailFallback&&config?.email_fallback_enabled!==true)return;
   emailValue=$('#email')?.value.trim()||emailValue;emailFallback=!emailFallback;
   if(mode==='login'&&emailFallback){mode='email';render();}
   else if(mode==='email'&&!emailFallback){mode='login';render();}
   else syncMethod();
   tell(emailFallback?'We’ll verify your email. No browser security check is needed for this option.':'');updateAddress();return;
  }
  if(t.id==='auth-retry'){loadSession();return;}
  if(t.matches('.password-reveal')){const input=$('#password'),show=input.type==='password';input.type=show?'text':'password';t.textContent=show?'Hide':'Show';t.setAttribute('aria-label',show?'Hide password':'Show password');t.setAttribute('aria-pressed',String(show));return;}
  if(t.id==='resend'){if(Date.now()<resendAt)return;run(async()=>showCode(await request('resend-code',{challenge_id:cid})));return;}
  emailValue=$('#email')?.value.trim()||emailValue;mode=t.dataset.mode==='back'?purpose:t.dataset.mode;if(mode==='login')emailFallback=false;cid=null;continuationNeedsCheck=true;clearInterval(timer);render();
  updateAddress();
 });
 render(false);
 async function loadSession(){
  if(loading)return;loading=true;const finish=beginActivity(null,'Preparing secure sign-in…');$('#auth-retry').hidden=true;$('#auth-status').setAttribute('aria-busy','true');tell('Connecting securely…');
  try{
   const result=await request('session');if(destroyed)return;
   if(typeof result.ready!=='boolean'||((result.ready||result.email_fallback_enabled)&&(!result.csrf||!result.security)))throw Error('The sign-in service returned an incomplete response. Please try again.');
   config=result;if(config.ready&&!emailFallback)preloadTurnstile(config.security);syncMethod();
   $('.auth-submit').disabled=!canSubmit();tell(canSubmit()?'':emailFallback?'Email fallback is not available. Use standard sign-in.':'Secure sign-in is being configured. Please come back shortly.');
   $('#auth-retry').hidden=canSubmit();
  }catch(e){if(!destroyed){tell(e.message,true);$('#auth-retry').hidden=false;}}finally{loading=false;$('#auth-status')?.removeAttribute('aria-busy');finish();}
 }
 loadSession();
 return {destroy(){destroyed=true;clearInterval(timer);stopMedia();}};
}
if(document.querySelector('#auth-app'))mountAuth(document.querySelector('#auth-app'));
