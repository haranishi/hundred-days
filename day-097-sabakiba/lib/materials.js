// 魚の材質一式（皮・身・切り口・骨・内臓・目・ヒレ・背わた）を生成・制御します。
// 仕様: spec/interfaces-render.md / spec/visual-direction.md
import * as THREE from '../vendor/three.js';
import { createRng, hashString } from './rng.js';
import { clamp01 } from './pixels.js';
import { createSkinTexture } from './textures-skin.js';
import { createFleshTexture, createProfileTexture } from './textures-flesh.js';
import {
  MAX_INCISIONS, MAX_INCISION_POINTS,
  patchSkinShader, patchFleshShader, patchBoneShader, patchOrganShader, patchIrisShader, patchFinShader,
} from './shader-chunks.js';

const VALID_QUALITIES = new Set(['high', 'standard', 'light']);

const FLESH_PALETTE = {
  white: { base: '#f0dfd2', deep: '#e4c7ba', chiai: '#8e4d4b', chiaiStrength: 0.34 },
  pink: { base: '#e6b7aa', deep: '#d6978c', chiai: '#631f22', chiaiStrength: 0.72 },
  red: { base: '#a63e3a', deep: '#822827', chiai: '#491216', chiaiStrength: 0.94 },
};

function sanitizeQuality(quality) {
  return VALID_QUALITIES.has(quality) ? quality : 'standard';
}

function finiteNumber(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** createMaterials({species, quality, textureSize}) と materialFactory(species, opts) の両方を受けます。 */
function parseArgs(arg0, arg1) {
  if (arg1 !== undefined) {
    return { species: arg0 && typeof arg0 === 'object' ? arg0 : {}, ...(arg1 && typeof arg1 === 'object' ? arg1 : {}) };
  }
  if (!arg0 || typeof arg0 !== 'object') return { species: {} };
  const isOptions = ('species' in arg0 || 'quality' in arg0 || 'textureSize' in arg0 || 'rng' in arg0)
    && !('sizeCm' in arg0) && !('shape' in arg0) && !('look' in arg0);
  return isOptions ? { species: {}, ...arg0 } : { species: arg0 };
}

/** 折れ線を弧長に沿って最大 maxPts 点へ再標本化し、累積弧長比 u∈[0,1] と外接球を返します。 */
function resamplePolyline(rawPoints, maxPts) {
  if (!Array.isArray(rawPoints)) return null;
  const clean = [];
  for (const pt of rawPoints) {
    if (!pt || pt.length < 3) continue;
    const x = Number(pt[0]);
    const y = Number(pt[1]);
    const z = Number(pt[2]);
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
      if (clean.length === 0) clean.push([x, y, z]);
      else {
        const prev = clean[clean.length - 1];
        if (Math.hypot(x - prev[0], y - prev[1], z - prev[2]) > 1e-6) clean.push([x, y, z]);
      }
    }
  }
  if (clean.length < 2) return null;

  const arc = [0];
  for (let i = 1; i < clean.length; i++) {
    const a = clean[i - 1];
    const b = clean[i];
    arc.push(arc[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  }
  const total = arc[arc.length - 1];
  if (!(total > 1e-6)) return null;

  let sampled;
  if (clean.length <= maxPts) {
    sampled = clean.map((p, i) => [p[0], p[1], p[2], arc[i] / total]);
  } else {
    sampled = [];
    let seg = 0;
    for (let k = 0; k < maxPts; k++) {
      const u = k / (maxPts - 1);
      const target = u * total;
      while (seg < arc.length - 2 && arc[seg + 1] < target) seg++;
      const span = Math.max(1e-9, arc[seg + 1] - arc[seg]);
      const t = clamp01((target - arc[seg]) / span);
      const a = clean[seg];
      const b = clean[seg + 1];
      sampled.push([
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
        u,
      ]);
    }
  }

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const p of sampled) {
    if (p[0] < minX) minX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[2] < minZ) minZ = p[2];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] > maxY) maxY = p[1];
    if (p[2] > maxZ) maxZ = p[2];
  }
  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  const cz = (minZ + maxZ) * 0.5;
  let rad = 0;
  for (const p of sampled) {
    const d = Math.hypot(p[0] - cx, p[1] - cy, p[2] - cz);
    if (d > rad) rad = d;
  }
  return { points: sampled, sphere: [cx, cy, cz, rad] };
}

/** 切り込み点列を詰める RGBA32F DataTexture（32×12）を作ります。 */
function createIncisionBuffer() {
  const data = new Float32Array(MAX_INCISION_POINTS * MAX_INCISIONS * 4);
  const texture = new THREE.DataTexture(data, MAX_INCISION_POINTS, MAX_INCISIONS, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.needsUpdate = true;
  texture.name = '切り込み点列';
  const meta = Array.from({ length: MAX_INCISIONS }, () => new THREE.Vector4(0, 0, 0, 0.07));
  const spheres = Array.from({ length: MAX_INCISIONS }, () => new THREE.Vector4(0, 0, 0, 0));
  return { data, texture, meta, spheres };
}

/**
 * 魚1尾分の材質セットを作成します。
 * 契約: createMaterials({species, quality, textureSize})
 * 互換: buildFishModel の materialFactory(species, {quality, rng}) としても直接渡せます。
 */
export function createMaterials(arg0 = {}, arg1) {
  const opts = parseArgs(arg0, arg1);
  const species = opts.species && typeof opts.species === 'object' ? opts.species : {};
  const quality = sanitizeQuality(opts.quality);
  const isLight = quality === 'light';
  const defaultTexSize = quality === 'high' ? 1024 : 512;
  const texSize = Math.max(64, Math.min(2048, Math.round(finiteNumber(opts.textureSize, defaultTexSize))));
  const rng = opts.rng ?? createRng(hashString(`materials:${species.id ?? 'default'}`));

  // テクスチャ生成（すべて純JS・決定的）
  const skinRes = createSkinTexture(species, {
    width: texSize,
    height: Math.max(32, texSize >> 1),
    quality,
    rng: rng.fork?.('皮色') ?? rng,
  });
  const fleshRes = createFleshTexture({
    size: isLight ? 128 : 256,
    quality,
    seed: hashString(`flesh:${species.id ?? 'default'}`),
  });
  const profileRes = createProfileTexture(species);
  const incisionBuf = createIncisionBuffer();

  const { SL, maxDepth, headLength, cavityEnd, hasLateralScutes } = profileRes.meta;
  const look = species.look ?? {};
  const colors = look.colors ?? {};
  const fleshKey = Object.hasOwn(FLESH_PALETTE, look.flesh) ? look.flesh : 'pink';
  const fleshPal = FLESH_PALETTE[fleshKey];

  // 種のうろこ寸法から体長方向・周方向の鱗ピッチを算出（細かい円鱗の比率に合わせ、周方向は必ず偶数）
  const scaleSize = Math.max(0.05, Math.min(0.45, finiteNumber(look.scale?.size, 0.13)));
  const scaleGloss = clamp01(finiteNumber(look.scale?.gloss, 0.65));
  const scaleCols = Math.max(40, Math.min(180, Math.round(14.0 / scaleSize)));
  const avgGirthRatio = Math.max(0.32, Math.min(1.05, (maxDepth / Math.max(SL, 1e-4)) * 2.15));
  const scaleRows = Math.max(20, Math.round((scaleCols * avgGirthRatio) / 2) * 2);

  // 全材質で共有する uniform（Node単体試験でも存在・更新を直接確認できる）
  const uniforms = {
    uSL: { value: SL },
    uMaxDepth: { value: maxDepth },
    uHeadLen: { value: headLength },
    uCavityEnd: { value: cavityEnd },
    uProfileTex: { value: profileRes.texture },
    uFleshTex: { value: fleshRes.texture },
    uIncisionTex: { value: incisionBuf.texture },
    uIncisionMeta: { value: incisionBuf.meta },
    uIncisionSphere: { value: incisionBuf.spheres },
    uIncisionCount: { value: 0 },
    uScale: { value: 1.0 },
    uScutes: { value: hasLateralScutes ? 1.0 : 0.0 },
    uHasScutes: { value: hasLateralScutes ? 1.0 : 0.0 },
    uScaleCols: { value: scaleCols },
    uScaleRows: { value: scaleRows },
    uScaleGloss: { value: scaleGloss },
    uIsFlat: { value: species.family === 'flat' ? 1.0 : 0.0 },
    uXray: { value: 0.0 },
    uSlitOpen: { value: 0.0 },
    uTime: { value: 0.0 },
    uSpeed: { value: 1.0 },
    uFleshBase: { value: new THREE.Color(fleshPal.base) },
    uFleshDeep: { value: new THREE.Color(fleshPal.deep) },
    uChiaiColor: { value: new THREE.Color(fleshPal.chiai) },
    uChiaiStrength: { value: fleshPal.chiaiStrength },
    uMyoPitch: { value: Math.max(0.14, maxDepth * 0.07) },
    uSkinInnerColor: { value: new THREE.Color('#cfc6c4') },
  };

  function makeMat(params, physicalExtras = {}) {
    if (isLight) return new THREE.MeshStandardMaterial(params);
    return new THREE.MeshPhysicalMaterial({ ...params, ...physicalExtras });
  }

  function attachShader(mat, cacheTag, patchFn) {
    mat.userData.uniforms = uniforms;
    mat.customProgramCacheKey = () => `sabaki:${cacheTag}:${quality}:${species.family ?? 'round'}`;
    mat.onBeforeCompile = (shader) => patchFn(shader);
    return mat;
  }

  // 1. 皮（カウンターシェード色テクスチャ＋六角うろこ＋ぜいご＋濡れたクリアコート＋切り込み＋裏面銀）
  const skin = attachShader(
    makeMat(
      {
        name: '皮',
        color: '#ffffff',
        map: skinRes.texture,
        roughness: isLight ? 0.34 : 0.28,
        metalness: isLight ? 0.26 : 0.30,
        side: THREE.DoubleSide,
        envMapIntensity: isLight ? 1.15 : 1.38,
      },
      {
        clearcoat: 0.92,
        clearcoatRoughness: 0.08,
        iridescence: quality === 'high' ? 0.32 : 0.16,
        iridescenceIOR: 1.33,
        iridescenceThicknessRange: [180, 420],
        specularIntensity: 0.95,
      },
    ),
    'skin',
    (shader) => patchSkinShader(shader, { quality, uniforms }),
  );
  skin.userData.renderOrder = 4;

  // 2. 身（筋節の「く」の字・血合い・生の艶・外側の身の切り込み）
  const flesh = attachShader(
    makeMat(
      {
        name: '身',
        color: '#ffffff',
        roughness: isLight ? 0.42 : 0.34,
        metalness: 0.02,
        envMapIntensity: isLight ? 0.85 : 1.05,
      },
      {
        clearcoat: 0.72,
        clearcoatRoughness: 0.14,
        specularIntensity: 0.75,
      },
    ),
    'flesh',
    (shader) => patchFleshShader(shader, { quality, isCap: false, uniforms }),
  );
  flesh.userData.renderOrder = 3;

  // 3. 切り口キャップ（身の輪・中央の白い椎体・脊髄の点・下の血合い）
  const cap = attachShader(
    makeMat(
      {
        name: '切り口',
        color: '#ffffff',
        roughness: isLight ? 0.46 : 0.38,
        metalness: 0.02,
        envMapIntensity: isLight ? 0.80 : 0.98,
      },
      {
        clearcoat: 0.64,
        clearcoatRoughness: 0.18,
        specularIntensity: 0.70,
      },
    ),
    'cap',
    (shader) => patchFleshShader(shader, { quality, isCap: true, uniforms }),
  );
  cap.userData.renderOrder = 3;

  // 4. 骨（象牙色・繊細な雑音・わずかな透け。過剰なクリアコートを避け象牙らしい艶に）
  const bone = attachShader(
    new THREE.MeshStandardMaterial({
      name: '骨',
      color: '#ece2c8',
      roughness: isLight ? 0.52 : 0.44,
      metalness: 0.02,
      envMapIntensity: 0.82,
    }),
    'bone',
    (shader) => patchBoneShader(shader, { quality, uniforms }),
  );
  bone.userData.renderOrder = 1;

  // 5. 内臓（腸・胃・肝臓・鰾）＋ 背わた（同一プログラムを uOrganMode で共有しコンパイルを削減）
  const makeOrgan = (name, color, roughness, metalness, organMode) => {
    const mat = attachShader(
      makeMat(
        {
          name,
          color,
          roughness: isLight ? roughness + 0.08 : roughness,
          metalness,
          envMapIntensity: 1.05,
        },
        {
          clearcoat: 0.82,
          clearcoatRoughness: 0.11,
        },
      ),
      'organ',
      (shader) => patchOrganShader(shader, { quality, organMode, uniforms }),
    );
    mat.userData.renderOrder = 1;
    return mat;
  };

  const organ = makeOrgan('腸', '#cc7b75', 0.30, 0.03, 0);
  const stomach = makeOrgan('胃', '#e0a99b', 0.32, 0.02, 0);
  const liver = makeOrgan('肝臓', '#924342', 0.27, 0.03, 0);
  const bladder = makeOrgan('鰾', '#d2dee0', 0.22, 0.30, 1);
  const kidney = makeOrgan('背わた', '#65212c', 0.28, 0.04, 2);

  // 6. 目（澄んだ黒い瞳・放射状の金銀虹彩・角膜のハイライト）＋ 口・鰓の暗い縁
  const eye = makeMat(
    {
      name: '瞳孔',
      color: '#070c12',
      roughness: 0.06,
      metalness: 0.08,
      envMapIntensity: 1.45,
    },
    {
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      ior: 1.48,
      specularIntensity: 1.0,
    },
  );
  eye.userData.uniforms = uniforms;
  eye.userData.renderOrder = 2;

  const iris = attachShader(
    makeMat(
      {
        name: '虹彩',
        color: colors.iris ?? '#D8D6C8',
        roughness: 0.20,
        metalness: 0.56,
        envMapIntensity: 1.35,
      },
      {
        clearcoat: 1.0,
        clearcoatRoughness: 0.03,
      },
    ),
    'iris',
    (shader) => patchIrisShader(shader, { uniforms }),
  );
  iris.userData.renderOrder = 2;

  const glint = new THREE.MeshStandardMaterial({
    name: '目の光',
    color: '#ffffff',
    emissive: new THREE.Color('#eef6fa'),
    emissiveIntensity: 0.65,
    roughness: 0.05,
    metalness: 0.0,
  });
  glint.userData.uniforms = uniforms;
  glint.userData.renderOrder = 2;

  const dark = new THREE.MeshStandardMaterial({
    name: '口と鰓の縁',
    color: '#1e2a30',
    roughness: 0.38,
    metalness: 0.06,
  });
  dark.userData.uniforms = uniforms;
  dark.userData.renderOrder = 2;

  // 7. ヒレ（放射状のすじ・半透明・両面）＋ ヒレのすじ
  const fin = attachShader(
    new THREE.MeshStandardMaterial({
      name: 'ヒレの膜',
      color: colors.fin ?? '#A5A882',
      roughness: 0.34,
      metalness: 0.06,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      envMapIntensity: 0.95,
    }),
    'fin',
    (shader) => patchFinShader(shader, { quality, uniforms }),
  );
  fin.userData.renderOrder = 4;

  const ray = new THREE.MeshStandardMaterial({
    name: 'ヒレのすじ',
    color: new THREE.Color(colors.fin ?? '#A5A882').multiplyScalar(0.76),
    roughness: 0.38,
    metalness: 0.05,
    transparent: true,
    opacity: 0.88,
    depthWrite: true,
  });
  ray.userData.uniforms = uniforms;
  ray.userData.renderOrder = 3;

  const kinds = {
    skin, flesh, cap, bone, organ, eye, fin, kidney,
    ray, iris, glint, dark, stomach, liver, bladder,
  };

  let xrayActive = false;
  let disposed = false;

  function setIncisions(list) {
    if (disposed) return;
    const arr = Array.isArray(list) ? list : [];
    incisionBuf.data.fill(0);
    let active = 0;
    const baseWidth = Math.max(0.055, Math.min(0.09, SL * 0.0038));

    for (let i = 0; i < arr.length && active < MAX_INCISIONS; i++) {
      const item = arr[i];
      if (!item || typeof item !== 'object') continue;
      const progress = clamp01(finiteNumber(item.progress, 0));
      if (progress <= 0) continue;
      const resampled = resamplePolyline(item.points, MAX_INCISION_POINTS);
      if (!resampled) continue;

      const rowOff = active * MAX_INCISION_POINTS * 4;
      const pts = resampled.points;
      for (let j = 0; j < pts.length; j++) {
        const off = rowOff + j * 4;
        incisionBuf.data[off] = pts[j][0];
        incisionBuf.data[off + 1] = pts[j][1];
        incisionBuf.data[off + 2] = pts[j][2];
        incisionBuf.data[off + 3] = pts[j][3];
      }
      const through = item.through ? 1 : 0;
      const widthCm = through ? Math.min(0.09, baseWidth * 1.24) : baseWidth;
      incisionBuf.meta[active].set(pts.length, progress, through, widthCm);
      const s = resampled.sphere;
      incisionBuf.spheres[active].set(s[0], s[1], s[2], s[3] + widthCm * 4.5 + 0.35);
      active++;
    }

    for (let i = active; i < MAX_INCISIONS; i++) {
      incisionBuf.meta[i].set(0, 0, 0, baseWidth);
      incisionBuf.spheres[i].set(0, 0, 0, 0);
    }
    uniforms.uIncisionCount.value = active;
    incisionBuf.texture.needsUpdate = true;
  }

  function setScale(v) {
    if (disposed) return;
    uniforms.uScale.value = clamp01(finiteNumber(v, 1));
  }

  function setScutes(v) {
    if (disposed) return;
    uniforms.uScutes.value = hasLateralScutes ? clamp01(finiteNumber(v, 1)) : 0;
  }

  function setXray(v) {
    if (disposed) return;
    const x = clamp01(finiteNumber(v, 0));
    uniforms.uXray.value = x;
    const nextActive = x > 0.001;
    if (nextActive !== xrayActive) {
      xrayActive = nextActive;
      for (const mat of [skin, flesh, cap, dark]) {
        mat.transparent = nextActive;
        mat.depthWrite = !nextActive;
        mat.needsUpdate = true;
      }
      ray.depthWrite = !nextActive;
      ray.needsUpdate = true;
    }
    dark.opacity = nextActive ? Math.max(0.22, 1 - 0.78 * x) : 1;
    ray.opacity = nextActive ? Math.max(0.28, 0.88 * (1 - 0.65 * x)) : 0.88;
  }

  function setSpeed(t) {
    if (disposed) return;
    uniforms.uSpeed.value = Math.max(0, Math.min(10, finiteNumber(t, 1)));
  }

  function setProgress(key, v) {
    if (disposed) return;
    if (key === 'scale') setScale(v);
    else if (key === 'scutes') setScutes(v);
    else if (key === 'xray') setXray(v);
    else if (key === 'slitOpen') uniforms.uSlitOpen.value = clamp01(finiteNumber(v, 0));
    else if (key === 'speed') setSpeed(v);
  }

  function update(dt) {
    if (disposed) return;
    const step = finiteNumber(dt, 0);
    if (step > 0) {
      uniforms.uTime.value += Math.min(0.1, step) * uniforms.uSpeed.value;
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const mat of new Set(Object.values(kinds))) mat.dispose();
    skinRes.texture.dispose();
    fleshRes.texture.dispose();
    profileRes.texture.dispose();
    incisionBuf.texture.dispose();
  }

  const textures = {
    skin: skinRes.texture,
    flesh: fleshRes.texture,
    profile: profileRes.texture,
    incisions: incisionBuf.texture,
  };
  const hashes = { skin: skinRes.hash, flesh: fleshRes.hash };

  return {
    ...kinds,
    kinds,
    uniforms,
    textures,
    hashes,
    quality,
    setIncisions,
    setProgress,
    setScale,
    setScutes,
    setXray,
    setSpeed,
    update,
    dispose,
  };
}
