// ミニチュア写真らしさの後処理。
// 1) 場面を MSAA（samples=4）の描画先へ描く
// 2) 横→縦の2回に分けたぼかし。ピントの帯から遠いほど半径を大きくする（チルトシフト）
// 3) ピントの帯はくっきりした元の絵、外側はぼかした絵を混ぜ、色を整えて画面へ（彩度を少し上げ、周辺を少し暗く）
import {
  BufferAttribute,
  BufferGeometry,
  HalfFloatType,
  LinearFilter,
  Mesh,
  NoBlending,
  OrthographicCamera,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type Camera,
  type Scene,
  type Texture,
  type WebGLRenderer,
} from 'three'

export interface PostSettings {
  /** MSAA の数（0 で無し） */
  msaa: number
  /** ぼかしを描く解像度の倍率（1 で同じ、0.5 で半分） */
  blurScale: number
  /** ぼかしの片側の取り出し数 */
  taps: number
  /** いちばん強いぼかしの半径（画面の高さに対する割合） */
  maxBlur: number
}

/** ピントの帯（画面の下が 0、上が 1） */
export interface Focus {
  center: number
  band: number
  falloff: number
}

export interface Grade {
  exposure: number
  saturation: number
  vignette: number
}

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4( position.xy, 0.0, 1.0 );
}`

const FOCUS_FN = /* glsl */ `
uniform float uFocus;
uniform float uBand;
uniform float uFalloff;
float blurAmount( float y ) {
  float d = max( abs( y - uFocus ) - uBand, 0.0 );
  return smoothstep( 0.0, uFalloff, d );
}`

function blurFragment(taps: number): string {
  return /* glsl */ `
uniform sampler2D tInput;
uniform vec2 uStep;
uniform float uMaxRadius;
varying vec2 vUv;
${FOCUS_FN}
void main() {
  vec4 center = texture2D( tInput, vUv );
  float radius = uMaxRadius * blurAmount( vUv.y );
  if ( radius < 0.35 ) { gl_FragColor = center; return; }
  vec4 sum = center;
  float wsum = 1.0;
  for ( int i = 1; i <= ${taps}; i ++ ) {
    float x = float( i ) / ${taps}.0;
    float w = exp( - 2.2 * x * x );
    vec2 off = uStep * x * radius;
    sum += ( texture2D( tInput, vUv + off ) + texture2D( tInput, vUv - off ) ) * w;
    wsum += 2.0 * w;
  }
  gl_FragColor = sum / wsum;
}`
}

const FINAL_FRAGMENT = /* glsl */ `
uniform sampler2D tSharp;
uniform sampler2D tBlur;
uniform float uUseBlur;
uniform float uExposure;
uniform float uSaturation;
uniform float uVignette;
varying vec2 vUv;
${FOCUS_FN}

// Khronos PBR Neutral のトーンマップ（明るい色を白へなめらかに寄せ、色相を保つ）
vec3 neutralTone( vec3 color ) {
  const float startCompression = 0.76;
  const float desaturation = 0.15;
  float x = min( color.r, min( color.g, color.b ) );
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max( color.r, max( color.g, color.b ) );
  if ( peak < startCompression ) return color;
  float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / ( peak + d - startCompression );
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / ( desaturation * ( peak - newPeak ) + 1.0 );
  return mix( color, vec3( newPeak ), g );
}

float toSrgb1( float c ) {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * pow( c, 1.0 / 2.4 ) - 0.055;
}

float hash12( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.x + p3.y ) * p3.z );
}

void main() {
  vec3 c = texture2D( tSharp, vUv ).rgb;
  if ( uUseBlur > 0.5 ) {
    float k = smoothstep( 0.0, 0.35, blurAmount( vUv.y ) );
    c = mix( c, texture2D( tBlur, vUv ).rgb, k );
  }
  c = neutralTone( max( c * uExposure, 0.0 ) );
  c = clamp( c, 0.0, 1.0 );
  c = vec3( toSrgb1( c.r ), toSrgb1( c.g ), toSrgb1( c.b ) );
  float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
  c = clamp( mix( vec3( l ), c, uSaturation ), 0.0, 1.0 );
  vec2 q = ( vUv - 0.5 ) * 2.0;
  c *= 1.0 - uVignette * smoothstep( 0.55, 1.45, length( q ) );
  c += ( hash12( gl_FragCoord.xy ) - 0.5 ) / 255.0;
  gl_FragColor = vec4( c, 1.0 );
}`

function fullScreenTriangle(): BufferGeometry {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2))
  return g
}

function focusUniforms() {
  return { uFocus: { value: 0.5 }, uBand: { value: 0.2 }, uFalloff: { value: 0.3 } }
}

export class MiniaturePost {
  private settings: PostSettings
  private sceneTarget: WebGLRenderTarget
  private readonly blurA: WebGLRenderTarget
  private readonly blurB: WebGLRenderTarget
  private readonly quad: Mesh
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private blurMaterial: ShaderMaterial
  private readonly finalMaterial: ShaderMaterial
  private width = 1
  private height = 1

  constructor(settings: PostSettings) {
    this.settings = settings
    this.sceneTarget = this.makeSceneTarget()
    this.blurA = makeTarget(0)
    this.blurB = makeTarget(0)
    this.blurMaterial = this.makeBlurMaterial()
    this.finalMaterial = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FINAL_FRAGMENT,
      uniforms: {
        tSharp: { value: null },
        tBlur: { value: null },
        uUseBlur: { value: 1 },
        uExposure: { value: 1 },
        uSaturation: { value: 1.12 },
        uVignette: { value: 0.2 },
        ...focusUniforms(),
      },
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
      toneMapped: false,
    })
    this.quad = new Mesh(fullScreenTriangle(), this.finalMaterial)
    this.quad.frustumCulled = false
  }

  setSettings(settings: PostSettings): void {
    const msaaChanged = settings.msaa !== this.settings.msaa
    const tapsChanged = settings.taps !== this.settings.taps
    this.settings = settings
    if (msaaChanged) {
      this.sceneTarget.dispose()
      this.sceneTarget = this.makeSceneTarget()
    }
    if (tapsChanged) {
      this.blurMaterial.dispose()
      this.blurMaterial = this.makeBlurMaterial()
    }
    this.setSize(this.width, this.height)
  }

  /** 描画バッファの大きさ（画素）を渡す */
  setSize(width: number, height: number): void {
    this.width = Math.max(1, Math.round(width))
    this.height = Math.max(1, Math.round(height))
    this.sceneTarget.setSize(this.width, this.height)
    const bw = Math.max(1, Math.round(this.width * this.settings.blurScale))
    const bh = Math.max(1, Math.round(this.height * this.settings.blurScale))
    this.blurA.setSize(bw, bh)
    this.blurB.setSize(bw, bh)
  }

  render(renderer: WebGLRenderer, scene: Scene, camera: Camera, focus: Focus, grade: Grade): void {
    renderer.setRenderTarget(this.sceneTarget)
    renderer.render(scene, camera)
    const useBlur = this.settings.taps > 0 && this.settings.maxBlur > 0
    if (useBlur) {
      const u = this.blurMaterial.uniforms
      setFocus(u, focus)
      // 半径は画素で渡す。ぼかし用の描画先の高さを基準にする
      u.uMaxRadius!.value = this.settings.maxBlur * this.blurA.height
      this.quad.material = this.blurMaterial
      u.tInput!.value = this.sceneTarget.texture
      ;(u.uStep!.value as Vector2).set(1 / this.blurA.width, 0)
      this.pass(renderer, this.blurA)
      u.tInput!.value = this.blurA.texture
      ;(u.uStep!.value as Vector2).set(0, 1 / this.blurA.height)
      this.pass(renderer, this.blurB)
    }
    const f = this.finalMaterial.uniforms
    setFocus(f, focus)
    f.tSharp!.value = this.sceneTarget.texture
    f.tBlur!.value = useBlur ? this.blurB.texture : this.sceneTarget.texture
    f.uUseBlur!.value = useBlur ? 1 : 0
    f.uExposure!.value = grade.exposure
    f.uSaturation!.value = grade.saturation
    f.uVignette!.value = grade.vignette
    this.quad.material = this.finalMaterial
    this.pass(renderer, null)
  }

  dispose(): void {
    this.sceneTarget.dispose()
    this.blurA.dispose()
    this.blurB.dispose()
    this.blurMaterial.dispose()
    this.finalMaterial.dispose()
    this.quad.geometry.dispose()
  }

  private pass(renderer: WebGLRenderer, target: WebGLRenderTarget | null): void {
    renderer.setRenderTarget(target)
    renderer.render(this.quad, this.camera)
  }

  private makeSceneTarget(): WebGLRenderTarget {
    return makeTarget(this.settings.msaa, true)
  }

  private makeBlurMaterial(): ShaderMaterial {
    return new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: blurFragment(Math.max(1, this.settings.taps)),
      uniforms: {
        tInput: { value: null as Texture | null },
        uStep: { value: new Vector2() },
        uMaxRadius: { value: 0 },
        ...focusUniforms(),
      },
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
      toneMapped: false,
    })
  }
}

function setFocus(u: Record<string, { value: unknown }>, focus: Focus): void {
  u.uFocus!.value = focus.center
  u.uBand!.value = focus.band
  u.uFalloff!.value = focus.falloff
}

function makeTarget(samples: number, depth = false): WebGLRenderTarget {
  return new WebGLRenderTarget(1, 1, {
    type: HalfFloatType,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    depthBuffer: depth,
    stencilBuffer: false,
    samples,
    generateMipmaps: false,
  })
}
