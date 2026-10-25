export const DEFAULT_STYLE = Object.freeze({preset:'classic',font:'sans',size:4.5,color:'#ffffff',highlight:'#6de2dc',outline:8,shadow:true,background:0,position:'bottom',animation:'none',weight:700,uppercase:false});
export const PRESETS = {
  classic:{...DEFAULT_STYLE,preset:'classic'},
  minimal:{...DEFAULT_STYLE,preset:'minimal',size:4.2,weight:500,outline:0,shadow:false,background:65},
  bold:{...DEFAULT_STYLE,preset:'bold',size:5,weight:800,outline:12,animation:'pop',uppercase:true},
  highlight:{...DEFAULT_STYLE,preset:'highlight',weight:800,outline:7,animation:'highlight'}
};
export const PRESET_LABELS = {classic:'Classic',minimal:'Minimal',bold:'TikTok Bold',highlight:'Word highlight'};
export const uid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
export const cleanText=t=>String(t??'').replace(/\s+/g,' ').trim();
export function clock(s,ms=false){
  const n=Math.max(0,Math.round((Number(s)||0)*1000));
  const h=Math.floor(n/3600000),m=Math.floor(n/60000)%60,sec=Math.floor(n/1000)%60;
  const short=`${String(m+h*60).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  return ms?`${short}.${String(n%1000).padStart(3,'0')}`:short;
}
export function parseTime(str){
  const parts=String(str).trim().replace(',','.').split(':').map(Number);
  if(parts.length>3||parts.some(p=>!Number.isFinite(p)||p<0))return NaN;
  return parts.reduce((n,p)=>n*60+p,0);
}
export function subtitleClock(s,vtt=false){
  const n=Math.max(0,Math.round((Number(s)||0)*1000));
  return `${String(Math.floor(n/3600000)).padStart(2,'0')}:${String(Math.floor(n/60000)%60).padStart(2,'0')}:${String(Math.floor(n/1000)%60).padStart(2,'0')}${vtt?'.':','}${String(n%1000).padStart(3,'0')}`;
}
export function lineLimit(width,height){return height>width?27:42;}
export function splitLines(text,limit=42){
  const words=cleanText(text).split(' ').filter(Boolean);
  if(!words.length)return [''];
  if(words.join(' ').length<=limit)return [words.join(' ')];
  let best=1,score=Infinity;
  for(let i=1;i<words.length;i++){
    const left=words.slice(0,i).join(' '),right=words.slice(i).join(' ');
    const excess=Math.max(0,left.length-limit)+Math.max(0,right.length-limit);
    const next=Math.abs(left.length-right.length)+excess*20;
    if(next<score){score=next;best=i;}
  }
  return words.length===1?[words[0]]:[words.slice(0,best).join(' '),words.slice(best).join(' ')];
}
export function distributeWords(text,start,end){
  const words=cleanText(text).split(' ').filter(Boolean);
  const weights=words.map(w=>Math.max(2,w.length));
  const total=weights.reduce((a,b)=>a+b,0)||1;
  let t=start;
  return words.map((text,i)=>{const s=t;t+=(end-start)*weights[i]/total;return {text,start:s,end:i===words.length-1?end:t};});
}
export function wordsToCaptions(rawWords,{duration,width=1920,height=1080}={}){
  const safeDuration=Number.isFinite(duration)?duration:Math.max(1,...rawWords.map(w=>Number(w.end)||0));
  const limit=lineLimit(width,height),maxChars=limit*2;
  const words=rawWords.map((w,i)=>({text:cleanText(w.text),start:clamp(Number(w.start)||0,0,safeDuration),end:clamp(Number(w.end)||Number(w.start)+.2,0,safeDuration)})).filter(w=>w.text&&w.start<safeDuration).sort((a,b)=>a.start-b.start);
  const groups=[];let group=[];
  const flush=()=>{if(group.length){groups.push(group);group=[];}};
  for(let i=0;i<words.length;i++){
    const word=words[i],prev=group.at(-1);
    const candidate=[...group,word].map(w=>w.text).join(' '),chars=candidate.length;
    const total=word.end-(group[0]?.start??word.start);
    if(group.length&&(chars>maxChars||splitLines(candidate,limit).some(l=>l.length>limit)||total>6.7||word.start-prev.end>.7))flush();
    group.push(word);
    const elapsed=word.end-group[0].start;
    if(/[.!?。！？]$/.test(word.text)&&elapsed>=1.4)flush();
  }
  flush();
  return groups.map((g,i)=>{
    const start=g[0].start,text=g.map(w=>w.text).join(' ');
    const next=groups[i+1]?.[0].start??safeDuration;
    const availableEnd=Math.min(safeDuration,next-(i<groups.length-1 ? .025 : 0),start+7);
    const end=Math.max(start+.05,Math.min(availableEnd,Math.max(g.at(-1).end+.12,start+1,start+text.length/18.5)));
    return {id:uid(),start,end:Math.min(end,safeDuration),text,words:g.map(w=>({...w,end:Math.min(w.end,end)}))};
  }).filter(c=>c.end>c.start);
}
export function tidyCaptions(captions,meta){
  const words=captions.flatMap(c=>c.words?.length&&cleanText(c.words.map(w=>w.text).join(' '))===cleanText(c.text)?c.words:distributeWords(c.text,c.start,c.end));
  return wordsToCaptions(words,meta);
}
export function captionMetrics(c,width,height){
  const limit=lineLimit(width,height),duration=c.end-c.start;
  const cps=cleanText(c.text).length/Math.max(.05,duration);
  const lines=splitLines(c.text,limit);
  const warnings=[];
  if(lines.some(x=>x.length>limit))warnings.push('Text is too long');
  if(duration<.98)warnings.push('Less than 1 second');
  if(duration>7.01)warnings.push('More than 7 seconds');
  if(cps>20.5)warnings.push('Too fast to read');
  return {cps,duration,lines,warnings};
}
export function exportSubtitles(captions,format,{width=1920,height=1080}={}){
  const sorted=[...captions].filter(c=>cleanText(c.text)&&c.end>c.start).sort((a,b)=>a.start-b.start);
  if(format==='txt')return sorted.map(c=>cleanText(c.text)).join('\n');
  const vtt=format==='vtt';
  const content=sorted.map((c,i)=>`${vtt?'':`${i+1}\n`}${subtitleClock(c.start,vtt)} --> ${subtitleClock(c.end,vtt)}\n${splitLines(c.text,lineLimit(width,height)).join('\n')}`).join('\n\n');
  return (vtt?'WEBVTT\n\n':'')+content+'\n';
}
export function parseSubtitles(text,duration=Infinity){
  const blocks=String(text).replace(/^\uFEFF/,'').replace(/\r/g,'').trim().split(/\n\s*\n/);
  const captions=[];
  for(const block of blocks){
    const lines=block.split('\n');
    const ti=lines.findIndex(l=>l.includes('-->'));
    if(ti<0)continue;
    const [a,b]=lines[ti].split('-->');
    const start=parseTime(a.trim()),end=Math.min(duration,parseTime(b.trim().split(/\s/)[0]));
    const cue=cleanText(lines.slice(ti+1).join(' ').replace(/<[^>]+>/g,''));
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||!cue||start>=duration)continue;
    captions.push({id:uid(),start,end,text:cue,words:distributeWords(cue,start,end)});
  }
  return captions.sort((a,b)=>a.start-b.start);
}
export function outputSize(width,height,resolution='original'){
  const target=resolution==='480'?854:resolution==='720'?1280:1920;
  const scale=Math.min(1,target/Math.max(width,height));
  return {width:Math.max(2,Math.round(width*scale/2)*2),height:Math.max(2,Math.round(height*scale/2)*2)};
}
export function activeCaption(captions,time){return captions.find(c=>time>=c.start&&time<c.end);}
function roundedRect(ctx,x,y,w,h,r){ctx.beginPath();if(ctx.roundRect)ctx.roundRect(x,y,w,h,r);else ctx.rect(x,y,w,h);ctx.fill();}
export function drawCaption(ctx,width,height,caption,time,baseStyle=DEFAULT_STYLE){
  if(!caption||!cleanText(caption.text))return;
  const style={...DEFAULT_STYLE,...baseStyle,...caption.style};
  const text=style.uppercase?cleanText(caption.text).toLocaleUpperCase():cleanText(caption.text);
  const lines=splitLines(text,lineLimit(width,height));
  let size=height*style.size/100;
  const family=style.font==='serif'?'Georgia,serif':'Inter,Arial,sans-serif';
  ctx.save();
  ctx.font=`${style.weight} ${size}px ${family}`;
  const widest=Math.max(1,...lines.map(l=>ctx.measureText(l).width));
  size*=Math.min(1,width*.85/widest);
  ctx.font=`${style.weight} ${size}px ${family}`;
  const lineHeight=size*1.25;
  const totalHeight=lines.length*lineHeight;
  const y=style.position==='top'?height*.1:style.position==='middle'?height*.5-totalHeight/2:height*.9-totalHeight;
  const elapsed=Math.max(0,time-caption.start);
  if(style.animation==='fade')ctx.globalAlpha=Math.min(1,elapsed/.18,(caption.end-time)/.12);
  if(style.animation==='pop'){
    const p=clamp(elapsed/.22,0,1),scale=.94+.06*(1-Math.pow(1-p,3));
    ctx.translate(width/2,y+totalHeight/2);ctx.scale(scale,scale);ctx.translate(-width/2,-y-totalHeight/2);
    ctx.globalAlpha=clamp(elapsed/.07,0,1);
  }
  ctx.textAlign='left';ctx.textBaseline='middle';ctx.lineJoin='round';ctx.miterLimit=2;
  const maxLine=Math.max(...lines.map(l=>ctx.measureText(l).width));
  if(style.background>0){ctx.fillStyle=`rgba(4,14,21,${style.background/100})`;roundedRect(ctx,width/2-maxLine/2-size*.35,y-size*.12,maxLine+size*.7,totalHeight+size*.24,size*.2);}
  const words=(caption.words?.length?caption.words:distributeWords(caption.text,caption.start,caption.end));
  let active=-1;for(let i=0;i<words.length;i++){if(time>=words[i].start)active=i;else break;}
  let globalIndex=0;
  for(let row=0;row<lines.length;row++){
    const line=lines[row],lineWidth=ctx.measureText(line).width;
    let x=(width-lineWidth)/2;const baseY=y+lineHeight*(row+.5);
    const tokens=line.split(' ');
    for(let i=0;i<tokens.length;i++){
      const word=tokens[i],wordWidth=ctx.measureText(word).width,space=ctx.measureText(' ').width;
      const highlight=style.animation==='highlight'&&globalIndex===active;
      if(highlight){ctx.fillStyle=style.highlight;roundedRect(ctx,x-size*.08,baseY-size*.57,wordWidth+size*.16,size*1.14,size*.12);}
      if(style.shadow){ctx.shadowColor='rgba(0,0,0,.65)';ctx.shadowBlur=size*.14;ctx.shadowOffsetY=size*.06;}
      if(style.outline>0&&!highlight){ctx.strokeStyle='#041018';ctx.lineWidth=size*style.outline/100*2;ctx.strokeText(word,x,baseY);}
      ctx.fillStyle=highlight?'#06141e':style.color;
      if(highlight){ctx.shadowBlur=0;ctx.shadowOffsetY=0;}
      ctx.fillText(word,x,baseY);
      ctx.shadowBlur=0;ctx.shadowOffsetY=0;
      x+=wordWidth+space;globalIndex++;
    }
  }
  ctx.restore();
}
export function drawFrame(ctx,width,height,video,captions,time,style){
  ctx.fillStyle='#040e15';ctx.fillRect(0,0,width,height);
  if(video.readyState>=2)ctx.drawImage(video,0,0,width,height);
  drawCaption(ctx,width,height,activeCaption(captions,time),time,style);
}
