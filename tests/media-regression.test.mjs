import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {frameSampleTimes,ensureFrameFile} from '../server/media.mjs';
import {repairEndFrameReferences} from '../server/repairs.mjs';
import {validateSources} from '../server/domain.mjs';
test('static-slide sample never requests a floating-point EOF frame',()=>{
 for(const duration of [624.338141,758.572698,1932.120272,1622.09,2,480,12,0.02]){
  const times=frameSampleTimes(duration);assert.equal(times[0],0);assert.ok(times.every(t=>t<duration-Math.min(0.05,duration/2)));assert.ok(times.length<=40);
 }
});
test('exit zero without a decoded image cannot create a frame reference',async()=>{
 const d=await fs.mkdtemp(path.join(os.tmpdir(),'learning-frame-'));try{await assert.rejects(ensureFrameFile(path.join(d,'missing.jpg')));await fs.writeFile(path.join(d,'bad.jpg'),'not an image');await assert.rejects(ensureFrameFile(path.join(d,'bad.jpg')),/有效画面/)}finally{await fs.rm(d,{recursive:true,force:true})}
});
test('endpoint repair retains valid and unexpected missing frames, state-only and idempotent',async()=>{
 const d=await fs.mkdtemp(path.join(os.tmpdir(),'learning-repair-'));try{
  const dir=path.join(d,'lessons','video','frames');await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'valid.jpg'),'valid test file');
  const frames=[{file:'frames/valid.jpg',time:100,method:'interval'},{file:'frames/gap-100000.jpg',time:99.999999999,method:'interval'},{file:'frames/gap-40000.jpg',time:40,method:'interval'}];
  let saves=0;const store={data:{lessons:[{id:'video',kind:'video',mediaReady:true,duration:100,hash:'source',frames}]},save:async()=>{saves++}};
  const removed=await repairEndFrameReferences(store,d);assert.equal(removed.length,1);assert.deepEqual(store.data.lessons[0].frames.map(f=>f.file),['frames/valid.jpg','frames/gap-40000.jpg']);assert.equal(saves,1);assert.equal((await repairEndFrameReferences(store,d)).length,0);
 }finally{await fs.rm(d,{recursive:true,force:true})}
});
test('a model cannot publish empty or nonexistent source references as a traced chapter',()=>{
 const make=sourceIds=>({contentType:'orientation',chapters:[{start:0,end:0,sourceIds,quiz:[]}]});
 assert.throws(()=>validateSources(make(['s1']),[{id:'a1'}],0),/有效原文引用/);assert.throws(()=>validateSources(make([]),[{id:'a1'}],0),/有效原文引用/);assert.deepEqual(validateSources(make(['a1']),[{id:'a1'}],0).chapters[0].sourceIds,['a1']);
});

test('untraced article keeps its source and prior course audit, with one bounded retry',async()=>{
 const {repairUntracedArticles}=await import('../server/repairs.mjs');
 const d=await fs.mkdtemp(path.join(os.tmpdir(),'learning-source-repair-'));try{
  const prior={chapters:[{sourceIds:[]}]};const l={id:'article',kind:'article',hash:'unchanged',documentText:'real text',segments:[{id:'a1'}],course:prior,status:'ready',organizeAttempts:1};
  let saves=0;const store={data:{lessons:[l]},save:async()=>{saves++}};const results=await repairUntracedArticles(store,d);
  assert.equal(results.length,1);assert.equal(results[0].priorCourse,prior);assert.equal(l.course,undefined);assert.equal(l.status,'media-ready');assert.equal(l.documentText,'real text');assert.equal(l.organizeAttempts,1);assert.equal(saves,1);assert.equal((await repairUntracedArticles(store,d)).length,0);
 }finally{await fs.rm(d,{recursive:true,force:true})}
});
