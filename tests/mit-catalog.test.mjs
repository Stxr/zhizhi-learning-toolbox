import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {validateMitMediaCatalog,registerMitMediaCatalog,mitCollectionId} from '../server/mit-catalog.mjs';
const entry=(more={})=>({bvid:'BV1evjR6RE1N',cid:'31381589522',order:1,title:'Introduction',video_path:'/fixed/source.mp4',sizeBytes:1,sha256:'a'.repeat(64),duration_seconds:20,source_url:'https://www.bilibili.com/video/BV1evjR6RE1N/?p=1',...more});
test('MIT limited manifest rejects other courses, duplicate parts and source mismatch',()=>{
 assert.equal(validateMitMediaCatalog({expectedPartCount:3,sourceYear:2024,sourceVersion:'verified test version',episodes:[entry()]}).episodes[0].lessonId,mitCollectionId+'-p001');
 assert.throws(()=>validateMitMediaCatalog({expectedPartCount:3,sourceYear:2024,sourceVersion:'verified test version',episodes:[entry({bvid:'BVother'})]}));
 assert.throws(()=>validateMitMediaCatalog({expectedPartCount:3,sourceYear:2024,sourceVersion:'verified test version',episodes:[entry(),entry()]}),/重复/);
 assert.throws(()=>validateMitMediaCatalog({expectedPartCount:3,sourceYear:2024,sourceVersion:'verified test version',episodes:[entry({source_url:'https://www.bilibili.com/video/BV1evjR6RE1N/?p=2'})]}),/顺序/);
 assert.throws(()=>validateMitMediaCatalog({expectedPartCount:3,sourceYear:2024,sourceVersion:'verified test version',episodes:[entry({order:11})]}));
});
test('MIT registration verifies hash/resolution before append, preserves 2026 materials and is idempotent',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mit-catalog-'));try{
 const sourceRoot=path.join(dir,'media'),dataRoot=path.join(dir,'data');await fs.mkdir(sourceRoot);const file=path.join(sourceRoot,'video.mp4'),bytes=Buffer.from('controlled probe fixture');await fs.writeFile(file,bytes);const hash=createHash('sha256').update(bytes).digest('hex'),catalogFile=path.join(dir,'catalog.json');await fs.writeFile(catalogFile,JSON.stringify({expectedPartCount:3,sourceYear:2024,sourceVersion:'verified test version',episodes:[entry({video_path:file,sizeBytes:bytes.length,sha256:hash})]}));
 const old={id:'mit6-s191-2026-slides-007',collectionId:'mit6-s191-2026',course:{chapters:['retained']}};const store={data:{lessons:[old]},save:async()=>{}};
 const probe=async()=>({streams:[{codec_type:'video',height:1080,width:1920,codec_name:'h264'},{codec_type:'audio',codec_name:'aac'}],format:{duration:20}});
 await assert.rejects(registerMitMediaCatalog(store,catalogFile,sourceRoot,dataRoot,{probe:async()=>({streams:[{codec_type:'video',height:720,codec_name:'h264'},{codec_type:'audio',codec_name:'aac'}],format:{duration:20}})}),/不允许降级/);assert.equal(store.data.lessons.length,1);
 const registered=await registerMitMediaCatalog(store,catalogFile,sourceRoot,dataRoot,{probe});assert.equal(registered.added,1);assert.equal(store.data.lessons[0],old);assert.equal(store.data.lessons[1].sourceYear,2024);assert.deepEqual(store.data.lessons[1].executionMachines,['mac']);assert.equal(await fs.realpath(path.join(dataRoot,'lessons',registered.lessonIds[0],'source.mp4')),await fs.realpath(file));
 assert.equal((await registerMitMediaCatalog(store,catalogFile,sourceRoot,dataRoot,{probe})).added,0);
 await fs.writeFile(file,Buffer.alloc(bytes.length,0));await assert.rejects(registerMitMediaCatalog(store,catalogFile,sourceRoot,dataRoot,{probe}),/SHA256/);assert.equal(store.data.lessons.length,2);
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});
