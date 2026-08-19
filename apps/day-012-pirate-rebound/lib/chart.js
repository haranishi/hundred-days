import { COUNT_IN_BEATS } from './beat.js';

/* 譜面。拍だけで書く。秒はここに出てこない。

   持ち方は「発射」を並べるだけにして、打点はそこから計算で出す。
   打点を直接書くと、飛行時間を変えたときに全部書き直しになるため。 */

/** 発射から自分の船へ届くまでの拍数。ここを変えると難易度が根本から変わる。 */
export const FLIGHT_BEATS = 2;

/** 二連弾の2発目が、1発目から何拍あとに来るか。 */
export const DOUBLE_GAP_BEATS = 0.5;

/* kind:
     cannon … 1回押す
     double … 半拍あけて2回押す
     gull   … 押さない（音を聞かずに連打していると、ここで必ず引っかかる）  */
const MAIN_EVENTS = [
  // 練習の1発。カウントインの中で撃たれる。当たっても外しても点にはならない
  { beat: -6, kind: 'cannon', practice: true },
  // やさしい。4拍に1回だけ。まず「発射音の2拍あと」を体に入れる
  { beat: 0, kind: 'cannon' }, { beat: 4, kind: 'cannon' },
  { beat: 8, kind: 'cannon' }, { beat: 12, kind: 'cannon' },
  // 少し詰める
  { beat: 16, kind: 'cannon' }, { beat: 20, kind: 'cannon' },
  { beat: 24, kind: 'cannon' }, { beat: 26, kind: 'cannon' },
  // 二連弾が入る
  { beat: 32, kind: 'double' }, { beat: 36, kind: 'cannon' },
  { beat: 40, kind: 'double' }, { beat: 44, kind: 'cannon' },
  // カモメが混じる。打ってはいけないものが来る
  { beat: 48, kind: 'cannon' }, { beat: 52, kind: 'gull' },
  { beat: 54, kind: 'cannon' }, { beat: 58, kind: 'double' },
  { beat: 62, kind: 'gull' }, { beat: 64, kind: 'cannon' },
  // 音数を減らして間を伸ばす。速くせずに難しくする区間
  { beat: 68, kind: 'cannon' }, { beat: 73, kind: 'cannon' }, { beat: 78, kind: 'cannon' },
  // 締め
  { beat: 80, kind: 'double' }, { beat: 84, kind: 'cannon' },
  { beat: 86, kind: 'double' }, { beat: 90, kind: 'cannon' },
  { beat: 91, kind: 'cannon' }, { beat: 92, kind: 'double' }
];

// 動作確認とデモ録画のための短い譜面。曲の作りは同じで、長さだけ違う
const SHORT_EVENTS = [
  { beat: -6, kind: 'cannon', practice: true },
  { beat: 0, kind: 'cannon' }, { beat: 4, kind: 'cannon' },
  { beat: 8, kind: 'double' }, { beat: 12, kind: 'gull' }, { beat: 14, kind: 'cannon' }
];

/* デモ動画用。本編より詰めてあり、20秒前後で敵船が「帆をすべて失う」まで壊れる。
   短縮版（テスト用）を長くするとCIが遅くなるので、別に持つ。 */
const DEMO_EVENTS = [
  { beat: -6, kind: 'cannon', practice: true },
  { beat: 0, kind: 'double' }, { beat: 4, kind: 'cannon' }, { beat: 6, kind: 'cannon' },
  { beat: 8, kind: 'double' }, { beat: 12, kind: 'cannon' }, { beat: 14, kind: 'gull' },
  { beat: 16, kind: 'double' }, { beat: 20, kind: 'cannon' }, { beat: 22, kind: 'double' },
  { beat: 26, kind: 'cannon' }, { beat: 28, kind: 'double' }, { beat: 32, kind: 'cannon' }
];

export const CHARTS = {
  main: { bpm: 124, beats: 100, events: MAIN_EVENTS },
  short: { bpm: 124, beats: 20, events: SHORT_EVENTS },
  demo: { bpm: 124, beats: 38, events: DEMO_EVENTS }
};

/** 発射の列 → 飛んでくる物と打点。打点は時刻順に並べ、通し番号を振る。 */
export function expandChart(chart) {
  const objects = [];
  const notes = [];

  chart.events.forEach((event, index) => {
    const arriveBeat = event.beat + FLIGHT_BEATS;
    const hits = event.kind === 'gull'
      ? []
      : event.kind === 'double'
        ? [arriveBeat, arriveBeat + DOUBLE_GAP_BEATS]
        : [arriveBeat];

    const practice = Boolean(event.practice);
    objects.push({ id: index, kind: event.kind, fireBeat: event.beat, arriveBeat, hits, practice });
    hits.forEach((beat, order) => notes.push({ beat, objectId: index, order, practice }));
  });

  notes.sort((a, b) => a.beat - b.beat);
  notes.forEach((note, index) => { note.index = index; });
  return { bpm: chart.bpm, beats: chart.beats, objects, notes };
}

/** 譜面が壊れていないか。テストと、開発中の書き換えのために置いてある。 */
export function validateChart(chart) {
  const problems = [];
  const { objects, notes, beats } = expandChart(chart);

  if (!(chart.bpm > 0)) problems.push('BPMが正の数でない');

  for (let index = 1; index < notes.length; index += 1) {
    const gap = notes[index].beat - notes[index - 1].beat;
    if (gap <= 0) problems.push(`打点の順序が壊れている（拍 ${notes[index].beat}）`);
    // 半拍(124BPMで約242ms)より詰まると、どちらの打点への入力か決められなくなる
    else if (gap < DOUBLE_GAP_BEATS) problems.push(`打点が近すぎる（拍 ${notes[index].beat}・間隔 ${gap}）`);
  }

  for (const object of objects) {
    // 練習の1発だけはカウントインの中（負の拍）に置いてよい
    if (object.fireBeat < 0 && !object.practice) problems.push(`発射が曲より前にある（拍 ${object.fireBeat}）`);
    if (object.practice && object.fireBeat < -COUNT_IN_BEATS) {
      problems.push(`練習の発射がカウントインより前にある（拍 ${object.fireBeat}）`);
    }
    for (const hit of object.hits) {
      if (hit > beats) problems.push(`打点が曲より後ろにある（拍 ${hit}）`);
    }
  }

  return problems;
}
