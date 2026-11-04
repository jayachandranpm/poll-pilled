import test from 'node:test';
import assert from 'node:assert/strict';
import {readRoute,routeURL,discoveryRoute} from '../src/navigation.js';

test('format changes keep the Discover feed, circle and search context',()=>{
 const current=readRoute('?view=discover&circle=food&poll=&q=Sunday');
 const next=discoveryRoute(current,{format:'audio',poll:''});
 assert.equal(next.layout,'feed');assert.equal(next.circle,'food');assert.equal(next.query,'Sunday');
 assert.deepEqual(readRoute(routeURL(next)),next);
});
test('circle navigation preserves Feed and its active format',()=>{
 const current=readRoute('?view=discover&circle=everyday&layout=feed&format=audio&poll=');
 const next=discoveryRoute(current,{circle:'food',poll:''});
 assert.equal(next.layout,'feed');assert.equal(next.format,'audio');
 assert.deepEqual(readRoute(routeURL(next)),next);
});
test('opening a feed item and returning can preserve the filter and query',()=>{
 const current=readRoute('?view=discover&circle=for-you&layout=feed&format=visual&q=bag&poll=');
 const detail={...current,layout:'question',from:'search',poll:'bag'};
 assert.deepEqual(readRoute(routeURL(detail)),detail);
 const back=discoveryRoute(detail,{layout:'feed',poll:''});
 assert.equal(back.query,'bag');assert.equal(back.format,'visual');assert.equal(back.from,'');
});
test('clear filters keeps the current circle and layout; invalid URL values fall back',()=>{
 const current=readRoute('?view=discover&circle=work&layout=feed&format=rank&q=tool');
 const cleared=discoveryRoute(current,{format:'all',query:'',poll:''});
 assert.equal(cleared.circle,'work');assert.equal(cleared.layout,'feed');
 const invalid=readRoute('?view=unknown&layout=other&format=invalid');
 assert.equal(invalid.view,'discover');assert.equal(invalid.layout,'feed');assert.equal(invalid.format,'all');
});


test('Discover defaults to the feed while direct poll links open the answer page',()=>{
 for(const query of ['', '?view=discover', '?view=discover&layout=question&poll=']){
  const route=readRoute(query);assert.equal(route.layout,'feed');assert.equal(route.poll,'');
 }
 assert.equal(readRoute('?view=discover&poll=voice&from=search').layout,'question');
});
test('reward and sorting persist through detail navigation and back to the feed',()=>{
 const feed=readRoute('?view=discover&reward=300&sort=quick&q=home');
 const detail={...feed,poll:'voice',from:'search',layout:'question'};
 assert.deepEqual(readRoute(routeURL(detail)),detail);
 const returned=discoveryRoute(detail,{poll:''});
 assert.equal(returned.layout,'feed');assert.equal(returned.reward,300);assert.equal(returned.sort,'quick');assert.equal(returned.query,'home');
 assert.deepEqual(readRoute(routeURL(returned)),returned);
 const invalid=readRoute('?view=discover&reward=-1&sort=bad');assert.equal(invalid.reward,0);assert.equal(invalid.sort,'for-you');
});
