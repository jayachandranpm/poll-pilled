// A deliberately separate widget harness: no app styles, dialog, auth form,
// custom challenge timers or automatic retries. Never retain a success token.
export function mountDiagnostic(root,{fetcher=fetch}={}){
 const doc=root.ownerDocument,win=doc.defaultView;
 const status=root.querySelector('#diagnostic-status'),result=root.querySelector('#diagnostic-result');
 const retry=root.querySelector('#diagnostic-retry'),container=root.querySelector('#diagnostic-widget');
 let widget,script,loadTimer,destroyed=false,phase='loading',config;
 const report={page:win.location.hostname,site_key:'',stage:'loading',reference:'',checked_at:new Date().toISOString()};
 function show(stage,message,reference=''){
  if(destroyed)return;phase=stage;report.stage=stage;report.reference=reference;report.checked_at=new Date().toISOString();
  status.textContent=message;status.dataset.failed=String(stage.includes('error'));result.textContent=JSON.stringify(report,null,2);
 }
 function fail(code){
  if(destroyed||phase==='complete')return true;
  const safe=/^\d{6}$/.test(String(code))?String(code):'unknown';
  show('widget_error','Cloudflare could not complete this standalone check. Share the result below.',safe);retry.hidden=false;retry.disabled=false;return true;
 }
 function render(){
  show('checking','Complete the Cloudflare check below if prompted.');
  try{
   widget=win.turnstile.render(container,{
    sitekey:config.site_key,action:'poll_login',theme:'light',size:container.clientWidth>0&&container.clientWidth<300?'compact':'flexible',retry:'never','response-field':false,
    callback:()=>{if(destroyed||phase!=='checking')return;show('complete','Browser check completed. Share this result so we can compare it with sign-in.');retry.hidden=false;retry.disabled=false;},
    'error-callback':fail,'expired-callback':()=>fail('110600'),'timeout-callback':()=>fail('110620'),
    'unsupported-callback':()=>fail('110500'),
   });
  }catch{show('widget_error','The widget could not start. Share the result below.','widget-start');retry.hidden=false;retry.disabled=false;}
 }
 async function load(){
  show('loading','Loading the security check…');retry.hidden=true;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try{
   const response=await fetcher('/api/auth/session',{credentials:'same-origin',cache:'no-store',signal:controller.signal});
   if(!response.ok)throw Error();config=(await response.json()).security;
   if(!config?.turnstile_enabled||!config.site_key){show('configuration_error','Turnstile is not configured.','missing-sitekey');return;}
   report.site_key=config.site_key;
   if(config.hostname!==win.location.hostname){show('configuration_error','Open this check on the configured Poll Pilled address.','hostname-mismatch');return;}
   if(destroyed)return;
   if(typeof win.turnstile?.render==='function'){render();return;}
   script=doc.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;script.defer=true;
   const scriptFailed=()=>{clearTimeout(loadTimer);script.onload=script.onerror=null;script.remove();show('script_error','Cloudflare’s script could not load. Share the result below.','script-load');retry.hidden=false;retry.disabled=false;};
   script.onload=()=>{clearTimeout(loadTimer);script.onload=script.onerror=null;if(destroyed)return;if(typeof win.turnstile?.render!=='function'){scriptFailed();return;}render();};
   script.onerror=scriptFailed;loadTimer=setTimeout(scriptFailed,30000);doc.head.append(script);
  }catch{show('configuration_error','The app configuration could not load. Please try again.','config-load');retry.hidden=false;retry.disabled=false;}
  finally{clearTimeout(timer);}
 }
 retry.onclick=()=>{
  if(destroyed||phase==='checking'||phase==='loading')return;
  if(widget===undefined){load();return;}
  retry.hidden=true;show('checking','Complete the Cloudflare check below if prompted.');
  try{win.turnstile.reset(widget);}catch{show('widget_error','The widget could not restart. Reload this page.','widget-reset');retry.hidden=false;}
 };
 const ready=load();
 function destroy(){destroyed=true;clearTimeout(loadTimer);if(script)script.onload=script.onerror=null;if(widget!==undefined)try{win.turnstile.remove(widget);}catch{}retry.onclick=null;}
 win.addEventListener('pagehide',destroy,{once:true});return {ready,destroy};
}
if(typeof document!=='undefined'&&document.querySelector('#security-diagnostic'))mountDiagnostic(document.querySelector('#security-diagnostic'));
