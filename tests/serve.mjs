// Servidor estático mínimo: sirve ROOT como Netlify (index.html en carpetas, 404 si no existe).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = path.resolve(process.argv[2] || '.'); const PORT = +process.argv[3] || 8787;
const T = {'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.ico':'image/x-icon','.xml':'application/xml','.txt':'text/plain','.mp4':'video/mp4','.webm':'video/webm','.svg':'image/svg+xml'};
http.createServer((req,res)=>{
  let p = decodeURIComponent(new URL(req.url,'http://x').pathname);
  let f = path.join(ROOT,p);
  if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) {
    if (!p.endsWith('/')) { res.writeHead(301,{Location:p+'/'}); return res.end(); }
    f = path.join(f,'index.html');
  }
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end('404'); }
  const tipo=T[path.extname(f)]||'application/octet-stream', size=fs.statSync(f).size;
  // Rangos de bytes (como Netlify): Safari no reproduce un video si el servidor no responde 206 a "Range"
  const m=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range||'');
  if (m) {
    let a=m[1]===''?size-+m[2]:+m[1], b=m[1]!==''&&m[2]!==''?+m[2]:size-1;
    if (a>b||a>=size) { res.writeHead(416,{'Content-Range':`bytes */${size}`}); return res.end(); }
    b=Math.min(b,size-1);
    res.writeHead(206,{'Content-Type':tipo,'Accept-Ranges':'bytes','Content-Range':`bytes ${a}-${b}/${size}`,'Content-Length':b-a+1});
    return fs.createReadStream(f,{start:a,end:b}).pipe(res);
  }
  res.writeHead(200,{'Content-Type':tipo,'Accept-Ranges':'bytes','Content-Length':size}); fs.createReadStream(f).pipe(res);
}).listen(PORT,()=>console.log('http://localhost:'+PORT));
