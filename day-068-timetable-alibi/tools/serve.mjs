import http from 'node:http';
import { readFile,stat } from 'node:fs/promises';
import { resolve,sep,extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const port=Number(process.env.DAY68_PORT||5418);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.txt':'text/plain; charset=utf-8','.json':'application/json; charset=utf-8'};
const csp="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";
const server=http.createServer(async(req,res)=>{
  try{
    let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    pathname=pathname.replace(/^\/day-068-timetable-alibi/,'');
    if(pathname==='/')pathname='/index.html';
    const file=resolve(root,'.'+pathname),extension=extname(file);
    if(!file.startsWith(root)||file===root||!types[extension]||pathname.split('/').some(s=>s.startsWith('.'))||/\/(?:tests|tools)\//.test(pathname)){
      res.writeHead(404);res.end('Not found');return;
    }
    if(!(await stat(file)).isFile()){res.writeHead(404);res.end('Not found');return;}
    res.writeHead(200,{'Content-Type':types[extension],'Content-Security-Policy':csp,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store','Referrer-Policy':'strict-origin-when-cross-origin'});
    res.end(await readFile(file));
  }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(port,'127.0.0.1',()=>console.log('Day68 preview: http://127.0.0.1:'+port+'/'));
process.on('SIGTERM',()=>server.close());
