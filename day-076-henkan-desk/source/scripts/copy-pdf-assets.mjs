import './patch-pdfjs.mjs';
import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
for (const directory of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  await mkdir(`public/pdf-assets/${directory}`, { recursive: true });
  await cp(`node_modules/pdfjs-dist/${directory}`, `public/pdf-assets/${directory}`, { recursive: true });
}
// Replace PDF.js's older GPL font binaries with the official, unmodified OFL
// Liberation Sans 2.1.5 release. Keep upstream names and all font notices.
const hashes = {
 'LiberationSans-Regular.ttf':'76d04c18ea243f426b7de1f3ad208e927008f961dc5945e5aad352d0dfde8ee8',
 'LiberationSans-Bold.ttf':'788abee4c806d660e8aee46689dd8540cd4bb98da03dcc9d171ce3efd99a9173',
 'LiberationSans-Italic.ttf':'e5bae5c4cde31f22142753855f4f8fb86da6ff39955ed3c0a11248b0d16948b0',
 'LiberationSans-BoldItalic.ttf':'698da70fc191cc5f33ad4d6d3fe830fe4624b898ea2e3169955928b7c491f1ee'
};
for(const [name,hash] of Object.entries(hashes)){
 const source=`vendor/liberation-fonts/${name}`;
 if(createHash('sha256').update(await readFile(source)).digest('hex')!==hash)throw new Error('Unverified Liberation font binary.');
 await cp(source,`public/pdf-assets/standard_fonts/${name}`);
}
await rm('public/pdf-assets/standard_fonts/LICENSE_LIBERATION',{force:true});
for(const [from,to] of [['LICENSE','LICENSE_OFL'],['AUTHORS','LIBERATION_AUTHORS'],['provenance.md','LIBERATION_PROVENANCE.md']]){
 await cp(`vendor/liberation-fonts/${from}`,`public/pdf-assets/standard_fonts/${to}`);
}
