import type { Artifact, ImageFormat, ImageOptions, SourceFile } from '../../shared/contracts';
import { ConversionFailure } from '../../shared/errors';
import { LIMITS } from '../../shared/limits';
import { inspectImage, inspectImageBytes } from './headers';
import { computePlan, validateOptions } from './options';
import { toImageError } from './errors';
import type { ImageWorkerRequest, ImageWorkerResponse } from './worker-contract';

const mimeByFormat: Record<ImageFormat, string> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const extensionByFormat: Record<ImageFormat, string> = { jpeg: 'jpg', png: 'png', webp: 'webp' };
let nativeWebp: Promise<boolean> | undefined;
async function canEncodeWebp(): Promise<boolean> {
  nativeWebp ??= (async () => {
    const probe = new OffscreenCanvas(1, 1);
    try {
      probe.getContext('2d')?.fillRect(0, 0, 1, 1);
      const blob = await probe.convertToBlob({ type: 'image/webp' });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      return blob.type === 'image/webp' && inspectImageBytes(bytes, false).format === 'webp';
    } catch { return false; }
    finally { probe.width = 0; probe.height = 0; }
  })();
  return nativeWebp;
}
async function writeCanvas(canvas: OffscreenCanvas, options: ImageOptions, forceWasm: boolean): Promise<Blob> {
  const desiredMime = mimeByFormat[options.format];
  if (options.format === 'webp' && (forceWasm || !await canEncodeWebp())) {
    const context = canvas.getContext('2d');
    if (!context) throw new ConversionFailure('MEMORY_LIMIT', '描画領域を確保できませんでした。');
    const { encodeWebp } = await import('./webp-codec');
    return encodeWebp(context.getImageData(0, 0, canvas.width, canvas.height), options.quality);
  }
  const blob = await canvas.convertToBlob(options.format === 'png' ? { type: desiredMime } : { type: desiredMime, quality: options.quality });
  if (options.format === 'webp' && blob.type !== desiredMime) {
    nativeWebp = Promise.resolve(false);
    return writeCanvas(canvas, options, true);
  }
  return blob;
}
export async function processImage(source: SourceFile, options: ImageOptions, notify?: (state: 'validating' | 'converting') => void, forceWasm = false): Promise<Artifact> {
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
    throw new ConversionFailure('UNSUPPORTED', 'このブラウザでは画像変換を利用できません。新しいSafari・Chrome・Edge・Firefoxで開いてください。');
  }
  validateOptions(options);
  notify?.('validating');
  const header = await inspectImage(source.file);
  const plan = computePlan(header.displayWidth, header.displayHeight, options);
  notify?.('converting');
  let bitmap: ImageBitmap | undefined;
  let canvas: OffscreenCanvas | undefined;
  try {
    try { bitmap = await createImageBitmap(source.file, { imageOrientation: 'from-image' }); }
    catch { throw new ConversionFailure('INVALID_FILE', '画像データを読み取れません。保存し直した画像を選んでください。'); }
    if (bitmap.width !== header.displayWidth || bitmap.height !== header.displayHeight) {
      throw new ConversionFailure('INVALID_FILE', '画像の向きや寸法を正しく読み取れませんでした。保存し直した画像を選んでください。');
    }
    canvas = new OffscreenCanvas(plan.width, plan.height);
    const context = canvas.getContext('2d', { alpha: options.format !== 'jpeg', colorSpace: 'srgb' });
    if (!context) throw new ConversionFailure('MEMORY_LIMIT', '描画領域を確保できませんでした。画像を小さくしてください。');
    if (options.format === 'jpeg' || (options.aspect.mode === 'pad' && options.padFill === 'color')) {
      context.fillStyle = options.background;
      context.fillRect(0, 0, plan.width, plan.height);
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    const s = plan.source, d = plan.destination;
    context.drawImage(bitmap, s.x, s.y, s.width, s.height, d.x, d.y, d.width, d.height);
    const blob = await writeCanvas(canvas, options, forceWasm);
    if (!blob.size || blob.size > LIMITS.imageOutputBytes) throw new ConversionFailure('LIMIT_EXCEEDED', '出力画像が20MiBを超えています。サイズを小さくしてください。');
    try {
      const output = inspectImageBytes(new Uint8Array(await blob.arrayBuffer()), false);
      if (blob.type !== mimeByFormat[options.format] || output.format !== options.format || output.width !== plan.width || output.height !== plan.height) throw new Error('invalid output');
    } catch {
      throw new ConversionFailure('ENCODE_FAILED', '指定した形式で画像を書き出せませんでした。別の形式を選んでください。');
    }
    const basename = source.file.name.replace(/\.[^.]*$/, '').replace(/[\u0000-\u001f\u007f/\\:]/g, '_').slice(0, 180) || 'image';
    return { id: source.id, blob, filename: `${basename}.${extensionByFormat[options.format]}`, mime: blob.type, size: blob.size, width: plan.width, height: plan.height };
  } catch (cause) {
    if (cause instanceof RangeError) throw new ConversionFailure('MEMORY_LIMIT', '画像の処理に必要なメモリを確保できませんでした。');
    throw cause;
  } finally {
    bitmap?.close();
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}

if (typeof document === 'undefined' && typeof self !== 'undefined') {
  const scope = self as unknown as { onmessage: ((event: MessageEvent<ImageWorkerRequest>) => void) | null; postMessage: (message: ImageWorkerResponse) => void };
  scope.onmessage = event => {
    const request = event.data;
    if (request.type !== 'convert') return;
    const base = { runId: request.runId, id: request.source.id };
    void processImage(request.source, request.options, state => scope.postMessage({ ...base, type: 'state', state }), request.forceWasm).then(
      artifact => scope.postMessage({ ...base, type: 'result', artifact }),
      cause => scope.postMessage({ ...base, type: 'error', error: toImageError(cause) }),
    );
  };
}
