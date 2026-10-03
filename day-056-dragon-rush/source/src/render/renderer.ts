// OWNER: render
// WebGL2 のレンダラーを作る。トーンマップと sRGB 変換は後処理の最後（GradeEffect）でだけ行う。
import { LinearSRGBColorSpace, NoToneMapping, PCFShadowMap, WebGLRenderer } from 'three';
import type { QualityPreset } from '../config/quality';

export function createRenderer(canvas: HTMLCanvasElement, quality: QualityPreset): WebGLRenderer {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
    stencil: false,
    depth: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.maxPixelRatio));
  // 後処理の GradeEffect が自分で sRGB に変換するので、ここでは変換しない
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.shadowMap.enabled = quality.shadow.enabled;
  renderer.shadowMap.type = PCFShadowMap;
  // 1コマの中の全パス（影・鏡像・後処理）の描画命令を数えるため、自動リセットを切る
  renderer.info.autoReset = false;
  return renderer;
}

/** GPU の名前（撮影の記録用。ソフトウェア描画に落ちていないかを確かめる）。 */
export function gpuName(renderer: WebGLRenderer): string {
  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
}
