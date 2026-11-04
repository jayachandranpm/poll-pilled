import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {fileURLToPath} from 'node:url';
const built=await build({stdin:{contents:"import * as loading from './loading.js';window.loading=loading;",resolveDir:fileURLToPath(new URL('../src/deck-prototype/',import.meta.url))},bundle:true,write:false,format:'iife',plugins:[{name:'css',setup(b){b.onLoad({filter:/\.css$/},()=>({contents:'',loader:'js'}));}}]});
const setup=()=>{const dom=new JSDOM('<button id="action">Save changes</button><div id="media"><span class="image-wrap"><img src="/image.webp" width="320" height="370" alt="Option one"></span></div>',{url:'https://app.test',runScripts:'outside-only'});dom.window.eval(built.outputFiles[0].text);return {dom,w:dom.window,api:dom.window.loading}};
const tick=()=>new Promise(r=>setTimeout(r,0));
test('overlapping activity keeps progress visible until the last task completes',async()=>{
 const x=setup(),b=x.w.document.querySelector('button');let callbacks=[];x.w.setTimeout=fn=>{callbacks.push(fn);return callbacks.length};x.w.clearTimeout=()=>{};
 const first=x.api.beginActivity(b,'Saving changes…'),second=x.api.beginActivity(null,'Uploading image…');callbacks.forEach(f=>f());
 assert.equal(b.textContent,'Save changes');assert.equal(b.disabled,true);assert.equal(x.w.document.querySelector('#app-activity').hidden,false);
 first();assert.equal(b.disabled,false);assert.equal(b.hasAttribute('aria-busy'),false);assert.equal(x.w.document.querySelector('#app-activity').hidden,false);
 first();second();assert.equal(x.w.document.querySelector('#app-activity').hidden,true);x.dom.window.close();
});
test('finishing a busy action preserves its original disabled state',()=>{
 const x=setup(),b=x.w.document.querySelector('button');b.disabled=true;const done=x.api.beginActivity(b);done();assert.equal(b.disabled,true);assert.equal(b.classList.contains('is-loading'),false);x.dom.window.close();
});
test('media skeletons finish on success or error and recover after replacing an image',async()=>{
 const x=setup(),root=x.w.document.querySelector('#media'),img=root.querySelector('img');
 Object.defineProperty(img,'complete',{get:()=>false,configurable:true});const stop=x.api.installMediaLoading(root);
 assert.ok(root.querySelector('.image-wrap.media-pending'));img.dispatchEvent(new x.w.Event('error'));assert.equal(root.querySelector('.media-pending'),null);assert.equal(root.querySelector('.media-load-error').textContent,'Image unavailable');
 img.src='/replacement.webp';await tick();assert.ok(root.querySelector('.media-pending'));img.dispatchEvent(new x.w.Event('load'));assert.equal(root.querySelector('.media-pending'),null);assert.equal(root.querySelector('.media-load-error'),null);assert.equal(img.alt,'Option one');stop();x.dom.window.close();
});
test('cached images never get stuck in a skeleton',()=>{
 const x=setup(),root=x.w.document.querySelector('#media'),img=root.querySelector('img');Object.defineProperty(img,'complete',{value:true});Object.defineProperty(img,'naturalWidth',{value:320});const stop=x.api.installMediaLoading(root);assert.equal(root.querySelector('.media-pending'),null);assert.equal(root.querySelector('.media-load-error'),null);stop();x.dom.window.close();
});
