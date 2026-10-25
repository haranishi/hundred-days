import { describe,expect,it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { PDFDocument, PDFDict, PDFName } from 'pdf-lib';
import { unzipSync } from 'fflate';
import { processCore, inspectPdf } from '../../src/features/pdf/core';
import { DEFAULT_PDF_OPTIONS, type PDFOperation, type PdfOptions } from '../../src/features/pdf/types';
import { fixturePdf,pdfSource } from './fixtures';
const signal = () => new AbortController().signal;
const options = (operation:PDFOperation, patch:Partial<PdfOptions>={}):PdfOptions=>({...DEFAULT_PDF_OPTIONS,operation,...patch});
async function pages(blob:Blob){return (await PDFDocument.load(await blob.arrayBuffer())).getPages();}
describe('PDF editing',()=>{
 it('merges file and page order without dropping inputs',async()=>{const a=pdfSource(await fixturePdf([200,300]),'a.pdf','a'),b=pdfSource(await fixturePdf([500]),'b.pdf','b');const result=await processCore([a,b],options('merge'),signal());expect((await pages(result.blob)).map(p=>p.getWidth())).toEqual([200,300,500]);expect(result.inputIds).toEqual(['a','b']);expect(result.inputBytes).toBe(a.file.size+b.file.size);});
 it('extracts selected pages in the requested order',async()=>{const out=await processCore([pdfSource(await fixturePdf())],options('extract',{pages:'3,1'}),signal());expect((await pages(out.blob)).map(p=>p.getWidth())).toEqual([500,300]);});
 it('splits to real one-page PDFs inside a ZIP',async()=>{const out=await processCore([pdfSource(await fixturePdf())],options('split',{pages:'2-3'}),signal());const zip=unzipSync(new Uint8Array(await out.blob.arrayBuffer()));expect(Object.keys(zip)).toEqual(['page-002.pdf','page-003.pdf']);expect((await PDFDocument.load(zip['page-002.pdf']!)).getPageCount()).toBe(1);});
 it('reorders all pages and rejects accidental omission',async()=>{const source=pdfSource(await fixturePdf());const out=await processCore([source],options('reorder',{order:'reverse'}),signal());expect((await pages(out.blob)).map(p=>p.getWidth())).toEqual([500,400,300]);await expect(processCore([source],options('reorder',{order:'3,1'}),signal())).rejects.toThrow();});
 it('reuses resources shared across copied pages',async()=>{const out=await processCore([pdfSource(await fixturePdf())],options('extract'),signal());const doc=await PDFDocument.load(await out.blob.arrayBuffer());const fonts=doc.context.enumerateIndirectObjects().filter(([,object])=>object instanceof PDFDict&&object.get(PDFName.of('Type'))?.toString()==='/Font');expect(fonts).toHaveLength(1);});
 it('rotates only selected pages',async()=>{const out=await processCore([pdfSource(await fixturePdf())],options('rotate',{pages:'2',rotation:90}),signal());expect((await pages(out.blob)).map(p=>p.getRotation().angle)).toEqual([0,90,0]);});
 it('does not increase optimized file size',async()=>{const source=pdfSource(await fixturePdf());const out=await processCore([source],options('optimize'),signal());expect(out.size).toBeLessThanOrEqual(source.file.size);expect((await pages(out.blob))).toHaveLength(3);});
 it('rejects malformed files and excessive page counts',async()=>{await expect(inspectPdf(pdfSource(new TextEncoder().encode('not PDF')),signal())).rejects.toThrow();await expect(inspectPdf(pdfSource(await fixturePdf(Array(101).fill(300))),signal())).rejects.toMatchObject({code:'LIMIT_EXCEEDED'});});
 it('rejects encrypted PDFs without bypassing their protection',async()=>{const bytes=await readFile(new URL('./fixtures/password.pdf',import.meta.url));await expect(inspectPdf(pdfSource(bytes),signal())).rejects.toMatchObject({code:'PASSWORD_PROTECTED'});});
 it('cancels before parsing and never returns a late output',async()=>{const controller=new AbortController();controller.abort();await expect(processCore([pdfSource(await fixturePdf())],options('merge'),controller.signal)).rejects.toMatchObject({name:'AbortError'});});
});
