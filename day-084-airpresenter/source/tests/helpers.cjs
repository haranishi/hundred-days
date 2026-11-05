'use strict';
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const execute = promisify(execFile);

function createPdf(pages = 2) {
  const objects = [null, '<< /Type /Catalog /Pages 2 0 R >>', ''];
  const ids = [];
  for (let i = 0; i < pages; i++) {
    const page = objects.length;
    const content = `q ${i % 2 ? '0.9 0.4 0.2' : '0.2 0.5 0.8'} rg 0 0 720 405 re f Q\nBT /F1 28 Tf 1 1 1 rg 40 320 Td (SYNTHETIC SLIDE ${i + 1}) Tj ET\n`;
    ids.push(`${page} 0 R`);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 720 405] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents ${page + 1} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`);
  }
  objects[2] = `<< /Type /Pages /Count ${pages} /Kids [${ids.join(' ')}] >>`;
  let out = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 1; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(out));
    out += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) out += `${String(offset).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out);
}

async function createPptx(japanese = false) {
  const { stdout } = await execute('python3', [path.join(__dirname, 'make_fixture.py'), ...(japanese ? ['--japanese'] : [])], { encoding: 'buffer', maxBuffer: 4 * 1024 * 1024 });
  return stdout;
}

async function createPpt() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'airpresenter-fixture-'));
  try {
    const source = path.join(dir, 'synthetic.pptx');
    await fs.writeFile(source, await createPptx());
    await execute('soffice', [`-env:UserInstallation=file://${dir}/profile`, '--headless', '--convert-to', 'ppt:MS PowerPoint 97', '--outdir', dir, source], { timeout: 30_000 });
    return await fs.readFile(path.join(dir, 'synthetic.ppt'));
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

function samplePngPixel(png, x = 5, y = 5) {
  const chunks = [];
  let width, channels;
  for (let pos = 8; pos < png.length;) {
    const length = png.readUInt32BE(pos);
    const type = png.toString('ascii', pos + 4, pos + 8);
    const data = png.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      if (data[8] !== 8 || ![2, 6].includes(data[9])) throw new Error('Unsupported PNG test fixture');
      channels = data[9] === 2 ? 3 : 4;
    }
    if (type === 'IDAT') chunks.push(data);
    pos += length + 12;
  }
  const bytes = require('node:zlib').inflateSync(Buffer.concat(chunks));
  const stride = width * channels;
  let previous = Buffer.alloc(stride);
  function paeth(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  }
  for (let row = 0; row <= y; row++) {
    const filter = bytes[row * (stride + 1)];
    const line = Buffer.from(bytes.subarray(row * (stride + 1) + 1, (row + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? line[i - channels] : 0;
      const up = previous[i], ul = i >= channels ? previous[i - channels] : 0;
      const prediction = [0, left, up, Math.floor((left + up) / 2), paeth(left, up, ul)][filter];
      if (prediction === undefined) throw new Error('Unsupported PNG filter');
      line[i] = (line[i] + prediction) & 255;
    }
    previous = line;
  }
  return [...previous.subarray(x * channels, x * channels + 3)];
}

async function recognizePng(buffer) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'airpresenter-ocr-'));
  try {
    const input = path.join(dir, 'page.png');
    await fs.writeFile(input, buffer, {mode:0o600});
    const {stdout} = await execute('swift', [path.join(__dirname, 'ocr.swift'), input], {timeout:60_000, maxBuffer:1024*1024});
    return stdout;
  } finally { await fs.rm(dir, {recursive:true,force:true}); }
}

module.exports = { createPdf, createPptx, createPpt, samplePngPixel, recognizePng };
