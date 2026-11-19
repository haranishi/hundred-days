// 写真は描画ターゲットから読み、和紙の帯・題字・朱の落款を 2D で重ねる。
// 画面のバッファを残さない（preserveDrawingBuffer は使わない）。
import { fitCamera } from './camera-math.js';

const FONT = '"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif';

export function bandMetrics(width, height) {
  const band = Math.min(Math.round(height * 0.16), 220);
  return {
    y: height - band,
    h: band,
    title: Math.max(18, Math.round(band * 0.34)),
    sub: Math.max(11, Math.round(band * 0.15)),
    seal: Math.max(28, Math.round(band * 0.42)),
  };
}

/** 帯の分だけ木を上に寄せた注視点と距離。撮影中だけ制限を超えてよい。 */
export function photoFrame(bounds, pose, fovDeg, aspect, usable = bandMetrics(1080, 1350).y / 1350) {
  return fitCamera(bounds, pose, fovDeg, aspect, { usable });
}

function paintBand(ctx, width, height, caption) {
  const box = bandMetrics(width, height);
  ctx.fillStyle = '#f3eee3';
  ctx.fillRect(0, box.y, width, box.h);
  ctx.fillStyle = '#c4452c';
  ctx.fillRect(0, box.y, width, Math.max(1, Math.round(height / 600)));
  const title = caption?.title || '盆栽日和';
  const subtitle = caption?.subtitle || '';
  ctx.fillStyle = '#3c342c';
  ctx.font = `${box.title}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cx = width * 0.46;
  ctx.fillText(title, cx, box.y + box.h * 0.4, width * 0.7);
  if (subtitle) {
    ctx.fillStyle = '#7a6a5c';
    ctx.font = `${box.sub}px ${FONT}`;
    ctx.fillText(subtitle, cx, box.y + box.h * 0.72, width * 0.7);
  }
  const seal = box.seal;
  const sx = width - seal - Math.round(width * 0.06);
  const sy = box.y + (box.h - seal) / 2;
  ctx.fillStyle = '#c4452c';
  ctx.fillRect(sx, sy, seal, seal);
  ctx.fillStyle = '#f3eee3';
  ctx.font = `${Math.round(seal * 0.52)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('盆', sx + seal / 2, sy + seal / 2 + seal * 0.04);
}

function flipToImage(ctx, pixels, width, height) {
  const image = ctx.createImageData(width, height);
  const row = width * 4;
  for (let y = 0; y < height; y += 1) {
    const src = (height - 1 - y) * row;
    image.data.set(pixels.subarray(src, src + row), y * row);
  }
  ctx.putImageData(image, 0, 0);
}

export async function captureFrame({
  THREE, renderer, scene, camera, pose, applyPose, bounds, overlay, width = 1080, height = 1350, caption, fov, createCanvas,
}) {
  const w = Math.max(16, width | 0);
  const h = Math.max(16, height | 0);
  const prevAspect = camera.aspect;
  const prevTarget = renderer.getRenderTarget();
  const overlayVisible = overlay?.visible;
  const frame = photoFrame(bounds, pose, fov, w / h, bandMetrics(w, h).y / h);
  const pixels = new Uint8Array(w * h * 4);
  const target = new THREE.WebGLRenderTarget(w, h, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
  });
  if (THREE.SRGBColorSpace) target.texture.colorSpace = THREE.SRGBColorSpace;
  try {
    // 枝の候補は操作中だけの目印なので、写真に焼き込まない。
    if (overlay) overlay.visible = false;
    applyPose(frame);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // 写真の大きさは描画先が持つので、操作中のキャンバスの寸法を変えずに書き出せる。
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, w, h, pixels);
  } finally {
    if (overlay) overlay.visible = overlayVisible;
    renderer.setRenderTarget(prevTarget);
    target.dispose();
    applyPose(pose);
    camera.aspect = prevAspect;
    camera.updateProjectionMatrix();
  }

  const canvas = createCanvas?.(w, h) ?? globalThis.document?.createElement('canvas');
  if (!canvas) throw new Error('写真用の canvas がありません');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('写真用の canvas に描けません');
  flipToImage(ctx, pixels, w, h);
  paintBand(ctx, w, h, caption);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('写真を書き出せません'))), 'image/png');
  });
  return blob;
}
