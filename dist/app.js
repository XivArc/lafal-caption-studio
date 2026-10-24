import {DEFAULT_STYLE,PRESETS,PRESET_LABELS,uid,clamp,clock,parseTime,cleanText,splitLines,distributeWords,wordsToCaptions,tidyCaptions,captionMetrics,exportSubtitles,parseSubtitles,outputSize,activeCaption,drawFrame} from './core.js';
import * as storage from './storage.js';
import {extractAudio,normalizeVideo,convertToMP4,stopMedia} from './media.js';

const $=id=>document.getElementById(id);
const assetURL=path=>new URL(path,import.meta.url).href;
const icon=name=>`<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=v=>structuredClone(v);
const video=$('previewVideo'),canvas=$('previewCanvas'),ctx=canvas.getContext('2d',{alpha:false});
const state={project:null,file:null,url:null,selected:null,view:'upload',uploadPreset:'highlight',undo:[],redo:[],worker:null,job:0,exportType:'video',exporting:false,cancelRender:null,editing:null,lastActive:null,saveTimer:null,toastTimer:null,exportURL:null,storageError:false};
const viewIds={upload:'uploadView',process:'processView',editor:'editorView',projects:'projectsView'};
const langLabels={auto:'Deteksi otomatis',indonesian:'Indonesia',english:'English',japanese:'日本語',chinese:'中文',korean:'한국어',arabic:'العربية',spanish:'Español',french:'Français',german:'Deutsch'};

function toast(message,error=false){clearTimeout(state.toastTimer);$('toast').textContent=message;$('toast').classList.toggle('error',error);$('toast').hidden=false;state.toastTimer=setTimeout(()=>$('toast').hidden=true,error?8500:4500);}
function setView(view){
  state.view=view;
  for(const [key,id] of Object.entries(viewIds))$(id).hidden=key!==view;
  document.body.classList.toggle('is-editor',view==='editor');
  document.querySelector('.stepper').hidden=view==='projects';
  const step=view==='process'?2:view==='editor'?3:1;
  document.querySelectorAll('.step').forEach(el=>{const n=Number(el.dataset.step);el.classList.toggle('active',n===step);el.classList.toggle('done',n<step);el.setAttribute('aria-current',n===step?'step':'false');});
  $('studioNav').classList.toggle('active',view!=='projects');$('projectsNav').classList.toggle('active',view==='projects');
  if(view!=='editor')video.pause();
  window.scrollTo({top:0,behavior:'instant'});
}
function themeToggle(){const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';setTheme(theme);try{localStorage.setItem('lafal-theme',theme);}catch{}}
function setTheme(theme){document.documentElement.dataset.theme=theme;$('themeToggle').innerHTML=icon(theme==='dark'?'sun':'moon');$('themeToggle').setAttribute('aria-label',theme==='dark'?'Aktifkan light mode':'Aktifkan dark mode');document.querySelector('meta[name=theme-color]').content=theme==='dark'?'#131815':'#f7f8f5';}
function presetSample(key){
  if(key==='classic')return '<span>Ceritamu, terbaca.</span>';
  if(key==='minimal')return '<span>Less, but meaningful.</span>';
  if(key==='bold')return 'MAKE IT <span>MATTER.</span>';
  return '<span>Every <b>word</b> matters.</span>';
}
function renderPresets(){
  $('landingPresets').innerHTML=Object.keys(PRESETS).map(key=>`<button class="landing-preset" data-preset="${key}" aria-pressed="${state.uploadPreset===key}"><div class="preset-sample ${key}">${presetSample(key)}</div><div class="preset-name">${PRESET_LABELS[key]}${key==='highlight'?'<small>FAVORIT</small>':''}${icon('arrow')}</div></button>`).join('');
  $('quickPresets').innerHTML=Object.keys(PRESETS).map(key=>`<button class="quick-preset" data-preset="${key}"><span>${key==='highlight'?'Kata <b>per</b> kata':key==='bold'?'Buat berarti.':key==='minimal'?'Sedikit, berarti.':'Ceritamu.'}</span>${PRESET_LABELS[key]}</button>`).join('');
  $('stylePresets').innerHTML=Object.keys(PRESETS).map(key=>`<button class="style-preset" data-preset="${key}"><div class="preset-sample ${key}">${presetSample(key)}</div><div class="preset-name">${PRESET_LABELS[key]}</div></button>`).join('');
  document.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>{
    if(button.classList.contains('landing-preset')){state.uploadPreset=button.dataset.preset;updateLandingPreset();return;}
    applyPreset(button.dataset.preset);
  }));
  updateLandingPreset();
}
function updateLandingPreset(){
  document.querySelectorAll('.landing-preset').forEach(b=>b.setAttribute('aria-pressed',b.dataset.preset===state.uploadPreset));
  const demo=document.querySelector('.example-caption');const s=PRESETS[state.uploadPreset];
  demo.style.fontWeight=s.weight;demo.style.textTransform=s.uppercase?'uppercase':'none';
  demo.style.textShadow=s.outline?'0 2px 5px #0008':'none';
  demo.querySelector('span').style.background=state.uploadPreset==='highlight'?'var(--accent)':'transparent';
  demo.querySelector('span').style.color=state.uploadPreset==='highlight'?'#263022':'#fff';
}
function snapshot(){return {captions:clone(state.project.captions),style:clone(state.project.style),selected:state.selected};}
function pushUndo(){if(!state.project)return;state.undo.push(snapshot());if(state.undo.length>60)state.undo.shift();state.redo=[];updateHistory();}
function commit(change,{list=true,controls=true}={}){if(!state.project||state.exporting)return;pushUndo();change();if(list)renderCaptionList();renderTimeline();if(controls)syncStyleControls();markDirty();}
function updateHistory(){$('undoButton').disabled=!state.undo.length;$('redoButton').disabled=!state.redo.length;}
function undo(redo=false){
  if(state.exporting||!state.project)return;
  const from=redo?state.redo:state.undo,to=redo?state.undo:state.redo;
  if(!from.length)return;to.push(snapshot());const s=from.pop();
  state.project.captions=s.captions;state.project.style=s.style;state.selected=s.selected;
  renderCaptionList();renderTimeline();syncStyleControls();updateHistory();markDirty();
}
function markDirty(){
  if(!state.project)return;
  $('saveStatus').innerHTML=icon('clock')+' Menyimpan…';
  clearTimeout(state.saveTimer);state.saveTimer=setTimeout(saveNow,650);
}
async function saveNow(){
  clearTimeout(state.saveTimer);if(!state.project)return;
  const id=state.project.id;state.project.updatedAt=Date.now();
  try{
    await storage.saveProject(clone(state.project));
    if(state.project?.id===id)$('saveStatus').innerHTML=icon('check')+' Tersimpan di perangkat';
    try{localStorage.setItem('lafal-last-project',id);}catch{}
    state.storageError=false;updateProjectCount();
  }catch(error){
    $('saveStatus').innerHTML=icon('help')+' Belum tersimpan';
    if(!state.storageError)toast('Penyimpanan browser penuh atau tidak tersedia. Ekspor hasilmu sebelum menutup tab.',true);
    state.storageError=true;
  }
}
async function updateProjectCount(){try{$('projectCount').textContent=(await storage.listProjects()).length;}catch{}}
function language(){return $('uploadLanguage').value;}
function processProgress(stage,percent,label,detail){
  const stages=['upload','analyze','compose'],active=stages.indexOf(stage);
  document.querySelectorAll('.process-stage').forEach(el=>{const n=stages.indexOf(el.dataset.stage);el.classList.toggle('active',n===active);el.classList.toggle('complete',n<active);});
  const progress=clamp(Math.round(percent),0,100);$('processProgress').value=progress;$('progressPercent').textContent=progress+'%';$('progressLabel').textContent=label;
  if(detail)$('processDetail').textContent=detail;
}
function readLocalFile(file,onProgress){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onprogress=e=>{if(e.lengthComputable)onProgress(e.loaded/e.total);};reader.onload=()=>resolve(new File([reader.result],file.name,{type:file.type,lastModified:file.lastModified}));reader.onerror=()=>reject(new Error('Video tidak dapat dibaca. Coba pilih ulang file.'));reader.readAsArrayBuffer(file);});}
async function loadVideoFile(file){
  video.pause();if(state.url)URL.revokeObjectURL(state.url);
  state.url=URL.createObjectURL(file);video.src=state.url;video.load();
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{clean();reject(new Error('Metadata video belum dapat dibaca.'));},20000);
    const ok=()=>{clean();resolve();},err=()=>{clean();reject(new Error('Codec video belum didukung oleh browser.'));};
    const clean=()=>{clearTimeout(timer);video.removeEventListener('loadedmetadata',ok);video.removeEventListener('error',err);};
    video.addEventListener('loadedmetadata',ok,{once:true});video.addEventListener('error',err,{once:true});
  });
  if(!Number.isFinite(video.duration)||video.duration<=0||!video.videoWidth)throw new Error('Durasi atau gambar video tidak valid.');
  return {duration:video.duration,width:video.videoWidth,height:video.videoHeight};
}
async function createThumbnail(){
  try{
    if(video.readyState<2)await new Promise(resolve=>{video.addEventListener('loadeddata',resolve,{once:true});setTimeout(resolve,2500);});
    const c=document.createElement('canvas');c.width=480;c.height=Math.round(480*video.videoHeight/video.videoWidth);c.height=Math.min(854,c.height);
    const cx=c.getContext('2d');cx.drawImage(video,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.65);
  }catch{return assetURL('./assets/demo-poster.jpg');}
}
function resetProcessing(filename){
  $('processView').classList.remove('error');$('processingFilename').textContent=filename;
  $('processView').querySelector('h1').innerHTML='Ceritamu sedang<br>menjadi kata.';
  $('processErrorActions')?.remove();$('cancelProcess').hidden=false;
  processProgress('upload',0,'Menyiapkan video…','Video diproses di perangkatmu. Tetap buka tab ini sampai selesai.');setView('process');
}
async function handleFile(file){
  if(!file)return;
  if(state.view==='process'||state.exporting)return toast('Selesaikan atau batalkan proses yang sedang berjalan.');
  const ext=file.name.split('.').pop()?.toLowerCase();
  if(!['mp4','mov','webm'].includes(ext))return toast('Pilih video berformat MP4, MOV, atau WebM.',true);
  if(!file.size)return toast('File video kosong.',true);
  if(file.size>200*1024*1024)return toast('Ukuran maksimal 200 MB. Kompres video atau pilih potongan yang lebih pendek.',true);
  await saveNow();
  state.project=null;state.file=null;
  const job=++state.job;resetProcessing(file.name);
  try{
    let imported=await readLocalFile(file,p=>{if(job===state.job)processProgress('upload',p*12,`Mengunggah ke ruang kerja lokal · ${Math.round(p*100)}%`);});
    if(job!==state.job)return;
    let meta;
    try{meta=await loadVideoFile(imported);}catch{
      processProgress('upload',12,'Menyesuaikan format video…','Codec video ini perlu disesuaikan terlebih dahulu. Proses dapat memerlukan beberapa menit.');
      imported=await normalizeVideo(imported,(p,label)=>{if(job===state.job)processProgress('upload',12+p*5,label);});
      meta=await loadVideoFile(imported);
    }
    if(job!==state.job)return;
    if(meta.duration>600.1)throw new Error('Durasi maksimal 10 menit. Pilih potongan video yang lebih pendek.');
    state.file=imported;state.undo=[];state.redo=[];state.selected=null;
    state.project={id:uid(),title:file.name.replace(/\.[^.]+$/,''),filename:file.name,...meta,language:language(),style:clone(PRESETS[state.uploadPreset]),captions:[],createdAt:Date.now(),updatedAt:Date.now(),demo:false,thumbnail:await createThumbnail(),status:'pending'};
    try{await storage.putMedia(state.project.id,imported);}catch{toast('Video belum bisa disimpan di browser. Proses bisa dilanjutkan; ekspor sebelum menutup tab.',true);}
    await saveNow();
    await generateCaptions(job);
  }catch(error){if(job===state.job)processError(error);}
  finally{$('videoInput').value='';}
}
async function generateCaptions(job){
  const project=state.project;if(!project||!state.file)return;
  processProgress('analyze',18,'Menyiapkan audio…','Ekstraksi audio dan pengenalan ucapan berjalan langsung di perangkatmu.');
  const audio=await extractAudio(state.file,(p,label)=>{if(job===state.job)processProgress('analyze',18+p*12,label);});
  if(job!==state.job)return;
  processProgress('analyze',30,'Menyiapkan Whisper…','Unduhan model sekitar 75 MB pada pemakaian pertama. Setelah itu browser dapat memakai cache.');
  const result=await transcribe(audio,project.language,job);
  if(job!==state.job)return;
  processProgress('compose',96,'Merapi­kan pemenggalan dan jeda…','Maksimal dua baris, ukuran mengikuti video, dan posisi di safe area.');
  project.captions=wordsToCaptions(result.words,project);project.status='ready';
  if(!project.captions.length)toast('Tidak ada ucapan yang terdeteksi. Kamu bisa menambahkan caption atau mengimpor SRT/VTT.');
  state.selected=project.captions[0]?.id??null;
  await saveNow();
  processProgress('compose',100,'Caption siap. Membuka editor…');
  showEditor();
}
function transcribe(audio,language,job){
  if(!state.worker)state.worker=new Worker(new URL('./transcribe-worker.js',import.meta.url),{type:'module'});
  return new Promise((resolve,reject)=>{
    state.worker.onmessage=({data})=>{
      if(job!==state.job)return;
      if(data.type==='download')processProgress('analyze',30,`Mengunduh model · ${(data.loaded/1048576).toFixed(1)} MB`,'Unduhan pertama dapat memerlukan beberapa menit. Video tetap berada di perangkatmu.');
      if(data.type==='status')$('progressLabel').textContent=data.message;
      if(data.type==='progress')processProgress('analyze',32+data.progress*62,`Mengenali ucapan · ${Math.round(data.progress*100)}%`,'Whisper sedang bekerja. Pada video panjang, proses dapat lebih lama dari durasi video.');
      if(data.type==='done')resolve(data);
      if(data.type==='error')reject(new Error(`Whisper belum dapat berjalan. ${data.message.includes('fetch')?'Unduhan model gagal; periksa koneksi internet lalu coba lagi.':data.message.includes('memory')?'Memori tidak cukup; coba video yang lebih pendek dan tutup tab lain.':'Coba ulang atau impor file SRT/VTT ke editor.'}`));
    };
    state.worker.onerror=()=>reject(new Error('Mesin AI gagal dimuat. Periksa koneksi internet, lalu coba ulang. Kamu tetap bisa mengimpor subtitle di editor.'));
    state.worker.postMessage({type:'transcribe',audio,language},[audio.buffer]);
  });
}
function processError(error){
  $('processView').classList.add('error');$('processView').querySelector('h1').innerHTML='Ada jeda kecil<br>dalam prosesnya.';
  $('progressLabel').textContent='Proses terhenti';$('processDetail').textContent=error.message||'Video gagal diproses. Coba pilih ulang file.';
  $('cancelProcess').hidden=true;
  const row=document.createElement('div');row.id='processErrorActions';
  if(state.project&&state.file){const retry=document.createElement('button');retry.className='button primary';retry.textContent='Coba lagi';retry.onclick=retryTranscription;row.append(retry);const editor=document.createElement('button');editor.className='button secondary';editor.textContent='Buka editor';editor.onclick=showEditor;row.append(editor);}
  else{const back=document.createElement('button');back.className='button primary';back.textContent='Pilih video lain';back.onclick=()=>setView('upload');row.append(back);}
  $('processView').append(row);
}
async function retryTranscription(){if(!state.file)return;const job=++state.job;resetProcessing(state.project.filename);try{await generateCaptions(job);}catch(e){if(job===state.job)processError(e);}}
async function cancelProcessing(){++state.job;state.worker?.terminate();state.worker=null;stopMedia();if(state.project&&state.file){await saveNow();showEditor();}else setView('upload');}
function showEditor(){
  if(!state.project)return setView('upload');
  const p=state.project;
  const size=outputSize(p.width,p.height,'original');canvas.width=size.width;canvas.height=size.height;
  $('projectTitle').textContent=p.title;
  $('projectMeta').textContent=`${p.width} × ${p.height} · ${clock(p.duration)} · ${langLabels[p.language]||'Deteksi otomatis'}`;
  $('ratioBadge').textContent=p.width/p.height>1.6?'16:9':p.height/p.width>1.6?'9:16':Math.abs(p.width-p.height)<p.width*.05?'1:1':`${p.width}:${p.height}`;
  $('totalTime').textContent=clock(p.duration);$('videoSeek').max=p.duration;$('timelineDuration').textContent=clock(p.duration);$('timelineMiddle').textContent=clock(p.duration/2);$('timelineEnd').textContent=clock(p.duration);$('demoBadge').hidden=!p.demo;
  renderCaptionList();renderTimeline();syncStyleControls();updateHistory();setPanel('text');setView('editor');
  if(video.currentTime>=p.duration-.1)video.currentTime=0;
  updatePlayer();requestAnimationFrame(updateSafeArea);
  try{localStorage.setItem('lafal-last-project',p.id);}catch{}
}
async function demoProject(){
  if(state.view==='process'||state.exporting)return;
  const button=$('demoButton');button.disabled=true;
  try{
    await saveNow();
    const [mediaResponse,captionsResponse]=await Promise.all([fetch(assetURL('./assets/demo.mp4')),fetch(assetURL('./assets/demo-captions.json'))]);
    if(!mediaResponse.ok||!captionsResponse.ok)throw new Error('Contoh belum dapat dimuat.');
    const file=new File([await mediaResponse.blob()],'Every story.mp4',{type:'video/mp4'}),cues=await captionsResponse.json();
    const meta=await loadVideoFile(file);state.file=file;state.undo=[];state.redo=[];
    state.project={id:uid(),title:'Every story deserves to be heard',filename:'Every story.mp4',...meta,language:'english',style:clone(PRESETS[state.uploadPreset]),captions:cues.map(c=>({...c,id:uid(),words:distributeWords(c.text,c.start,c.end)})),demo:true,createdAt:Date.now(),updatedAt:Date.now(),thumbnail:assetURL('./assets/demo-poster.jpg'),status:'ready'};
    state.selected=state.project.captions[0].id;
    try{await storage.putMedia(state.project.id,file);await saveNow();}catch{toast('Contoh dibuka, tetapi autosave belum tersedia.',true);}
    showEditor();video.currentTime=state.project.captions[0].start+.8;
    toast('Proyek contoh dengan caption yang sudah disiapkan. Upload videomu untuk mencoba Whisper.');
  }catch(error){toast(error.message,true);}finally{button.disabled=false;}
}
function effectiveStyle(){return {...state.project?.style,...state.project?.captions.find(c=>c.id===state.selected)?.style};}
function syncStyleControls(){
  if(!state.project)return;const s=effectiveStyle();
  const values={fontFamily:s.font,fontSize:s.size,textColor:s.color,highlightColor:s.highlight,outline:s.outline,backgroundOpacity:s.background,position:s.position,animation:s.animation};
  for(const [id,v] of Object.entries(values))$(id).value=v;
  $('shadow').checked=s.shadow;$('fontSizeValue').textContent=`${Number(s.size).toFixed(1)}% tinggi video`;$('outlineValue').textContent=s.outline+'%';$('backgroundValue').textContent=s.background+'%';
  document.querySelectorAll('.quick-preset,.style-preset').forEach(b=>{const selected=b.dataset.preset===s.preset;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',selected);});
  $('styleScopeHint').textContent=$('applyAll').checked?'Perubahan langsung terlihat di semua caption.':'Perubahan hanya untuk caption yang dipilih.';
}
function changeStyle(patch){
  if(!state.project)return;
  commit(()=>{
    if($('applyAll').checked){state.project.style={...state.project.style,...patch};for(const c of state.project.captions){if(c.style){c.style={...c.style,...patch};}}}
    else{const c=state.project.captions.find(c=>c.id===state.selected);if(c)c.style={...effectiveStyle(),...patch};}
  },{list:false});
}
function applyPreset(key){changeStyle(clone(PRESETS[key]));}
function setPanel(panel){const text=panel==='text';$('textPanel').hidden=!text;$('stylePanel').hidden=text;$('textTab').classList.toggle('active',text);$('styleTab').classList.toggle('active',!text);$('textTab').setAttribute('aria-selected',text);$('styleTab').setAttribute('aria-selected',!text);}
function metricsMarkup(c){
  const m=captionMetrics(c,state.project.width,state.project.height);
  return `<span class="${m.warnings.length?'caption-warning':''}" title="${esc(m.warnings.join(' · '))}">${m.warnings.length?'◦ '+esc(m.warnings[0]):`${m.lines.length} baris · ${cleanText(c.text).length} karakter`}</span><span title="Kecepatan baca">${m.duration.toFixed(1)} dtk · ${Math.round(m.cps)} kar/dtk</span>`;
}
function renderCaptionList(){
  if(!state.project)return;
  const p=state.project,q=$('captionSearch').value.toLocaleLowerCase();
  const filtered=p.captions.filter(c=>c.text.toLocaleLowerCase().includes(q));$('captionCount').textContent=p.captions.length;
  if(!filtered.length){$('captionList').innerHTML=q?'<div class="empty-captions">Kata ini belum ditemukan.<br>Coba pencarian lain.</div>':`<div class="empty-captions">Belum ada caption.<br>Tambahkan teks, impor SRT/VTT,<br>atau coba transkripsi lagi.<br><button id="retryFromEditor" class="button secondary" style="margin-top:20px">${icon('spark')} Generate caption</button></div>`;$('retryFromEditor')?.addEventListener('click',retryTranscription);return;}
  $('captionList').innerHTML=filtered.map(c=>`<article class="caption-item ${c.id===state.selected?'selected':''}" data-id="${c.id}" tabindex="0" aria-label="Caption ${p.captions.indexOf(c)+1}"><div class="caption-item-top"><span class="caption-index">${String(p.captions.indexOf(c)+1).padStart(2,'0')}</span><input class="caption-time-input" data-time="start" aria-label="Waktu mulai caption ${p.captions.indexOf(c)+1}" value="${clock(c.start,true)}"><span class="time-separator">→</span><input class="caption-time-input" data-time="end" aria-label="Waktu akhir caption ${p.captions.indexOf(c)+1}" value="${clock(c.end,true)}"><button class="caption-delete icon-button" data-delete="${c.id}" aria-label="Hapus caption ${p.captions.indexOf(c)+1}">${icon('trash')}</button></div><textarea rows="2" spellcheck="false" aria-label="Teks caption ${p.captions.indexOf(c)+1}" maxlength="700">${esc(c.text)}</textarea><div class="caption-metrics">${metricsMarkup(c)}</div></article>`).join('');
  $('captionList').querySelectorAll('textarea').forEach(ta=>{ta.style.height='auto';ta.style.height=Math.max(40,ta.scrollHeight)+'px';});
}
function renderTimeline(){
  if(!state.project)return;
  const p=state.project;
  $('captionTimeline').innerHTML=p.captions.map(c=>`<button class="timeline-segment ${c.id===state.selected?'active':''}" data-id="${c.id}" style="left:${c.start/p.duration*100}%;width:${(c.end-c.start)/p.duration*100}%" title="${esc(c.text)}" aria-label="Lompat ke ${esc(c.text)}">${esc(c.text)}</button>`).join('')+'<span class="timeline-playhead" id="timelinePlayhead"></span>';
}
function selectCaption(id,seek=true){
  if(state.exporting)return;const c=state.project?.captions.find(c=>c.id===id);if(!c)return;
  state.selected=id;
  $('captionList').querySelectorAll('.caption-item').forEach(row=>row.classList.toggle('selected',row.dataset.id===id));
  $('captionTimeline').querySelectorAll('.timeline-segment').forEach(row=>row.classList.toggle('active',row.dataset.id===id));
  if(seek)video.currentTime=c.start+.001;
  syncStyleControls();
}
function addCaption(){
  if(!state.project)return;const p=state.project,time=video.currentTime;
  const sorted=[...p.captions].sort((a,b)=>a.start-b.start);const gaps=[];let last=0;
  for(const c of sorted){if(c.start-last>=1)gaps.push([last,c.start-.03]);last=Math.max(last,c.end+.03);}
  if(p.duration-last>=.5)gaps.push([last,p.duration]);
  const gap=gaps.find(([a,b])=>b-a>=1&&b>time)||gaps.find(([a,b])=>b-a>=.5);
  if(!gap)return toast('Tidak ada jeda kosong. Sesuaikan waktu caption yang ada terlebih dahulu.');
  const start=clamp(time,gap[0],gap[1]-.5),end=Math.min(gap[1],start+3),text='Caption baru';
  const c={id:uid(),start,end,text,words:distributeWords(text,start,end)};
  commit(()=>{p.captions.push(c);p.captions.sort((a,b)=>a.start-b.start);state.selected=c.id;});setPanel('text');video.currentTime=start;
  const row=$('captionList').querySelector(`[data-id="${c.id}"]`);row?.scrollIntoView({block:'nearest'});row?.querySelector('textarea').focus();row?.querySelector('textarea').select();
}
function tidyAll(){
  if(!state.project?.captions.length)return;
  commit(()=>{const before=state.project.captions;state.project.captions=tidyCaptions(before,state.project).map(c=>{const origin=before.find(o=>c.start>=o.start&&c.start<o.end);return origin?.style?{...c,style:clone(origin.style)}:c;});state.selected=state.project.captions[0]?.id;});
  toast('Pemenggalan dan durasi dirapikan. Periksa tanda pada caption yang masih terlalu cepat.');
}
async function importSubtitle(file){
  if(!file||!state.project)return;
  if(file.size>2*1024*1024)return toast('File subtitle maksimal 2 MB.',true);
  try{const captions=parseSubtitles(await file.text(),state.project.duration);if(!captions.length)throw new Error('Waktu caption tidak ditemukan. Pilih SRT/VTT yang sesuai dengan durasi video.');
    commit(()=>{state.project.captions=captions;state.selected=captions[0].id;state.project.status='ready';});toast(`${captions.length} caption berhasil diimpor.`);
  }catch(error){toast(error.message,true);}finally{$('subtitleInput').value='';}
}
function updatePlayer(){
  if(!state.project||state.view!=='editor')return;
  const time=video.currentTime||0;$('currentTime').textContent=clock(time);$('videoSeek').value=time;
  $('playButton').innerHTML=icon(video.paused?'play':'pause');$('playButton').setAttribute('aria-label',video.paused?'Putar':'Jeda');
  $('videoStage').classList.toggle('paused',video.paused);$('videoStage').classList.toggle('playing',!video.paused);
  const head=$('timelinePlayhead');if(head)head.style.left=`${time/state.project.duration*100}%`;
  const current=activeCaption(state.project.captions,time);
  if(!video.paused&&current?.id!==state.lastActive){state.lastActive=current?.id;
    if(current&&!$('captionList').contains(document.activeElement)){
      selectCaption(current.id,false);
      const row=$('captionList').querySelector(`[data-id="${current.id}"]`);
      if(row){const list=$('captionList');if(row.offsetTop-list.offsetTop<list.scrollTop||row.offsetTop-list.offsetTop+row.offsetHeight>list.scrollTop+list.clientHeight)list.scrollTo({top:row.offsetTop-list.offsetTop-24,behavior:'smooth'});}
    }
  }
}
function frameLoop(){
  if(state.project&&state.view==='editor'&&video.readyState>=2){drawFrame(ctx,canvas.width,canvas.height,video,state.project.captions,video.currentTime,state.project.style);updatePlayer();}
  requestAnimationFrame(frameLoop);
}
async function togglePlay(){if(state.view!=='editor'||state.exporting)return;try{if(video.paused){if(video.currentTime>=video.duration-.05)video.currentTime=0;await video.play();}else video.pause();}catch{toast('Video belum dapat diputar. Coba ulang atau pilih format MP4 H.264.',true);}}
function updateSafeArea(){const c=canvas.getBoundingClientRect(),stage=$('videoStage').getBoundingClientRect(),guide=$('safeAreaGuide');guide.style.left=(c.left-stage.left+c.width*.05)+'px';guide.style.top=(c.top-stage.top+c.height*.1)+'px';guide.style.width=c.width*.9+'px';guide.style.height=c.height*.8+'px';}
async function openProject(id){
  if(state.view==='process'||state.exporting)return;
  await saveNow();
  try{
    const [project,file]=await Promise.all([storage.getProject(id),storage.getMedia(id)]);
    if(!project||!file)throw new Error('Video proyek ini tidak tersedia di browser. Pilih ulang video untuk membuat proyek baru.');
    await loadVideoFile(file);state.project=project;state.file=file;state.selected=project.captions[0]?.id;state.undo=[];state.redo=[];showEditor();video.currentTime=project.captions[0]?.start??0;
  }catch(error){toast(error.message,true);setView('upload');}
}
async function showProjects(){
  if(state.view==='process')return toast('Selesaikan atau batalkan transkripsi terlebih dahulu.');
  if(state.exporting)return toast('Selesaikan ekspor terlebih dahulu.');
  await saveNow();setView('projects');
  try{
    const projects=await storage.listProjects();$('projectCount').textContent=projects.length;
    $('projectsList').innerHTML=projects.length?projects.map(p=>`<article class="project-card"><button class="project-card-open" data-open-project="${p.id}"><img src="${esc(p.thumbnail||assetURL('./assets/demo-poster.jpg'))}" alt="" loading="lazy"><span class="project-card-body"><strong>${esc(p.title)}</strong><small>${clock(p.duration)} · ${p.captions.length} caption · ${new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(p.updatedAt)}</small></span></button><button class="icon-button delete-project" data-delete-project="${p.id}" aria-label="Hapus proyek ${esc(p.title)}">${icon('trash')}</button></article>`).join(''):`<div class="projects-empty">${icon('folder')}<h3>Cerita pertamamu menunggu.</h3><p>Upload video, dan proyekmu akan tersimpan di sini.</p><button id="emptyNewProject" class="button primary">Mulai dengan video ${icon('arrow')}</button></div>`;
    $('emptyNewProject')?.addEventListener('click',()=>setView('upload'));
  }catch{$('projectsList').innerHTML='<div class="projects-empty">Penyimpanan lokal belum tersedia. Izinkan penyimpanan browser untuk mengaktifkan autosave.</div>';}
}
function openExport(){
  if(!state.project)return;
  video.pause();state.exportType='video';$('exportOptions').hidden=false;$('exportProgressView').hidden=true;$('exportClose').disabled=false;
  $('exportSummary').textContent=`${state.project.captions.length} caption · ${clock(state.project.duration)} · ${$('ratioBadge').textContent}`;
  chooseExport('video');$('exportDialog').showModal();
}
function chooseExport(type){state.exportType=type;document.querySelectorAll('[data-export]').forEach(b=>b.classList.toggle('active',b.dataset.export===type));$('videoExportOptions').hidden=type!=='video';$('subtitleExportOptions').hidden=type!=='subtitle';$('startExport').innerHTML=icon('download')+(type==='video'?' Export video':' Export subtitle');}
function exportProgress(p,label){const value=Math.round(clamp(p,0,1)*100);$('exportProgress').value=value;$('exportProgressPercent').textContent=value+'%';$('exportProgressLabel').textContent=label;}
function downloadReady(blob,filename){
  if(state.exportURL)URL.revokeObjectURL(state.exportURL);state.exportURL=URL.createObjectURL(blob);
  $('exportStateIcon').innerHTML=icon('check');$('exportStateTitle').textContent='Ceritamu siap dibagikan.';$('exportStateDescription').textContent=`${filename} · ${(blob.size/1048576).toFixed(1)} MB`;
  exportProgress(1,'Selesai');$('downloadButton').href=state.exportURL;$('downloadButton').download=filename;$('downloadButton').hidden=false;$('cancelExport').hidden=true;$('exportAgain').hidden=false;$('exportClose').disabled=false;
}
async function startExport(){
  if(state.exporting||!state.project)return;
  if(!state.project.captions.some(c=>cleanText(c.text)))return toast('Tambahkan setidaknya satu caption untuk diekspor.',true);
  await saveNow();
  $('exportOptions').hidden=true;$('exportProgressView').hidden=false;$('downloadButton').hidden=true;$('exportAgain').hidden=true;$('cancelExport').hidden=false;$('exportClose').disabled=true;$('exportStateIcon').innerHTML=icon(state.exportType==='video'?'video':'file');$('exportStateTitle').textContent='Menyatukan ceritamu…';$('exportStateDescription').textContent='Menyiapkan hasil ekspor.';exportProgress(0,'Menyiapkan…');
  const base=state.project.title.replace(/[<>:"/\\|?*\x00-\x1F]/g,'_').slice(0,100)||'Lafal';
  try{
    if(state.exportType==='subtitle'){
      const format=$('subtitleFormat').value,text=exportSubtitles(state.project.captions,format,state.project);
      downloadReady(new Blob([format==='srt'?'\uFEFF'+text:text],{type:format==='vtt'?'text/vtt;charset=utf-8':'text/plain;charset=utf-8'}),`${base}.${format}`);return;
    }
    if(typeof MediaRecorder==='undefined'||!HTMLCanvasElement.prototype.captureStream)throw new Error('Browser ini belum mendukung ekspor video. Gunakan Chrome/Edge terbaru, atau ekspor SRT/VTT.');
    state.exporting=true;$('editorView').setAttribute('inert','');$('exportStateDescription').textContent='Jangan tutup tab. Audio dan caption ikut disimpan.';
    const blob=await renderVideo($('exportResolution').value);
    downloadReady(blob,`${base}_caption.mp4`);
  }catch(error){
    $('exportClose').disabled=false;$('cancelExport').hidden=true;$('exportAgain').hidden=false;
    if(error.name==='AbortError'){$('exportStateTitle').textContent='Ekspor dibatalkan.';$('exportStateDescription').textContent='Proyek dan perubahanmu tetap tersimpan.';}
    else{$('exportStateTitle').textContent='Ekspor belum berhasil.';$('exportStateDescription').textContent=error.message||String(error)||'Coba ulang dengan resolusi lebih rendah.';}
    $('exportStateIcon').innerHTML=icon('help');
  }finally{state.exporting=false;state.cancelRender=null;$('editorView').removeAttribute('inert');}
}
async function renderVideo(resolution){
  const project=clone(state.project),url=state.url;
  const source=document.createElement('video');source.playsInline=true;source.preload='auto';source.src=url;
  const Context=window.AudioContext||window.webkitAudioContext;
  if(!Context)throw new Error('Web Audio belum tersedia. Gunakan browser desktop terbaru.');
  const audioContext=new Context();await audioContext.resume();
  const dest=audioContext.createMediaStreamDestination(),audioSource=audioContext.createMediaElementSource(source);audioSource.connect(dest);
  const out=document.createElement('canvas'),dimensions=outputSize(project.width,project.height,resolution);out.width=dimensions.width;out.height=dimensions.height;
  const context=out.getContext('2d',{alpha:false});let stream,recorder,raf,timer,aborted=false,cleanupVisibility=()=>{};
  let abortReject;const abortPromise=new Promise((_,reject)=>{abortReject=reject;});
  state.cancelRender=()=>{aborted=true;abortReject(new DOMException('Ekspor dibatalkan','AbortError'));};
  const ready=new Promise((resolve,reject)=>{source.onloadeddata=resolve;source.onerror=()=>reject(new Error('Video sumber tidak dapat dibaca untuk ekspor.'));timer=setTimeout(()=>reject(new Error('Video terlalu lama dimuat. Coba ulang ekspor.')),20000);});
  source.load();
  try{
    await Promise.race([ready,abortPromise]);clearTimeout(timer);await document.fonts.ready;
    const mimeTypes=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4;codecs=avc1.42001f,mp4a.40.2','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4'];
    const mime=mimeTypes.find(type=>MediaRecorder.isTypeSupported(type));if(!mime)throw new Error('Codec ekspor tidak tersedia. Gunakan Chrome/Edge terbaru.');
    const needsConversion=!mime.includes('avc1');
    stream=out.captureStream(0);const captureTrack=stream.getVideoTracks()[0];
    for(const track of dest.stream.getAudioTracks())stream.addTrack(track);
    const chunks=[];
    recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:Math.max(2500000,dimensions.width*dimensions.height*4),audioBitsPerSecond:192000});
    const finished=new Promise((resolve,reject)=>{
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onerror=e=>reject(new Error(e.error?.message||'Perekaman video gagal.'));
      recorder.onstop=()=>resolve(new Blob(chunks,{type:mime}));
      source.onended=()=>{drawFrame(context,out.width,out.height,source,project.captions,Math.min(source.currentTime,project.duration),project.style);captureTrack.requestFrame();if(recorder.state!=='inactive')recorder.stop();};
      source.onerror=()=>reject(new Error('Video gagal diputar saat ekspor. Coba codec H.264/AAC.'));
    });
    function paint(){
      if(aborted)return;
      drawFrame(context,out.width,out.height,source,project.captions,source.currentTime,project.style);
      captureTrack.requestFrame();
      exportProgress(Math.min(.98,source.currentTime/project.duration)*(needsConversion?.78:1),`Merender video · ${clock(source.currentTime)} / ${clock(project.duration)}`);
      raf=setTimeout(paint,1000/30);
    }
    drawFrame(context,out.width,out.height,source,project.captions,0,project.style);
    const onVisibility=()=>{
      if(document.hidden&&recorder.state==='recording'){source.pause();recorder.pause();$('exportStateDescription').textContent='Ekspor dijeda. Kembali ke tab ini untuk melanjutkan.';}
      else if(!document.hidden&&recorder.state==='paused'){recorder.resume();source.play().catch(()=>{});$('exportStateDescription').textContent='Ekspor dilanjutkan. Biarkan tab ini tetap terbuka.';}
    };
    document.addEventListener('visibilitychange',onVisibility);cleanupVisibility=()=>document.removeEventListener('visibilitychange',onVisibility);
    recorder.start(500);paint();await source.play();
    let blob=await Promise.race([finished,abortPromise]);clearTimeout(raf);
    if(!blob.size)throw new Error('Hasil video kosong. Coba ulang dengan resolusi yang lebih rendah.');
    source.pause();audioSource.disconnect();await audioContext.close();
    if(needsConversion){
      $('exportStateDescription').textContent='Video selesai dirender. Sedang mengemas MP4…';
      const previousCancel=state.cancelRender;state.cancelRender=()=>{previousCancel();stopMedia();};
      blob=await Promise.race([convertToMP4(blob,(p,label)=>exportProgress(.78+p*.21,label),project.duration),abortPromise]);
    }
    return blob;
  }finally{
    clearTimeout(timer);clearTimeout(raf);cleanupVisibility();source.pause();
    if(recorder&&recorder.state!=='inactive')recorder.stop();stream?.getTracks().forEach(t=>t.stop());
    try{audioSource.disconnect();if(audioContext.state!=='closed')await audioContext.close();}catch{}
    source.removeAttribute('src');source.load();
  }
}

// Event bindings stay attached once; caption rows are rendered from project state.
$('themeToggle').addEventListener('click',themeToggle);$('helpButton').onclick=()=>$('helpDialog').showModal();
document.querySelector('.brand').onclick=e=>{e.preventDefault();if(state.view==='process'||state.exporting)return toast('Selesaikan atau batalkan proses terlebih dahulu.');saveNow();setView('upload');};
$('studioNav').onclick=()=>{if(state.view==='process'||state.exporting)return;if(state.project&&state.file)showEditor();else setView('upload');};$('projectsNav').onclick=showProjects;
$('dropzone').onclick=()=>$('videoInput').click();$('dropzone').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('videoInput').click();}};
for(const type of ['dragenter','dragover'])$('dropzone').addEventListener(type,e=>{e.preventDefault();$('dropzone').classList.add('drag-over');});
for(const type of ['dragleave','drop'])$('dropzone').addEventListener(type,e=>{e.preventDefault();$('dropzone').classList.remove('drag-over');});
$('dropzone').addEventListener('drop',e=>{if(e.dataTransfer.files.length>1)toast('Satu video dulu. Video pertama akan diproses.');handleFile(e.dataTransfer.files[0]);});
window.addEventListener('dragover',e=>e.preventDefault());window.addEventListener('drop',e=>e.preventDefault());
$('videoInput').onchange=e=>handleFile(e.target.files[0]);$('demoButton').onclick=demoProject;$('demoPlay').onclick=demoProject;
$('uploadLanguage').onchange=()=>{try{localStorage.setItem('lafal-language',language());}catch{}};
$('cancelProcess').onclick=cancelProcessing;
$('backButton').onclick=async()=>{if(state.exporting)return;await saveNow();try{localStorage.removeItem('lafal-last-project');}catch{}setView('upload');};
$('newProject').onclick=()=>{try{localStorage.removeItem('lafal-last-project');}catch{}setView('upload');};
$('undoButton').onclick=()=>undo();$('redoButton').onclick=()=>undo(true);$('textTab').onclick=()=>setPanel('text');$('styleTab').onclick=()=>setPanel('style');$('customizeButton').onclick=()=>{setPanel('style');if(innerWidth<=800)document.querySelector('.caption-panel').scrollIntoView({block:'start',behavior:'smooth'});};
$('captionSearch').oninput=renderCaptionList;$('addCaption').onclick=addCaption;$('tidyButton').onclick=tidyAll;$('importSubtitle').onclick=()=>$('subtitleInput').click();$('subtitleInput').onchange=e=>importSubtitle(e.target.files[0]);
$('captionList').addEventListener('click',e=>{
  const row=e.target.closest('.caption-item');if(!row)return;
  const del=e.target.closest('[data-delete]');if(del){e.stopPropagation();commit(()=>{state.project.captions=state.project.captions.filter(c=>c.id!==del.dataset.delete);if(state.selected===del.dataset.delete)state.selected=state.project.captions[0]?.id;});return;}
  if(e.target.matches('[data-time]'))return;
  selectCaption(row.dataset.id,e.target.tagName!=='TEXTAREA'||state.selected!==row.dataset.id);
});
$('captionList').addEventListener('keydown',e=>{if(e.target.classList.contains('caption-item')&&e.key==='Enter')selectCaption(e.target.dataset.id);});
$('captionList').addEventListener('focusin',e=>{if(e.target.tagName==='TEXTAREA')state.editing=null;});
$('captionList').addEventListener('input',e=>{
  if(e.target.tagName!=='TEXTAREA'||!state.project)return;
  const row=e.target.closest('.caption-item'),c=state.project.captions.find(c=>c.id===row.dataset.id);if(!c)return;
  if(state.editing!==c.id){pushUndo();state.editing=c.id;}
  c.text=e.target.value.replace(/\n/g,' ');c.words=distributeWords(c.text,c.start,c.end);c.timingEdited=true;
  e.target.style.height='auto';e.target.style.height=Math.max(40,e.target.scrollHeight)+'px';row.querySelector('.caption-metrics').innerHTML=metricsMarkup(c);renderTimeline();markDirty();
});
$('captionList').addEventListener('focusout',e=>{if(e.target.tagName==='TEXTAREA')state.editing=null;});
$('captionList').addEventListener('change',e=>{
  if(!e.target.matches('[data-time]'))return;const row=e.target.closest('.caption-item'),c=state.project.captions.find(c=>c.id===row.dataset.id),key=e.target.dataset.time,n=parseTime(e.target.value);
  if(!Number.isFinite(n)||n<0||n>state.project.duration||(key==='start'?n>=c.end:n<=c.start)){e.target.value=clock(c[key],true);return toast('Gunakan waktu yang valid, misalnya 00:03.500. Akhir harus setelah awal dan di dalam durasi video.',true);}
  commit(()=>{c[key]=n;c.words=distributeWords(c.text,c.start,c.end);c.timingEdited=true;state.project.captions.sort((a,b)=>a.start-b.start);});
});
$('captionTimeline').addEventListener('click',e=>{const button=e.target.closest('[data-id]');if(button)selectCaption(button.dataset.id);else if(state.project){const r=e.currentTarget.getBoundingClientRect();video.currentTime=clamp((e.clientX-r.left)/r.width*state.project.duration,0,state.project.duration);}});
const styleBindings={fontFamily:['font',String],fontSize:['size',Number],textColor:['color',String],highlightColor:['highlight',String],outline:['outline',Number],backgroundOpacity:['background',Number],position:['position',String],animation:['animation',String]};
for(const [id,[key,convert]] of Object.entries(styleBindings)){
  $(id).addEventListener('input',e=>changeStyle({[key]:convert(e.target.value),preset:'custom'}));
}
$('shadow').onchange=e=>changeStyle({shadow:e.target.checked,preset:'custom'});$('applyAll').onchange=syncStyleControls;
$('applyStyleAll').onclick=()=>{if(!state.project)return;const style=effectiveStyle();commit(()=>{state.project.style=clone(style);state.project.captions.forEach(c=>delete c.style);});$('applyAll').checked=true;syncStyleControls();toast('Gaya yang dipilih diterapkan ke semua caption.');};
$('playButton').onclick=togglePlay;$('stagePlay').onclick=togglePlay;canvas.onclick=togglePlay;$('videoSeek').oninput=e=>{video.currentTime=Number(e.target.value);};$('muteButton').onclick=()=>{video.muted=!video.muted;$('muteButton').style.opacity=video.muted?.4:1;$('muteButton').setAttribute('aria-label',video.muted?'Aktifkan audio':'Bisukan audio');};
$('fullscreenButton').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('videoStage').requestFullscreen();}catch{toast('Layar penuh belum didukung browser ini.');}};
$('safeAreaButton').onclick=()=>{$('safeAreaGuide').hidden=!$('safeAreaGuide').hidden;$('safeAreaButton').setAttribute('aria-pressed',!$('safeAreaGuide').hidden);updateSafeArea();};
new ResizeObserver(updateSafeArea).observe($('videoStage'));document.addEventListener('fullscreenchange',()=>requestAnimationFrame(updateSafeArea));
video.addEventListener('play',updatePlayer);video.addEventListener('pause',updatePlayer);video.addEventListener('seeked',updatePlayer);
$('projectsList').addEventListener('click',async e=>{
  const open=e.target.closest('[data-open-project]');if(open)return openProject(open.dataset.openProject);
  const del=e.target.closest('[data-delete-project]');if(del){const id=del.dataset.deleteProject;try{await storage.deleteProject(id);if(state.project?.id===id){state.project=null;state.file=null;try{localStorage.removeItem('lafal-last-project');}catch{}}await showProjects();toast('Proyek dihapus dari perangkat.');}catch{toast('Proyek belum dapat dihapus.',true);}}
});
$('exportButton').onclick=openExport;document.querySelectorAll('[data-export]').forEach(b=>b.onclick=()=>chooseExport(b.dataset.export));$('startExport').onclick=startExport;$('cancelExport').onclick=()=>state.cancelRender?.();$('exportAgain').onclick=()=>{$('exportOptions').hidden=false;$('exportProgressView').hidden=true;};
$('exportDialog').addEventListener('cancel',e=>{if(state.exporting){e.preventDefault();toast('Gunakan Batalkan ekspor untuk menghentikan render.');}});
document.addEventListener('keydown',e=>{
  if(e.target.matches('input,textarea,select,[contenteditable=true]')||document.querySelector('dialog[open]'))return;
  if(state.view==='editor'){
    if(e.code==='Space'){e.preventDefault();togglePlay();}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo(e.shiftKey);}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();undo(true);}
  }
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.project)saveNow();});
window.addEventListener('pagehide',()=>saveNow());

async function init(){
  try{setTheme(localStorage.getItem('lafal-theme')||'light');const lang=localStorage.getItem('lafal-language');if(lang&&langLabels[lang])$('uploadLanguage').value=lang;}catch{}
  renderPresets();updateProjectCount();frameLoop();
  try{const id=localStorage.getItem('lafal-last-project');if(id){const p=await storage.getProject(id);if(p?.captions.length)await openProject(id);}}
  catch{}
}
init();
