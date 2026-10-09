"""Official Transformers Qwen3-ASR 1.7B + Qwen3-ForcedAligner 0.6B.
No community model code, credentials, remote-code loading or cloud ASR.
Chunk checkpoints survive cancellation; forced timestamps are explicitly identified.
"""
import argparse,gc,hashlib,json,os,time
from pathlib import Path
os.environ['HF_HUB_DISABLE_IMPLICIT_TOKEN']='1'
os.environ['HF_HOME']=str(Path('.local/hf-cache').resolve())
os.environ['TOKENIZERS_PARALLELISM']='false'
import numpy as np
import soundfile as sf
import torch
from huggingface_hub import snapshot_download,set_client_factory
import httpx
# Process-local direct public download; do not change the user's system proxy.
if os.environ.get('QWEN_DIRECT_DOWNLOAD','1')=='1':
    set_client_factory(lambda:httpx.Client(trust_env=False,follow_redirects=True,timeout=60))
from transformers import AutoProcessor,AutoModelForMultimodalLM,AutoModelForTokenClassification

ASR='Qwen/Qwen3-ASR-1.7B-hf'
ALIGN='Qwen/Qwen3-ForcedAligner-0.6B-hf'
def emit(**event): print(json.dumps(event,ensure_ascii=False),flush=True)
def save(file,data):
    temp=Path(str(file)+'.tmp');temp.write_text(json.dumps(data,ensure_ascii=False,indent=2));temp.replace(file)
def fetch_model(repo):
    try:
        cached=snapshot_download(repo,cache_dir=os.environ['HF_HOME'],token=False,local_files_only=True)
        if (Path(cached)/'model.safetensors').is_file():
            emit(phase='weights',message=f'复用已下载官方模型 {repo}',progress=1)
            return cached
    except FileNotFoundError:pass
    except Exception:pass
    emit(phase='weights',message=f'准备官方模型 {repo}（只读公开权重，无认证）',progress=1)
    return snapshot_download(repo,cache_dir=os.environ['HF_HOME'],token=False,allow_patterns=['*.json','*.safetensors','*.txt','*.jinja'],max_workers=2)
def load(repo,cls,device):
    p=fetch_model(repo);processor=AutoProcessor.from_pretrained(p,local_files_only=True,trust_remote_code=False)
    model=cls.from_pretrained(p,local_files_only=True,trust_remote_code=False,dtype=torch.float16 if device in ('mps','cuda') else torch.float32,attn_implementation='eager').to(device).eval()
    return processor,model
def unload(model):
    del model;gc.collect()
    if torch.backends.mps.is_available():torch.mps.empty_cache()
def segments_from_words(words,start):
    groups=[];text='';begin=None;end=0
    for w in words:
        a=float(w['start_time'])+start;b=float(w['end_time'])+start;token=w['text']
        if begin is None:begin=a
        text+=token if not text or not token.isascii() else ' '+token
        end=b
        if token.endswith(('。','？','！','.','?','!')) or len(text)>=70 or end-begin>=10:
            groups.append({'start':begin,'end':end,'text':text});text='';begin=None
    if text:groups.append({'start':begin,'end':end,'text':text})
    return groups
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--audio');ap.add_argument('--output');ap.add_argument('--language',default='auto');ap.add_argument('--align',action='store_true');ap.add_argument('--prepare',action='store_true');ap.add_argument('--limit',type=float,default=0);ap.add_argument('--device',choices=['auto','mps','cuda','cpu'],default='auto');args=ap.parse_args()
    device=('cuda' if torch.cuda.is_available() else 'mps' if torch.backends.mps.is_available() else 'cpu') if args.device=='auto' else args.device
    if device=='cuda' and not torch.cuda.is_available():raise RuntimeError('CUDA 不可用；不会静默改用CPU比较')
    if device=='mps' and not torch.backends.mps.is_available():raise RuntimeError('MPS 不可用')
    torch.set_num_threads(4)
    emit(phase='device',device=device,torch=torch.__version__,message=f'官方 PyTorch 使用 {device}',progress=1)
    if args.prepare:
        fetch_model(ASR);fetch_model(ALIGN);emit(phase='ready',progress=100,message='官方 Qwen3 权重准备完成');return
    began=time.monotonic();audio,sr=sf.read(args.audio,dtype='float32');audio=audio.mean(axis=1) if audio.ndim>1 else audio
    if sr!=16000:raise ValueError('FFmpeg must provide 16 kHz audio')
    if args.limit:audio=audio[:int(args.limit*sr)]
    duration=len(audio)/sr;out=Path(args.output);cache=out.with_suffix('.checkpoint.json');chunks_dir=out.parent/'qwen-chunks';chunks_dir.mkdir(exist_ok=True)
    fingerprint=hashlib.sha256(audio.tobytes()).hexdigest();previous=json.loads(cache.read_text()) if cache.exists() else {}
    results=previous.get('chunks',[]) if previous.get('fingerprint')==fingerprint else []
    ranges=[];start=0.0
    # Choose low-energy boundaries near 24 s to avoid cutting mid-word; no timestamp is inferred from tokens.
    while start<duration:
        end=min(start+24,duration)
        if end<duration:
            candidates=np.arange(max(start+15,end-4),end+.01,.2)
            end=float(min(candidates,key=lambda t:np.mean(audio[int(t*sr):int((t+.12)*sr)]**2)))
        ranges.append((start,end));start=end
    reused=len(results);tick=time.monotonic()
    processor,model=load(ASR,AutoModelForMultimodalLM,device);asr_load=time.monotonic()-tick;asr_tick=time.monotonic()
    for i,(start,end) in enumerate(ranges):
        if i<len(results):continue
        chunk=chunks_dir/f'{i:04d}.wav';sf.write(chunk,audio[int(start*sr):int(end*sr)],sr)
        tick=time.monotonic();lang={'zh':'Chinese','en':'English'}.get(args.language)
        inputs=processor.apply_transcription_request(audio=str(chunk),language=lang).to(device,model.dtype)
        with torch.inference_mode():ids=model.generate(**inputs,max_new_tokens=512,do_sample=False)
        new=ids[:,inputs['input_ids'].shape[1]:];parsed=processor.decode(new,return_format='parsed')[0]
        text=parsed.get('transcription','').strip();results.append({'start':start,'end':end,'text':text,'language':parsed.get('language') or lang or 'Chinese','seconds':time.monotonic()-tick,'chunk':str(chunk)})
        save(cache,{'fingerprint':fingerprint,'chunks':results});emit(phase='transcribe',progress=70*(i+1)/len(ranges),message=f'Qwen3-ASR 1.7B 转写 {i+1}/{len(ranges)} 段',chunk_seconds=results[-1]['seconds'],audio_seconds=end-start)
    asr_wall=time.monotonic()-asr_tick
    if 'inputs' in locals():del inputs
    if 'ids' in locals():del ids
    del model;gc.collect()
    if device=='mps':torch.mps.empty_cache()
    if device=='cuda':torch.cuda.empty_cache()
    align_load=0;align_wall=0
    segments=[];alignment='音频片段范围（未做逐字强制对齐）'
    if args.align:
        tick=time.monotonic();processor,model=load(ALIGN,AutoModelForTokenClassification,device);align_load=time.monotonic()-tick;align_tick=time.monotonic()
        for i,r in enumerate(results):
            if not r['text']:continue
            if 'words' not in r:
                word_tick=time.monotonic()
                inputs,word_lists=processor.prepare_forced_aligner_inputs(audio=r['chunk'],transcript=r['text'],language=r['language'])
                inputs=inputs.to(device,model.dtype)
                with torch.inference_mode():output=model(**inputs)
                r['words']=processor.decode_forced_alignment(logits=output.logits,input_ids=inputs['input_ids'],word_lists=word_lists,timestamp_token_id=model.config.timestamp_token_id)[0]
                r['alignmentSeconds']=time.monotonic()-word_tick
                save(cache,{'fingerprint':fingerprint,'chunks':results})
            segments+=segments_from_words(r['words'],r['start']);emit(phase='align',progress=70+30*(i+1)/len(results),message=f'Qwen3 强制时间对齐 {i+1}/{len(results)} 段')
        align_wall=time.monotonic()-align_tick
        alignment='Qwen3-ForcedAligner 0.6B 逐字强制对齐后聚合为句段'
    else:segments=[{'start':r['start'],'end':r['end'],'text':r['text']} for r in results if r['text']]
    for i,s in enumerate(segments):s['id']=f's{i+1}';s['start']=max(0,min(duration,s['start']));s['end']=max(s['start'],min(duration,s['end']))
    meta={'model':ASR,'aligner':ALIGN if args.align else None,'device':f'Apple MPS ({device})' if device=='mps' else f'CUDA ({torch.cuda.get_device_name(0)})' if device=='cuda' else 'CPU','alignment':alignment,'seconds':time.monotonic()-began,'audioSeconds':duration,'chunks':len(results),'torch':torch.__version__,'reusedChunks':reused,'phaseSeconds':{'asrColdLoad':asr_load,'asrInference':sum(r['seconds'] for r in results),'asrWall':asr_wall,'alignerColdLoad':align_load,'alignInference':sum(r.get('alignmentSeconds',0) for r in results),'alignWall':align_wall},'rtf':sum(r['seconds'] for r in results)/duration}
    save(out,{'segments':segments,'metadata':meta});emit(phase='complete',progress=100,message='本地转写及时间戳已保存',metadata=meta)
if __name__=='__main__':main()
