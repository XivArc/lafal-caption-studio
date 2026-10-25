export function aiFailure(message,phase='model'){
  const raw=String(message||'Unknown AI error');
  if(/memory|allocation|out of bounds|out of memory/i.test(raw))return {code:'AI_MEMORY',title:'Not enough memory for speech recognition.',help:'Close other tabs and try a shorter clip. Your original video is unchanged.',raw,phase};
  if(/fetch|network|download|HTTP|ERR_|timeout|connection|offline/i.test(raw))return {code:'AI_DOWNLOAD',title:'The speech model could not be downloaded.',help:'Check your connection and whether your browser or network blocks huggingface.co. Choose Try again to download a fresh model.',raw,phase};
  if(/wasm|WebAssembly|backend|SIMD|CompileError|LinkError|instantiate/i.test(raw))return {code:'AI_RUNTIME',title:'The speech engine could not start.',help:'Try again to restart the engine. Use an up-to-date Chrome or Edge browser with WebAssembly enabled.',raw,phase};
  if(/alignment|timestamp/i.test(raw))return {code:'AI_TIMING',title:'Whisper could not align the words.',help:'Try again. You can also open the editor and import subtitles while keeping this video.',raw,phase};
  return {code:'AI_TRANSCRIPTION',title:'Whisper could not complete speech recognition.',help:'Try again to restart with a fresh model. Technical details below show the original error.',raw,phase};
}
