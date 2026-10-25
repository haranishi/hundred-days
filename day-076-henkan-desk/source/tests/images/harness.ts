import { processImage } from '../../src/features/images/image.worker';
import { convertImages } from '../../src/features/images/convert';
import { DEFAULT_IMAGE_OPTIONS } from '../../src/features/images/options';
import { inspectImage } from '../../src/features/images/headers';
import type { ImageWorkerRequest, ImageWorkerResponse } from '../../src/features/images/worker-contract';
import type { Artifact, ConversionEvent, ImageFormat, ImageOptions } from '../../src/shared/contracts';

function options(overrides: Partial<ImageOptions> = {}): ImageOptions { return { ...DEFAULT_IMAGE_OPTIONS, ...overrides }; }
async function makeFile(format: 'png' | 'jpeg' = 'png', alpha = false): Promise<File> {
  const canvas = document.createElement('canvas'); canvas.width = 120; canvas.height = 80;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 60, 40);
  ctx.fillStyle = '#00ff00'; ctx.fillRect(60, 0, 60, 40);
  ctx.fillStyle = '#0000ff'; ctx.fillRect(0, 40, 60, 40);
  ctx.fillStyle = '#ffff00'; ctx.fillRect(60, 40, 60, 40);
  if (alpha) ctx.clearRect(0, 0, 20, 20);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('fixture encode')), `image/${format}`, 0.98));
  return new File([blob], `self-generated.${format === 'jpeg' ? 'jpg' : 'png'}`, { type: blob.type });
}
async function sample(artifact: Artifact): Promise<number[][]> {
  const bitmap = await createImageBitmap(artifact.blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d')!; ctx.drawImage(bitmap, 0, 0); bitmap.close();
  return [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]].map(([x, y]) => Array.from(ctx.getImageData(Math.floor(x! * canvas.width), Math.floor(y! * canvas.height), 1, 1).data));
}
async function single(file: File, overrides: Partial<ImageOptions> = {}, forceWasm = false): Promise<Artifact> {
  return processImage({ id: 'fixture', file }, options(overrides), undefined, forceWasm);
}
function describe(artifact: Artifact) { return { mime: artifact.mime, width: artifact.width, height: artifact.height, filename: artifact.filename, size: artifact.size }; }
function insertOrientation(jpeg: Uint8Array, value: number): Uint8Array<ArrayBuffer> {
  const exif = new Uint8Array([0xff, 0xe1, 0, 34, 69, 120, 105, 102, 0, 0, 73, 73, 42, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, value, 0, 0, 0, 0, 0, 0, 0]);
  const out = new Uint8Array(jpeg.length + exif.length); out.set(jpeg.subarray(0, 2)); out.set(exif, 2); out.set(jpeg.subarray(2), 2 + exif.length); return out;
}
const harness = {
  async matrix() {
    const png = await makeFile('png'); const jpg = await makeFile('jpeg');
    const webpResult = await single(png, { format: 'webp' }, true);
    const webp = new File([webpResult.blob], 'self-generated.webp', { type: 'image/webp' });
    const results = [];
    for (const file of [png, jpg, webp]) for (const format of ['jpeg', 'png', 'webp'] as ImageFormat[]) {
      const artifact = await single(file, { format }); const header = await inspectImage(new File([artifact.blob], artifact.filename));
      results.push({ input: file.type, format, ...describe(artifact), actual: header.format });
    }
    return results;
  },
  async ratios() {
    const file = await makeFile(); const results = [];
    for (const [width, height] of [[16, 9], [4, 5], [1, 1], [7, 11]]) for (const mode of ['crop', 'pad'] as const) {
      const artifact = await single(file, { format: 'png', aspect: { mode, width: width!, height: height!, anchor: { x: 0.5, y: 0.5 } } });
      results.push({ ...describe(artifact), mode, ratio: [width, height] });
    }
    const transparent = await single(file, { format: 'png', aspect: { mode: 'pad', width: 1, height: 1, anchor: { x: 0.5, y: 0.5 } } });
    const color = await single(file, { format: 'jpeg', background: '#123456', aspect: { mode: 'pad', width: 1, height: 1, anchor: { x: 0.5, y: 0.5 } } });
    async function corner(artifact: Artifact) {
      const bitmap = await createImageBitmap(artifact.blob); const canvas = new OffscreenCanvas(bitmap.width, bitmap.height); const ctx = canvas.getContext('2d')!; ctx.drawImage(bitmap, 0, 0); bitmap.close(); return Array.from(ctx.getImageData(0, 0, 1, 1).data);
    }
    return { results, transparent: await corner(transparent), color: await corner(color) };
  },
  async orientations() {
    const jpg = await makeFile('jpeg'); const bytes = new Uint8Array(await jpg.arrayBuffer()); const result = [];
    for (let orientation = 1; orientation <= 8; orientation++) {
      const file = new File([insertOrientation(bytes, orientation)], 'with-exif.jpg', { type: 'image/jpeg' });
      const artifact = await single(file, { format: 'png' }); const output = await inspectImage(new File([artifact.blob], 'output.png'));
      result.push({ orientation, ...describe(artifact), corners: await sample(artifact), outputOrientation: output.orientation });
    }
    return result;
  },
  async nativeFallback() {
    const original = OffscreenCanvas.prototype.convertToBlob;
    OffscreenCanvas.prototype.convertToBlob = function (options) { return original.call(this, options?.type === 'image/webp' ? { type: 'image/png' } : options); };
    try {
      const artifact = await single(await makeFile('png', true), { format: 'webp' });
      const bitmap = await createImageBitmap(artifact.blob); const canvas = new OffscreenCanvas(bitmap.width, bitmap.height); const ctx = canvas.getContext('2d')!; ctx.drawImage(bitmap, 0, 0); bitmap.close();
      return { ...describe(artifact), alpha: ctx.getImageData(5, 5, 1, 1).data[3], actual: (await inspectImage(new File([artifact.blob], 'output.webp'))).format };
    } finally { OffscreenCanvas.prototype.convertToBlob = original; }
  },
  async workerWasm() {
    const worker = new Worker(new URL('../../src/features/images/image.worker.ts', import.meta.url), { type: 'module' });
    try {
      const file = await makeFile('png', true);
      const artifact = await new Promise<Artifact>((resolve, reject) => {
        worker.onmessage = (event: MessageEvent<ImageWorkerResponse>) => {
          if (event.data.type === 'result') resolve(event.data.artifact);
          if (event.data.type === 'error') reject(new Error(event.data.error.message));
        };
        worker.onerror = () => reject(new Error('worker failed'));
        const request: ImageWorkerRequest = { type: 'convert', runId: 'wasm-test', source: { id: 'wasm', file }, options: options({ format: 'webp' }), forceWasm: true };
        worker.postMessage(request);
      });
      return { ...describe(artifact), actual: (await inspectImage(new File([artifact.blob], 'output.webp'))).format };
    } finally { worker.terminate(); }
  },
  async realWorker() {
    const events: ConversionEvent[] = []; const file = await makeFile();
    await convertImages([{ id: 'worker', file }], options({ format: 'png', aspect: { mode: 'crop', width: 4, height: 5, anchor: { x: 1, y: 0 } } }), { signal: new AbortController().signal, emit: event => events.push(event) });
    return events.map(e => e.type === 'result' ? { type: e.type, ...describe(e.artifact) } : e);
  },
};
declare global { interface Window { imageHarness: typeof harness } }
window.imageHarness = harness;
