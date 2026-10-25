import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { SourceFile } from '../../src/shared/contracts';
export async function fixturePdf(widths: number[] = [300,400,500]): Promise<Uint8Array<ArrayBuffer>> {
  const doc = await PDFDocument.create(); const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const [index,width] of widths.entries()) { const page = doc.addPage([width,400]); page.drawText(`Page ${index + 1}`,{x:20,y:350,size:20,font,color:rgb(0.1,0.2,0.7)}); }
  return Uint8Array.from(await doc.save({useObjectStreams:false}));
}
export function pdfSource(bytes: Uint8Array, name='sample.pdf', id='sample'): SourceFile { return {id,file:new File([Uint8Array.from(bytes).buffer],name,{type:'application/pdf'})}; }
