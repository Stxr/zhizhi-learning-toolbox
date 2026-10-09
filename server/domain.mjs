import {z} from 'zod';

export const rubricSchema=z.object({id:z.string(),point:z.string(),weight:z.number().int().min(1).max(100)});
export const quizSchema=z.object({id:z.string(),type:z.enum(['choice','concept','transfer']),prompt:z.string(),options:z.array(z.string()),answer:z.string(),rubric:z.array(rubricSchema).min(1).max(5),sourceIds:z.array(z.string())});
export const conceptSchema=z.object({term:z.string().min(1).max(100),explanation:z.string().max(6000),example:z.string().max(4000),sourceIds:z.array(z.string()).max(20).optional(),sourceQuote:z.string().max(100).optional(),children:z.array(z.lazy(()=>conceptSchema)).max(80).optional()});
export const courseSchema=z.object({title:z.string(),overview:z.string(),contentType:z.enum(['orientation','concept','practice','mixed']).default('mixed'),chapters:z.array(z.object({id:z.string(),title:z.string(),start:z.number().min(0),end:z.number().min(0),summary:z.string(),sourceIds:z.array(z.string()),concepts:z.array(conceptSchema),flow:z.array(z.string()).max(8),comparison:z.array(z.object({label:z.string(),a:z.string(),b:z.string()})).max(6),assessmentRecommended:z.boolean().default(true),quiz:z.array(quizSchema).max(5)})).min(1).max(8)});
export const answerSchema=z.object({markdown:z.string(),sourceIds:z.array(z.string()),flow:z.array(z.string()).max(8),comparison:z.array(z.object({label:z.string(),a:z.string(),b:z.string()})).max(6),example:z.string()});
export const evaluationSchema=z.object({items:z.array(z.object({questionId:z.string(),criterionId:z.string(),met:z.boolean(),quote:z.string(),reason:z.string()}))});
export const jsonSchema=s=>z.toJSONSchema(s);
export function parseJson(text,schema){let s=text.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');return schema.parse(JSON.parse(s));}

export function ancestry(messages,id){
  const map=new Map(messages.map(m=>[m.id,m]));const chain=[],visited=new Set();
  while(id){if(visited.has(id))throw new Error('分支存在循环');visited.add(id);const m=map.get(id);if(!m)throw new Error('找不到消息祖先');chain.unshift(m);id=m.parentId}
  return chain;
}
export function scoreEvidence(quiz,answers,evaluations){
  const items=quiz.flatMap(q=>q.rubric.map(r=>{
    const answer=String(answers[q.id]||'').trim();const e=evaluations.find(x=>x.questionId===q.id&&x.criterionId===r.id);
    const objective=q.type==='choice';const quote=String(e?.quote||'').trim();
    const verified=objective?answer===q.answer:!!e?.met&&quote.length>=2&&answer.includes(quote);
    return {questionId:q.id,criterionId:r.id,point:r.point,weight:r.weight,earned:verified?r.weight:0,quote:objective?answer:quote,reason:objective?(verified?'选项与标准答案一致':'选项未匹配标准答案'):(e?.reason||'未提供可核验的答题证据'),verified};
  }));
  const total=items.reduce((s,i)=>s+i.weight,0),earned=items.reduce((s,i)=>s+i.earned,0);const score=total?Math.round(100*earned/total):0;
  return {score,passed:score>=90,total,earned,items,threshold:90,method:'按预先固定的评分点累计，并按总权重归一到100分；开放题要求模型逐项判定并引用答案原文，服务端验证引用；选择题按标准答案核对。该成绩仅反映本次题目证据，不是掌握概率。'};
}
export function alignedFrames(frames,segments){return frames.map(f=>({...f,sourceIds:segments.filter(s=>s.start<=f.time+2&&s.end>=f.time-2).map(s=>s.id)}))}
export function selectEvidence(segments,question,chapter,history=[]){
  const q=(question+' '+history.slice(-2).map(x=>x.content).join(' ')).toLowerCase();
  const words=[...new Set(q.match(/[a-z0-9]{2,}|[\u4e00-\u9fff]{2}/g)||[])];
  const ranked=segments.map(s=>({s,score:words.reduce((n,w)=>n+(s.text.toLowerCase().includes(w)?2:0),0)+(chapter&&s.start>=chapter.start&&s.start<=chapter.end?1:0)})).sort((a,b)=>b.score-a.score||a.s.start-b.s.start);
  return ranked.slice(0,16).map(x=>x.s).sort((a,b)=>a.start-b.start);
}
export function validateSources(course,segments,duration){
  const ids=new Set(segments.map(s=>s.id));
  for(const c of course.chapters){validateConceptSources(c.concepts||[],segments);if(c.end<c.start||c.end>duration+1)throw new Error('模型章节时间超出素材范围');c.sourceIds=c.sourceIds.filter(id=>ids.has(id));if(!c.sourceIds.length)throw new Error('模型章节没有有效原文引用，请重新整理');for(const q of c.quiz){q.sourceIds=q.sourceIds.filter(id=>ids.has(id));if(!q.sourceIds.length)throw new Error('模型题目没有有效原文引用，请重新整理');}if(course.contentType==='orientation'||c.assessmentRecommended===false){c.quiz=[];c.assessmentRecommended=false;continue}if(!c.quiz.length){c.assessmentRecommended=false;continue}if(!c.quiz.some(q=>q.type==='concept')||!c.quiz.some(q=>q.type==='transfer')||!c.quiz.some(q=>q.type==='choice'))throw new Error('小测必须包含概念解释、迁移和选择题')}
  return course;
}

export function validateConceptSources(concepts,segments){
 const originals=new Map(segments.map(s=>[s.id,s]));let count=0;
 const visit=(nodes,child=false)=>{for(const n of nodes){if(++count>500)throw new Error('导图节点超过安全上限，需按章节细分');
  if(n.sourceIds!==undefined){if(!n.sourceIds.length||n.sourceIds.some(id=>!originals.has(id)))throw new Error('导图节点没有有效原文引用');
   if(n.sourceQuote){const norm=x=>x.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');const target=norm(n.sourceQuote),positions=n.sourceIds.map(id=>segments.findIndex(s=>s.id===id));const consecutive=positions.every((p,i)=>!i||p===positions[i-1]+1);if(!target||(!n.sourceIds.some(id=>norm(originals.get(id).text).includes(target))&&!(consecutive&&norm(n.sourceIds.map(id=>originals.get(id).text).join('')).includes(target))))throw new Error('导图引用词未出现在所引原文中');}
  }else if(child)throw new Error('导图子节点必须保留直接原文引用');
  if(n.children?.length)visit(n.children,true);
 }};visit(concepts);return concepts;
}
