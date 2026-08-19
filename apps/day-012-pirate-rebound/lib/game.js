/* ゲームの進行。画面にも音にも触らない、数えるだけの部分。

   ここを純粋にしておくと、判定の正しさをブラウザ無しで固定できる。
   音ゲーは目で見て確かめるのが難しいので、この分け方が効く。 */

import { WINDOW, findNote, judgeOffset, rank } from './judge.js';
import { beatToSeconds } from './beat.js';

/** カモメに引っかかったと見なす、鳴き声からの距離(秒)。 */
const BAIT_WINDOW = 0.3;

export class GameState {
  constructor(expanded) {
    this.bpm = expanded.bpm;
    this.beats = expanded.beats;
    this.objects = expanded.objects;

    this.notes = expanded.notes.map((note) => ({ ...note, time: beatToSeconds(note.beat, expanded.bpm) }));
    this.gulls = expanded.objects
      .filter((object) => object.kind === 'gull')
      .map((object) => ({ id: object.id, time: beatToSeconds(object.arriveBeat, expanded.bpm), baited: false }));

    // 物体ごとの打点の番号。画面側が「その弾は打ち返せたのか」を引くのに使う
    this.notesByObject = new Map();
    for (const note of this.notes) {
      if (!this.notesByObject.has(note.objectId)) this.notesByObject.set(note.objectId, []);
      this.notesByObject.get(note.objectId).push(note.index);
    }

    this.taken = new Set();
    this.results = new Map();
    this.counts = { perfect: 0, good: 0, miss: 0, whiff: 0 };
    this.combo = 0;
    this.bestCombo = 0;
    // 判定のズレ（秒）。平均を出して「早い／遅い」を伝えるのに使う
    this.offsets = [];
  }

  /** 点になる打点の数。練習の1発は含まない。 */
  get total() {
    return this.notes.filter((note) => !note.practice).length;
  }

  get done() {
    return this.notes.filter((note) => !note.practice && this.taken.has(note.index)).length;
  }

  /* 押されたときの処理。返すのは、その入力が何だったか。
     どの打点からも遠い入力は「から振り」＝拍と関係ない入力として扱い、打点は消費しない。 */
  press(songSeconds) {
    const index = findNote(this.notes, songSeconds, this.taken);
    if (index < 0) {
      this.counts.whiff += 1;
      this.combo = 0;
      const gull = this.gulls.find((one) => !one.baited && Math.abs(one.time - songSeconds) <= BAIT_WINDOW);
      if (gull) gull.baited = true;
      return { result: 'whiff', noteIndex: -1, offset: null, baitedGull: gull ? gull.id : null };
    }

    const note = this.notes[index];
    const offset = songSeconds - note.time;
    const result = judgeOffset(offset) ?? 'miss';

    this.taken.add(index);
    this.results.set(index, result);

    // 練習の1発は「最初の成功」を体験させるためだけのもの。点にも連続数にも入れない
    if (note.practice) return { result, noteIndex: index, offset, baitedGull: null, practice: true };

    this.counts[result] += 1;

    /* 連続はドンピシャだけ数える。おしいでも伸ばすと、
       敵船に1発も届いていないのに「29 連続」と出て、看板のルールと食い違う（体験評価2周目）。 */
    if (result === 'perfect') {
      this.combo += 1;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
    } else {
      this.combo = 0;
    }
    this.offsets.push(offset);
    return { result, noteIndex: index, offset, baitedGull: null, practice: false };
  }

  /** 窓を過ぎても叩かれなかった打点を、その時点でミスとして確定させる。 */
  expire(songSeconds) {
    const missed = [];
    for (const note of this.notes) {
      if (this.taken.has(note.index)) continue;
      if (songSeconds > note.time + WINDOW.reach) {
        this.taken.add(note.index);
        this.results.set(note.index, 'miss');
        if (note.practice) continue;
        this.counts.miss += 1;
        this.combo = 0;
        missed.push(note.index);
      }
    }
    return missed;
  }

  /** 結果。ランクの判定に渡す形をここで作る。 */
  summary() {
    const counts = { ...this.counts, total: this.total };
    const averageOffset = this.offsets.length
      ? this.offsets.reduce((sum, one) => sum + one, 0) / this.offsets.length
      : null;
    return {
      ...counts,
      averageOffsetMs: averageOffset === null ? null : Math.round(averageOffset * 1000),
      bestCombo: this.bestCombo,
      gullsTotal: this.gulls.length,
      gullsHeld: this.gulls.filter((one) => !one.baited).length,
      rank: rank(counts)
    };
  }
}
