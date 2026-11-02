// OWNER: world-art
// WebGL2 のレンダラー。トーンマップと sRGB への変換は後処理の最後（grade.ts）でだけ行う。
// 本人の dragon-rampage（src/render/renderer.ts）から写し、画質の段を外して影の方式を決め打ちにした。
import { LinearSRGBColorSpace, NoToneMapping, PCFShadowMap, WebGLRenderer } from 'three';
import { MAX_PIXEL_RATIO } from './config';
import { installGameLightCurve } from './lightCurve';

export function createRenderer(canvas: HTMLCanvasElement): WebGLRenderer {
  // 灯りの減衰の差し替えは、どの材質のコンパイルよりも前に入れる
  installGameLightCurve();
  const renderer = new WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
    stencil: false,
    depth: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  // 1コマの全パス（影・本体・後処理）の描画命令を数えるため、自動リセットを切る（post.render の頭で数え直す）
  renderer.info.autoReset = false;
  return renderer;
}

/** GPU の名前（撮影の記録用。ソフトウェア描画に落ちていないかを確かめる）。 */
export function gpuName(renderer: WebGLRenderer): string {
  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
}
