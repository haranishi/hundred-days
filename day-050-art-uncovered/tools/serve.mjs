import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.glb':'model/gltf-binary'};
export function startServer(port=5050){
  const server=createServer((req,res)=>{
    try{
      const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      const relative=path.replace(/^\/day-050-art-uncovered\//,'/');
      const target=resolve(root,'.'+(relative.endsWith('/')?relative+'index.html':relative));
      if((!target.startsWith(root+sep)&&target!==root)||relative.includes('/tools/')||!existsSync(target)||!statSync(target).isFile()){res.writeHead(404);res.end('Not found');return;}
      res.writeHead(200,{'Content-Type':types[extname(target)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff', 'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'"});
      createReadStream(target).pipe(res);
    }catch{res.writeHead(400);res.end('Bad request');}
  });
  return new Promise(resolveReady=>server.listen(port,'127.0.0.1',()=>resolveReady(server)));
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  await startServer(Number(process.env.DAY050_PORT||5050));
  console.log('Day050 preview: http://127.0.0.1:5050/day-050-art-uncovered/');
}
