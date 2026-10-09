export type Segment={id:string;start:number;end:number;text:string;locator?:string;timeKind?:'article'|'video';sourceUrl?:string};
export type Frame={id:string;time:number;file:string;method:string;sourceIds:string[]};
export type Comparison={label:string;a:string;b:string};
export type Quiz={id:string;type:'choice'|'concept'|'transfer';prompt:string;options:string[];answer:string;rubric:{id:string;point:string;weight:number}[];sourceIds:string[]};
export type Concept={term:string;explanation:string;example:string;sourceIds?:string[];sourceQuote?:string;children?:Concept[]};
export type Chapter={id:string;title:string;start:number;end:number;summary:string;sourceIds:string[];concepts:Concept[];flow:string[];comparison:Comparison[];quiz:Quiz[]};
export type Lesson={id:string;title:string;kind:string;status:string;stage:string;progress:number;createdAt:string;duration:number;collectionId?:string;collection?:string;collectionFamily?:string;order?:number;sourceVersion?:string;mediaUrl?:string;segments:Segment[];frames:Frame[];error?:string;mediaReady?:boolean;organizedBy?:string;assessmentPolicy?:string;course?:{title:string;overview:string;contentType?:'orientation'|'concept'|'practice'|'mixed';chapters:Chapter[]};source?:string|{name?:string;title?:string;year?:string|number;url?:string};sourceUrl?:string;sourceYear?:string|number|null;subtitleStatus?:string;asr?:{model:string;device:string;alignment:string;seconds:number}};
export type Message={id:string;lessonId:string;parentId:string|null;role:string;content:string;sourceIds:string[];status?:string;error?:string;model?:string;origin?:string;flow?:string[];comparison?:Comparison[];example?:string;frameIds?:string[]};
export type Branch={id:string;lessonId:string;name:string;tipId:string;forkId:string|null;parentBranchId:string|null};
export type Attempt={id:string;lessonId:string;chapterId:string;status:string;createdAt:string;answers:Record<string,string>;error?:string;result?:{score:number;passed:boolean;method:string;items:{questionId:string;criterionId:string;point:string;earned:number;weight:number;quote:string;reason:string;verified:boolean}[]}};
export type Settings={organizeModel:string;visionModel:string;chatModel:string;gradeModel:string;autoOrganize:boolean;language:string;asrEngine?:string};
export type State={lessons:Lesson[];messages:Message[];branches:Branch[];attempts:Attempt[];settings:Settings;calls:{id:string;stage:string;status:string;model:string;createdAt:string;images:number}[];activeJobs:string[]};
export type ModelStatus={connected:boolean;authType:string;plan:string;models:{id:string;model:string;name:string;modalities:string[]}[];windows:{usedPercent:number;windowDurationMins:number;resetsAt:number}[]};

export type QueueWorker={enabled:boolean;online?:boolean;connected?:boolean;lastSeenAt?:string;stage?:string;error?:string;name?:string;[key:string]:unknown};
export type QueueClaim={lessonId:string;machine:string;state:string;updatedAt:string;stage?:string};
export type QueueItem={lessonId:string;title:string;order:number;status:string;machine?:string|null;stage?:string;error?:string};
export type QueueStats={total:number;transcribed:number;organized:number;asrRunning:number;asrFailed:number;organizationFailed:number;cancelled:number;articlesImported?:number;articlesOrganized?:number};
export type QueueStatus={enabled:boolean;stats?:QueueStats;organizationPausedReason?:string|null;diskFreeBytes?:number;minimumFreeBytes?:number;pausedReason?:string|null;workers:{mac:QueueWorker;windows:QueueWorker};claims:QueueClaim[];items:QueueItem[]};

export type MediaStatus={available:boolean;remote:boolean;sourceUrl?:string;duration?:number;reason?:string|null};
