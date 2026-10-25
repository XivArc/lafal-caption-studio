import {cleanText,distributeWords,clamp} from './core.js';

export function captionWords(caption){
  return caption.words?.length&&cleanText(caption.words.map(w=>w.text).join(' '))===cleanText(caption.text)
    ?caption.words:distributeWords(caption.text,caption.start,caption.end);
}

export function replaceCaptionText(caption,text){
  const before=captionWords(caption),used=new Set();
  caption.text=text.replace(/\n/g,' ');
  caption.words=distributeWords(caption.text,caption.start,caption.end).map(word=>{
    const index=before.findIndex((old,i)=>!used.has(i)&&old.text===word.text);
    if(index>=0){used.add(index);if(before[index].style)word.style={...before[index].style};}
    return word;
  });
  caption.timingEdited=true;
}

export function editWord(caption,index,patch){
  const words=captionWords(caption).map(w=>({...w}));
  if(!words[index])throw new Error('Select a word first.');
  const word={...words[index],...patch};
  word.text=String(word.text).trim();
  if(!word.text||/\s/.test(word.text))throw new Error('Enter one word. Use Sentence mode to edit a full sentence.');
  const min=index?words[index-1].end:caption.start,max=index<words.length-1?words[index+1].start:caption.end;
  if(('start' in patch||'end' in patch)&&(!Number.isFinite(word.start)||!Number.isFinite(word.end)||word.start<min-.001||word.end>max+.001||word.end<=word.start))
    throw new Error('Keep word timing inside this caption and between neighbouring words.');
  words[index]=word;caption.words=words;caption.text=words.map(w=>w.text).join(' ');caption.timingEdited=true;
}

export function retimeCaption(caption,start,end){
  const oldStart=caption.start,oldDuration=caption.end-oldStart;
  caption.words=captionWords(caption).map(w=>({...w,start:start+(w.start-oldStart)/(oldDuration||1)*(end-start),end:start+(w.end-oldStart)/(oldDuration||1)*(end-start)}));
  caption.start=start;caption.end=end;caption.timingEdited=true;
}

export function timelineTime(clientX,left,width,duration){return clamp((clientX-left)/Math.max(1,width),0,1)*duration;}

export function applyScopedStyle(project,scope,captionId,wordIndex,patch){
  if(scope==='all'){
    project.style={...project.style,...patch};
    for(const c of project.captions){
      if(c.style)c.style={...c.style,...patch};
      for(const w of c.words||[])if(w.style)w.style={...w.style,...patch};
    }
    return;
  }
  const caption=project.captions.find(c=>c.id===captionId);if(!caption)return;
  if(scope==='sentence'){
    caption.style={...caption.style,...patch};
    for(const w of caption.words||[])if(w.style)w.style={...w.style,...patch};
  }else{
    caption.words=captionWords(caption);
    const {position,...wordPatch}=patch;
    const word=caption.words[wordIndex];if(word)word.style={...word.style,...wordPatch};
  }
}
