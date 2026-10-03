// OWNER: dragon
// 足もとの接地の影：足の裏の下と胴の下の地面に、柔らかい暗がりを掛け算で重ねる（足と胴が空の光を遮る分）。
// 夕日を背にして竜を見上げる構図では、竜の落とす影が竜の後ろに隠れて見えず、足が地面から浮いて見えた（r00c-竜）。
// 足が地面から離れるほど薄く広がり、飛び上がると消える。焦げ跡と同じく、地面の少し上に置いた板で掛け算する。
// 板は竜の根の子に置くが、行列を「根の逆」にして、インスタンスの行列を世界の座標で書く。
import {
  CustomBlending,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  type Object3D,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  SrcColorFactor,
  Vector3,
  ZeroFactor,
} from 'three';
import { DRAGON_CONTACT as C } from '../config/dragon';

const VERT = /* glsl */ `
attribute vec2 iShade;
varying vec2 vUv;
varying vec2 vShade;
varying float vDist;
void main() {
  vUv = uv;
  vShade = iShade;
  vec4 vp = viewMatrix * modelMatrix * instanceMatrix * vec4( position, 1.0 );
  vDist = length( vp.xyz );
  gl_Position = projectionMatrix * vp;
}
`;

const FRAG = /* glsl */ `
uniform vec2 uFade;
varying vec2 vUv;
varying vec2 vShade;
varying float vDist;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r2 = dot( p, p );
  // 広く薄い暗がりと、足の真下の狭く濃い芯（接地の線）。板の四角い縁が出ないよう、半径1で必ず0
  float m = mix( exp( -2.6 * r2 ), exp( -11.0 * r2 ), vShade.y ) * ( 1.0 - smoothstep( 0.55, 1.0, r2 ) );
  m *= vShade.x * ( 1.0 - smoothstep( uFade.x, uFade.y, vDist ) );
  gl_FragColor = vec4( vec3( 1.0 - m ), 1.0 );
}
`;

/** 1つの影の置き場所：地面の上の中心・長い向き（水平）・半径（長さ・幅）・濃さ・芯の割合（0 で広い暗がりだけ、1 で狭く濃い芯だけ）。 */
export interface ContactSpot {
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
  length: number;
  width: number;
  strength: number;
  core: number;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _up = new Vector3(0, 1, 0);

export class ContactShadows {
  readonly mesh: InstancedMesh;
  private readonly shade: InstancedBufferAttribute;

  constructor(private readonly capacity: number) {
    const g = new PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    this.shade = new InstancedBufferAttribute(new Float32Array(capacity * 2), 2);
    this.shade.setUsage(DynamicDrawUsage);
    g.setAttribute('iShade', this.shade);
    const material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uFade: { value: [C.fadeNear, C.fadeFar] } },
      transparent: true,
      depthWrite: false,
      blending: CustomBlending,
      blendSrc: ZeroFactor,
      blendDst: SrcColorFactor,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    material.name = 'DragonContact';
    this.mesh = new InstancedMesh(g, material, capacity);
    this.mesh.name = 'dragonContact';
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    // 焦げ跡（5）の上、粒子（10〜）の下
    this.mesh.renderOrder = 6;
    this.mesh.matrixAutoUpdate = false;
    for (let i = 0; i < capacity; i++) this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
  }

  /** 影を置き直す。parent は板の親（竜の根）で、その世界の行列を打ち消して、spots を世界の座標で置く。 */
  update(parent: Object3D, groundY: number, spots: ContactSpot[]): void {
    this.mesh.matrix.copy(parent.matrixWorld).invert();
    this.mesh.matrixWorldNeedsUpdate = true;
    const arr = this.shade.array as Float32Array;
    for (let i = 0; i < this.capacity; i++) {
      const s = spots[i];
      if (!s || s.strength <= 1e-3) {
        arr[i * 2] = 0;
        this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
        continue;
      }
      arr[i * 2] = s.strength;
      arr[i * 2 + 1] = s.core;
      _p.set(s.x, groundY + C.lift, s.z);
      // 板の +z（面の上の向き v）を影の長い向きに合わせる
      _q.setFromAxisAngle(_up, Math.atan2(s.dirX, s.dirZ));
      _s.set(s.width, 1, s.length);
      this.mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
    }
    this.shade.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.updateMatrixWorld(true);
  }
}
