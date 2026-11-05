import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile,writeFile,mkdir,mkdtemp,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {inflateRawSync} from 'node:zlib';
import {isServedPath} from '../../scripts/lib/dist-files.mjs';

const day=fileURLToPath(new URL('../',import.meta.url));
const expected=['.gitignore','LICENSE','README.md','app.js','font-profile.js','index.html','package-lock.json','package.json','server.js','svg-renderer.js','tests/browser.mjs','tests/helpers.cjs','tests/make_fixture.py','tests/ocr.swift','tests/server.test.cjs','tests/svg-renderer.test.cjs'].sort();

async function archiveFiles() {
  const zip=await readFile(join(day,'airpresenter-local.zip'));
  const entries=new Map();
  let offset=0;
  while(zip.readUInt32LE(offset)===0x04034b50) {
    const flags=zip.readUInt16LE(offset+6), method=zip.readUInt16LE(offset+8);
    const size=zip.readUInt32LE(offset+18), nameLength=zip.readUInt16LE(offset+26), extra=zip.readUInt16LE(offset+28);
    assert.equal(flags&8,0,'download must have explicit entry lengths');
    const name=zip.toString('utf8',offset+30,offset+30+nameLength);
    assert.ok(name.startsWith('airpresenter/')&&!name.includes('..'),'safe archive path');
    const start=offset+30+nameLength+extra;
    assert.equal(method,8,'download compression');
    entries.set(name.slice('airpresenter/'.length),inflateRawSync(zip.subarray(start,start+size)));
    offset=start+size;
  }
  assert.equal(zip.readUInt32LE(offset),0x02014b50,'complete central directory must follow file entries');
  return entries;
}

test('download contains only reviewed source, and matches the source exactly',async()=>{
  const entries=await archiveFiles();
  assert.deepEqual([...entries.keys()].sort(),expected);
  for(const [name,bytes] of entries) assert.deepEqual(bytes,await readFile(join(day,'source',name)),name);
  const walk=async folder=>{
    const names=[];
    for(const entry of await readdir(folder,{withFileTypes:true})) {
      if(['node_modules','.runtime','.artifacts','__pycache__'].includes(entry.name)) continue;
      const child=join(folder,entry.name);
      if(entry.isDirectory()) names.push(...(await walk(child)).map(name=>entry.name+'/'+name));
      else names.push(entry.name);
    }
    return names;
  };
  assert.deepEqual((await walk(join(day,'source'))).sort(),expected,'unreviewed source must not enter the repository or archive');
});

test('public site serves the download, not the server source or packaging tools',()=>{
  for(const file of ['index.html','preview.png','airpresenter-local.zip','shared/share.js']) assert.equal(isServedPath('day-084-airpresenter',file),true,file);
  for(const file of ['source','source/server.js','source/tests/server.test.cjs','tools','tools/package.py','tests/distribution.test.mjs']) assert.equal(isServedPath('day-084-airpresenter',file),false,file);
});

test('the actual downloaded app can boot and authenticate from an extracted archive',async()=>{
  const root=await mkdtemp(join(tmpdir(),'day084-distribution-'));
  let app;
  try {
    for(const [name,bytes] of await archiveFiles()) {
      const file=join(root,'app',name);
      await mkdir(dirname(file),{recursive:true}); await writeFile(file,bytes);
    }
    const require=createRequire(import.meta.url);
    const {createApp}=require(join(root,'app/server.js'));
    app=await createApp({localIp:'127.0.0.1',dataDir:join(root,'runtime')});
    await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
    const base=`http://127.0.0.1:${app.server.address().port}`;
    const response=await fetch(base+'/api/session',{method:'POST',headers:{Origin:base}});
    assert.equal(response.status,200);
    const session=await response.json();
    assert.equal(session.state.total,5);
    const move=await fetch(base+'/api/command',{method:'POST',headers:{Origin:base,Authorization:`Bearer ${session.token}`,'X-AirPresenter-Room':session.room,'X-AirPresenter-Client':'packaging-check','Content-Type':'application/json'},body:JSON.stringify({type:'NEXT'})});
    assert.equal(move.status,200); assert.equal((await move.json()).state.current,1);
    assert.equal((await fetch(base+'/api/info')).status,401);
    assert.equal((await fetch(base+'/.git/config')).status,404);
    assert.ok((await (await fetch(base+'/')).text()).includes('importProgress'));
  } finally { if(app)await app.close(); await rm(root,{recursive:true,force:true}); }
});
