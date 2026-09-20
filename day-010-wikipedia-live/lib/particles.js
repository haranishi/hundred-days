/* 地図に立てるピンの見た目だけを担当する。描画も乱数もここには入れないので、
   同じ入力なら必ず同じ結果になり、そのままテストできる。

   ピンは2つの部品でできている。
     波紋（ripple）… 立った瞬間だけ広がって消える。目を引くため
     しるし（mark）… 5分かけて薄れる点。集中している場所が濃く見えるため */

export const RIPPLE_MS = 1100;
export const RIPPLE_MS_JA = 2600; // 日本語版はめったに来ないので長めに残す
export const MARK_MS = 5 * 60 * 1000;
export const MAX_RADIUS = 13;

/** バイト増減 → 点の大きさ。小さな修正と大きな加筆で見た目が変わるように対数で効かせる。 */
export function radiusFor(delta) {
  const size = Math.abs(Number.isFinite(delta) ? delta : 0);
  return Number(Math.min(MAX_RADIUS, 2.2 + 3.4 * Math.log10(size + 1)).toFixed(3));
}

/* ピンが持つのは緯度経度だけにして、画面の座標は描くときに毎回計算する。
   画面の座標で持つと、window を横に伸ばした瞬間に既存のピンが全部ずれた場所に残る */
export function createRipple({ lon, lat, delta = 0, isJa = false, title = '' } = {}) {
  const life = isJa ? RIPPLE_MS_JA : RIPPLE_MS;
  const r = radiusFor(delta);
  return { lon, lat, r, rMax: r * (isJa ? 7 : 4.2), isJa, title, delta, age: 0, life };
}

/** 波紋を dtMs ぶん広げる。寿命が尽きたものは返り値から消える。 */
export function stepRipples(ripples, dtMs) {
  const step = Math.max(0, dtMs);
  const next = [];
  for (const ripple of ripples) {
    const age = ripple.age + step;
    if (age >= ripple.life) continue;
    const progress = age / ripple.life;
    const eased = 1 - (1 - progress) ** 3;
    next.push({
      ...ripple,
      age,
      radius: ripple.r + (ripple.rMax - ripple.r) * eased,
      alpha: Number((1 - progress).toFixed(4))
    });
  }
  return next;
}

export function createMark({ lon, lat, delta = 0, isJa = false } = {}) {
  // 世界地図の縮尺では点が小さくなりすぎるので下限を持たせる
  return { lon, lat, r: Math.max(2.8, radiusFor(delta) * 0.62), isJa, age: 0, life: MARK_MS, alpha: 1 };
}

/**
 * しるしを dtMs ぶん薄くする。消えるのは5分後。
 * 薄れ方は最初ゆっくり・後半で速く（直近のピンほどはっきり見せたいため）。
 */
export function stepMarks(marks, dtMs) {
  const step = Math.max(0, dtMs);
  const next = [];
  for (const mark of marks) {
    const age = mark.age + step;
    if (age >= mark.life) continue;
    const progress = age / mark.life;
    // 1 - p^2：最初はほとんど薄れず、終わりぎわで一気に消える。
    // (1 - p)^2 にすると逆に立った直後がいちばん速く薄れて、直近のピンが目立たなくなる
    next.push({ ...mark, age, alpha: Number((1 - progress ** 2).toFixed(4)) });
  }
  return next;
}
