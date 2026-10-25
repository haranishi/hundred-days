// @vitest-environment node
import { describe,expect,it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { sampleDocx } from './fixtures';
const enabled=process.env.OFFICE_RUNTIME==='1',origin=process.env.OFFICE_RUNTIME_URL||'http://localhost:4183';
async function convert(kind:'docx'|'xlsx'|'pptx',filename=`japanese.${kind}`){const bytes=kind==='docx'?sampleDocx({embeddedImage:true,hyperlink:'https://example.com/'}):await readFile(new URL(`./fixtures/japanese.${kind}`,import.meta.url));const form=new FormData();form.append('consent','true');form.append('file',new Blob([new Uint8Array(bytes)]),filename);return fetch(`${origin}/api/v1/documents/pdf`,{method:'POST',headers:{origin},body:form});}
describe.skipIf(!enabled)('actual Office conversion',()=>{
 it.each(['docx','xlsx','pptx'] as const)('converts Japanese %s to a validated PDF',async kind=>{const response=await convert(kind);expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');expect(response.headers.get('content-type')).toContain('application/pdf');const pdf=Buffer.from(await response.arrayBuffer());expect(pdf.subarray(0,5).toString()).toBe('%PDF-');expect(pdf.length).toBeGreaterThan(1000);},30000);
 it('rejects a renamed Excel archive claimed to be Word',async()=>{const response=await convert('xlsx','renamed.docx');expect(response.status).toBe(422);expect((await response.json() as {error:{code:string}}).error.code).toBe('INVALID_FILE');});
});
