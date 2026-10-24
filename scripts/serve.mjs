import http from 'node:http';
import path from 'node:path';
import {stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';

const defaultRoot=fileURLToPath(new URL('../dist/',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.wasm':'application/wasm','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.mp4':'video/mp4','.webm':'video/webm','.txt':'text/plain; charset=utf-8'};

export function createPreviewServer({root=defaultRoot,basePath='/'}={}){
  const directory=path.resolve(root);
  const base='/'+basePath.split('/').filter(Boolean).join('/')+(basePath.split('/').filter(Boolean).length?'/':'');
  return http.createServer(async(req,res)=>{
    try{
      if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'}).end();return;}
      const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      if((pathname==='/'&&base!=='/')||pathname===base.slice(0,-1)){
        res.writeHead(302,{'Location':base});res.end();return;
      }
      if(!pathname.startsWith(base)){res.writeHead(404).end('Not found');return;}
      const relative=pathname.slice(base.length)||'index.html';
      let file=path.resolve(directory,relative);
      if(file!==directory&&!file.startsWith(directory+path.sep)){res.writeHead(403).end('Forbidden');return;}
      let info=await stat(file);
      if(info.isDirectory()){file=path.join(file,'index.html');info=await stat(file);}
      if(!info.isFile()){res.writeHead(404).end('Not found');return;}
      const headers={'Content-Type':mime[path.extname(file).toLowerCase()]||'application/octet-stream','Accept-Ranges':'bytes','Cache-Control':'no-cache'};
      let start=0,end=info.size-1,status=200;
      if(req.headers.range){
        const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if(!match||(!match[1]&&!match[2])){res.writeHead(416,{'Content-Range':`bytes */${info.size}`}).end();return;}
        if(!match[1])start=Math.max(0,info.size-Number(match[2]));
        else{start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}
        if(start>end||start>=info.size){res.writeHead(416,{'Content-Range':`bytes */${info.size}`}).end();return;}
        status=206;headers['Content-Range']=`bytes ${start}-${end}/${info.size}`;
      }
      headers['Content-Length']=String(info.size?end-start+1:0);
      res.writeHead(status,headers);
      if(req.method==='HEAD'||info.size===0){res.end();return;}
      const stream=createReadStream(file,{start,end});stream.on('error',()=>res.destroy());stream.pipe(res);
    }catch(error){if(!res.headersSent)res.writeHead(error.code==='ENOENT'?404:400);res.end('File tidak tersedia.');}
  });
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const args=process.argv.slice(2),value=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
  const port=Number(value('--port','5173')),basePath=value('--base','/');
  if(!Number.isInteger(port)||port<1||port>65535){console.error('Gunakan --port dengan angka 1 sampai 65535.');process.exit(1);}
  const server=createPreviewServer({basePath});
  server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`Port ${port} sedang dipakai. Coba: npm run dev -- --port 5174`:error.message);process.exit(1);});
  server.listen(port,'127.0.0.1',()=>{
    const suffix='/'+basePath.split('/').filter(Boolean).join('/')+(basePath.split('/').filter(Boolean).length?'/':'');
    console.log(`Lafal Studio: http://localhost:${port}${suffix}`);
    console.log('Tekan Ctrl+C untuk menutup server lokal.');
  });
}
