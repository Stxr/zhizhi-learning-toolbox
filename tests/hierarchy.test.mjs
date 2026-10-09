import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {conceptSchema,validateConceptSources,jsonSchema} from '../server/domain.mjs';
import {enrichCourseHierarchy,repairConceptHierarchy} from '../server/hierarchy.mjs';
import {Store} from '../server/store.mjs';
import {buildKnowledge,visibleKnowledge} from '../src/knowledge.ts';
const concept=(term,more={})=>({term,explanation:'解释',example:'保留例子',...more});
const fixture=()=>({id:'test',kind:'video',status:'ready',segments:[{id:'s1',start:0,end:2,text:'分类包括甲策略、乙策略、丙策'},{id:'s2',start:2,end:4,text:'略和丁策略。'}],course:{title:'合成课程',overview:'保留全文',chapters:[{id:'c1',title:'分类',start:0,end:4,summary:'保留摘要',sourceIds:['s1','s2'],concepts:[concept('产品分类',{explanation:'包括甲策略、乙策略、丙策略和丁策略。'})],quiz:[{id:'original-quiz'}]}]}});
test('Recursive concepts retain deep descendants, direct references and legacy node identities',()=>{
 const lesson=fixture();let nested=concept('deepest',{sourceIds:['s2'],sourceQuote:'丁策略'});for(let i=5;i>=0;i--)nested=concept('depth '+i,{sourceIds:['s1'],children:[nested]});lesson.course.chapters[0].concepts=[nested,concept('sibling')];
 assert.equal(conceptSchema.parse(nested).children[0].term,'depth 1');assert.match(JSON.stringify(jsonSchema(conceptSchema)),/\$ref/);validateConceptSources([nested],lesson.segments);
 const nodes=buildKnowledge(lesson),tip=nodes.find(n=>n.title==='deepest');assert.equal(nodes.find(n=>n.title==='depth 0').id,'c1:concept:0');assert.equal(nodes.find(n=>n.title==='sibling').id,'c1:concept:1');assert.equal(tip.matchMethod,'explicit');assert.deepEqual(tip.sourceIds,['s2']);
 assert.equal(nodes.find(n=>n.title==='depth 1').parentId,'c1:concept:0');const collapsed=visibleKnowledge(nodes,['c1:concept:0']);assert.equal(collapsed.some(n=>n.title==='deepest'),false);assert.equal(collapsed.some(n=>n.title==='sibling'),true);assert.equal(visibleKnowledge(nodes,['c1']).length,2);assert.equal(visibleKnowledge(nodes,[]).length,nodes.length);
});
test('Child claims cannot cite fabricated text, unknown IDs or unrelated nonadjacent fragments',()=>{
 const segments=[...fixture().segments,{id:'s3',start:4,end:6,text:'other'}];assert.throws(()=>validateConceptSources([concept('parent',{children:[concept('child')]})],segments),/直接/);
 for(const sourceIds of [[],['missing']])assert.throws(()=>validateConceptSources([concept('x',{sourceIds})],segments),/引用/);
 assert.throws(()=>validateConceptSources([concept('x',{sourceIds:['s1'],sourceQuote:'编造'})],segments),/原文/);
 assert.throws(()=>validateConceptSources([concept('x',{sourceIds:['s1','s3'],sourceQuote:'丙策other'})],segments),/原文/);
 assert.doesNotThrow(()=>validateConceptSources([concept('x',{sourceIds:['s1','s2'],sourceQuote:'丙策略'})],segments));
});
test('Legacy expansion requires a complete evidenced enumeration and preserves separate or uncertain groups',()=>{
 const lesson=fixture(),before=structuredClone(lesson),result=enrichCourseHierarchy(lesson);assert.deepEqual(lesson,before);assert.deepEqual(result.added[0].children.map(c=>c.term),['甲策略','乙策略','丙策略','丁策略']);assert.deepEqual(result.course.chapters[0].concepts[0].children[2].sourceIds,['s1','s2']);
 for(const explanation of ['包括甲策略、乙策略和未知项。','外部包括甲策略、乙策略；内部包括丙策略和丁策略。','转写有误：包括甲策略、乙策略和丙策略。']){const l=fixture();l.course.chapters[0].concepts[0].explanation=explanation;assert.equal(enrichCourseHierarchy(l).added.length,0)}
 assert.equal(enrichCourseHierarchy({...lesson,course:result.course}).added.length,0);
});
test('Audited migration is idempotent and leaves original explanation, progress, Fork and answers unchanged',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'learning-hierarchy-'));try{const store=await new Store(dir).init();store.data.lessons=[fixture()];store.data.branches=[{id:'fork',tipId:'msg'}];store.data.messages=[{id:'msg',content:'original'}];store.data.attempts=[{id:'answer',score:90}];const baseline=structuredClone(store.data);const repair=await repairConceptHierarchy(store,dir);assert.equal(repair.length,1);assert.deepEqual(store.data.branches,baseline.branches);assert.deepEqual(store.data.messages,baseline.messages);assert.deepEqual(store.data.attempts,baseline.attempts);
 const course=structuredClone(store.data.lessons[0].course);delete course.chapters[0].concepts[0].children;assert.deepEqual(course,baseline.lessons[0].course);const audits=await fs.readdir(path.join(dir,'audits'));assert.equal(audits.length,1);const audit=JSON.parse(await fs.readFile(path.join(dir,'audits',audits[0])));assert.deepEqual(audit.repairs[0].priorCourse,baseline.lessons[0].course);assert.deepEqual((await new Store(dir).init()).data,store.data);assert.deepEqual(await repairConceptHierarchy(store,dir),[]);assert.equal((await fs.readdir(path.join(dir,'audits'))).length,1);
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});
