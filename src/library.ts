import type {Lesson} from './types.ts';

export type LearningFolder={id:string;title:string;description:string;lessons:Lesson[]};
export type LibraryRoute={kind:'root'|'folder'|'lesson';id:string;query:string};
const folderNames:Record<string,string>={
 'karpathy-zero-to-hero-code':'Karpathy · 从零构建神经网络',
 'hf-agents-course':'Hugging Face · AI Agents 课程',
 'anthropic-effective-agents':'Anthropic · 构建有效的 Agent',
 'stanford-cs336-2025':'Stanford CS336 · 大语言模型基础（2025）'
};
export function lessonFolder(lesson:Lesson):{id:string;title:string;description:string}{
 if(lesson.collectionFamily==='mit6-s191'||/^mit6-s191(?:-|$)/.test(lesson.collectionId||''))return {id:'collection:mit6-s191',title:'MIT 6.S191 · 深度学习',description:'讲义与视频保留各自来源版本，不默认逐讲对应。'};
 if(lesson.collectionId)return {id:`collection:${lesson.collectionId}`,title:folderNames[lesson.collectionId]||lesson.collection||lesson.collectionId,description:lesson.collection||'课程资料'};
 if(/^BV1fm8Mz7EX1-p\d+$/.test(lesson.id))return {id:'collection:BV1fm8Mz7EX1',title:'Python 量化交易',description:'已登记的分 P，按原合集顺序排列。'};
 if(lesson.collection)return {id:`legacy:${lesson.collection}`,title:lesson.collection,description:'按已有合集信息归组。'};
 if(lesson.kind==='sample')return {id:'samples',title:'体验样例',description:'自建内容，用于体验学习与分支问答。'};
 return {id:'imports',title:'本机导入',description:'独立导入的素材与处理结果。'};
}
export function groupLessons(lessons:Lesson[]):LearningFolder[]{
 const folders=new Map<string,LearningFolder>();
 for(const lesson of lessons){const meta=lessonFolder(lesson);let folder=folders.get(meta.id);if(!folder){folder={...meta,lessons:[]};folders.set(meta.id,folder)}folder.lessons.push(lesson)}
 for(const folder of folders.values())folder.lessons.sort((a,b)=>(a.order??Number.MAX_SAFE_INTEGER)-(b.order??Number.MAX_SAFE_INTEGER));
 return [...folders.values()];
}
export function sourceVersion(lesson:Lesson){
 if(lesson.kind==='sample')return '自建样例';
 if(lesson.sourceVersion)return lesson.sourceVersion;
 const year=lesson.sourceYear??(typeof lesson.source==='object'?lesson.source.year:undefined);
 return year?`${year} · ${lesson.kind==='article'?'文稿 / 讲义':'视频来源'}`:lesson.kind==='article'?'官方文稿':'视频 · 年份未标注';
}
export function matchesLesson(lesson:Lesson,query:string){const words=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);const text=[lesson.title,lesson.collection,sourceVersion(lesson),lesson.kind==='article'?'讲义 正文 文稿':'视频'].join(' ').toLocaleLowerCase();return words.every(word=>text.includes(word))}
export function matchesFolder(folder:LearningFolder,query:string){return !query.trim()||folder.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())||folder.lessons.some(lesson=>matchesLesson(lesson,query))}
export function parseLibraryRoute(hash:string):LibraryRoute{const params=new URLSearchParams(hash.replace(/^#/,''));const lesson=params.get('lesson'),folder=params.get('folder');return {kind:lesson?'lesson':folder?'folder':'root',id:lesson||folder||'',query:params.get('q')||''}}
export function libraryHash(route:LibraryRoute){const params=new URLSearchParams();if(route.kind!=='root')params.set(route.kind,route.id);if(route.query)params.set('q',route.query);return params.size?`#${params}`:''}
