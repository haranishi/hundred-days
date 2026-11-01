// OWNER: chars-art
// 確認ページの舞台：world に近い仮の夜（背景 #070b16・半球光・東の高い所からの冷たい主光と影・暖色の点光2つ・青みの灰の白砂）。
// 世界の担当の本物の光とは別物なので、ここでの明るさは「どちらの光でも破綻しないか」を見る目安に使う。
import {
  ACESFilmicToneMapping,
  BackSide,
  CanvasTexture,
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  LinearMipmapLinearFilter,
  Mesh,
  MeshStandardMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

export interface LabStage {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  key: DirectionalLight;
  warm: PointLight[];
  ground: Mesh;
  render(): void;
  resize(): void;
  /** 主光の影の範囲を、注視点のまわりへ寄せる。 */
  focusShadow(target: Vector3, half: number): void;
  /** 講評用の補助光（連番で体の形と脚の動きを見やすくする。本番の光とは別物）。 */
  reviewLight(on: boolean): void;
}

/** 白砂の手ざわり（細かい粒のむら）。地面に1枚だけ使う。 */
function sandTexture(): CanvasTexture {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  if (!g) throw new Error('canvas 2d が使えない');
  g.fillStyle = '#bfc6d2';
  g.fillRect(0, 0, S, S);
  let a = 12345;
  const r = () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
  for (let i = 0; i < 26000; i++) {
    const v = r();
    g.fillStyle = v < 0.5 ? `rgba(60,66,82,${0.1 + r() * 0.16})` : `rgba(255,255,255,${0.08 + r() * 0.14})`;
    const s = 1 + r() * 2.2;
    g.fillRect(r() * S, r() * S, s, s);
  }
  // 掃き目の筋（ごく薄く）
  g.strokeStyle = 'rgba(70,78,96,0.07)';
  g.lineWidth = 2;
  for (let y = 0; y < S; y += 9) {
    g.beginPath();
    g.moveTo(0, y + Math.sin(y) * 2);
    g.lineTo(S, y + Math.cos(y) * 2);
    g.stroke();
  }
  const t = new CanvasTexture(c);
  t.flipY = false;
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.minFilter = LinearMipmapLinearFilter;
  t.anisotropy = 8;
  t.repeat.set(14, 14);
  return t;
}

/** 夜空の色の球から環境マップを作る（漆と刃に映り込む色）。 */
function nightEnvironment(renderer: WebGLRenderer): Scene['environment'] {
  const env = new Scene();
  const mat = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new Color(0x1d2747) },
      mid: { value: new Color(0x2c3656) },
      bot: { value: new Color(0x0a0c12) },
      east: { value: new Color(0x48506e) },
    },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader:
      'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; uniform vec3 east; varying vec3 vDir; void main(){ float y = vDir.y; vec3 c = y > 0.0 ? mix(mid, top, smoothstep(0.0, 0.6, y)) : mix(mid, bot, smoothstep(0.0, 0.25, -y)); c += east * pow(max(0.0, vDir.x), 3.0) * smoothstep(-0.1, 0.3, y) * 0.6; gl_FragColor = vec4(c, 1.0); }',
  });
  env.add(new Mesh(new SphereGeometry(10, 32, 16), mat));
  const pm = new PMREMGenerator(renderer);
  const rt = pm.fromScene(env, 0.02);
  pm.dispose();
  return rt.texture;
}

export function createLabStage(canvas: HTMLCanvasElement, opts: { post: boolean; width?: number; height?: number }): LabStage {
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  const scene = new Scene();
  scene.background = new Color(0x070b16);
  scene.fog = new FogExp2(0x0b1020, 0.018);
  scene.environment = nightEnvironment(renderer);
  scene.environmentIntensity = 0.7;
  const hemi = new HemisphereLight(0x34456e, 0x0a0c12, 1.05);
  scene.add(hemi);
  // 東（+X）の高い所から、弱く冷たい主光
  const key = new DirectionalLight(0xa9bcff, 1.25);
  key.position.set(6, 9, 1.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0003;
  key.shadow.normalBias = 0.025;
  key.shadow.radius = 1;
  const sc = key.shadow.camera;
  sc.near = 0.5;
  sc.far = 40;
  sc.left = -7;
  sc.right = 7;
  sc.top = 7;
  sc.bottom = -7;
  scene.add(key, key.target);
  // 近くの暖色の点光（篝火と行灯のつもり）
  const warm = [new PointLight(0xffa860, 9, 9, 2), new PointLight(0xff9a50, 6, 7, 2)];
  warm[0].position.set(-3.2, 1.7, 2.4);
  warm[1].position.set(3.6, 1.2, -2.2);
  scene.add(...warm);
  const sand = sandTexture();
  // r01-chars-周1: 指摘「舞台の砂が暗く、白砂の上で人影が黒く浮くかの試験にならない」 砂の色 #9aa4b8 → #c4cee2
  const ground = new Mesh(new PlaneGeometry(60, 60), new MeshStandardMaterial({ color: 0xc4cee2, map: sand, roughness: 0.96, metalness: 0 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.name = 'lab-ground';
  scene.add(ground);
  const camera = new PerspectiveCamera(40, 16 / 9, 0.1, 200);
  let review: DirectionalLight | null = null;
  let composer: EffectComposer | null = null;
  let bloom: UnrealBloomPass | null = null;
  if (opts.post) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    // r03-fix-visual: 指摘「倒れた信長の背に白い光の塊が残る（chars-film-assassinate）」 塊は、羽織の前の開きからのぞく白い寝間着の胸に、
    // 確認用の正面の光（強さ 1.6・露出 1.35）で掛かった光のにじみだった（遊ぶ画面の討ち取りの寄りでは光らない）。
    // にじむのは発光（提灯の紙）だけにする：しきい値 0.82→1.3
    bloom = new UnrealBloomPass(new Vector2(1280, 720), 0.55, 0.45, 1.3);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }
  const resize = () => {
    const w = opts.width ?? window.innerWidth;
    const h = opts.height ?? window.innerHeight;
    renderer.setSize(w, h, false);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    composer?.setSize(w, h);
    bloom?.setSize(w, h);
  };
  resize();
  return {
    renderer,
    scene,
    camera,
    key,
    warm,
    ground,
    render() {
      if (composer) composer.render();
      else renderer.render(scene, camera);
    },
    resize,
    reviewLight(on: boolean) {
      if (on && !review) {
        review = new DirectionalLight(0xdfe6ff, 1.6);
        review.position.set(0.5, 3, 8);
        scene.add(review, review.target);
        renderer.toneMappingExposure = 1.35;
      } else if (!on && review) {
        scene.remove(review, review.target);
        review = null;
        renderer.toneMappingExposure = 1.0;
      }
    },
    focusShadow(target: Vector3, half: number) {
      key.target.position.copy(target);
      key.position.copy(target).add(new Vector3(6, 9, 1.5));
      sc.left = -half;
      sc.right = half;
      sc.top = half;
      sc.bottom = -half;
      sc.updateProjectionMatrix();
    },
  };
}
