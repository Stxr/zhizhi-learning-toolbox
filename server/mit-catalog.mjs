import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {run} from './media.mjs';
export const mitCollectionId='mit6-s191-bv1evjr6re1n';
const sha=z.string().regex(/^[a-f0-9]{64}$/);
const episode=z.object({lessonId:z.string().optional(),bvid:z.literal('BV1evjR6RE1N'),cid:z.union([z.string().regex(/^\d+$/),z.number().int().positive()]),order:z.number().int().min(1).max(100),title:z.string().min(1).max(250),video_path:z.string(),sizeBytes:z.number().int().positive(),sha256:sha,duration_seconds:z.number().positive().max(7200),source_url:z.string().url(),subtitles:z.array(z.unknown()).max(20).default([])});
export function validateMitMediaCatalog(input){
 const catalog=z.object({expectedPartCount:z.number().int().min(1).max(100),sourceYear:z.number().int().min(1990).max(2100).nullable(),sourceVersion:z.string().min(1).max(250),episodes:z.array(episode).max(100)}).parse(input),ids=new Set(),hashes=new Set();
 for(const e of catalog.episodes){if(e.order>catalog.expectedPartCount)throw new Error('MIT分P超出核实的实际课程范围');const id=`${mitCollectionId}-p${String(e.order).padStart(3,'0')}`;if(e.lessonId&&e.lessonId!==id)throw new Error('MIT lessonId不符合固定合集顺序');e.lessonId=id;const url=new URL(e.source_url);if(url.protocol!=='https:'||url.hostname!=='www.bilibili.com'||!/^\/video\/BV1evjR6RE1N\/?$/.test(url.pathname))throw new Error('MIT来源必须是已授权BV');if(url.searchParams.has('p')&&url.searchParams.get('p')!==String(e.order))throw new Error('MIT来源分P与顺序不匹配');if(ids.has(id)||hashes.has(e.sha256))throw new Error('MIT清单包含重复分P或相同源文件');ids.add(id);hashes.add(e.sha256)}
 return catalog;
}
const hashFile=async file=>{const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex')};
export async function registerMitMediaCatalog(store,catalogFile,sourceRoot,dataRoot,{limit=100,probe=async file=>JSON.parse((await run('ffprobe',['-v','error','-show_format','-show_streams','-of','json',file],{timeout:15000})).output)}={}){
 const catalogStat=await fs.lstat(catalogFile);if(!catalogStat.isFile()||catalogStat.isSymbolicLink()||catalogStat.size>2*1024*1024)throw new Error('MIT清单类型/大小无效');
 const catalog=validateMitMediaCatalog(JSON.parse(await fs.readFile(catalogFile,'utf8')));const base=await fs.realpath(sourceRoot),prepared=[];
 for(const e of catalog.episodes.slice(0,limit)){
  if(!path.isAbsolute(e.video_path))throw new Error('MIT素材必须使用固定目录绝对路径');const full=await fs.realpath(e.video_path);if(!full.startsWith(base+path.sep)||!full.endsWith('.mp4'))throw new Error('MIT源文件越出固定素材目录');const stat=await fs.stat(full);if(!stat.isFile()||stat.size!==e.sizeBytes)throw new Error('MIT源文件大小不匹配');if(await hashFile(full)!==e.sha256)throw new Error('MIT源SHA256不匹配');
  const actual=await probe(full),video=actual.streams?.find(s=>s.codec_type==='video'),audio=actual.streams?.find(s=>s.codec_type==='audio'),duration=Number(actual.format?.duration);if(video?.height!==1080||video.codec_name!=='h264'||audio?.codec_name!=='aac')throw new Error('MIT必须是真实1080P H264+AAC，不允许降级');if(!Number.isFinite(duration)||Math.abs(duration-e.duration_seconds)>1)throw new Error('MIT容器时长与已核验清单不匹配');
  const old=store.data.lessons.find(l=>l.id===e.lessonId);if(old){if(old.hash!==e.sha256||old.collectionId!==mitCollectionId)throw new Error('MIT相同ID来源改变，拒绝覆盖');continue}if(store.data.lessons.some(l=>l.hash===e.sha256))throw new Error('MIT源已在其他素材登记，拒绝重复');
  // Do not silently skip a real subtitle: register it only with an implemented local parser.
  if(e.subtitles.length)throw new Error('MIT清单包含独立字幕，需先核验本地字幕解析合同；尚未导入或运行ASR');
  prepared.push({sourcePath:full,id:e.lessonId,title:`MIT 6.S191 ${catalog.sourceYear||'年份待核'} · P${String(e.order).padStart(3,'0')} · ${e.title}`,kind:'video',status:'downloaded',progress:0,stage:'1080P源已核验，等待Mac本地处理',createdAt:new Date().toISOString(),hash:e.sha256,sizeBytes:e.sizeBytes,duration,segments:[],frames:[],mediaUrl:`/media/${e.lessonId}/source.mp4`,collection:`MIT 6.S191 ${catalog.sourceYear||'年份待核'} · Bilibili补充视频`,collectionId:mitCollectionId,collectionFamily:'mit6-s191',sourceVersion:catalog.sourceVersion,sourceYear:catalog.sourceYear,source:e.source_url,sourceUrl:e.source_url,sourceCid:String(e.cid),order:e.order,executionMachines:['mac'],publicSubtitles:[],subtitleStatus:'未取得独立字幕，使用Qwen本地转写与强制对齐',sourceResolution:{width:video.width,height:video.height,videoCodec:video.codec_name,audioCodec:audio.codec_name}});
 }
 // All sources verified before canonical append. A conflicting old symlink cannot be reused.
 for(const l of prepared){const dir=path.join(dataRoot,'lessons',l.id);await fs.mkdir(dir,{recursive:true});const target=path.join(dir,'source.mp4');try{await fs.symlink(l.sourcePath,target)}catch(error){if(error.code!=='EEXIST'||await fs.realpath(target)!==l.sourcePath)throw error}}
 store.data.lessons.push(...prepared);if(prepared.length)await store.save();
 return {ok:true,added:prepared.length,total:catalog.episodes.length,collectionId:mitCollectionId,collectionFamily:'mit6-s191',sourceYear:catalog.sourceYear,expectedPartCount:catalog.expectedPartCount,lessonIds:prepared.map(l=>l.id)};
}
