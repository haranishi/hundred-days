// 空・太陽・環境光・霞・影。色の出どころを「同じ空」1つにする：
// 空を小さな立方体へ描き、そこから環境光（PMREM）と霞の色を取る。別々の色を持たせると地平線に継ぎ目が出る。
import * as THREE from 'three/webgpu';
import {
  Fn, float, vec3, vec4, exp, max, min, dot, mix, pow, smoothstep, normalize, saturate, select, cubeTexture, positionWorld, cameraPosition, fog, texture, uniform, length, screenUV,
} from 'three/tsl';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js';

// 夕方の光の値（見た目の調整値。変えたら固定の場面を撮り直して比べる）。
// 考え方：太陽を向いた雪面の明るさを 1 とすると、空だけで照らされた日陰は 0.2〜0.25 にしたい（低い太陽の雪の写真の比）。
// SkyMesh の出力はそのままだと桁違いに明るいので、gain で空の平均の明るさを合わせる。
export const LOOK = {
  // gain 0.3 で、空の平均の明るさ（太陽の円盤を除く）がおよそ 0.35 になる（実測。SkyMesh の生の値は約 1.2）
  sky: { turbidity: 2.4, rayleigh: 1.45, mieCoefficient: 0.0042, mieDirectionalG: 0.82, gain: 0.3 },
  sun: { color: [1.0, 0.86, 0.68], intensity: 5.2 },
  envIntensity: 1.0,
  // 回り込みの光：雪原では、日なたの雪が跳ね返した光が日かげを照らす。空だけで照らすと、日かげが実物より暗く青くなる
  fill: { color: [0.86, 0.92, 1.0], intensity: 0.5 },
  exposure: 0.5,
  // 目の慣れ：山かげに入ると、明るさを最大でこの割合だけ上げる（秒は、慣れるまでの時間の目安）
  adapt: { shade: 0.45, seconds: 1.4 },
  toneMapping: 'neutral',
  // 霞：高さ baseY での濃さ（1/m）と、薄くなる高さの尺度（m）
  haze: { density: 1 / 26000, baseY: 500, scaleHeight: 1300, maxFactor: 0.94 },
};

/**
 * 日の高い時刻の光（谷と湖のマップ：南東・高さ 28° 前後の朝の光）。太陽の高さが 18° を超える山のデータで使う。
 * 夕方の値のままだと、空が暗く黄ばみ、雪が橙に寄る。参考画像は、青い空・白い雪・青い影。
 */
export const LOOK_DAY = {
  // 最初の値（濁り 1.9・散乱 1.15・明るさ 0.22）は、空が濃い紺になった。参考画像の空は、明るい水色で、地平線が白い
  // 濁りと散乱を変えても、空の上のほうは濃い紺のままだった（太陽が高いと、この空の式は天頂が暗い）。
  // viewBoost：見える空と霞の色だけを明るくする倍率。雪面を照らす環境光（gain）は変えない＝日なたと日陰の比を崩さない
  // 2026-11-11：空の式（SkyMesh）をやめ、色を自分で決めた空にした。濁りや散乱をどう変えても、見上げた空が濃い紺のままだった
  // （南の岸から山を見上げる構図で、画面の上 3 分の 1 が紺になった）。色は「画面に出したい色 ÷ 露出」で決めてある：
  // 地平線は白っぽい水色、天頂は澄んだ青。gain × viewBoost ＝ 1 にして、下の色がそのまま見える空の色になる。
  // 環境光は、その 1/viewBoost（平均の明るさ 0.3 前後＝これまでと同じ）。
  sky: { gradient: true, gain: 1 / 2.2, viewBoost: 2.2,
    zenith: [0.125, 0.36, 1.08], horizon: [0.84, 1.17, 1.52], curve: 0.46,
    warm: [0.5, 0.36, 0.16], glow: [1.0, 0.9, 0.7], disc: 60 },
  sun: { color: [1.0, 0.95, 0.86], intensity: 4.6 },
  envIntensity: 1.0,
  fill: { color: [0.82, 0.9, 1.0], intensity: 0.42 },
  // 露出：日なたの雪が、白に近い明るさ（画面の 8〜9 割）になる値。0.46 では、雪がねずみ色に見えた
  exposure: 0.58,
  adapt: { shade: 0.35, seconds: 1.4 },
  toneMapping: 'neutral',
  // 霞は薄く（参考画像は、遠くの峰までくっきり見える）。最初の値（1/34000）は、見える空を明るくしたら、谷全体が白くかすんだ
  // 2026-11-11：1/80000 では、地図の外の山並みが、手前の山と同じ濃さで見えて、遠さが出なかった。少し濃くして、遠くを空の色へ寄せる
  haze: { density: 1 / 42000, baseY: 1200, scaleHeight: 1800, maxFactor: 0.78 },
};

/**
 * 日の高い時刻の空：地平線の白っぽい水色から、天頂の青へ、なめらかに変わる色を式で描く。
 * 太陽の側の地平線は暖かく、太陽のまわりは明るい。見える空と、環境光のもとの空（円盤なし）の両方に使う。
 */
function createGradientSky(look, sunDir, showDisc, gainNode) {
  const c = look.sky;
  const material = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false });
  const d = normalize(positionWorld.sub(cameraPosition));
  const s = vec3(sunDir.x, sunDir.y, sunDir.z);
  const up = saturate(d.y);
  // 低い所で急に、上ではゆっくり青くなる（地平線の白い帯を細くする）
  let color = mix(vec3(...c.horizon), vec3(...c.zenith), pow(up, c.curve));
  // 太陽のある方角は、地平線の近くが暖かい
  const flat = normalize(vec3(d.x, 1e-4, d.z)), sunFlat = normalize(vec3(s.x, 0, s.z));
  const toward = saturate(dot(flat, sunFlat).mul(0.5).add(0.5));
  color = color.add(vec3(...c.warm).mul(pow(toward, 3)).mul(pow(float(1).sub(up), 5)));
  // 太陽のまわりの明るみ（広い薄い輪と、狭い強い輪）
  const cosA = saturate(dot(d, s));
  color = color.add(vec3(...c.glow).mul(pow(cosA, 20).mul(0.3).add(pow(cosA, 350).mul(1.1))));
  if (showDisc) color = color.add(vec3(...look.sun.color).mul(c.disc).mul(smoothstep(0.99986, 0.99996, cosA)));
  material.colorNode = vec4(color.mul(gainNode), 1);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), material);
  mesh.frustumCulled = false;
  return mesh;
}

function applySky(sky, look, sunDir, showDisc, gainNode) {
  sky.turbidity.value = look.sky.turbidity;
  sky.rayleigh.value = look.sky.rayleigh;
  sky.mieCoefficient.value = look.sky.mieCoefficient;
  sky.mieDirectionalG.value = look.sky.mieDirectionalG;
  sky.sunPosition.value.copy(sunDir);
  if (sky.cloudCoverage) sky.cloudCoverage.value = 0; // 雲は snow-look で扱う
  if (sky.showSunDisc) sky.showSunDisc.value = showDisc ? 1 : 0;
  sky.material.colorNode = sky.material.colorNode.mul(vec4(gainNode, gainNode, gainNode, 1));
}

/**
 * @param {{renderer:object, scene:object, world:object, tier:object, textures:object}} deps
 */
export function createSky({ renderer, scene, world, tier, textures, tune = {} }) {
  // 太陽の向き：山のデータの値。確認用に、向きだけ差し替えられる（そのときは、山が落とす影の地図は合わなくなる）
  const sunSource = tune.sunDir ? { x: tune.sunDir[0], y: tune.sunDir[1], z: tune.sunDir[2] } : world.meta.sun;
  const sunHeight = sunSource.y / Math.hypot(sunSource.x, sunSource.y, sunSource.z);
  const BASE = sunHeight > Math.sin(18 * Math.PI / 180) ? LOOK_DAY : LOOK;
  const look = {
    ...BASE,
    sky: { ...BASE.sky, ...(tune.sky || {}) },
    sun: { ...BASE.sun, ...(tune.sun || {}) },
    haze: { ...BASE.haze, ...(tune.haze || {}) },
    envIntensity: tune.envIntensity ?? BASE.envIntensity,
    fill: { ...BASE.fill, ...(tune.fill || {}) },
    adapt: { ...BASE.adapt, ...(tune.adapt || {}) },
    exposure: tune.exposure ?? BASE.exposure,
  };
  const HAZE = look.haze;
  const uGain = uniform(look.sky.gain);
  const viewBoost = look.sky.viewBoost ?? 1;
  const uViewGain = uniform(look.sky.gain * viewBoost);
  renderer.toneMappingExposure = look.exposure;
  const m = world.meta;
  const half = m.size / 2;
  const sunDir = new THREE.Vector3(sunSource.x, sunSource.y, sunSource.z).normalize(); // 地面から太陽への向き

  const TM = { agx: THREE.AgXToneMapping, aces: THREE.ACESFilmicToneMapping, neutral: THREE.NeutralToneMapping };
  renderer.toneMapping = TM[tune.toneMapping || look.toneMapping] || THREE.NeutralToneMapping;

  // 環境光と霞の色のもと：太陽の円盤を抜いた空（円盤を入れると、太陽の光を二重に数える）
  const envScene = new THREE.Scene();
  const gradient = look.sky.gradient === true;
  const envSky = gradient ? createGradientSky(look, sunDir, false, uGain) : new SkyMesh();
  envSky.scale.setScalar(1000);
  if (!gradient) applySky(envSky, look, sunDir, false, uGain);
  envScene.add(envSky);
  // ぼかして読めるよう、縮小の段（ミップ）も作る
  const cubeRT = new THREE.CubeRenderTarget(256, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const cubeCam = new THREE.CubeCamera(1, 5000, cubeRT);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null;
  function bakeEnvironment() {
    cubeCam.update(renderer, envScene);
    if (envRT) envRT.dispose();
    envRT = pmrem.fromCubemap(cubeRT.texture);
    scene.environment = envRT.texture;
  }
  bakeEnvironment();
  scene.environmentIntensity = look.envIntensity;

  // ---- 見える空：SkyMesh をそのまま使う（解析的なので、太陽のまわりの急な明暗でも格子が出ない） ----
  const sky = gradient ? createGradientSky(look, sunDir, true, uViewGain) : new SkyMesh();
  sky.name = 'sky';
  sky.scale.setScalar(40000);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  if (!gradient) applySky(sky, look, sunDir, true, uViewGain);
  scene.add(sky);

  // ---- 地平線より下：空の色の「霞の海」でふたをする ----
  // SkyMesh は地平線より下を灰色の面で描くので、そのままだと地図の端の先が灰色に見える。
  // 焼いた空をぼかして読み、地平線の少し上から半透明で重ねて、境目の線を作らない。雲海の作り込みは snow-look で行う。
  const seaMat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, transparent: true });
  const seaDir = normalize(positionWorld.sub(cameraPosition));
  const seaCol = cubeTexture(cubeRT.texture, normalize(vec3(seaDir.x, 0.05, seaDir.z))).bias(2.5).rgb;
  seaMat.colorNode = seaCol.mul(viewBoost).mul(mix(float(1.0), float(0.80), saturate(seaDir.y.negate().mul(3.0))));
  seaMat.opacityNode = smoothstep(0.03, -0.035, seaDir.y);
  if (tune.skyDebug === 'equirect') {
    // 確認用：焼いた立方体を、画面いっぱいの正距円筒図で見る（面の継ぎ目や向きの取り違えを探す）
    seaMat.colorNode = Fn(() => {
      const lon = screenUV.x.sub(0.5).mul(Math.PI * 2);
      const lat = float(0.5).sub(screenUV.y).mul(Math.PI);
      const d = vec3(lat.cos().mul(lon.sin()), lat.sin(), lat.cos().mul(lon.cos()).negate());
      return cubeTexture(cubeRT.texture, d).rgb;
    })();
    seaMat.opacityNode = float(1);
  }
  const sea = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), seaMat);
  sea.name = 'haze-sea';
  sea.scale.setScalar(39000);
  sea.frustumCulled = false;
  sea.renderOrder = -9;
  scene.add(sea);

  // ---- 霞：高さとともに薄くなる霧を、カメラから画素までの区間で積分する ----
  const hazeColor = Fn(() => {
    const dir = normalize(positionWorld.sub(cameraPosition));
    // 地平線の少し上の空の色を取る。下向きの視線でも地面の色にならないようにする
    const d = normalize(vec3(dir.x, max(dir.y, 0.0).mul(0.35).add(0.03), dir.z));
    return cubeTexture(cubeRT.texture, d).bias(2.0).rgb.mul(viewBoost);
  });
  const hazeFactor = Fn(() => {
    const toP = positionWorld.sub(cameraPosition);
    const dist = length(toP);
    const dy = toP.y;
    const k = float(1 / HAZE.scaleHeight);
    const a = dy.mul(k);
    // (1 - exp(-a)) / a。a が 0 に近いときは小さな正の値に置き換えて、0 での割り算を避ける（そのとき比は 1 に近い）
    const safeA = select(a.abs().lessThan(1e-4), float(1e-4), a);
    const ratio = float(1).sub(exp(safeA.negate())).div(safeA);
    const atCam = exp(cameraPosition.y.sub(HAZE.baseY).mul(k).negate());
    const tau = float(HAZE.density).mul(dist).mul(atCam).mul(ratio);
    return saturate(float(1).sub(exp(tau.negate()))).mul(HAZE.maxFactor);
  });
  if (tune.fog !== false) scene.fogNode = fog(hazeColor(), hazeFactor());

  // ---- 太陽と影 ----
  // 光源へ colorNode を渡すと、three.js は light.intensity を掛けない。強さは自分で色に入れる
  const sunColor = uniform(new THREE.Color(...look.sun.color).multiplyScalar(look.sun.intensity));
  const sun = new THREE.DirectionalLight(0xffffff, look.sun.intensity);
  sun.name = 'sun';
  sun.position.copy(sunDir).multiplyScalar(1000);
  // 山が落とす大きな影：山のデータの日当たりの地図を、光の色に掛ける。
  // カスケード影が届かない遠くも、木や滑走者も、同じ影に入る。
  // 地図の外（遠くの山並み）では、この地図を使わない：端の画素が外へ引き伸ばされて、まっすぐな暗い筋になる
  const sunUV = positionWorld.xz.add(half).div(m.size);
  const inMap = smoothstep(0.0, 0.004, min(min(sunUV.x, float(1).sub(sunUV.x)), min(sunUV.y, float(1).sub(sunUV.y))));
  const sunVis = mix(float(1), texture(textures.sunVis, sunUV).r, inMap);
  sun.colorNode = tune.sunVis === false ? sunColor : sunColor.mul(sunVis);
  sun.castShadow = true;
  sun.shadow.mapSize.set(tier.shadow.mapSize, tier.shadow.mapSize);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 3000;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.35;
  // 注意：csm.camera を自分で代入しない（CSMShadowNode の初期化が飛び、組み立てで落ちる）
  const csm = new CSMShadowNode(sun, { cascades: tier.shadow.cascades, maxFar: tier.shadow.maxFar, mode: 'practical', lightMargin: 300 });
  if (tune.csm !== false) sun.shadow.shadowNode = csm;
  if (tune.shadows === false) sun.castShadow = false;
  scene.add(sun);
  scene.add(sun.target);
  const fill = new THREE.AmbientLight(new THREE.Color(...look.fill.color), look.fill.intensity);
  fill.name = 'snow-bounce';
  scene.add(fill);
  let exposureNow = look.exposure;
  let adapted = false;

  return {
    sky, sun, csm, sunDir, sunColor, cubeTexture: cubeRT.texture,
    bakeEnvironment, look,
    /** 環境光のもとの空の明るさを測る（調整用）。上半球の6面の平均の線形の値を返す */
    async measureEnv() {
      const n = 256;
      const out = {};
      const names = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
      for (let f = 0; f < 6; f++) {
        const px = await renderer.readRenderTargetPixelsAsync(cubeRT, 0, 0, n, n, 0, f);
        // 半精度の描画先は、生の 16bit が返る。1画素ずつ数値へ戻してから平均する
        const half = px instanceof Uint16Array;
        const dec = (h) => {
          const e = (h >> 10) & 31;
          const f = h & 1023;
          const v = e === 0 ? (f / 1024) * 2 ** -14 : e === 31 ? 65504 : (1 + f / 1024) * 2 ** (e - 15);
          return h & 0x8000 ? -v : v;
        };
        let r = 0, g = 0, b = 0;
        const count = px.length / 4;
        for (let i = 0; i < px.length; i += 4) {
          r += half ? dec(px[i]) : px[i];
          g += half ? dec(px[i + 1]) : px[i + 1];
          b += half ? dec(px[i + 2]) : px[i + 2];
        }
        out[names[f]] = [r / count, g / count, b / count].map((v) => Number(v.toFixed(4)));
      }
      return out;
    },
    /** 太陽を、影の計算の中心（カメラの近く）へ追従させる */
    update(camera, dt = 0) {
      // 目の慣れ：カメラのいる場所の日当たりで、目標の明るさを決めて、ゆっくり寄せる
      const vis = world.sunVisibilityAt(camera.position.x, camera.position.z);
      const target = look.exposure * (1 + look.adapt.shade * (1 - vis));
      if (!adapted || !(dt > 0)) { if (!adapted) exposureNow = target; adapted = true; }
      else exposureNow += (target - exposureNow) * (1 - Math.exp(-dt / look.adapt.seconds));
      renderer.toneMappingExposure = exposureNow;
      sky.position.copy(camera.position);
      sea.position.copy(camera.position);
      sun.target.position.copy(camera.position);
      sun.position.copy(camera.position).addScaledVector(sunDir, 1000);
    },
    dispose() {
      scene.remove(sky, sea, sun, sun.target, fill);
      csm.dispose?.();
      sun.shadow.dispose?.();
      sea.geometry.dispose();
      sea.material.dispose();
      cubeRT.dispose();
      if (envRT) envRT.dispose();
      pmrem.dispose();
      sky.geometry.dispose();
      sky.material.dispose();
    },
  };
}
