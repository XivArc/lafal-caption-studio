import test from 'node:test';
import assert from 'node:assert/strict';
import {editWord,retimeCaption,applyScopedStyle,replaceCaptionText,timelineTime} from '../dist/editor.js';
import {DEFAULT_STYLE,drawCaption,tidyCaptions,exportSubtitles} from '../dist/core.js';
import {aiFailure} from '../dist/diagnostics.js';

const cue=()=>({id:'a',start:1,end:4,text:'One small story.',words:[{text:'One',start:1,end:1.5},{text:'small',start:1.7,end:2.5,style:{color:'#ff0000'}},{text:'story.',start:2.7,end:4}]});
test('editing one word preserves other words, timings and styles',()=>{
  const c=cue(),before=structuredClone(c.words);editWord(c,1,{text:'great'});
  assert.equal(c.text,'One great story.');assert.deepEqual(c.words[0],before[0]);assert.deepEqual(c.words[2],before[2]);
  assert.equal(c.words[1].start,1.7);assert.deepEqual(c.words[1].style,{color:'#ff0000'});
  assert.throws(()=>editWord(c,1,{text:'two words'}));assert.throws(()=>editWord(c,1,{start:1.2}));assert.throws(()=>editWord(c,1,{end:3}));
  assert.equal(c.words[1].end,2.5);editWord(c,1,{end:2.6});assert.equal(c.words[1].end,2.6);
});
test('style scopes affect only the intended word or sentence',()=>{
  const p={style:{...DEFAULT_STYLE},captions:[cue(),{...cue(),id:'b'}]};
  applyScopedStyle(p,'word','a',0,{color:'#123456',position:'top'});
  assert.equal(p.captions[0].words[0].style.color,'#123456');assert.equal(p.captions[0].words[0].style.position,undefined);
  assert.equal(p.captions[0].words[1].style.color,'#ff0000');assert.equal(p.captions[1].words[0].style,undefined);
  applyScopedStyle(p,'sentence','a',0,{color:'#00ff00'});assert.equal(p.captions[0].words[1].style.color,'#00ff00');assert.equal(p.captions[1].style,undefined);
  applyScopedStyle(p,'all','a',0,{color:'#ffffff'});assert.equal(p.style.color,'#ffffff');assert.equal(p.captions[0].words[0].style.color,'#ffffff');
});
test('caption retiming preserves relative word timing and custom style',()=>{
  const c=cue();retimeCaption(c,2,8);assert.equal(c.words[0].start,2);assert.equal(c.words[0].end,3);assert.equal(c.words[2].end,8);
  assert.equal(c.words[1].style.color,'#ff0000');
});
test('transcript edits and tidy retain word style and export the edited text',()=>{
  const c=cue();replaceCaptionText(c,'One small world.');assert.equal(c.words[1].style.color,'#ff0000');
  const tidied=tidyCaptions([c],{duration:8,width:1920,height:1080});assert.equal(tidied[0].words[1].style.color,'#ff0000');
  assert.match(exportSubtitles([c],'srt'),/One small world\./);
});
test('timeline seek clamps at both ends and maps pointer position precisely',()=>{
  assert.equal(timelineTime(150,100,200,12),3);assert.equal(timelineTime(90,100,200,12),0);assert.equal(timelineTime(400,100,200,12),12);
});
test('shared caption renderer applies the selected word style without leaking it',()=>{
  const drawn=[];const ctx={save(){},restore(){},measureText:t=>({width:t.length*10}),beginPath(){},rect(){},roundRect(){},fill(){},strokeText(){},translate(){},scale(){},fillText(text){drawn.push({text,color:this.fillStyle,font:this.font});}};
  drawCaption(ctx,1920,1080,cue(),2,{...DEFAULT_STYLE,shadow:false,outline:0});
  assert.deepEqual(drawn.map(w=>w.color),['#ffffff','#ff0000','#ffffff']);
});
test('AI failures keep the original diagnostic and distinguish download, memory and runtime errors',()=>{
  assert.equal(aiFailure('Failed to fetch').code,'AI_DOWNLOAD');assert.equal(aiFailure('WebAssembly CompileError').code,'AI_RUNTIME');
  assert.equal(aiFailure('memory allocation failed').code,'AI_MEMORY');assert.equal(aiFailure('Bad model config','model').raw,'Bad model config');
});
