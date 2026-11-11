// 遠くの森：山ぜんたいの木を、いちばん軽い形（1 本 40 三角形）で、動かさずに描いておく。
//
// なぜ要るか：木を 1 本ずつ出し入れする部品（scatter.js）は、カメラの周り数百 m だけを描く。その外は、雪面に暗い色を塗っていた。
// 谷の向こうや、上空からの眺めでは、森が「雪に塗った縞」に見えた（2026-11-11 の見比べ）。参考画像の森は、遠くでも 1 本ずつ立っている。
//
// 作り：木の位置は、当たり判定と同じ問い合わせ（world.obstaclesNear）から、起動のときに 1 度だけ集める。
// 山を 1,024 m の区画に分け、区画×木の種類ごとに 1 つの入れ物にする（視界の外の区画は、three.js が描かない）。
// 近く（scatter.js が細かい木を描く範囲）では、頂点を根元へ畳んで消す。行列は持たず、位置・高さ・向きから頂点の計算で置く。
import * as THREE from 'three/webgpu';
import { attribute, cameraPosition, cos, sin, length, mix, smoothstep, vec3, positionGeometry, normalGeometry, transformNormalToView } from 'three/tsl';

const CHUNK = 96; // 木の位置を集めるときの区切り（scatter.js と同じ大きさ）
const REGION = 1024; // 視界の判定の単位（m）

function hash01(n) {
  let t = (n ^ 0x9e3779b9) >>> 0;
  t = Math.imul(t ^ (t >>> 16), 0x85ebca6b);
  t = Math.imul(t ^ (t >>> 13), 0xc2b2ae35);
  return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
}

/**
 * @param {{scene:object, world:object, shapes:object[], fadeStart?:number, fadeEnd?:number, extra?:number}} deps
 *   shapes：木の種類ごとの「高さ 1 の形」（いちばん軽い段）。fadeStart〜fadeEnd：この距離（m）で現れはじめ、現れきる。
 *   extra：木 1 本につき、遠くでだけ足す「添え木」の数。当たり判定のある木は、滑りやすさのために 7〜10 m おきにしてある。
 *   そのままだと、上空や谷の向こうから、森がまばらな点に見えた（2026-11-11）。遠くでは、森の中に限って、木を足して濃く見せる（近くでは描かないので、滑りには影響しない）
 */
export function createFarForest({ scene, world, shapes, fadeStart = 400, fadeEnd = 450, extra = 1 }) {
  const group = new THREE.Group();
  group.name = 'far-forest';
  scene.add(group);
  const variants = shapes.length;
  const half = world.half;
  const perSide = Math.ceil((half * 2) / REGION);

  // 1 つの材質を、すべての入れ物で使い回す。木ごとの値は、入れ物の属性（tree：位置と高さ、turn：向きと太さ）から読む
  const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
  const tree = attribute('tree', 'vec4');
  const turn = attribute('turn', 'vec2');
  const c = cos(turn.x), s = sin(turn.x);
  const spin = (v) => vec3(v.x.mul(c).add(v.z.mul(s)), v.y, v.z.mul(c).sub(v.x.mul(s)));
  const wide = tree.w.mul(turn.y);
  const distance = length(tree.xyz.sub(cameraPosition));
  const shown = smoothstep(fadeStart, fadeEnd, distance);
  // 遠いほど、枝の雪の白を減らして、暗い緑へ寄せる。1 本が数画素になる距離では、白と緑の細かな明暗が、白黒の粒のちらつきに見えた
  // （上から見おろすと、枝の雪の白ばかりが見えて、森が白い点の集まりに見えた。遠くでは、ほぼ暗い緑にする）
  // （軽い形の木は、色のほとんどが枝の雪。そのまま出すと、中くらいの距離の森だけ、白っぽい帯に見えた：2026-11-11）
  // 2026-11-11（2 回目）：上空と谷の向こう（2 km より先）では、まだ灰緑に見えた（参考画像の森は、遠くでも暗い緑）。
  // 1 本が 1 画素より小さくなる距離では、枝の雪の白を、ほぼ出さない（白が 12% 残るだけで、森の明るさが 2 倍になる）
  material.colorNode = mix(attribute('color', 'vec3'), vec3(0.034, 0.068, 0.05), smoothstep(300, 1400, distance).mul(0.22).add(smoothstep(1400, 3000, distance).mul(0.09)).add(0.66));
  material.positionNode = tree.xyz.add(spin(positionGeometry.mul(vec3(wide, tree.w, wide))).mul(shown));
  material.normalNode = transformNormalToView(spin(normalGeometry));

  const stats = { trees: 0, meshes: 0, buildMs: 0, ready: false, detail: 1 };
  const geometries = [];
  const counts = []; // 入れ物ごとの、ぜんぶの本数（描く本数を減らすときの元）

  /**
   * 木の位置を集めて、入れ物を作る。時間のかかる処理なので、少しずつ進めて画面を止めない。
   * @param {{slice?:number, onProgress?:(ratio:number)=>void}} options slice：1 度に使ってよい時間（ms）
   */
  async function build({ slice = 12, onProgress } = {}) {
    const t0 = performance.now();
    const chunksPerSide = Math.ceil((half * 2) / CHUNK);
    // 区画×種類ごとに、木の値をためる
    const bins = Array.from({ length: perSide * perSide * variants }, () => ({ tree: [], turn: [], minY: Infinity, maxY: -Infinity }));
    const found = [];
    let sliceStart = performance.now();
    for (let iz = 0; iz < chunksPerSide; iz++) {
      for (let ix = 0; ix < chunksPerSide; ix++) {
        const cx = ix * CHUNK - half + CHUNK / 2, cz = iz * CHUNK - half + CHUNK / 2;
        found.length = 0;
        world.obstaclesNear(cx, cz, CHUNK * 0.7072, found);
        for (let i = 0; i < found.length; i++) {
          const o = found[i];
          if (o.type !== 'tree' || Math.abs(o.x - cx) > CHUNK / 2 || Math.abs(o.z - cz) > CHUNK / 2) continue;
          // 種類・向き・太さは、scatter.js と同じ決め方（近くの木と、同じ姿で立つ）
          const key = Math.round(o.x * 7.3) * 73856093 ^ Math.round(o.z * 7.3) * 19349663;
          const v = Math.floor(hash01(key) * variants) % variants;
          const rx = Math.min(perSide - 1, Math.max(0, Math.floor((o.x + half) / REGION)));
          const rz = Math.min(perSide - 1, Math.max(0, Math.floor((o.z + half) / REGION)));
          const bin = bins[(rz * perSide + rx) * variants + v];
          bin.tree.push(o.x, o.y - o.height * 0.03, o.z, o.height);
          bin.turn.push(hash01(key + 11) * Math.PI * 2, 0.9 + hash01(key + 23) * 0.3);
          if (o.y < bin.minY) bin.minY = o.y;
          if (o.y + o.height > bin.maxY) bin.maxY = o.y + o.height;
          stats.trees++;
          // 添え木：3〜6.5 m 離れた所に、少し低い木を足す。森の中（木の密度が 0 でない所）だけ：滑走の帯・道・建物・湖へは、はみ出さない
          for (let e = 0; e < extra; e++) {
            const a = hash01(key + 31 + e * 7) * Math.PI * 2, d = 3 + hash01(key + 37 + e * 7) * 3.5;
            const ex = o.x + Math.cos(a) * d, ez = o.z + Math.sin(a) * d;
            if (!(world.treeDensityAt(ex, ez) > 0.02)) continue;
            const eh = o.height * (0.72 + hash01(key + 41 + e * 7) * 0.3), ey = world.heightAt(ex, ez);
            const ev = Math.floor(hash01(key + 43 + e * 7) * variants) % variants;
            const erx = Math.min(perSide - 1, Math.max(0, Math.floor((ex + half) / REGION))), erz = Math.min(perSide - 1, Math.max(0, Math.floor((ez + half) / REGION)));
            const eb = bins[(erz * perSide + erx) * variants + ev];
            eb.tree.push(ex, ey - eh * 0.03, ez, eh);
            eb.turn.push(hash01(key + 47 + e * 7) * Math.PI * 2, 0.9 + hash01(key + 53 + e * 7) * 0.3);
            if (ey < eb.minY) eb.minY = ey;
            if (ey + eh > eb.maxY) eb.maxY = ey + eh;
            stats.trees++;
          }
        }
      }
      if (performance.now() - sliceStart > slice) {
        onProgress?.((iz + 1) / chunksPerSide);
        await new Promise((resolve) => setTimeout(resolve, 0));
        sliceStart = performance.now();
      }
    }
    for (let r = 0; r < perSide * perSide; r++) {
      const rx = r % perSide, rz = Math.floor(r / perSide);
      for (let v = 0; v < variants; v++) {
        const bin = bins[r * variants + v];
        const count = bin.tree.length / 4;
        if (!count) continue;
        // 並びを、決まった乱数でかき混ぜる：描く本数を減らすとき（軽い画質の段）、先頭から n 本を描くだけで、森がまんべんなく薄くなる
        for (let i = count - 1; i > 0; i--) {
          const j = Math.floor(hash01(i * 2654435761 + r * 97 + v) * (i + 1));
          for (let q = 0; q < 4; q++) { const t = bin.tree[i * 4 + q]; bin.tree[i * 4 + q] = bin.tree[j * 4 + q]; bin.tree[j * 4 + q] = t; }
          for (let q = 0; q < 2; q++) { const t = bin.turn[i * 2 + q]; bin.turn[i * 2 + q] = bin.turn[j * 2 + q]; bin.turn[j * 2 + q] = t; }
        }
        const base = shapes[v];
        const g = new THREE.InstancedBufferGeometry();
        g.setAttribute('position', base.getAttribute('position'));
        g.setAttribute('normal', base.getAttribute('normal'));
        g.setAttribute('color', base.getAttribute('color'));
        g.setIndex(base.getIndex());
        g.setAttribute('tree', new THREE.InstancedBufferAttribute(new Float32Array(bin.tree), 4));
        g.setAttribute('turn', new THREE.InstancedBufferAttribute(new Float32Array(bin.turn), 2));
        g.instanceCount = count;
        // 頂点は計算で置くので、視界の判定に使う球を自分で決める（区画の箱を包む球）
        const cx = rx * REGION - half + REGION / 2, cz = rz * REGION - half + REGION / 2, cy = (bin.minY + bin.maxY) / 2;
        g.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, cy, cz), Math.hypot(REGION * 0.7072 + 20, (bin.maxY - bin.minY) / 2 + 20));
        const mesh = new THREE.Mesh(g, material);
        mesh.name = `far-forest-${rx}-${rz}-${v}`;
        mesh.castShadow = false; // 遠くの木の影は、雪面の側で暗くして表す（影の地図は近くだけ）
        mesh.receiveShadow = false;
        group.add(mesh);
        geometries.push(g);
        counts.push(count);
        stats.meshes++;
      }
    }
    stats.buildMs = Math.round(performance.now() - t0);
    stats.ready = true;
    setDetail(stats.detail);
    onProgress?.(1);
    return stats;
  }

  /** 描く本数の割合（0〜1）。軽い画質の段では減らす。0 なら、ぜんぶ隠す（森は、雪面の色だけで表す） */
  function setDetail(fraction) {
    stats.detail = Math.min(1, Math.max(0, fraction));
    group.visible = stats.detail > 0;
    for (let i = 0; i < geometries.length; i++) geometries[i].instanceCount = Math.max(1, Math.round(counts[i] * stats.detail));
  }

  return {
    group, stats, build, setDetail, fadeStart, fadeEnd,
    dispose() {
      scene.remove(group);
      material.dispose();
      for (const g of geometries) g.dispose();
    },
  };
}
