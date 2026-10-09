import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {ancestry,scoreEvidence,alignedFrames,selectEvidence} from '../server/domain.mjs';
import {Store} from '../server/store.mjs';
import {run} from '../server/media.mjs';

test('Fork inherits ancestors and excludes sibling future messages',()=>{
  const messages=[{id:'root',parentId:null},{id:'a',parentId:'root'},{id:'a2',parentId:'a'},{id:'b',parentId:'root'},{id:'b2',parentId:'b'}];
  assert.deepEqual(ancestry(messages,'a2').map(m=>m.id),['root','a','a2']);
  assert.deepEqual(ancestry(messages,'b2').map(m=>m.id),['root','b','b2']);
  assert.throws(()=>ancestry([{id:'a',parentId:'b'},{id:'b',parentId:'a'}],'a'),/循环/);
  assert.throws(()=>ancestry(messages,'missing'),/祖先/);
});
const quiz=[{id:'q1',type:'choice',answer:'B',rubric:[{id:'r1',point:'objective',weight:40}]},{id:'q2',type:'concept',rubric:[{id:'r2',point:'explain',weight:50},{id:'r3',point:'transfer',weight:10}]}];
test('Server computes fixed weights and 90 threshold from evidence',()=>{
  const a={q1:'B',q2:'我从记忆解释，再核对遗漏'};
  const e=[{questionId:'q2',criterionId:'r2',met:true,quote:'从记忆解释',reason:'correct'},{questionId:'q2',criterionId:'r3',met:false,quote:'',reason:'missing'}];
  const r=scoreEvidence(quiz,a,e);assert.equal(r.score,90);assert.equal(r.passed,true);
});
test('Fake model quotes, blank answers and subjective score cannot earn credit',()=>{
  const r=scoreEvidence(quiz,{q1:'A',q2:'我觉得已经学会了'},[{questionId:'q2',criterionId:'r2',met:true,quote:'从记忆解释',reason:'model said so',score:100}]);
  assert.equal(r.score,0);assert.equal(r.passed,false);
  assert.equal(scoreEvidence(quiz,{},[]).score,0);
});
test('Frames align to actual timestamp overlaps; retrieval stays bounded',()=>{
  const seg=Array.from({length:100},(_,i)=>({id:'s'+i,start:i*10,end:i*10+5,text:i===50?'context isolation fork':'general'}));
  assert.deepEqual(alignedFrames([{time:501}],seg)[0].sourceIds,['s50']);
  const selected=selectEvidence(seg,'context isolation',null);assert.equal(selected.length,16);assert.ok(selected.some(s=>s.id==='s50'));
});
test('Atomic snapshots survive restart with fork and attempt records',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'learning-store-'));try{const a=await new Store(dir).init();await a.seed();a.data.branches.push({id:'fork',parentBranchId:'sample-main',tipId:'sample-root'});a.data.attempts.push({id:'attempt',result:{score:90}});await Promise.all([a.save(),a.save()]);const b=await new Store(dir).init();assert.equal(b.data.branches.at(-1).id,'fork');assert.equal(b.data.attempts[0].result.score,90)}finally{await fs.rm(dir,{recursive:true,force:true})}
});
test('Malformed persistence is preserved and does not get silently reset',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'learning-store-'));try{await fs.writeFile(path.join(dir,'state.json'),'{broken');await assert.rejects(new Store(dir).init(),/损坏/);assert.equal(await fs.readFile(path.join(dir,'state.json'),'utf8'),'{broken')}finally{await fs.rm(dir,{recursive:true,force:true})}
});
test('Local process cancellation kills the active media worker',async()=>{
  const controller=new AbortController();const p=run(process.execPath,['-e','setInterval(()=>{},1000)'],{signal:controller.signal,timeout:5000});setTimeout(()=>controller.abort(),50);await assert.rejects(p,/已取消/);
});

test("A signalled worker fails instead of reporting a usable dependency", async()=>{await assert.rejects(run(process.execPath,["-e","process.kill(process.pid,'SIGTERM')"]),/SIGTERM/)});

test('a rubric whose weights total 300 still uses a 90 out of 100 threshold',()=>{
  const q=[{id:'first',type:'choice',answer:'A',rubric:[{id:'r',weight:100}]},{id:'second',type:'concept',rubric:[{id:'r',weight:100},{id:'missing',weight:30},{id:'met',weight:70}]}];
  const r=scoreEvidence(q,{first:'A',second:'解释原理并给出迁移例子'},[{questionId:'second',criterionId:'r',met:true,quote:'解释原理',reason:'evidence'},{questionId:'second',criterionId:'met',met:true,quote:'迁移例子',reason:'evidence'}]);
  assert.equal(r.total,300);assert.equal(r.earned,270);assert.equal(r.score,90);assert.equal(r.passed,true);
});
