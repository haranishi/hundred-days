/* 自己ベスト（端末内の保存）。保存するのは「最短の合計秒数」と「そのときのランク」だけで、
   個人を特定する情報やプレイ中の選択は残さない。対象は被害0円・時間切れなしの周だけ。
   保存先は引数で受け取る（ブラウザでは localStorage）。拒否・容量超過・プライベートモードで
   読み書きが失敗しても、ゲームは記録なしとして続ける。 */

export const BEST_KEY = "day063.best.v1";

export function isBestEligible({ totalDamage, hasTimeouts }) {
  return totalDamage === 0 && !hasTimeouts;
}

// 壊れた値・別の形の値は「記録なし」として扱う
export function parseBest(raw) {
  if (typeof raw !== "string" || raw === "") return null;
  try {
    const value = JSON.parse(raw);
    if (value && Number.isInteger(value.sec) && value.sec > 0 && (value.rank === "S" || value.rank === "A")) {
      return { sec: value.sec, rank: value.rank };
    }
  } catch {
    // 読めない値は記録なし
  }
  return null;
}

// 2つの記録のうち速い方（片方が無ければもう片方）。保存に失敗したときの、ページ内だけの記録と突き合わせる
export function betterBest(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return b.sec < a.sec ? b : a;
}

/* run = { totalDamage, hasTimeouts, totalTimeSec, rank }。
   返り値の updated は「今回の周で記録が変わった」、first は「それが初めての記録」（更新とは言わない） */
export function mergeBest(previous, run) {
  if (!isBestEligible(run)) return { best: previous, updated: false, first: false };
  if (!previous || run.totalTimeSec < previous.sec) {
    return { best: { sec: run.totalTimeSec, rank: run.rank }, updated: true, first: !previous };
  }
  return { best: previous, updated: false, first: false };
}

export function readBest(storage) {
  try {
    return parseBest(storage ? storage.getItem(BEST_KEY) : null);
  } catch {
    return null;
  }
}

export function writeBest(storage, best) {
  if (!storage || !best) return false;
  try {
    storage.setItem(BEST_KEY, JSON.stringify({ sec: best.sec, rank: best.rank }));
    return true;
  } catch {
    return false;
  }
}

/* 結果画面の1行と札。best が無ければ、記録の条件を案内する。
   札は、初めての記録なら「初記録！」、縮めたときだけ「更新！」、それ以外は出さない（badge: null）。
   記録の対象になる周（run）で縮められなかったときは、自己ベストまでの差を書く（更新した周と同じ文にしない） */
export function describeBest({ best, updated, first, run }) {
  if (!best) return { text: "自己ベストは、被害0円・時間切れなしの周で記録されます", badge: null };
  const badge = updated ? (first ? "初記録！" : "更新！") : null;
  const label = `自己ベスト ${best.sec}秒（${best.rank}）`;
  if (!updated && run && isBestEligible(run)) {
    const gap = run.totalTimeSec - best.sec;
    if (gap > 0) return { text: `${label}まであと${gap}秒`, badge };
    if (gap === 0) return { text: `${label}と同じタイム`, badge };
  }
  return { text: label, badge };
}
