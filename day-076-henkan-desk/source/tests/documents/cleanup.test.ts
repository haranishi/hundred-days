// @vitest-environment node
import { expect,it } from 'vitest';
import { mkdtemp,readdir,rm,writeFile,symlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanupOfficeIpc } from '../../server/engine/process';
it('cleans only owned LibreOffice IPC sockets inside the dedicated temporary root',async()=>{
 const root=await mkdtemp(join(tmpdir(),'henkan-ipc-')),server=createServer(),other=createServer();
 try{
  await new Promise<void>(resolve=>server.listen(join(root,'OSL_PIPE_1001_SingleOfficeIPC_abc123'),resolve));
  await new Promise<void>(resolve=>other.listen(join(root,'unrelated.sock'),resolve));
  await writeFile(join(root,'OSL_PIPE_1001_SingleOfficeIPC_123abc'),'keep');
  await symlink('OSL_PIPE_1001_SingleOfficeIPC_123abc',join(root,'OSL_PIPE_1001_SingleOfficeIPC_aabbcc'));
  await cleanupOfficeIpc(root);
  expect((await readdir(root)).sort()).toEqual(['OSL_PIPE_1001_SingleOfficeIPC_123abc','OSL_PIPE_1001_SingleOfficeIPC_aabbcc','unrelated.sock']);
 }finally{await Promise.all([new Promise<void>(resolve=>server.close(()=>resolve())),new Promise<void>(resolve=>other.close(()=>resolve()))]);await rm(root,{recursive:true,force:true});}
});
