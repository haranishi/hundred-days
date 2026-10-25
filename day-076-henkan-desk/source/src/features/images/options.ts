import type { AspectSpec, ImageOptions, ResizeSpec } from '../../shared/contracts';
import { ConversionFailure as ImageProcessingError } from '../../shared/errors';
import { LIMITS } from '../../shared/limits';

const MAX_EDGE = LIMITS.imageEdge;
const MAX_PIXELS = LIMITS.imagePixels;
export type Size = { width: number; height: number };
export type Rect = { x: number; y: number; width: number; height: number };
export type TransformPlan = Size & { source: Rect; destination: Rect };
export const ASPECT_PRESETS = ['1:1', '4:5', '5:4', '3:4', '4:3', '2:3', '3:2', '9:16', '16:9', '21:9'].map(label => {
  const [width, height] = label.split(':').map(Number) as [number, number];
  return { label, width, height };
});
export const DEFAULT_IMAGE_OPTIONS: ImageOptions = {
  format: 'webp', resize: { mode: 'original' }, aspect: { mode: 'original' },
  padFill: 'transparent', quality: 0.85, background: '#ffffff', allowUpscale: false,
};

function invalid(message: string): never { throw new ImageProcessingError('INVALID_FILE', message); }
function withinInteger(value: number, min: number, max: number): boolean {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}
function checkResize(resize: ResizeSpec): void {
  if (!resize || !['original', 'percentage', 'fit'].includes(resize.mode)) invalid('サイズの指定方法を選んでください。');
  if (resize.mode === 'percentage' && !withinInteger(resize.percent, 1, 100)) invalid('割合は1〜100の整数で指定してください。');
  if (resize.mode === 'fit' && (!withinInteger(resize.maxWidth, 1, MAX_EDGE) || !withinInteger(resize.maxHeight, 1, MAX_EDGE))) {
    invalid('幅と高さは1〜8192pxの整数で指定してください。');
  }
}
export function validateOptions(options: ImageOptions): ImageOptions {
  if (!options || !['jpeg', 'png', 'webp'].includes(options.format)) invalid('JPG・PNG・WebPから出力形式を選んでください。');
  checkResize(options.resize);
  if (options.format !== 'png' && (!Number.isFinite(options.quality) || options.quality < 0.1 || options.quality > 1)) {
    invalid('品質は10〜100%で指定してください。');
  }
  if (!/^#[\da-f]{6}$/i.test(options.background)) invalid('背景色を選んでください。');
  if (!['transparent', 'color'].includes(options.padFill) || options.allowUpscale !== false) invalid('画像の設定を確認してください。');
  const aspect = options.aspect;
  if (!aspect || !['original', 'crop', 'pad'].includes(aspect.mode)) invalid('比率の変更方法を選んでください。');
  if (aspect.mode !== 'original') {
    if (!withinInteger(aspect.width, 1, 10000) || !withinInteger(aspect.height, 1, 10000)) invalid('比率は1〜10000の整数で指定してください。');
    if (!aspect.anchor || ![aspect.anchor.x, aspect.anchor.y].every(n => Number.isFinite(n) && n >= 0 && n <= 1)) invalid('配置は0〜100%の範囲で指定してください。');
  }
  return options;
}
function resizeScale(width: number, height: number, resize: ResizeSpec): number {
  if (resize.mode === 'percentage') return resize.percent / 100;
  if (resize.mode === 'fit') return Math.min(1, resize.maxWidth / width, resize.maxHeight / height);
  return 1;
}
export function computeSize(width: number, height: number, resize: ResizeSpec): Size {
  checkDimensions(width, height);
  checkResize(resize);
  const scale = resizeScale(width, height, resize);
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}
function checkDimensions(width: number, height: number): void {
  if (!withinInteger(width, 1, MAX_EDGE) || !withinInteger(height, 1, MAX_EDGE) || width * height > MAX_PIXELS) {
    throw new ImageProcessingError('LIMIT_EXCEEDED', '画像は一辺8192px、1600万画素以内で選んでください。');
  }
}
function gcd(a: number, b: number): number { while (b) [a, b] = [b, a % b]; return a; }
function ratio(aspect: Exclude<AspectSpec, { mode: 'original' }>): Size {
  const divisor = gcd(aspect.width, aspect.height);
  return { width: aspect.width / divisor, height: aspect.height / divisor };
}
export function computePlan(width: number, height: number, options: ImageOptions): TransformPlan {
  validateOptions(options);
  checkDimensions(width, height);
  const { aspect, resize } = options;
  if (aspect.mode === 'original') {
    const size = computeSize(width, height, resize);
    return { ...size, source: { x: 0, y: 0, width, height }, destination: { x: 0, y: 0, ...size } };
  }
  const reduced = ratio(aspect);
  const a = reduced.width, b = reduced.height;
  const cropWidth = Math.min(width, height * a / b);
  const cropHeight = cropWidth * b / a;
  const frameWidth = aspect.mode === 'crop' ? cropWidth : Math.max(width, height * a / b);
  const frameHeight = frameWidth * b / a;
  const scale = resizeScale(frameWidth, frameHeight, resize);
  const requestedK = Math.floor(Math.min(frameWidth * scale / a, frameHeight * scale / b) + 1e-9);
  const limitK = Math.min(Math.floor(MAX_EDGE / a), Math.floor(MAX_EDGE / b), Math.floor(Math.sqrt(MAX_PIXELS / (a * b))));
  const k = Math.min(requestedK, limitK);
  if (k < 1) throw new ImageProcessingError('LIMIT_EXCEEDED', 'この比率とサイズは両立しません。比率を小さな整数にするか、出力サイズを大きくしてください。');
  const outputWidth = a * k, outputHeight = b * k;
  if (aspect.mode === 'crop') {
    return { width: outputWidth, height: outputHeight,
      source: { x: (width - cropWidth) * aspect.anchor.x, y: (height - cropHeight) * aspect.anchor.y, width: cropWidth, height: cropHeight },
      destination: { x: 0, y: 0, width: outputWidth, height: outputHeight } };
  }
  const drawScale = Math.min(1, outputWidth / width, outputHeight / height);
  const drawWidth = width * drawScale, drawHeight = height * drawScale;
  return { width: outputWidth, height: outputHeight, source: { x: 0, y: 0, width, height },
    destination: { x: (outputWidth - drawWidth) * aspect.anchor.x, y: (outputHeight - drawHeight) * aspect.anchor.y, width: drawWidth, height: drawHeight } };
}
