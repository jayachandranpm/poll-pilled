import test from 'node:test';
import assert from 'node:assert/strict';
import {changeFormat,editorIssue,estimateInput} from '../src/editorModel.js';

const draft={title:'Which bag would you choose?',format:'visual',options:['Tote','Crossbody'],images:['/one.png','/two.png'],image_origin:'generated',audio:'',audio_origin:'human',transcript:'',responses:20,reach:'Community',audience:'Everyone'};

test('format round trips preserve labels, media and provenance without sharing mutable arrays',()=>{
 const audio=changeFormat(draft,'audio');
 const withAudio={...draft,...audio.patch,audio:'/recording.mp3',transcript:'My question',options:['Love it','Not for me']};
 const visual=changeFormat(withAudio,'visual',audio.drafts);
 assert.deepEqual(visual.patch.images,draft.images);
 assert.deepEqual(visual.patch.options,draft.options);
 assert.equal(visual.patch.image_origin,'generated');
 const restored=changeFormat({...draft,...visual.patch},'audio',visual.drafts);
 assert.equal(restored.patch.audio,'/recording.mp3');
 assert.equal(restored.patch.transcript,'My question');
 assert.deepEqual(restored.patch.options,['Love it','Not for me']);
 restored.patch.options[0]='Changed';
 assert.equal(restored.drafts.audio.options[0],'Love it');
});

test('first switch between choice-based formats keeps labels, while scales have their own steps',()=>{
 const classic={...draft,format:'classic',options:['Books','Lunch','Both']};
 assert.deepEqual(changeFormat(classic,'rank').patch.options,classic.options);
 const scale=changeFormat(classic,'slider');
 assert.equal(scale.patch.options.length,5);
 assert.deepEqual(changeFormat({...classic,...scale.patch},'classic',scale.drafts).patch.options,classic.options);
});

test('incomplete polls have an actionable reason before reaching publishing',()=>{
 assert.equal(editorIssue(draft),null);
 assert.equal(editorIssue({...draft,title:'Hi'}).target,'question');
 assert.equal(editorIssue({...draft,options:['Same',' same ']}).target,'options');
 assert.equal(editorIssue({...draft,options:['Tote',' ']}).target,'options');
 assert.equal(editorIssue({...draft,images:['/one.png','']}).target,'images');
 assert.equal(editorIssue({...draft,format:'audio'}).target,'audio');
 assert.equal(editorIssue({...draft,format:'audio',audio:'/recording.mp3'}),null);
});

test('cosmetic draft changes do not invalidate an estimate; budget and content changes do',()=>{
 assert.deepEqual(estimateInput({...draft,name:'Renamed',image_origin:'human'}),estimateInput(draft));
 for(const patch of [{responses:30},{reach:'Boost'},{format:'rank'},{title:'A much longer question about bags'},{audience:'design'},{options:['One','Two','Three']}])assert.notDeepEqual(estimateInput({...draft,...patch}),estimateInput(draft));
});

test('video drafts retain clips and provenance across formats and require text alternatives',()=>{
 const video={...draft,format:'video',images:[],videos:['/clip-a.mp4','/clip-b.mp4'],video_descriptions:['Version A animation','Version B animation'],video_origin:'generated',tags:['design']};
 assert.equal(editorIssue(video),null);
 assert.equal(editorIssue({...video,video_descriptions:['Version A animation','']}).target,'videos');
 assert.equal(editorIssue({...video,videos:['/clip-a.mp4','']}).target,'videos');
 const classic=changeFormat(video,'classic');const restored=changeFormat({...video,...classic.patch},'video',classic.drafts);
 assert.deepEqual(restored.patch.videos,video.videos);assert.deepEqual(restored.patch.video_descriptions,video.video_descriptions);assert.equal(restored.patch.video_origin,'generated');
 assert.ok(editorIssue({...draft,format:'ab',options:['A','B','C'],images:['/a','/b','/c']}));
});
