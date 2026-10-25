let ffmpegPromise;let currentFFmpeg;
async function blobDownload(url,type,progress){
  const response=await fetch(url);if(!response.ok)throw new Error('Could not download the media engine. Check your internet connection.');
  const total=Number(response.headers.get('content-length'))||0;
  if(!response.body){return URL.createObjectURL(new Blob([await response.arrayBuffer()],{type}));}
  const reader=response.body.getReader(),chunks=[];let loaded=0;
  for(;;){const {value,done}=await reader.read();if(done)break;chunks.push(value);loaded+=value.length;progress?.(total?loaded/total:0,loaded);}
  return URL.createObjectURL(new Blob(chunks,{type}));
}
export async function getFFmpeg(onProgress=()=>{}){
  if(!ffmpegPromise){
    ffmpegPromise=(async()=>{
      const {FFmpeg}=await import('./vendor/ffmpeg/index.js');
      const ffmpeg=new FFmpeg();currentFFmpeg=ffmpeg;
      const base='https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';
      const [coreURL,wasmURL]=await Promise.all([
        blobDownload(`${base}/ffmpeg-core.js`,'text/javascript'),
        blobDownload(`${base}/ffmpeg-core.wasm`,'application/wasm',(p,loaded)=>onProgress(p,`Preparing audio engine · ${(loaded/1048576).toFixed(1)} MB`))
      ]);
      try{await ffmpeg.load({coreURL,wasmURL});}finally{URL.revokeObjectURL(coreURL);URL.revokeObjectURL(wasmURL);}
      return ffmpeg;
    })().catch(e=>{ffmpegPromise=null;throw e;});
  }
  return ffmpegPromise;
}
export function stopMedia(){try{currentFFmpeg?.terminate();}catch{}currentFFmpeg=null;ffmpegPromise=null;}
export async function extractAudio(file,onProgress=()=>{}){
  try{
    const ffmpeg=await getFFmpeg((p,label)=>onProgress(p*.25,label));
    onProgress(.28,'Extracting audio with FFmpeg…');
    const ext=(file.name?.split('.').pop()||'mp4').toLowerCase();const name=`source.${ext}`;
    await ffmpeg.writeFile(name,new Uint8Array(await file.arrayBuffer()));
    const progress=({progress})=>onProgress(.3+Math.min(.65,progress*.65),'Separating audio from video…');
    ffmpeg.on('progress',progress);
    try{
      const code=await ffmpeg.exec(['-i',name,'-vn','-ac','1','-ar','16000','-c:a','pcm_f32le','-f','f32le','audio.f32']);
      if(code!==0)throw new Error('Could not read the video’s audio track.');
      const data=await ffmpeg.readFile('audio.f32');
      const result=new Float32Array(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength));
      if(!result.length)throw new Error('This video has no audio.');
      onProgress(1,'Audio ready for analysis');return result;
    }finally{ffmpeg.off('progress',progress);for(const p of [name,'audio.f32']){try{await ffmpeg.deleteFile(p);}catch{}}}
  }catch(error){
    if(!globalThis.AudioContext&&!globalThis.webkitAudioContext)throw error;
    onProgress(.4,'Reading audio with the browser decoder…');
    const Context=globalThis.AudioContext||globalThis.webkitAudioContext,ctx=new Context({sampleRate:16000});
    try{
      const source=await ctx.decodeAudioData(await file.arrayBuffer());
      const output=new OfflineAudioContext(1,Math.ceil(source.duration*16000),16000);
      const node=output.createBufferSource();node.buffer=source;node.connect(output.destination);node.start();
      const rendered=await output.startRendering();onProgress(1,'Audio ready for analysis');return new Float32Array(rendered.getChannelData(0));
    }catch{throw new Error('Could not read the audio. Check that the video has sound and the file is not damaged.');}
    finally{await ctx.close();}
  }
}
export async function normalizeVideo(file,onProgress){
  const ffmpeg=await getFFmpeg((p,label)=>onProgress?.(p*.2,label));
  await ffmpeg.writeFile('unsupported.mov',new Uint8Array(await file.arrayBuffer()));
  const listener=({progress})=>onProgress?.(.2+Math.min(.79,progress*.79),'Converting the video codec for preview…');
  ffmpeg.on('progress',listener);
  try{
    const code=await ffmpeg.exec(['-i','unsupported.mov','-vf',"scale=w='min(1920,iw)':h='min(1920,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",'-c:v','libx264','-preset','ultrafast','-crf','20','-c:a','aac','-movflags','+faststart','compatible.mp4']);
    if(code!==0)throw new Error('Could not read this video codec. Try converting the video to MP4 H.264/AAC.');
    const data=await ffmpeg.readFile('compatible.mp4');
    return new File([data],file.name.replace(/\.[^.]+$/,'')+'.mp4',{type:'video/mp4'});
  }finally{ffmpeg.off('progress',listener);for(const p of ['unsupported.mov','compatible.mp4']){try{await ffmpeg.deleteFile(p);}catch{}}}
}
export async function convertToMP4(blob,onProgress,duration){
  const ffmpeg=await getFFmpeg((p,label)=>onProgress?.(p*.1,label));
  await ffmpeg.writeFile('render.webm',new Uint8Array(await blob.arrayBuffer()));
  const listener=({progress})=>onProgress?.(Math.min(.98,progress),'Preparing the MP4 file…');
  ffmpeg.on('progress',listener);
  try{
    const timing=Number.isFinite(duration)?['-vf','fps=30,tpad=stop_mode=clone:stop_duration=1','-af','apad','-t',String(duration)]:['-r','30'];
    const code=await ffmpeg.exec(['-i','render.webm',...timing,'-c:v','libx264','-preset','ultrafast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart','render.mp4']);
    if(code!==0)throw new Error('MP4 conversion failed. Try a lower resolution.');
    return new Blob([await ffmpeg.readFile('render.mp4')],{type:'video/mp4'});
  }finally{ffmpeg.off('progress',listener);for(const p of ['render.webm','render.mp4']){try{await ffmpeg.deleteFile(p);}catch{}}}
}
