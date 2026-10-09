import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {alignedFrames} from './domain.mjs';
export const whisperBin=path.resolve(process.env.WHISPER_BIN||'.local/whisper-build/bin/whisper-cli');
export const whisperModel=path.resolve(process.env.WHISPER_MODEL||'.local/models/ggml-tiny.bin');
export function run(command,args,{signal,timeout=900000,onOutput,onStdout}={}){
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(new Error('已取消'));return}
    const p=spawn(command,args,{stdio:['ignore','pipe','pipe']});let output='',error='',done=false;
    const kill=()=>{p.kill('SIGTERM');setTimeout(()=>{if(!done)p.kill('SIGKILL')},1500).unref()};
    const timer=setTimeout(kill,timeout);signal?.addEventListener('abort',kill,{once:true});
    p.stdout.on('data',d=>{output=(output+d).slice(-4000000);onOutput?.(String(d));onStdout?.(String(d))});p.stderr.on('data',d=>{error=(error+d).slice(-300000);onOutput?.(String(d))});
    const finish=e=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',kill);if(e)reject(e);else resolve({output,error})};
    p.on('error',finish);p.on('close',(code,termination)=>finish(signal?.aborted?new Error('已取消'):termination?new Error(`${path.basename(command)} 被信号 ${termination} 终止`):code?new Error(`${path.basename(command)} 失败 (${code}): ${error.slice(-1200)}`):null));
  });
}
export async function dependencies(){
  const check=async(c,args)=>{try{const r=await run(c,args,{timeout:5000});return {available:true,version:(r.output||r.error).split('\n')[0]}}catch{return {available:false}}};
  const [ffmpeg,ffprobe,whisper]=await Promise.all([check('ffmpeg',['-version']),check('ffprobe',['-version']),check(whisperBin,['--help'])]);let modelReady=false;try{modelReady=(await fs.stat(whisperModel)).size>50000000}catch{ /* not installed */ }
  return {ffmpeg,ffprobe,whisper,modelReady,architecture:process.arch,whisperModel:path.basename(whisperModel)};
}
export function frameSampleTimes(duration){const interval=Math.max(12,duration/40);return Array.from({length:Math.ceil(duration/interval)},(_,i)=>i*interval).filter(t=>t<duration-Math.min(0.05,duration/2));}
export async function ensureFrameFile(file){let b;try{b=await fs.readFile(file)}catch(e){if(e.code==='ENOENT')throw new Error('此位置未解码出画面，请选择视频结束前的位置');throw e;}if(b.length<4||b[0]!==255||b[1]!==216)throw new Error('FFmpeg 未生成有效画面，请选择视频结束前的位置');}
export async function processMedia(lesson,folder,{signal,update,language='auto',asrEngine='qwen3'}){
  const began=performance.now();let tick=began;lesson.timings={startedAt:new Date().toISOString()};
  await update('probe',3,'核验视频与音轨');
  const probe=JSON.parse((await run('ffprobe',['-v','error','-show_format','-show_streams','-of','json',path.join(folder,'source.mp4')],{signal,timeout:15000})).output);
  const duration=Number(probe.format?.duration);if(!Number.isFinite(duration)||duration<=0)throw new Error('无法读取有效时长');if(duration>(lesson.order?7200:1800))throw new Error(lesson.order?'课程超过2小时处理上限':'基础版上传视频上限30分钟，请先切分视频');
  lesson.timings.probeSeconds=(performance.now()-tick)/1000;lesson.duration=duration;
  if(!probe.streams.some(s=>s.codec_type==='video'))throw new Error('文件中没有视频轨道');if(!probe.streams.some(s=>s.codec_type==='audio'))throw new Error('文件没有音轨，请导入带讲解语音的视频');
  tick=performance.now();await update('audio',10,'FFmpeg 分离本地16kHz单声道音轨');
  await run('ffmpeg',['-y','-i',path.join(folder,'source.mp4'),'-vn','-ac','1','-ar','16000','-c:a','pcm_s16le',path.join(folder,'audio.wav')],{signal});
  lesson.timings.audioSeconds=(performance.now()-tick)/1000;tick=performance.now();
  await update('frames',23,'按场景变化抽帧，保留时间戳');
  const frameDir=path.join(folder,'frames');await fs.mkdir(frameDir,{recursive:true});
  const scene=await run('ffmpeg',['-y','-i',path.join(folder,'source.mp4'),'-vf',"select='gt(scene,0.25)',scale=768:-2,format=yuvj420p,showinfo",'-vsync','vfr','-frames:v','60',path.join(frameDir,'scene-%03d.jpg')],{signal});
  const sceneTimes=[...scene.error.matchAll(/pts_time:([0-9.]+)/g)].map(x=>Number(x[1])).slice(0,60);
  const files=(await fs.readdir(frameDir)).filter(x=>/^scene-\d+\.jpg$/.test(x)).sort();
  const frames=files.map((file,i)=>({id:`f${i+1}`,time:sceneTimes[i]||0,file:`frames/${file}`,method:'scene'}));
  // Uniform fallback covers static slides and intervals without a scene transition.
  const interval=Math.max(12,duration/40);
  for(const t of frameSampleTimes(duration)){if(frames.some(f=>Math.abs(f.time-t)<interval/2))continue;const file=`gap-${Math.round(t*1000)}.jpg`;await run('ffmpeg',['-y','-ss',String(t),'-i',path.join(folder,'source.mp4'),'-frames:v','1','-vf','scale=768:-2,format=yuvj420p',path.join(frameDir,file)],{signal,timeout:15000});await ensureFrameFile(path.join(frameDir,file));frames.push({id:`f${frames.length+1}`,time:t,file:`frames/${file}`,method:'interval'})}
  frames.push(...(lesson.frames||[]).filter(f=>f.method==='manual'&&!frames.some(x=>x.file===f.file)));
  frames.sort((a,b)=>a.time-b.time);lesson.frames=frames;
  lesson.timings.frameSeconds=(performance.now()-tick)/1000;tick=performance.now();
  if(asrEngine==='qwen3'){
    await update('transcribe',40,'Qwen3-ASR 1.7B 本地转写，随后执行强制时间对齐');
    let lines='';
    const observe=d=>{lines+=d;const all=lines.split('\n');lines=all.pop()||'';for(const line of all){try{const event=JSON.parse(line);if(event.progress)update(event.phase||'transcribe',40+event.progress*.35,event.message||'Qwen3 本地处理').catch(()=>{})}catch{/* library progress */}}};
    await run(path.resolve('.local/qwen-env/bin/python'),[path.resolve('scripts/qwen_asr.py'),'--audio',path.join(folder,'audio.wav'),'--output',path.join(folder,'qwen-transcript.json'),'--language',language,'--align'],{signal,timeout:7200000,onStdout:observe});
    const data=JSON.parse(await fs.readFile(path.join(folder,'qwen-transcript.json'),'utf8'));
    if(!data.segments.length)throw new Error('Qwen3-ASR 未生成文字，请检查语音');
    lesson.timings.asrWorkerSeconds=(performance.now()-tick)/1000;lesson.timings.mediaTotalSeconds=(performance.now()-began)/1000;
    lesson.segments=data.segments;lesson.frames=alignedFrames(frames,data.segments);lesson.asr=data.metadata;lesson.mediaReady=true;
    await update('media-ready',78,`Qwen3 真实转写与对齐完成：${data.segments.length}段 / ${frames.length}帧`);return lesson;
  }
  await update('transcribe',40,'Whisper tiny 本地转写（用户手动切换）');
  const progress=d=>{const matches=[...d.matchAll(/\[\d{2}:(\d{2}):(\d{2})\.(\d{3}) --> \d{2}:(\d{2}):(\d{2})\.(\d{3})\]/g)];const m=matches.at(-1);if(m){const sec=Number(m[4])*60+Number(m[5])+Number(m[6])/1000;update('transcribe',Math.min(72,40+32*sec/duration),'Whisper 正在生成时间戳文字').catch(()=>{})}};
  await run(whisperBin,['-m',whisperModel,'-f',path.join(folder,'audio.wav'),'-l',language,'-oj','-of',path.join(folder,'transcript'),'-t','4','-pp'],{signal,onOutput:progress});
  const transcript=JSON.parse(await fs.readFile(path.join(folder,'transcript.json'),'utf8'));
  const segments=(transcript.transcription||[]).filter(s=>s.text?.trim()).map((s,i)=>({id:`s${i+1}`,start:s.offsets.from/1000,end:Math.min(duration,s.offsets.to/1000),text:s.text.trim()}));
  if(!segments.length)throw new Error('Whisper 未识别到文字；请检查语音、语言或更换本地模型');
  lesson.segments=segments;lesson.frames=alignedFrames(frames,segments);lesson.mediaReady=true;lesson.asr={model:path.basename(whisperModel),device:'CPU ARM64',alignment:'Whisper 片段时间戳',seconds:0};
  await update('media-ready',78,`真实媒体处理完成：${segments.length}段文字 / ${frames.length}帧`);
  return lesson;
}
