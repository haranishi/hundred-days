// Poly Haven の3Dモデル（CC0）と床・壁の質感素材を落として、ブラウザ向けに軽くする。
// 素材を全部作り直せるようにしておくための道具で、アプリの実行には使わない。
//
// 使い方（道具はリポジトリに入れず、別の場所に入れて ASSET_TOOLS で指す）:
//   npm i --prefix /tmp/asset-tools @gltf-transform/core@4 @gltf-transform/functions@4 \
//     @gltf-transform/extensions@4 sharp meshoptimizer
//   ASSET_TOOLS=/tmp/asset-tools node day-054-what-vanished/scripts/fetch-assets.mjs [--only id,id]
//
// 出力: assets/models/<id>.glb・assets/textures/<name>_<map>.webp・data/models.json（寸法と重さ）
// 取得には Poly Haven の公開API（https://api.polyhaven.com）を使う。
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { BACKDROP_SOURCES, MODEL_SOURCES, TEXTURE_SOURCES } from './asset-list.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..');
const cacheDir = process.env.ASSET_CACHE || join(tmpdir(), 'hundred-days-054-polyhaven');
const toolsDir = process.env.ASSET_TOOLS;
if (!toolsDir) throw new Error('ASSET_TOOLS に道具を入れたフォルダを指定してください（先頭のコメント参照）');

const req = createRequire(join(toolsDir, 'package.json'));
const load = async (name) => import(pathToFileURL(req.resolve(name)).href);
const { NodeIO, getBounds } = await load('@gltf-transform/core');
const { ALL_EXTENSIONS } = await load('@gltf-transform/extensions');
const fn = await load('@gltf-transform/functions');
const sharp = (await load('sharp')).default;
const { MeshoptSimplifier } = await load('meshoptimizer');

const UA = 'hundred-days-day054-asset-fetch (https://github.com/haranishi/hundred-days)';
const only = (() => {
  const i = process.argv.indexOf('--only');
  return i > 0 ? new Set(process.argv[i + 1].split(',')) : null;
})();

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function download(url, dest) {
  if (existsSync(dest)) return;
  mkdirSync(dirname(dest), { recursive: true });
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

async function fetchModel(ph) {
  const files = await getJson(`https://api.polyhaven.com/files/${ph}`);
  const g = files.gltf['1k'].gltf;
  const dir = join(cacheDir, 'models', ph);
  const main = join(dir, `${ph}.gltf`);
  await download(g.url, main);
  await Promise.all(Object.entries(g.include).map(([rel, f]) => download(f.url, join(dir, rel))));
  const info = await getJson(`https://api.polyhaven.com/info/${ph}`);
  return { main, info };
}

function triangles(doc) {
  let n = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      const pos = prim.getAttribute('POSITION');
      n += (idx ? idx.getCount() : pos.getCount()) / 3;
    }
  }
  return Math.round(n);
}

async function processModel(src) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const { main, info } = await fetchModel(src.ph);
  const doc = await io.read(main);
  const before = triangles(doc);
  await MeshoptSimplifier.ready;
  const steps = [fn.dedup(), fn.prune(), fn.weld()];
  if (before > src.maxTris) {
    // 葉や本の束のように継ぎ目が多い物は、許す誤差を広げないと間引きが止まる
    steps.push(fn.simplify({
      simplifier: MeshoptSimplifier,
      ratio: src.maxTris / before,
      error: src.error ?? 0.002,
      lockBorder: src.lockBorder ?? true
    }));
  }
  const aux = src.texAux ?? Math.max(256, src.tex / 2);
  steps.push(
    // 色だけ tex の大きさ、凹凸・陰り・粗さは半分にする（近づかないと差が見えない）
    fn.textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [src.tex, src.tex], quality: 82, slots: /^baseColor/ }),
    fn.textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [aux, aux], quality: 80, slots: /^(normal|occlusion|metallicRoughness)/ }),
    fn.textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [aux, aux], quality: 80 }),
    fn.prune(),
    fn.quantize()
  );
  await doc.transform(...steps);
  const out = join(appDir, 'assets', 'models', `${src.id}.glb`);
  await io.write(out, doc);
  const b = getBounds(doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0]);
  const size = b.max.map((v, i) => +(v - b.min[i]).toFixed(3));
  return {
    id: src.id,
    ph: src.ph,
    name: info.name,
    authors: Object.keys(info.authors || {}),
    trisBefore: before,
    tris: triangles(doc),
    bytes: statSync(out).size,
    tex: src.tex,
    size,
    min: b.min.map(v => +v.toFixed(3)),
    max: b.max.map(v => +v.toFixed(3))
  };
}

async function processTexture(t) {
  const files = await getJson(`https://api.polyhaven.com/files/${t.ph}`);
  const maps = { diff: files[t.diffKey || 'Diffuse'], nor: files.nor_gl, arm: files.arm };
  const done = {};
  for (const [key, entry] of Object.entries(maps)) {
    if (!t.maps.includes(key)) continue;
    const jpg = entry['1k'].jpg;
    const cached = join(cacheDir, 'textures', t.ph, `${key}.jpg`);
    await download(jpg.url, cached);
    const out = join(appDir, 'assets', 'textures', `${t.id}_${key}.webp`);
    // 凹凸・陰り・粗さは色ほど細かさが要らないので、auxSize があればその大きさにする（GPUの記憶域を抑える）
    const px = key === 'diff' ? t.size : (t.auxSize ?? t.size);
    await sharp(readFileSync(cached)).resize(px, px).webp({ quality: 80 }).toFile(out);
    done[key] = statSync(out).size;
  }
  const info = await getJson(`https://api.polyhaven.com/info/${t.ph}`);
  return { id: t.id, ph: t.ph, name: info.name, authors: Object.keys(info.authors || {}), bytes: done, size: t.size };
}

const manifestPath = join(appDir, 'data', 'models.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { models: {}, textures: {} };
for (const src of MODEL_SOURCES) {
  if (only && !only.has(src.id)) continue;
  const r = await processModel(src);
  manifest.models[src.id] = r;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`${r.id.padEnd(22)} ${String(r.trisBefore).padStart(7)} → ${String(r.tris).padStart(6)} tris  ${(r.bytes / 1024).toFixed(0).padStart(5)} KB  ${r.size.join(' × ')} m`);
}
for (const t of TEXTURE_SOURCES) {
  if (only && !only.has(t.id)) continue;
  const r = await processTexture(t);
  manifest.textures[t.id] = r;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`${r.id.padEnd(22)} ${JSON.stringify(r.bytes)}`);
}
async function processBackdrop(b) {
  const files = await getJson(`https://api.polyhaven.com/files/${b.ph}`);
  const cached = join(cacheDir, 'backdrops', `${b.ph}.jpg`);
  await download(files.tonemapped.url, cached);
  const out = join(appDir, 'assets', 'textures', `${b.id}_sky.webp`);
  await sharp(readFileSync(cached), { limitInputPixels: false }).resize(b.width, b.width / 2).webp({ quality: 78 }).toFile(out);
  const info = await getJson(`https://api.polyhaven.com/info/${b.ph}`);
  return { id: b.id, ph: b.ph, name: info.name, authors: Object.keys(info.authors || {}), bytes: { sky: statSync(out).size }, size: b.width };
}

for (const b of BACKDROP_SOURCES) {
  if (only && !only.has(b.id)) continue;
  const r = await processBackdrop(b);
  manifest.textures[b.id] = r;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`${r.id.padEnd(22)} ${JSON.stringify(r.bytes)}`);
}
manifest.generatedBy = 'scripts/fetch-assets.mjs';
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
const total = Object.values(manifest.models).reduce((s, m) => s + m.bytes, 0)
  + Object.values(manifest.textures).reduce((s, t) => s + Object.values(t.bytes).reduce((a, b) => a + b, 0), 0);
console.log(`合計 ${(total / 1024 / 1024).toFixed(2)} MB`);
