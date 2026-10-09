import {randomUUID} from 'node:crypto';
export const inFlight=c=>c.state==='processing';
export function initQueue(data){
  data.processingQueue??={enabled:true,pausedReason:null,workers:{mac:{enabled:false},windows:{enabled:true}},claims:[]};
  const q=data.processingQueue;q.workers.mac??={enabled:false};q.workers.windows??={enabled:true};
  return q;
}
// Called synchronously in the single coordinator process, before the first await.
// Claims never expire into another worker: a stalled machine needs explicit resolution.
export function claimNext(data,machine){
  const q=initQueue(data);if(!q.enabled||!q.workers[machine]?.enabled||q.pausedReason)return null;
  const current=q.claims.find(c=>c.machine===machine&&inFlight(c));if(current)return {claim:current,lesson:data.lessons.find(l=>l.id===current.lessonId),duplicate:true};
  const lesson=data.lessons.filter(l=>l.order>0&&l.kind==='video'&&!l.mediaReady&&l.status==='downloaded'&&!q.claims.some(c=>c.lessonId===l.id)&&(!l.executionMachines||l.executionMachines.includes(machine))).sort((a,b)=>a.order-b.order)[0];if(!lesson)return null;
  const claim={lessonId:lesson.id,machine,leaseId:randomUUID(),state:'processing',stage:'已领取',updatedAt:new Date().toISOString()};q.claims.push(claim);lesson.status='processing';lesson.machine=machine;lesson.stage='等待 '+machine+' 处理';lesson.progress=0;return {claim,lesson,duplicate:false};
}
export function queueSnapshot(data){const q=initQueue(data),lessons=data.lessons.filter(l=>l.order&&l.kind!=='article'),articles=data.lessons.filter(l=>l.kind==='article');return {...q,stats:{articlesImported:articles.length,articlesOrganized:articles.filter(l=>l.course).length,total:lessons.length,transcribed:lessons.filter(l=>l.mediaReady).length,organized:lessons.filter(l=>l.course).length,asrRunning:q.claims.filter(c=>inFlight(c)&&!data.lessons.find(l=>l.id===c.lessonId)?.mediaReady).length,asrFailed:lessons.filter(l=>l.status==='failed'&&!l.mediaReady).length,organizationFailed:lessons.filter(l=>l.status==='failed'&&l.mediaReady).length,cancelled:lessons.filter(l=>l.status==='cancelled').length},items:data.lessons.filter(l=>l.order).sort((a,b)=>a.order-b.order).map(l=>({lessonId:l.id,title:l.title,order:l.order,kind:l.kind,collectionId:l.collectionId,collection:l.collection,status:l.status,machine:q.claims.find(c=>c.lessonId===l.id)?.machine||l.machine||null,stage:l.stage,error:l.error||null,progress:l.progress}))};}
