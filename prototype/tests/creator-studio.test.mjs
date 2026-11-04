import test from 'node:test';
import assert from 'node:assert/strict';
import {applyProposal,canApplyVoice,voiceAttachment,voiceFingerprint} from '../src/deck-prototype/studioState.js';
test('a proposal replaces incompatible media but preserves audience and funding',()=>{
 const before={id:'saved',reach:'Boost',count:100,title:'Old',type:'audio',mediaURL:'/uploads/old.mp3',image_origin:'generated',audio_origin:'generated',images:['old'],videos:['old']};
 const proposal={title:'Choose an option?',format:'ab',options:['A','B'],tags:['design'],language:'English',image_prompts:['Same style A','Same style B'],transcript:'',rationale:'Compare only color',instructions:'Choose one'};
 const result=applyProposal(before,proposal,['ref']);
 assert.equal(before.mediaURL,'/uploads/old.mp3');assert.equal(result.mediaURL,'');assert.deepEqual(result.images,['ref']);assert.deepEqual(result.videos,[]);
 assert.equal(result.id,'saved');assert.equal(result.reach,'Boost');assert.equal(result.count,100);assert.equal(result.text_origin,'generated');assert.equal(result.audio_origin,'human');
});
test('AI audio preview becomes stale when words, preset, or source mode change',()=>{
 const v={mode:'type',text:'My opinion',speaker:'luna',result:{url:'audio',audio_origin:'generated',fingerprint:voiceFingerprint('My opinion','luna')}};
 assert.equal(canApplyVoice(v),true);assert.equal(canApplyVoice({...v,text:'Changed words'}),false);assert.equal(canApplyVoice({...v,speaker:'iris'}),false);assert.equal(canApplyVoice({...v,mode:'original'}),false);
});
test('natural voice and generated voice carry distinct submission provenance',()=>{
 assert.deepEqual(voiceAttachment({url:'voice',audio_origin:'generated',transcript:'Hello'}),{audio:'voice',audio_origin:'generated',transcript:'Hello',voiceLocked:true});
 assert.equal(voiceAttachment({url:'recording',audio_origin:'human'}).voiceLocked,false);
 assert.equal(canApplyVoice({mode:'original',result:{url:'recording',audio_origin:'human'}}),true);
 assert.equal(canApplyVoice({mode:'type',result:{url:'recording',audio_origin:'human'}}),false);
});
