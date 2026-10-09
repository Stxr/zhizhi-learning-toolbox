import {test} from 'node:test';
import assert from 'node:assert/strict';
import {groupLessons,lessonFolder,matchesFolder,matchesLesson,sourceVersion,parseLibraryRoute,libraryHash} from '../src/library.ts';
const lesson=(id,more={})=>({id,title:id,kind:'video',status:'ready',segments:[],frames:[],...more});

test('legacy IDs, named collections, samples and standalone imports remain unique and unchanged',()=>{
 const original=[lesson('BV1fm8Mz7EX1-p002',{order:2}),lesson('BV1fm8Mz7EX1-p001',{order:1}),lesson('article',{kind:'article',collectionId:'hf-agents-course'}),lesson('sample',{kind:'sample'}),lesson('uuid',{status:'failed'}),lesson('old',{collection:'Older course'})];
 const before=structuredClone(original),folders=groupLessons(original),ids=folders.flatMap(f=>f.lessons.map(l=>l.id));
 assert.deepEqual(original,before);assert.equal(new Set(ids).size,original.length);assert.deepEqual(ids.toSorted(),original.map(l=>l.id).toSorted());
 assert.deepEqual(folders[0].lessons.map(l=>l.id),['BV1fm8Mz7EX1-p001','BV1fm8Mz7EX1-p002']);
 assert.equal(lessonFolder(original.at(-1)).title,'Older course');
});
test('MIT source versions share one folder without conflating years or other MIT courses',()=>{
 const items=[lesson('notes',{kind:'article',collectionId:'mit6-s191-2026',sourceYear:2026}),lesson('new-video',{collectionId:'mit6-s191-bv19u8bzrewm',collectionFamily:'mit6-s191',sourceYear:2025}),lesson('other',{collectionId:'mit6-824'})];
 const folders=groupLessons(items);assert.equal(folders.length,2);assert.deepEqual(folders[0].lessons.map(l=>l.id),['notes','new-video']);assert.match(sourceVersion(items[0]),/2026/);assert.match(sourceVersion(items[1]),/2025/);assert.equal(sourceVersion(lesson('unknown')),'视频 · 年份未标注');
});
test('folder search discovers a contained lesson; scoped search respects all words and empty reset',()=>{
 const folders=groupLessons([lesson('a',{title:'Micrograd backpropagation',collectionId:'karpathy-zero-to-hero-code'}),lesson('b',{title:'Welcome',collectionId:'hf-agents-course'})]);
 assert.equal(folders.filter(f=>matchesFolder(f,'micrograd')).length,1);assert.equal(folders.filter(f=>matchesFolder(f,'nonexistent')).length,0);assert.equal(matchesLesson(folders[0].lessons[0],'micrograd back'),true);assert.equal(matchesLesson(folders[0].lessons[0],'micrograd other'),false);assert.equal(matchesLesson(folders[1].lessons[0],''),true);
});
test('refreshable routes round trip Unicode, spaces and reserved characters; empty or legacy hash opens folders',()=>{
 for(const route of [{kind:'root',id:'',query:''},{kind:'folder',id:'legacy:课程 / & #',query:'深入 学习'},{kind:'lesson',id:'some-id',query:''}])assert.deepEqual(parseLibraryRoute(libraryHash(route)),route);
 assert.deepEqual(parseLibraryRoute('#old-ui'),{kind:'root',id:'',query:''});
});
