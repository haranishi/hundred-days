// OWNER: fx
// 地面の焦げ跡。炎が地面に当たった所に、まだらな黒い跡を掛け算で重ねる（下の路面の模様は残る）。
import {
  CustomBlending,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  SrcColorFactor,
  Vector3,
  ZeroFactor,
} from 'three';
import { NOISE_GLSL } from '../render/shaders/noiseGlsl';

const VERT = /* glsl */ `
attribute float iStrength;
varying vec2 vUv;
varying float vStrength;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vStrength = iStrength;
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
${NOISE_GLSL}
varying vec2 vUv;
varying float vStrength;
varying vec3 vWorld;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float n = fbm2(vWorld.xz * 0.18, 3);
  float m = smoothstep(1.0, 0.25, length(p) + (n - 0.5) * 0.8) * vStrength;
  gl_FragColor = vec4(mix(vec3(1.0), vec3(0.16, 0.14, 0.13), m), 1.0);
}
`;

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _up = new Vector3(0, 1, 0);

export class ScorchDecals {
  readonly mesh: InstancedMesh;
  private readonly strength: InstancedBufferAttribute;
  private cursor = 0;

  constructor(private readonly capacity: number) {
    const g = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.strength = new InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.strength.setUsage(DynamicDrawUsage);
    g.setAttribute('iStrength', this.strength);
    const material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: CustomBlending,
      blendSrc: ZeroFactor,
      blendDst: SrcColorFactor,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    material.name = 'Scorch';
    this.mesh = new InstancedMesh(g, material, capacity);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.name = 'scorch';
  }

  add(x: number, groundY: number, z: number, radius: number, strength: number, angle: number): void {
    const slot = this.cursor++ % this.capacity;
    this.mesh.count = Math.min(this.capacity, this.mesh.count + 1);
    _p.set(x, groundY + 0.32, z);
    _q.setFromAxisAngle(_up, angle);
    _s.set(radius * 2, 1, radius * 2);
    this.mesh.setMatrixAt(slot, _m.compose(_p, _q, _s));
    (this.strength.array as Float32Array)[slot] = strength;
    this.strength.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    this.cursor = 0;
    this.mesh.count = 0;
  }

  prime(on: boolean): void {
    if (on && this.mesh.count === 0) this.mesh.count = 1;
    else if (!on && this.cursor === 0) this.mesh.count = 0;
  }
}
