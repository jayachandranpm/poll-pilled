import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {mountDiagnostic} from '../src/security-diagnostic.js';
const html=readFileSync(new URL('../security-check.html',import.meta.url),'utf8');
function setup(hostname='poll.example'){
 const dom=new JSDOM(html,{url:'https://poll.example/security-check'}),w=dom.window,calls=[],widgets=[],resets=[];
 w.turnstile={render:(el,options)=>{widgets.push(options);return 'widget';},reset:id=>resets.push(id),remove:()=>{}};
 const mount=()=>mountDiagnostic(w.document.querySelector('main'),{fetcher:async(...args)=>{calls.push(args);return {ok:true,json:async()=>({csrf:'private-csrf',security:{turnstile_enabled:true,site_key:'public-site-key',hostname}})};}});
 return {dom,w,calls,widgets,resets,mount};
}
test('diagnostic success never stores a token, posts data, or creates a sign-in',async t=>{
 const x=setup(),m=x.mount();t.after(()=>{m.destroy();x.w.close()});await m.ready;
 assert.equal(x.widgets[0].action,'poll_login');assert.equal(x.widgets[0]['response-field'],false);
 x.widgets[0].callback('sensitive-provider-token');
 const report=JSON.parse(x.w.document.querySelector('pre').textContent);assert.equal(report.stage,'complete');
 assert.equal(x.calls.length,1);assert.equal(x.calls[0][0],'/api/auth/session');assert.equal(x.calls[0][1].method,undefined);
 assert.doesNotMatch(x.w.document.body.textContent,/sensitive-provider-token|private-csrf/);
 assert.equal(x.w.localStorage.length,0);assert.equal(x.w.sessionStorage.length,0);assert.equal(x.w.location.pathname,'/security-check');
});
test('diagnostic preserves a failed widget, records only a safe code and resets only on a click',async t=>{
 const x=setup(),m=x.mount();t.after(()=>{m.destroy();x.w.close()});await m.ready;
 x.widgets[0]['error-callback']('600010');assert.equal(JSON.parse(x.w.document.querySelector('pre').textContent).reference,'600010');
 assert.equal(x.widgets.length,1);assert.deepEqual(x.resets,[]);assert.equal(x.w.document.querySelector('button').hidden,false);
 x.w.document.querySelector('button').click();assert.deepEqual(x.resets,['widget']);
 x.widgets[0]['error-callback']('<secret-token>');assert.equal(JSON.parse(x.w.document.querySelector('pre').textContent).reference,'unknown');
 assert.doesNotMatch(x.w.document.body.innerHTML,/secret-token/);
});
test('diagnostic fails closed before rendering on another hostname',async t=>{
 const x=setup('other.example'),m=x.mount();t.after(()=>{m.destroy();x.w.close()});await m.ready;
 assert.equal(x.widgets.length,0);assert.equal(JSON.parse(x.w.document.querySelector('pre').textContent).reference,'hostname-mismatch');
});
test('diagnostic loads only the official provider script and reports script failure without app mutations',async t=>{
 const x=setup();delete x.w.turnstile;const m=x.mount();t.after(()=>{m.destroy();x.w.close()});await m.ready;
 const script=x.w.document.querySelector('script[src^="https://challenges"]');assert.ok(script);
 assert.equal(script.src,'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit');script.onerror();
 assert.equal(JSON.parse(x.w.document.querySelector('pre').textContent).reference,'script-load');assert.equal(x.calls.length,1);
});
