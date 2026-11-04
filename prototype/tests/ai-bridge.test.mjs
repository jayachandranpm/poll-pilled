import test from 'node:test';
import assert from 'node:assert/strict';
import {api,community,configureSession,liveRequest} from '../src/api.js';

const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const original=globalThis.fetch;
test.after(()=>{globalThis.fetch=original});
test.beforeEach(()=>configureSession({csrf:'test-csrf',security:{}}));

test('AI bypasses demo outputs and sends keys only to the local server',async()=>{
 const calls=[];globalThis.fetch=async(url,options)=>{calls.push({url,options});return json({connections:{meta:{configured:true}}})};
 const result=await api('/api/ai/connections',{provider:'meta',key:'test-only-key'});
 assert.equal(result.connections.meta.configured,true);assert.equal(calls.length,1);
 assert.equal(calls[0].url,'/api/ai/connections');assert.equal(calls[0].options.headers['X-CSRF-Token'],'test-csrf');
 assert.equal(calls[0].options.credentials,'same-origin');assert.equal(JSON.parse(calls[0].options.body).key,'test-only-key');
 assert.equal(calls[0].options.headers.Authorization,undefined);
});

test('provider failures propagate instead of returning a sample draft',async()=>{
 let count=0;globalThis.fetch=async()=>{count++;return json({error:'Add your Meta key first.'},503)};
 await assert.rejects(()=>api('/api/ai',{task:'draft',prompt:'Plan an event'}),/Add your Meta key/);
 assert.equal(count,1);
});

test('hybrid state keeps marketplace examples and reads real AI connection state',async()=>{
 globalThis.fetch=async()=>json({connections:{meta:{configured:true},usage:{daily_limit:1}}});
 const state=await community('/state');assert.equal(state.demo,true);assert.equal(state.ai.meta.configured,true);assert.ok(state.polls.length);
});

test('real insight briefs persist to the demo and send anonymous evidence',async()=>{
 let sent;globalThis.fetch=async(url,options)=>{
  assert.equal(url,'/api/ai/insights');sent=JSON.parse(options.body);
  return json({brief:{themes:[{title:'Space',summary:'Space for books.',sources:[sent.responses[0].id]}],disagreements:[],sample_size:sent.responses.length,demo:false,generated_at:new Date().toISOString()}});
 };
 await community('/polls/design-study/insights',{});
 assert.equal(sent.question,'Which everyday bag should we make next?');assert.ok(sent.responses.length>=2);
 assert.equal(sent.responses[0].name,undefined);
 const detail=await community('/polls/design-study/details');assert.equal(detail.brief.demo,false);assert.equal(detail.brief.themes[0].title,'Space');
});

test('a missing key does not upload voice or return an illustrative transcript',async()=>{
 const calls=[];globalThis.fetch=async url=>{calls.push(url);return json({connections:{meta:{configured:false}}})};
 await assert.rejects(()=>api('/api/ai/transcribe',{url:'/assets/voice-sample.mp3'}),/Add your Meta key/);
 assert.deepEqual(calls,['/api/ai/connections']);
});

test('capability status records a failed request without retaining its prompt or key',async()=>{
 const {getCapabilityChecks}=await import('../src/aiCapabilityState.js');
 globalThis.fetch=async()=>json({error:'Model access is unavailable'},403);
 await assert.rejects(api('/api/ai/image',{prompt:'private prompt marker'}),/Model access/);
 assert.equal(getCapabilityChecks().image.state,'failed');
 assert.equal(JSON.stringify(getCapabilityChecks()).includes('private prompt marker'),false);
});
test('cached success is identified without claiming a fresh provider verification',async()=>{
 configureSession({csrf:'test-csrf',security:{}});
 const {getCapabilityChecks,capabilityLabel}=await import('../src/aiCapabilityState.js');
 globalThis.fetch=async()=>json({question:'A new question',ai_usage:{cached:true}});
 await api('/api/ai',{task:'rephrase',prompt:'Private draft'});
 assert.equal(getCapabilityChecks().language.cached,true);
 assert.match(capabilityLabel(getCapabilityChecks().language),/provider not rechecked/);
});


test('fresh app startup reads community state directly without an AI bootstrap dependency',async()=>{
 configureSession({csrf:'',security:{}});const calls=[];
 globalThis.fetch=async(url)=>{calls.push(url);if(url.startsWith('/api/ai'))throw Error('AI is unavailable');return json({csrf:'from-state',security:{turnstile_enabled:false},polls:[]});};
 const result=await liveRequest('/api/community/state');assert.deepEqual(result.polls,[]);assert.deepEqual(calls,['/api/community/state']);
 await liveRequest('/api/community/preferences',{theme:'light'});assert.equal(calls.length,2);
});

test('first mutation uses a lightweight authenticated session and never repeats the write',async()=>{
 configureSession({csrf:'',security:{}});const calls=[];
 globalThis.fetch=async(url,options)=>{calls.push(url);if(url==='/api/session')return json({csrf:'new-session',security:{turnstile_enabled:false}});assert.equal(options.headers['X-CSRF-Token'],'new-session');return json({error:'Temporary storage failure.'},503);};
 await assert.rejects(liveRequest('/api/community/preferences',{theme:'light'}),/Temporary storage failure/);
 assert.deepEqual(calls,['/api/session','/api/community/preferences']);
});

test('expired sessions are identified without claiming an AI key was not saved',async()=>{
 configureSession({csrf:'',security:{}});globalThis.fetch=async()=>json({error:'Sign in securely to continue.',login_required:true},401);
 await assert.rejects(liveRequest('/api/community/state'),e=>e.loginRequired===true&&e.status===401&&!/AI|key/.test(e.message));
});

test('gateway auth errors without a JSON body retain sign-in recovery and never repeat the mutation',async()=>{
 configureSession({csrf:'signed-in',security:{turnstile_enabled:true,captcha_policy:{version:1,free_posts:['/api/community/preferences']}}});
 let calls=0;globalThis.fetch=async()=>{calls++;return new Response(null,{status:401});};
 await assert.rejects(liveRequest('/api/community/preferences',{theme:'dark'}),e=>e.loginRequired&&e.status===401&&/Sign in again/.test(e.message));
 assert.equal(calls,1);
});

test('a stalled startup request terminates with actionable feedback',async()=>{
 configureSession({csrf:'',security:{}});let calls=0;
 globalThis.fetch=async(url,options)=>{calls++;return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));};
 await assert.rejects(liveRequest('/api/community/state',undefined,{timeout:10}),/took too long/);assert.equal(calls,1);
});

test('truncated successful publications keep the same operation key for a manual retry',async()=>{
 const bodies=[];
 globalThis.fetch=async(url,options)=>{bodies.push(JSON.parse(options.body));return bodies.length===1?new Response('',{status:200}):json({id:'one-publication'});};
 const data={title:'A confirmed publication?',options:['Yes','No']};
 await assert.rejects(liveRequest('/api/community/publish',data),e=>e.unconfirmed&&e.status===200);
 const result=await liveRequest('/api/community/publish',data);
 assert.equal(result.id,'one-publication');assert.equal(bodies[0].idempotency_key,bodies[1].idempotency_key);
 assert.equal(bodies.length,2,'no automatic mutation replay');
});

test('server error references stay actionable without discarding the operation key',async()=>{
 const bodies=[];
 globalThis.fetch=async(url,options)=>{bodies.push(JSON.parse(options.body));return bodies.length===1?json({error:'Your action could not be confirmed.',reference:'qa-reference'},500):json({saved:true});};
 await assert.rejects(liveRequest('/api/community/draft',{draft:{title:'Keep my work'}}),/Reference: qa-reference/);
 await liveRequest('/api/community/draft',{draft:{title:'Keep my work'}});
 assert.equal(bodies[0].idempotency_key,bodies[1].idempotency_key);
});

test('server routine policy skips widgets for settings, drafts, previews and bounded actions',async()=>{
 const rules=['/api/community/preferences','/api/community/onboarding','/api/community/draft','/api/community/quote','/api/upload','/api/community/notifications/read','/api/community/polls/<pid>/claim','/api/community/polls/<pid>/answer','/api/community/followups/<fid>/answer','/api/community/polls/<pid>/save','/api/community/polls/<pid>/react','/api/community/polls/<pid>/report','/api/community/people/<public_id>/follow'];
 const policy={turnstile_enabled:true,site_key:'test-key',captcha_policy:{version:1,free_posts:rules}};
 configureSession({csrf:'routine-csrf',security:policy});
 const calls=[];
 globalThis.fetch=async(url,options)=>{calls.push({url,options});return json({saved:true,security:policy});};
 for(const rule of rules)await liveRequest(rule.replace(/<[^>]+>/g,'test-id'),{});
 assert.equal(calls.length,rules.length);
 for(const {options} of calls){assert.equal(options.headers['X-CSRF-Token'],'routine-csrf');assert.equal(options.headers['X-Turnstile-Token'],undefined);}
 // No browser/widget exists here, so protected requests must fail before fetch.
 for(const path of ['/api/community/publish','/api/community/polls/test-id/answer/extra','/api/ai/image','/api/community/preferences/extra','/api/community/people/test-id/follow/extra'])await assert.rejects(liveRequest(path,{}));
 assert.equal(calls.length,rules.length);
});

test('missing server policy stays protected and expired sessions are not retried',async()=>{
 configureSession({csrf:'routine-csrf',security:{turnstile_enabled:true,site_key:'test-key'}});
 let calls=0;globalThis.fetch=async()=>{calls++;return json({saved:true});};
 await assert.rejects(liveRequest('/api/community/preferences',{theme:'dark'}));assert.equal(calls,0);
 configureSession({csrf:'routine-csrf',security:{turnstile_enabled:true,site_key:'test-key',captcha_policy:{version:1,free_posts:['/api/community/preferences']}}});
 globalThis.fetch=async()=>{calls++;return json({error:'Sign in again.',login_required:true},401);};
 await assert.rejects(liveRequest('/api/community/preferences',{theme:'dark'}),error=>error.loginRequired);
 assert.equal(calls,1);
});

test('signed-in AI creation uses the exact server policy without loading a security widget',async()=>{
 const rules=['/api/ai','/api/ai/assist','/api/ai/image','/api/ai/studio','/api/ai/studio/review','/api/ai/vision','/api/ai/segment','/api/ai/transcribe','/api/ai/insights','/api/cloudflare/speech','/api/community/polls/<pid>/insights','/api/community/responses/<rid>/transcribe'];
 configureSession({csrf:'verified-session',security:{turnstile_enabled:true,site_key:'qa',captcha_policy:{version:1,free_posts:rules}}});
 const calls=[];
 globalThis.fetch=async(path,options)=>{calls.push(path);assert.equal(options.headers['X-CSRF-Token'],'verified-session');assert.equal(options.headers['X-Turnstile-Token'],undefined);return json({saved:true});};
 for(const path of rules)await liveRequest(path.replace(/<[^>]+>/g,'poll-test'),{prompt:'A private draft'});
 assert.equal(calls.length,rules.length);
 // No browser exists in this test. Any attempt to challenge here would fail;
 // credential/admin/unknown routes must still fail before sending a request.
 for(const path of ['/api/ai/connections','/api/ai/preferences','/api/ai/cache/clear','/api/admin/settings','/api/ai/new-tool','/api/ai/image/extra'])await assert.rejects(liveRequest(path,{}));
 assert.equal(calls.length,rules.length);
});


test('invalid JSON shapes keep write receipts recoverable without a runtime TypeError',async()=>{
 for(const value of [null,[],"unexpected text"]){
  const bodies=[];globalThis.fetch=async(url,options)=>{bodies.push(JSON.parse(options.body));return bodies.length===1?json(value):json({saved:true});};
  const data={draft:{title:'Keep this question'}};
  await assert.rejects(liveRequest('/api/community/draft',data),e=>e.unconfirmed&&/kept/.test(e.message));
  await liveRequest('/api/community/draft',data);
  assert.equal(bodies[0].idempotency_key,bodies[1].idempotency_key);
 }
});

test('temporary workspace reads recover once while failed writes are never replayed',async()=>{
 let calls=0;globalThis.fetch=async()=>++calls===1?json({error:'Storage is temporarily unavailable'},503):json({polls:[]});
 assert.deepEqual((await liveRequest('/api/community/state')).polls,[]);assert.equal(calls,2);
 calls=0;globalThis.fetch=async()=>{calls++;return json({error:'Storage is temporarily unavailable'},503);};
 await assert.rejects(liveRequest('/api/community/state'),/temporarily unavailable/);assert.equal(calls,2);
 calls=0;await assert.rejects(liveRequest('/api/community/draft',{draft:{title:'Pending'}}),/temporarily unavailable/);assert.equal(calls,1);
});

test('sign-in redirects are reported as expired sessions instead of unreadable workspace data',async()=>{
 const response=new Response('<html>Sign in</html>',{status:200});
 Object.defineProperties(response,{redirected:{value:true},url:{value:'https://app.test/sign-in'}});
 globalThis.fetch=async()=>response;
 await assert.rejects(liveRequest('/api/community/state'),e=>e.loginRequired&&e.status===401);
});

test('malformed gateway 401 JSON retains the sign-in recovery path',async()=>{
 configureSession({csrf:'test-csrf',security:{}});
 globalThis.fetch=async()=>json(null,401);
 await assert.rejects(liveRequest('/api/community/state'),e=>e.loginRequired&&e.status===401&&/Sign in again/.test(e.message));
});
