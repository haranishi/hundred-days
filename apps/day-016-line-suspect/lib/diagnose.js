/* 診断ロジック（純粋関数だけ。ネットワークにもDOMにも触らない）

   このアプリの中身はここにある。測定そのものは既存の速度テストと変わらないが、
   「その数字をどう読むか」＝犯人が家の中にいるのか外にいるのかを言い切る部分が本体。
   ネットワークに触らないので、固定入力のテストで全分岐を押さえられる（tests/diagnose.test.mjs）。 */

import { POOR, rate } from './scales.js';

/* 採点のしきい値は lib/scales.js に1か所だけ置いてある（画面の目安表と同じものを使う） */

/** 夜とみなす時間帯（18時〜23時台）。混雑が出るならここに出る */
const NIGHT_FROM = 18;

export const isNight = (hour) => hour >= NIGHT_FROM;

/**
 * アイドル時からの遅延の増え方を採点する。
 * 距離ではなく「自分のアイドル時との差」で見るので、測定サーバーが遠くても不利にならない。
 */
export function gradeFor(latencyIdle, latencyDown, latencyUp) {
  const loaded = [latencyDown, latencyUp].filter((v) => Number.isFinite(v));
  if (!Number.isFinite(latencyIdle) || !loaded.length) return { grade: '—', increase: null, bad: false, means: null };
  const increase = Math.max(0, Math.max(...loaded) - latencyIdle);
  const { grade, means } = rate('bloat', increase);
  return { grade, means, increase: Math.round(increase), bad: POOR.has(grade) };
}

const mean = (nums) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0);

/**
 * 履歴を時間帯で割って、夜だけ遅いのか・いつも遅いのか・不規則なのかを出す。
 * 判断できないときは pattern を 'unknown' にする（黙って決めつけない）。
 */
export function analyzeHistory(items) {
  const usable = (items || []).filter((it) => Number.isFinite(it?.dl) && Number.isFinite(it?.t));
  const night = usable.filter((it) => isNight(new Date(it.t).getHours()));
  const rest = usable.filter((it) => !isNight(new Date(it.t).getHours()));

  const all = usable.map((it) => it.dl);
  const avg = mean(all);
  // 変動係数＝ばらつきを平均で割った値。回線速度そのものの大小に引きずられない指標
  const sd = all.length > 1 ? Math.sqrt(mean(all.map((v) => (v - avg) ** 2))) : 0;
  const cv = avg > 0 ? sd / avg : 0;

  const result = {
    count: usable.length,
    nightCount: night.length,
    restCount: rest.length,
    nightAvg: mean(night.map((it) => it.dl)),
    restAvg: mean(rest.map((it) => it.dl)),
    avg,
    cv,
    pattern: 'unknown'
  };

  if (usable.length < 3) return result;
  if (night.length && rest.length && result.nightAvg < result.restAvg * 0.5) result.pattern = 'night';
  else if (avg < 30) result.pattern = 'always';
  else if (cv > 0.6) result.pattern = 'erratic';
  else result.pattern = 'fine';
  return result;
}

/* 診断文。level は表示の強さで、severe＝赤／warn＝黄／info＝青緑 */
const SAY = {
  'DX-1': {
    level: 'severe',
    title: '下り方向だけが遅い',
    body: '上りは出ているのに下りだけが遅い状態です。上りと下りは同じ電波・同じ線を通るので、宅内のWi-Fiやルーターが原因ならどちらも遅くなります。片方だけ遅い＝原因は宅内の機器より外側にあります。Wi-Fiルーターを買い替えても直りません。'
  },
  'DX-2': {
    level: 'warn',
    title: '上り方向だけが遅い',
    body: '送り出す方向だけが遅い状態です。ビデオ会議のカメラ映像や、動画・写真のアップロードに影響が出ます。'
  },
  'DX-3': {
    level: 'warn',
    title: '通信中に遅延が跳ね上がる',
    body: '速度そのものは出ていても、何かをダウンロードしている間だけ反応が遅くなります。通話が途切れる・ゲームがカクつく原因はこれです。ルーターにQoS（SQM）の設定があれば改善することがあります。'
  },
  'DX-4': {
    level: 'severe',
    title: '夜だけ遅い',
    body: '昼と比べて夜の速度が半分以下に落ちています。回線が混み合う時間帯の影響で、家の中の機器を買い替えても直りません。'
  },
  'DX-5': {
    level: 'severe',
    title: '時間帯によらず遅い',
    body: 'どの時間に測っても遅い状態です。混雑ではなく、機器か回線そのものの不具合を疑う段階です。'
  },
  'DX-6': {
    level: 'warn',
    title: '不定期に落ちる',
    body: '時間帯とは関係なく、速いときと遅いときの差が大きい状態です。家の中の別の端末が通信を占有している可能性があります（更新プログラム・クラウド同期・動画の再生など）。'
  },
  'DX-7': {
    level: 'info',
    title: '1回では判断できません',
    body: '回線の速度は同じ日でも大きく振れます。時間を変えてあと数回測ると、夜だけ遅いのか・いつも遅いのかが分かれます。'
  },
  'DX-8': {
    level: 'ok',
    title: '大きな異常は見つかりませんでした',
    body: '下りと上りのつり合い、通信中の遅延、時間帯のばらつきのいずれにも問題は出ていません。'
  }
};

const withId = (id, extra = {}) => ({ id, ...SAY[id], ...extra });

/**
 * 今回の測定と履歴（今回を含む）から診断を組み立てる。
 * 当てはまったものを全部返す。並びは重い順。
 */
export function diagnose(current, history) {
  const found = [];
  const { dl, ul } = current;
  const stats = analyzeHistory(history);

  if (Number.isFinite(dl) && Number.isFinite(ul)) {
    if (dl < 30 && ul > dl * 3) found.push(withId('DX-1', { evidence: `下り ${dl.toFixed(1)} / 上り ${ul.toFixed(1)} Mbps` }));
    else if (ul < 10 && dl > ul * 3) found.push(withId('DX-2', { evidence: `下り ${dl.toFixed(1)} / 上り ${ul.toFixed(1)} Mbps` }));
  }

  if (current.grade && POOR.has(current.grade)) {
    found.push(withId('DX-3', { evidence: `アイドル時から ${current.increase}ms 増加（グレード ${current.grade}）` }));
  }

  if (stats.count < 3) {
    found.push(withId('DX-7', { evidence: `測定 ${stats.count} 回。あと ${3 - stats.count} 回で時間帯の判定が出ます` }));
  } else if (stats.pattern === 'night') {
    found.push(withId('DX-4', { evidence: `夜の平均 ${stats.nightAvg.toFixed(1)} / 他の時間帯 ${stats.restAvg.toFixed(1)} Mbps` }));
  } else if (stats.pattern === 'always') {
    found.push(withId('DX-5', { evidence: `${stats.count}回の平均 ${stats.avg.toFixed(1)} Mbps` }));
  } else if (stats.pattern === 'erratic') {
    found.push(withId('DX-6', { evidence: `${stats.count}回の平均 ${stats.avg.toFixed(1)} Mbps・ばらつきが大きい` }));
  }

  if (!found.some((f) => f.level === 'severe' || f.level === 'warn')) {
    found.unshift(withId('DX-8'));
  }

  const order = { severe: 0, warn: 1, info: 2, ok: 3 };
  return { items: found.sort((a, b) => order[a.level] - order[b.level]), stats };
}

/** 3時間刻みの集計。report用の表をそのまま作れる形で返す */
export function buckets(items) {
  const slots = Array.from({ length: 8 }, (_, i) => ({ from: i * 3, to: i * 3 + 3, dl: [], ul: [] }));
  for (const it of items || []) {
    if (!Number.isFinite(it?.t)) continue;
    const slot = slots[Math.floor(new Date(it.t).getHours() / 3)];
    if (Number.isFinite(it.dl)) slot.dl.push(it.dl);
    if (Number.isFinite(it.ul)) slot.ul.push(it.ul);
  }
  return slots.map((s) => ({
    label: `${String(s.from).padStart(2, '0')}-${String(s.to).padStart(2, '0')}時`,
    count: s.dl.length,
    dl: s.dl.length ? mean(s.dl) : null,
    ul: s.ul.length ? mean(s.ul) : null
  }));
}
