// @vitest-environment node
import { afterEach,describe,expect,it } from 'vitest';
import { mkdtemp,rm,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateArchive } from '../../server/documents/archive';
import { validateDocx } from '../../server/documents/preflight';
import { docxEntries,makeZip,sampleDocx } from './fixtures';
const folders:string[]=[];
async function input(bytes:Buffer){const folder=await mkdtemp(join(tmpdir(),'henkan-test-'));folders.push(folder);const file=join(folder,'input.docx');await writeFile(file,bytes);return file;}
afterEach(async()=>{await Promise.all(folders.splice(0).map(folder=>rm(folder,{recursive:true,force:true})));});
describe('DOCX preflight',()=>{
 it('accepts a standard Japanese document with table, embedded image, and safe hyperlink',async()=>{await expect(validateArchive(await input(sampleDocx({embeddedImage:true,hyperlink:'https://example.com/'})))).resolves.toBe('docx');});
 it('rejects external images before reaching the engine',async()=>{await expect(validateArchive(await input(sampleDocx({externalImage:true})))).rejects.toMatchObject({code:'UNSAFE_DOCUMENT'});});
 it.each(['file:///etc/passwd','javascript:alert(1)','data:text/plain,x'])('rejects unsafe hyperlink %s',async hyperlink=>{await expect(validateArchive(await input(sampleDocx({hyperlink})))).rejects.toMatchObject({code:'UNSAFE_DOCUMENT'});});
 it('rejects DTD/entity definitions',async()=>{await expect(validateArchive(await input(sampleDocx({unsafeXml:true})))).rejects.toMatchObject({code:'UNSAFE_DOCUMENT'});});
 it('rejects embedded objects and VBA',async()=>{for(const name of ['word/embeddings/evil.bin','word/vbaProject.bin'])await expect(validateArchive(await input(makeZip({...docxEntries(),[name]:'x'})))).rejects.toMatchObject({code:'UNSAFE_DOCUMENT'});});
 it('rejects field commands split across SAX chunks or multiple instrText runs',async()=>{for(const split of ['<w:instrText>INCLUDE</w:instrText><w:instrText>TEXT &quot;file:///etc/passwd&quot;</w:instrText>','<w:instrText>INCLU&#68;ETEXT &quot;file:///etc/passwd&quot;</w:instrText>','<w:instrText>INCLU<![CDATA[DETEXT]]> &quot;file:///etc/passwd&quot;</w:instrText>']){const entries=docxEntries();entries['word/document.xml']=String(entries['word/document.xml']).replace('<w:body>',`<w:body><w:p><w:r><w:fldChar w:fldCharType="begin"/>${split}<w:fldChar w:fldCharType="end"/></w:r></w:p>`);await expect(validateArchive(await input(makeZip(entries)))).rejects.toMatchObject({code:'UNSAFE_DOCUMENT'});}});
 it('uses XML namespace URIs for dangerous field and protection attributes, independent of prefixes',async()=>{for(const contents of ['<w:fldSimple w:instr="INCLUDETEXT &quot;file:///etc/passwd&quot;"/>','<w:r><w:fldChar w:fldCharType="begin"/><w:instrText>INCLUDE</w:instrText><w:instrText>TEXT &quot;file:///etc/passwd&quot;</w:instrText><w:fldChar w:fldCharType="end"/></w:r>']){const entries=docxEntries();entries['word/document.xml']=String(entries['word/document.xml']).replace('<w:body>',`<w:body>${contents}`).replaceAll('w:','z:').replace('xmlns:w=','xmlns:z=');await expect(validateArchive(await input(makeZip(entries)))).rejects.toMatchObject({code:'UNSAFE_DOCUMENT'});}const protectedEntries=docxEntries({protection:true});protectedEntries['word/settings.xml']=String(protectedEntries['word/settings.xml']).replaceAll('w:','z:').replace('xmlns:w=','xmlns:z=');await expect(validateArchive(await input(makeZip(protectedEntries)))).rejects.toMatchObject({code:'PASSWORD_PROTECTED'});});
 it('rejects protected documents',async()=>{await expect(validateArchive(await input(sampleDocx({protection:true})))).rejects.toMatchObject({code:'PASSWORD_PROTECTED'});});
 it('rejects non-package ZIPs, traversal, and corrupted CRC/local headers',async()=>{
  await expect(validateArchive(await input(makeZip({'other.txt':'x'})))).rejects.toMatchObject({code:'INVALID_FILE'});
  await expect(validateArchive(await input(makeZip({...docxEntries(),'../evil':'x'})))).rejects.toBeDefined();
  const broken=sampleDocx();broken.writeUInt32LE(123,14);await expect(validateArchive(await input(broken))).rejects.toBeDefined();
 });
 it('rejects 1001 entries and oversized expanded bytes',async()=>{
  const entries=docxEntries();for(let i=0;i<999;i++)entries[`word/item${i}.txt`]='x';await expect(validateArchive(await input(makeZip(entries)))).rejects.toMatchObject({code:'LIMIT_EXCEEDED'});
  const bomb=sampleDocx(),at=bomb.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));bomb.writeUInt32LE(101*1048576,at+24);await expect(validateArchive(await input(bomb))).rejects.toMatchObject({code:'LIMIT_EXCEEDED'});
 });
 it('runs in an interruptible worker and rejects pre-aborted signals',async()=>{const path=await input(sampleDocx());await expect(validateDocx(path,new AbortController().signal)).resolves.toBe('docx');const controller=new AbortController();controller.abort();await expect(validateDocx(path,controller.signal)).rejects.toMatchObject({code:'CANCELLED'});});
});
