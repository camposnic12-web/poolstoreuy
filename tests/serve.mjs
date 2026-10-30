// Servidor estático mínimo: sirve ROOT como Netlify (index.html en carpetas, 404 si no existe).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = process.argv[2]; const PORT = +process.argv[3] || 8787;
const T = {'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.ico':'image/x-icon','.xml':'application/xml','.txt':'text/plain'};
http.createServer((req,res)=>{
  let p = decodeURIComponent(new URL(req.url,'http://x').pathname);
  let f = path.join(ROOT,p);
  if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) {
    if (!p.endsWith('/')) { res.writeHead(301,{Location:p+'/'}); return res.end(); }
    f = path.join(f,'index.html');
  }
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'}); fs.createReadStream(f).pipe(res);
}).listen(PORT,()=>console.log('http://localhost:'+PORT));
