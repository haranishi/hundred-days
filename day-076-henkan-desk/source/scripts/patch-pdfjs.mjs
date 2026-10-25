import { readFile, writeFile, rm } from 'node:fs/promises';
// PDF.js 6.4.299 resolves getOperatorList's partial list before rejecting its
// stream error. Reject first, so stopAtErrors can prevent incomplete exports.
// Keep this narrow patch version-bound and fail closed when upstream changes.
const packagePath = 'node_modules/pdfjs-dist/package.json';
const { version } = JSON.parse(await readFile(packagePath, 'utf8'));
if (version !== '6.4.299') throw new Error('Recheck the PDF.js operator-list patch for this version.');
const path = 'node_modules/pdfjs-dist/build/pdf.mjs';
const marker = '/*! PDF.js 6.4.299 modified by henkan-desk (2026-10-25): reject incomplete operator lists before completion. Apache-2.0. */';
const source = await readFile(path, 'utf8');
if (!source.includes(marker)) {
  const original = '        if (intentState.operatorList) {\n          intentState.operatorList.lastChunk = true;';
  if (source.split(original).length !== 2) throw new Error('PDF.js patch target does not match.');
  await writeFile(path, source.replace(original, `        ${marker}\n        intentState.opListReadCapability?.reject(reason);\n${original}`));
  await rm('node_modules/.vite', { recursive: true, force: true });
}
