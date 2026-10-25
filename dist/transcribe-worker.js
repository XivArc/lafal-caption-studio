import {pipeline,env} from './vendor/transformers.min.js';
env.allowLocalModels=false;
env.backends.onnx.wasm.numThreads=1;
env.backends.onnx.wasm.wasmPaths=new URL('./vendor/ort/',import.meta.url).href;
env.backends.onnx.wasm.proxy=false;
let transcriber;
const downloads=new Map();
self.onmessage=async ({data})=>{
  if(data.type!=='transcribe')return;
  try{
    if(!transcriber){
      self.postMessage({type:'status',message:'Downloading the Whisper model · first use only'});
      transcriber=await pipeline('automatic-speech-recognition','Xenova/whisper-tiny',{
        quantized:true,progress_callback:p=>{
          if(p.status==='progress'){
            downloads.set(p.file,{loaded:p.loaded||0,total:p.total||0});
            let loaded=0,total=0;for(const v of downloads.values()){loaded+=v.loaded;total+=v.total;}
            self.postMessage({type:'download',loaded,total,progress:p.progress||0,file:p.file});
          }
        }
      });
    }
    const audio=data.audio,sampleRate=16000,seconds=audio.length/sampleRate,block=25,padding=1.5;
    const words=[];let fullText='';
    for(let coreStart=0;coreStart<seconds;coreStart+=block){
      const coreEnd=Math.min(seconds,coreStart+block),sliceStart=Math.max(0,coreStart-padding),sliceEnd=Math.min(seconds,coreEnd+padding);
      const sample=audio.slice(Math.floor(sliceStart*sampleRate),Math.floor(sliceEnd*sampleRate));
      let energy=0;for(let i=0;i<sample.length;i+=4)energy+=sample[i]*sample[i];
      const rms=Math.sqrt(energy/Math.max(1,sample.length/4));
      if(rms>.001){
        self.postMessage({type:'status',message:`Recognising speech · ${Math.floor(coreStart)}–${Math.ceil(coreEnd)} seconds`});
        const options={return_timestamps:'word',task:'transcribe',chunk_length_s:30,stride_length_s:3,temperature:0};
        if(data.language&&data.language!=='auto')options.language=data.language;
        const result=await transcriber(sample,options);
        const chunks=result.chunks||[];
        for(let i=0;i<chunks.length;i++){
          const c=chunks[i],text=c.text?.trim();if(!text)continue;
          let a=c.timestamp?.[0]==null?NaN:Number(c.timestamp[0]),b=c.timestamp?.[1]==null?NaN:Number(c.timestamp[1]);
          if(!Number.isFinite(a))a=i?Number(chunks[i-1].timestamp?.[1])||i*.25:0;
          if(!Number.isFinite(b)||b<=a)b=Number(chunks[i+1]?.timestamp?.[0])||a+.25;
          const start=Math.max(0,sliceStart+a),end=Math.min(seconds,sliceStart+b),mid=(start+end)/2;
          if(mid>=coreStart&&mid<coreEnd&&end>start)words.push({text,start,end});
        }
        if(!chunks.length&&result.text?.trim()){
          const textWords=result.text.trim().split(/\s+/),step=(coreEnd-coreStart)/textWords.length;
          textWords.forEach((text,i)=>words.push({text,start:coreStart+i*step,end:coreStart+(i+1)*step}));
        }
        fullText+=result.text||'';
      }
      self.postMessage({type:'progress',progress:coreEnd/seconds});
    }
    self.postMessage({type:'done',words,text:fullText,language:data.language||'auto'});
  }catch(error){self.postMessage({type:'error',message:error.message||String(error)});transcriber=null;}
};
