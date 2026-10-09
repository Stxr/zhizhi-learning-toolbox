import fs from 'node:fs/promises';
import path from 'node:path';
// Migration for a known floating-point endpoint issue. No valid frame or media is removed.
export async function repairEndFrameReferences(store,root){
 const removed=[];
 for(const l of store.data.lessons){
  if(l.kind!=='video'||!l.mediaReady||l.machine==='windows')continue;
  const valid=[];
  for(const f of l.frames){
   try{await fs.access(path.join(root,'lessons',l.id,f.file));valid.push(f)}catch(e){
    if(e.code!=='ENOENT'||f.method!=='interval'||!/^frames\/gap-\d+\.jpg$/.test(f.file)||Math.abs(f.time-l.duration)>0.01){valid.push(f);continue;}
    removed.push({lessonId:l.id,sourceSha256:l.hash,duration:l.duration,frame:f,reason:'Floating-point endpoint requested no decoded frame; nonexistent reference removed, valid frames retained'});
   }
  }
  if(valid.length!==l.frames.length)l.frames=valid;
 }
 if(removed.length){await store.save();const dir=path.join(root,'audits');await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'end-frame-repair-'+Date.now()+'.json'),JSON.stringify({at:new Date().toISOString(),removed,noAsrRerun:true},null,2),{mode:0o600});}
 return removed;
}

export async function repairUntracedArticles(store,root){
 const repairs=[];
 for(const l of store.data.lessons){
  if(l.kind!=='article'||!l.course)continue;
  const ids=new Set(l.segments.map(s=>s.id));
  if(!l.course.chapters.some(c=>!c.sourceIds.some(id=>ids.has(id))))continue;
  repairs.push({lessonId:l.id,priorCourse:l.course,reason:'Existing chapter has no valid original paragraph reference; bounded reorganization only, source unchanged'});
  delete l.course;l.status='media-ready';l.progress=78;l.error=null;l.stage='章节引用校验未通过，复用原文重新整理';
 }
 if(repairs.length){const dir=path.join(root,'audits');await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'article-reference-repair-'+Date.now()+'.json'),JSON.stringify({at:new Date().toISOString(),repairs,noAsrRerun:true},null,2),{mode:0o600});await store.save();}
 return repairs;
}
