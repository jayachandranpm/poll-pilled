let loading, challengeQueue = Promise.resolve();

// Cloudflare's public diagnostic codes, never a token or user identifier.
export function securityFailure(value) {
  const code=/^\d{6}$/.test(String(value))?String(value):'unknown';
  let message='Cloudflare couldn’t complete this check. Reload the page and try again.',retryable=false;
  if(['110100','110110','400020','400070'].includes(code))message='The security widget needs to be checked by Poll Pilled. Please share the reference below with the owner.';
  else if(code==='110200'||code==='400021')message='This website address is not enabled for the security widget. Please share the reference below with the owner.';
  else if(code==='110500'||code==='110510')message='Cloudflare couldn’t verify this browser. Use an up-to-date browser, then try again.';
  else if(code==='200100')message='Cloudflare detected a clock or cached-page problem. Check your device’s date and time, then reload this page.';
  else if(code==='200500'){message='The security widget couldn’t connect. Check that your browser or network allows challenges.cloudflare.com.';retryable=true;}
  else if(code==='110600'||code==='110620'){message='The security check timed out. Start a fresh check when you’re ready.';retryable=true;}
  else if(/^(300|600)/.test(code)){message='Cloudflare couldn’t verify this browser check. Try again. If it repeats, share the reference below so we can investigate.';retryable=true;}
  const error=new Error(`${message} Reference: ${code}.`);
  error.code=code;error.retryable=retryable;
  // Assessment failures need a deliberate retry. Replacing their iframe
  // immediately discards Cloudflare's Ray ID and built-in feedback controls.
  error.automaticRetry=retryable&&!/^(300|600)/.test(code);return error;
}

function loadWidget() {
  if (typeof window.turnstile?.render==='function') return Promise.resolve();
  if (!loading) loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;script.defer = true;
    let settled=false;
    const timer = setTimeout(fail,15000);
    function fail() {
      if(settled)return;settled=true;clearTimeout(timer);script.onload=script.onerror=null;script.remove();loading=null;
      reject(new Error('The security widget could not load. Allow challenges.cloudflare.com in your browser or network settings, then try again. Reference: script-load.'));
    }
    script.onload = () => {
      if(settled)return;
      if(typeof window.turnstile?.render!=='function'){fail();return;}
      const ready=()=>{if(settled)return;settled=true;clearTimeout(timer);script.onload=script.onerror=null;resolve();};
      // Script onload runs after api.js evaluates. Cloudflare rejects ready()
      // for async/defer scripts (error 3857); do not call it here.
      ready();
    };
    script.onerror = fail;
    document.head.append(script);
  });
  return loading;
}
// Warm only the provider script; never create or reuse a challenge token.
export function preloadTurnstile(config) {
  if(config?.turnstile_enabled)loadWidget().catch(()=>{});
}
export function challenge(config, action='poll_write') {
  // Every protected write still gets its own single-use token. Only one widget
  // owns focus; a retry repeats the challenge, never the application request.
  const next = challengeQueue.then(() => runChallenge(config, action));
  challengeQueue = next.catch(() => {});
  return next;
}
export async function runChallenge(config, action, {retryDelays=[8000],timeout=90000,attemptTimeout=30000,interactiveTimeout=120000}={}) {
  if (!config.turnstile_enabled) return '';
  if(!config.site_key)throw new Error('The security widget is not configured. Please contact the owner. Reference: missing-sitekey.');
  if(config.hostname&&window.location?.hostname&&window.location.hostname!==config.hostname){
    throw new Error(`Security checks are enabled on ${config.hostname}. Open Poll Pilled at that address to continue. Reference: hostname-mismatch.`);
  }
  await loadWidget();
  return new Promise((resolve, reject) => {
    const previous = document.activeElement;
    const modal = document.createElement('dialog');
    modal.className = 'security-check';
    modal.setAttribute('aria-labelledby', 'security-check-title');
    modal.setAttribute('aria-describedby','security-check-status');
    modal.innerHTML = '<h2 id="security-check-title">Quick security check</h2><p>Protecting polls and rewards from bots.</p><div class="security-widget"></div><p id="security-check-status" role="status" aria-live="polite">Checking securely…</p><details class="security-help" hidden><summary>Help with this check</summary><p>Your form is unchanged. You can retry when ready. If Cloudflare keeps rejecting the check, use its widget feedback control and include the Ray ID shown there. The reference code alone cannot identify the cause.</p><a href="https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/" target="_blank" rel="noopener noreferrer">Cloudflare troubleshooting</a></details><div class="security-actions"><button type="button" class="btn security-cancel">Cancel</button><button type="button" class="btn primary security-retry" hidden>Try again</button></div>';
    document.body.append(modal);modal.showModal();
    const status=modal.querySelector('#security-check-status'),retryButton=modal.querySelector('.security-retry'),container=modal.querySelector('.security-widget');
    let widget, timer, retryTimer, attemptTimer, generation=0, settled=false, phase='checking', retries=0,lastError=null;
    function armDeadline(ms=timeout){
      clearTimeout(timer);
      timer=setTimeout(()=>finish(lastError||'The security check timed out. Your form is unchanged. Please try again. Reference: check-timeout.'),ms);
    }
    function cleanupWidget(){if(widget!==undefined){try{window.turnstile.remove(widget);}catch{}widget=undefined;}}
    function finish(error,token) {
      if(settled)return;settled=true;phase='finished';clearTimeout(timer);clearTimeout(retryTimer);clearTimeout(attemptTimer);generation++;
      cleanupWidget();modal.close();modal.remove();if(previous?.isConnected)previous.focus();
      error?reject(error instanceof Error?error:new Error(error)):resolve(token);
    }
    function armAttempt(ms=attemptTimeout) {
      clearTimeout(attemptTimer);
      attemptTimer=setTimeout(()=>{
        const error=new Error('The security check stopped responding. Try again; your form is unchanged. Reference: check-stalled.');
        error.code='check-stalled';error.retryable=true;failed(error);
      },ms);
    }
    function failed(value) {
      if(settled||phase!=='checking')return true;
      clearTimeout(attemptTimer);
      lastError=value instanceof Error?value:securityFailure(value);
      if(!lastError.retryable){finish(lastError);return true;}
      status.dataset.error='true';
      if(lastError.automaticRetry!==false&&retries<retryDelays.length){
        phase='retrying';const delay=retryDelays[retries++];
        status.textContent=`The check was interrupted. Starting a fresh check… Reference: ${lastError.code}.`;
        retryTimer=setTimeout(startAttempt,delay);
      }else{
        // No work is pending while waiting for the user. Do not close the
        // failed widget or let an old deadline cancel their manual retry.
        clearTimeout(timer);phase='waiting';status.textContent=lastError.message;retryButton.hidden=false;
        modal.querySelector('.security-help').hidden=false;retryButton.focus();
      }
      return true;
    }
    function startAttempt() {
      if(settled)return;
      clearTimeout(retryTimer);clearTimeout(attemptTimer);
      const attempt=++generation;cleanupWidget();phase='checking';lastError=null;
      retryButton.hidden=true;modal.querySelector('.security-help').hidden=true;
      status.textContent=generation>1?'Starting a fresh security check…':'Checking securely…';status.dataset.error='false';
      const active=()=>!settled&&phase==='checking'&&generation===attempt;
      const errorCallback=code=>active()?failed(code):true;
      armAttempt();
      try {
        const rendered=window.turnstile.render(container,{
          sitekey:config.site_key,action,theme:document.documentElement.dataset.theme==='dark'?'dark':'light',size:container.clientWidth>0&&container.clientWidth<300?'compact':'flexible',
          appearance:'always',execution:'render',
          retry:'never','refresh-expired':'manual','refresh-timeout':'manual','response-field':false,
          callback:token=>{if(!active())return;if(typeof token!=='string'||!token||token.length>2048){finish(new Error('The security widget returned an invalid response. Reload and try again. Reference: empty-token.'));return;}finish(null,token);},
          'error-callback':errorCallback,
          'expired-callback':()=>errorCallback('110600'),
          'timeout-callback':()=>errorCallback('110620'),
          'unsupported-callback':()=>errorCallback('110500'),
          'before-interactive-callback':()=>{if(active()){status.textContent='Complete the check above to continue.';armDeadline(interactiveTimeout);armAttempt(interactiveTimeout);}},
          'after-interactive-callback':()=>{if(active()){status.textContent='Finishing the security check…';armAttempt();}},
        });
        widget=rendered;
        // Render may invoke callbacks synchronously before returning its ID.
        if(settled)cleanupWidget();
      }catch{finish(new Error('The security widget could not start. Reload this page and try again. Reference: widget-start.'));}
    }
    modal.addEventListener('cancel',e=>{e.preventDefault();finish(lastError||'Security check cancelled. Nothing was submitted.');});
    modal.querySelector('.security-cancel').onclick=()=>finish(lastError||'Security check cancelled. Nothing was submitted.');
    retryButton.onclick=()=>{if(phase!=='waiting'||settled)return;armDeadline();startAttempt();};
    armDeadline();startAttempt();
  });
}
