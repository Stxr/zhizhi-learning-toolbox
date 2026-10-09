import type {Lesson,Chapter,Concept} from './types.ts';
export type KnowledgeItem={id:string;parentId:string|null;kind:'course'|'chapter'|'concept';title:string;description:string;chapter?:Chapter;sourceIds:string[];matchMethod?:string;hasChildren:boolean};
function chapterEvidence(lesson:Lesson,chapter:Chapter){const explicit=chapter.sourceIds.filter(id=>lesson.segments.some(segment=>segment.id===id));return explicit.length?explicit:lesson.kind==='article'?[]:lesson.segments.filter(segment=>segment.end>=chapter.start&&segment.start<=chapter.end).map(segment=>segment.id)}
function normalizeConceptText(value:string){return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'')}
function conceptEvidence(lesson:Lesson,chapter:Chapter,term:string,chapterIds:string[]){
  const candidates=lesson.segments.filter(segment=>chapterIds.includes(segment.id)||(lesson.kind!=='article'&&segment.end>chapter.start&&segment.start<chapter.end));
  const normalized=normalizeConceptText(term),withoutDe=normalized.replace(/的/g,'');
  const tokens=new Set<string>();
  for(const part of withoutDe.match(/[a-z0-9]+|[\p{Script=Han}]+/gu)||[]){if(/^[a-z0-9]+$/.test(part)){if(part.length>=2)tokens.add(part)}else for(const size of [2,3])for(let index=0;index+size<=part.length;index++)tokens.add(part.slice(index,index+size))}
  const texts=candidates.map(segment=>({segment,text:normalizeConceptText(segment.text),withoutDe:normalizeConceptText(segment.text).replace(/的/g,'')}));
  const frequencies=new Map([...tokens].map(token=>[token,texts.filter(value=>value.withoutDe.includes(token)).length]));
  const qualifiers=['狭义','广义'].filter(value=>withoutDe.includes(value));
  const ranked=texts.map(value=>{const exact=normalized.length>0&&value.text.includes(normalized),deMatch=withoutDe.length>0&&value.withoutDe.includes(withoutDe);const matched=[...tokens].filter(token=>value.withoutDe.includes(token));const keywordScore=matched.reduce((sum,token)=>sum+(Math.log((texts.length+1)/((frequencies.get(token)||0)+1))+1)*token.length,0);const qualifierScore=qualifiers.filter(token=>value.withoutDe.includes(token)).length*100;return {...value,level:exact?3:deMatch?2:matched.length?1:0,score:keywordScore+qualifierScore}}).filter(value=>value.level>0).sort((a,b)=>b.level-a.level||b.score-a.score||Number(b.segment.start>=chapter.start&&b.segment.start<chapter.end)-Number(a.segment.start>=chapter.start&&a.segment.start<chapter.end)||a.segment.start-b.segment.start||a.segment.id.localeCompare(b.segment.id));
  const best=ranked[0];
  return {sourceIds:best?[best.segment.id,...chapterIds.filter(id=>id!==best.segment.id)]:chapterIds,matchMethod:best?(best.level>=2?'term':'keyword'):'chapter-fallback'};
}

export function buildKnowledge(lesson:Lesson){
 const items:KnowledgeItem[]=[{id:'course',parentId:null,kind:'course',title:lesson.course?.title||lesson.title,description:lesson.course?.overview||'',sourceIds:[],hasChildren:!!lesson.course?.chapters.length}];
 for(const chapter of lesson.course?.chapters||[]){
  const sourceIds=chapterEvidence(lesson,chapter);items.push({id:chapter.id,parentId:'course',kind:'chapter',title:chapter.title,description:chapter.summary,chapter,sourceIds,hasChildren:!!chapter.concepts.length});
  const add=(concept:Concept,index:number,parentId:string,base:string)=>{
   const id=`${base}:${index}`,explicit=concept.sourceIds?.filter(id=>lesson.segments.some(s=>s.id===id));
   const evidence=explicit?.length?{sourceIds:explicit,matchMethod:'explicit'}:conceptEvidence(lesson,chapter,concept.term,sourceIds);
   items.push({id,parentId,kind:'concept',title:concept.term,description:concept.explanation+(concept.example?'\n\n例子：'+concept.example:''),chapter,...evidence,hasChildren:!!concept.children?.length});
   concept.children?.forEach((child,i)=>add(child,i,id,id+':child'));
  };chapter.concepts.forEach((concept,i)=>add(concept,i,chapter.id,chapter.id+':concept'));
 }return items;
}
export function visibleKnowledge(items:KnowledgeItem[],collapsed:string[]){
 const byId=new Map(items.map(i=>[i.id,i])),hidden=new Set(collapsed);
 return items.filter(item=>{let parent=item.parentId;const seen=new Set<string>();while(parent){if(hidden.has(parent))return false;if(seen.has(parent))throw new Error('导图父子关系循环');seen.add(parent);parent=byId.get(parent)?.parentId||null}return true});
}
