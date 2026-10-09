import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {alignedFrames} from './domain.mjs';
const segment=z.object({id:z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),start:z.number().finite().min(0),end:z.number().finite().min(0),text:z.string().min(1).max(20000)});
export function validateIncoming(transcript,media,lesson){
  const t=z.object({segments:z.array(segment).min(1).max(20000),metadata:z.record(z.string(),z.unknown())}).parse(transcript);
  const m=z.object({videoSha256:z.string().regex(/^[a-f0-9]{64}$/),frames:z.array(z.object({id:z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),time:z.number().finite().min(0),file:z.string().regex(/^frames\/[a-zA-Z0-9_-]+\.(jpg|png)$/),method:z.enum(['scene','interval','manual'])})).max(120),timings:z.record(z.string(),z.unknown()).optional()}).parse(media);
  if(m.videoSha256!==lesson.hash)throw new Error('回传源视频 SHA256 不匹配');
  if(t.metadata.source==='public-subtitle'){if(!lesson.publicSubtitles?.some(s=>s.sha256===t.metadata.subtitleSha256&&s.sourceUrl===t.metadata.sourceUrl&&s.timeStamped&&s.type===t.metadata.subtitleType))throw new Error('公开字幕必须匹配已登记的实际来源与SHA，不能冒充ASR');if(t.metadata.alignment!=='公开独立字幕时间码'||t.metadata.model!=='public-subtitle'||t.metadata.asrExecuted!==false||t.metadata.forcedAlignerExecuted!==false)throw new Error('字幕不应冒称ASR或强制对齐');}else if(t.metadata.model!=='Qwen/Qwen3-ASR-1.7B-hf'||t.metadata.aligner!=='Qwen/Qwen3-ForcedAligner-0.6B-hf'||!String(t.metadata.alignment).includes('强制对齐'))throw new Error('必须保留 Qwen1.7B 与 0.6B 的真实对齐结果，不能静默降级');
  if(Math.abs(Number(t.metadata.audioSeconds)-lesson.duration)>2)throw new Error('回传音频长度不匹配');
  const ids=new Set();let last=-1;for(const s of t.segments){if(ids.has(s.id))throw new Error('回传句段 id 重复');ids.add(s.id);if(s.end<s.start||s.end>lesson.duration+1||s.start<last)throw new Error('回传句段时间越界或非顺序');last=s.start;}
  const files=new Set(),fids=new Set();for(const f of m.frames){if(f.time>lesson.duration+1||files.has(f.file)||fids.has(f.id))throw new Error('回传画面时间或标识无效');files.add(f.file);fids.add(f.id)}
  return {transcript:t,media:m};
}
async function readSafe(root,file,max){const rootReal=await fs.realpath(root),resolved=await fs.realpath(path.join(root,file));if(!resolved.startsWith(rootReal+path.sep))throw new Error('回传文件不能越出固定目录');const stat=await fs.stat(resolved);if(!stat.isFile()||stat.size>max)throw new Error('回传文件大小或类型不合法');return fs.readFile(resolved);}
export async function receiveResult(lesson,incoming,destination){
  const incomingStat=await fs.lstat(incoming);if(incomingStat.isSymbolicLink()||!incomingStat.isDirectory())throw new Error('回传根目录不能是符号链接');
  const rawT=await readSafe(incoming,'transcript.json',16*1024*1024),rawM=await readSafe(incoming,'media.json',128*1024);
  const {transcript,media}=validateIncoming(JSON.parse(rawT),JSON.parse(rawM),lesson);
  let originalSubtitle=null,subtitleFile; if(transcript.metadata.source==='public-subtitle'){const source=lesson.publicSubtitles.find(s=>s.sha256===transcript.metadata.subtitleSha256&&s.sourceUrl===transcript.metadata.sourceUrl);subtitleFile='public-subtitle.'+source.format;originalSubtitle=await readSafe(incoming,subtitleFile,16*1024*1024);if(createHash('sha256').update(originalSubtitle).digest('hex')!==source.sha256)throw new Error('原始字幕字节SHA256不匹配');}
  const images=[];for(const f of media.frames){const bytes=await readSafe(incoming,f.file,4*1024*1024);const jpg=bytes[0]===255&&bytes[1]===216,png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));if(!(f.file.endsWith('.jpg')?jpg:png))throw new Error('回传图片格式不匹配');images.push({file:f.file,bytes});}
  const digest=createHash('sha256').update(rawT).update(rawM);if(originalSubtitle)digest.update(originalSubtitle);for(const i of images)digest.update(i.bytes);const resultHash=digest.digest('hex');
  if(lesson.receivedHash===resultHash)return {duplicate:true};if(lesson.mediaReady||lesson.course)throw new Error('已有不同成果，拒绝覆盖');
  await fs.mkdir(path.join(destination,'frames'),{recursive:true});for(const i of images)await fs.writeFile(path.join(destination,i.file),i.bytes,{mode:0o600});await fs.writeFile(path.join(destination,'qwen-transcript.json'),rawT,{mode:0o600});if(originalSubtitle)await fs.writeFile(path.join(destination,subtitleFile),originalSubtitle,{mode:0o600});
  lesson.segments=transcript.segments;lesson.asr=transcript.metadata;lesson.frames=alignedFrames(media.frames,transcript.segments);lesson.timings=media.timings||{};lesson.mediaReady=true;lesson.receivedHash=resultHash;lesson.receivedAt=new Date().toISOString();lesson.machine='windows';lesson.status='media-ready';lesson.stage=transcript.metadata.source==='public-subtitle'?'公开独立字幕时间码及画面已导入，等待本机AI整理':'Windows 真实转写与对齐已导入，等待本机 AI 整理';lesson.progress=78;lesson.error=null;return {duplicate:false};
}
