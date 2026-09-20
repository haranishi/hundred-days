/* 判定。押した時刻と打点のズレ（秒）だけを見る。

   窓の値は秋田リズムゲームの要件定義で決めた初期値をそのまま引き継いだ。
   ここを甘くすると気持ちよさが消える。実機で確かめてから動かすこと。 */

export const WINDOW = {
  perfect: 0.035,
  good: 0.080,
  // ここより外の入力は、どの打点にも結びつけない＝から振り
  reach: 0.160
};

export const LABEL = {
  perfect: 'ドンピシャ',
  good: 'おしい',
  miss: 'ミス',
  whiff: 'から振り',
  held: 'よく我慢した'
};

/** ズレ(秒) → 判定。reach の外は null（どの打点のものでもない）。 */
export function judgeOffset(offsetSeconds) {
  const gap = Math.abs(offsetSeconds);
  if (!Number.isFinite(gap)) return null;
  if (gap <= WINDOW.perfect) return 'perfect';
  if (gap <= WINDOW.good) return 'good';
  if (gap <= WINDOW.reach) return 'miss';
  return null;
}

/** まだ叩かれていない打点のうち、指定時刻にいちばん近いものの位置を返す。無ければ -1。 */
export function findNote(notes, timeSeconds, taken) {
  let best = -1;
  let bestGap = Infinity;
  for (let index = 0; index < notes.length; index += 1) {
    if (taken.has(index)) continue;
    const gap = Math.abs(notes[index].time - timeSeconds);
    if (gap < bestGap) {
      bestGap = gap;
      best = index;
    }
  }
  return bestGap <= WINDOW.reach ? best : -1;
}

/* ランク。**敵船に届いた弾の数（ドンピシャ）だけ**で決める。

   画面が「届くのはドンピシャで返した弾だけ」と宣言している以上、順位もその1本で切る。
   おしい・から振りの数は内訳として出すが、順位には混ぜない。

   ここは2周作り直した。
   1周目：まじめな回と連打の回が同じ見出しだった → 刻みを6段に増やした
   2周目：**敵船を大破させた回と、1発も届かなかった回が同じ「操舵手」**だった
          （おしいをドンピシャと同じに数えていたため）。順位の物差しそのものが違っていた。
          あわせて、から振り1回でキャプテンから落ちる段差もやめた（連打とは別物なので）。 */
/* 順位の段。下から上へ。結果画面に「いま自分がどこにいるか」を出すのに使う。 */
export const RANK_STEPS = [
  { key: 'rookie', label: '新入り', at: 0.1 },
  { key: 'crew', label: '見習い', at: 0.3 },
  { key: 'helm', label: '操舵手', at: 0.5 },
  { key: 'mate', label: '甲板長', at: 0.7 },
  { key: 'captain', label: 'キャプテン', at: 0.9 }
];

export const RANK_LADDER = ['まだ船酔い', ...RANK_STEPS.map((step) => step.label)];

/** 次の段と、そこまであと何発ドンピシャが要るか。いちばん上なら null。 */
export function nextRank(counts) {
  const total = Math.max(0, Number(counts.total) || 0);
  const landed = Number(counts.perfect) || 0;
  if (total === 0) return null;
  for (const step of RANK_STEPS) {
    const need = Math.ceil(step.at * total) - landed;
    if (need > 0) return { key: step.key, label: step.label, needed: need };
  }
  return null;
}

export function rank(counts) {
  const total = Math.max(0, Number(counts.total) || 0);
  const landed = Number(counts.perfect) || 0;
  const missed = Number(counts.miss) || 0;
  if (total === 0) return { key: 'none', label: '\u2014', note: '打つものが1つも来なかった' };

  const ratio = landed / total;
  if (ratio >= 0.9 && missed === 0) {
    return { key: 'captain', label: 'キャプテン', note: '波の音まで合っていた' };
  }
  if (ratio >= 0.7) return { key: 'mate', label: '甲板長', note: '敵船はもう戦えない' };
  if (ratio >= 0.5) return { key: 'helm', label: '操舵手', note: '半分より多く届いた。あとは間だけ' };
  if (ratio >= 0.3) return { key: 'crew', label: '見習い', note: 'おしいをドンピシャに変えられれば、船は沈む' };
  if (ratio >= 0.1) return { key: 'rookie', label: '新入り', note: '合図の音の2拍あと。そこだけ数えてみる' };
  return { key: 'seasick', label: 'まだ船酔い', note: '目より先に、耳を使うと届く' };
}
