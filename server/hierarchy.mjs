import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {validateConceptSources} from './domain.mjs';
const normalize=value=>value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
// Only expand a list explicitly present in the saved explanation. Each child
// must also match actual original text inside the chapter; guesses are skipped.
export function explicitListTerms(explanation){
 const lists=[];
 for(const match of explanation.matchAll(/(?:包括|包含|分为|分别(?:为|是)|提到|有以下)[：:\s]*([^。；;\n]+)/gu)){
  const text=match[1].split(/，(?:但|而|并|可|用|其|具|讲|需要|不)/u)[0];
  if(!/[、,，]|和|以及|及/u.test(text))continue;
  const terms=text.split(/、|，|,|以及|和|及/u).map(t=>t.trim().replace(/[（(][^）)]*[）)]/gu,'').replace(/(?:等|三种|四种|五种|六种|两种|几种|这些|两类|三类|四类).*$/u,'').trim()).filter(t=>t.length>=2&&Array.from(t).length<=24&&!/[：:。；;]|(?:可以|就是|通过|进行|需要|不等于|以便|用来)/u.test(t));
  if(terms.length>=2&&terms.length<=20)lists.push([...new Set(terms)]);
 }
 return lists;
}
function originalMatch(lesson,chapter,term){
 const candidates=lesson.segments.filter(s=>lesson.kind==='article'?chapter.sourceIds.includes(s.id):s.start<chapter.end&&s.end>chapter.start);
 const target=normalize(term);if(target.length<2)return null;
 const found=candidates.find(s=>normalize(s.text).includes(target));if(found)return {sourceIds:[found.id],sourceQuote:term};
 for(let i=0;i<candidates.length-1;i++){const a=candidates[i],b=candidates[i+1];if(lesson.segments.indexOf(b)===lesson.segments.indexOf(a)+1&&b.start-a.end<=2&&normalize(a.text+b.text).includes(target))return {sourceIds:[a.id,b.id],sourceQuote:term}}return null;
}
export function enrichCourseHierarchy(lesson){
 const course=structuredClone(lesson.course),added=[];if(!course)return {course,added};
 for(const chapter of course.chapters)for(const [index,concept] of chapter.concepts.entries()){
  if(concept.children?.length)continue;
  // Multiple lists can represent separate groups; uncertain transcription needs review.
  const lists=explicitListTerms(concept.explanation);
  if(lists.length!==1||/转写.{0,12}(?:有误|不确定)|建议.{0,12}核对/u.test(concept.explanation))continue;
  const list=lists[0];const matches=list.map(term=>originalMatch(lesson,chapter,term));
  if(matches.some(e=>!e))continue; // Never publish a partial enumeration as a complete list.
  const seen=new Set(),children=[];
  for(const [i,value] of list.entries()){let term=value;
   const evidence=matches[i];
   // Shared list suffix, e.g. short acronym alongside items ending in 策略.
   if(/^[A-Za-z]{2,8}$/.test(term)&&list.some(t=>t.endsWith('策略'))&&originalMatch(lesson,chapter,term+'策略'))term+='策略';
   const key=normalize(term);if(seen.has(key)||key===normalize(concept.term))continue;seen.add(key);
   children.push({term,explanation:`原资料在「${concept.term}」中明确列举此项。\n\n原文：${evidence.sourceIds.map(id=>lesson.segments.find(s=>s.id===id).text).join(' ')}`,example:'',...evidence,children:[]});
  }
  if(children.length>=2){concept.children=children;added.push({chapterId:chapter.id,conceptIndex:index,parent:concept.term,children:children.map(c=>({term:c.term,sourceIds:c.sourceIds}))})}
 }
 for(const c of course.chapters)validateConceptSources(c.concepts,lesson.segments);
 return {course,added};
}
export async function repairConceptHierarchy(store,root){
 const updates=[];
 for(const lesson of store.data.lessons){if(!lesson.course||lesson.status!=='ready')continue;const result=enrichCourseHierarchy(lesson);if(result.added.length)updates.push({lesson,priorCourse:lesson.course,nextCourse:result.course,added:result.added})}
 if(!updates.length)return [];
 const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
 const dir=path.join(root,'audits');await fs.mkdir(dir,{recursive:true});
 await fs.writeFile(path.join(dir,'concept-hierarchy-'+randomUUID()+'.json'),JSON.stringify({at:new Date().toISOString(),method:'explicit saved enumeration + exact original-text match',noAsrRerun:true,noModelCall:true,repairs:updates.map(u=>({lessonId:u.lesson.id,priorCourse:u.priorCourse,priorDigest:digest(u.priorCourse),nextDigest:digest(u.nextCourse),added:u.added}))},null,2),{mode:0o600});
 for(const u of updates)u.lesson.course=u.nextCourse;
 try{await store.save()}catch(error){for(const u of updates)u.lesson.course=u.priorCourse;throw error}
 return updates.map(u=>({lessonId:u.lesson.id,added:u.added}));
}
