// 種から決まる乱数。機能ごとに別の系列を使い、あとから足した機能で既存の並びが変わらないようにする。

/** 文字列を32bitの数にする（FNV-1a） */
export function hashString(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32。0以上1未満を返す関数を作る */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** ゲームの種と系列名から乱数を作る。例: stream(seed, 'arrange', 2) */
export function stream(seed, ...labels) {
  return mulberry32(hashString(`${seed >>> 0}:${labels.join(':')}`));
}

export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

/** 並びを入れ替えた新しい配列（元の配列は変えない） */
export function shuffled(rng, list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** 1〜999999 の種を作る（挑戦リンクに載せる数） */
export function newSeed(random = Math.random) {
  return 1 + Math.floor(random() * 999999);
}
