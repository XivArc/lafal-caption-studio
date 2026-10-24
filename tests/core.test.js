import test from 'node:test';
import assert from 'node:assert/strict';
import {wordsToCaptions,distributeWords,splitLines,exportSubtitles,parseSubtitles,outputSize,parseTime,subtitleClock,tidyCaptions} from '../dist/core.js';

test('portrait captions retain all words and respect two-line character budget',()=>{
  const text='Setiap cerita mempunyai arti dan setiap kata membantu penonton memahami maksud yang ingin kita sampaikan dengan jelas tanpa perlu memutar video berulang kali.';
  const words=distributeWords(text,.3,15.4);
  const captions=wordsToCaptions(words,{width:1080,height:1920,duration:17});
  assert.equal(captions.map(c=>c.text).join(' '),text);
  for(let i=0;i<captions.length;i++){
    const c=captions[i];assert(c.end>c.start);assert(c.end-c.start<=7);assert(c.end<=17);
    assert(splitLines(c.text,27).length<=2);assert(splitLines(c.text,27).every(l=>l.length<=27));
    if(i)assert(c.start>=captions[i-1].end);
  }
});
test('subtitle exports preserve millisecond timing across SRT and VTT round trips',()=>{
  const cues=[{start:.125,end:2.725,text:'Halo, dunia.'},{start:3.001,end:5.999,text:'Cerita berikutnya sudah dimulai.'}];
  for(const format of ['srt','vtt']){
    const parsed=parseSubtitles(exportSubtitles(cues,format));
    assert.equal(parsed.length,2);
    for(let i=0;i<cues.length;i++){assert.equal(parsed[i].start,cues[i].start);assert.equal(parsed[i].end,cues[i].end);assert.equal(parsed[i].text,cues[i].text);}
  }
  assert.equal(subtitleClock(3599.999),'00:59:59,999');
  assert.equal(subtitleClock(3600.001),'01:00:00,001');
});
test('import rejects malformed timings and clips cues at video boundary',()=>{
  const imported=parseSubtitles('1\n00:00:00,500 --> 00:00:04,000\n<b>Selamat datang.</b>\n\n2\n00:00:07,000 --> 00:00:06,000\nInvalid\n\n3\n00:00:10,000 --> 00:00:13,000\nBeyond video',3);
  assert.equal(imported.length,1);assert.equal(imported[0].end,3);assert.equal(imported[0].text,'Selamat datang.');
  assert(Number.isNaN(parseTime('nope')));
});
test('exports keep aspect ratio, use even dimensions, and never upscale',()=>{
  assert.deepEqual(outputSize(1080,1920,'720'),{width:720,height:1280});
  assert.deepEqual(outputSize(3840,2160,'1080'),{width:1920,height:1080});
  assert.deepEqual(outputSize(640,360,'1080'),{width:640,height:360});
  assert.deepEqual(outputSize(1080,1080,'720'),{width:1080,height:1080});
});
test('tidying keeps original word timings when text has not changed',()=>{
  const words=[{text:'Halo',start:1,end:1.25},{text:'semua.',start:1.7,end:2.3}];
  const result=tidyCaptions([{start:1,end:3,text:'Halo semua.',words}],{width:1920,height:1080,duration:5});
  assert.equal(result[0].words[1].start,1.7);
});
test('silent audio yields an empty caption list rather than placeholder speech',()=>{
  assert.deepEqual(wordsToCaptions([],{duration:12}),[]);
});
