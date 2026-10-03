// OWNER: audio
// BGM：3つの層（静・暴・頂）を同じ時刻に並べて流し、層の音量だけを小節の頭で動かす（曲を差し替えないので継ぎ目が出ない）。
// 曲は 10 秒（4小節）の塊に分けて取り寄せる。塊には前後 0.1 秒の糊しろがあり、糊しろを捨てて頭から尻まで隙間なく並べる。
// 段階が上がるときは、次の小節の頭の1拍前から太鼓のつなぎを鳴らす。下がるときは頭から1小節の半分ほどで消す。
// 一時停止の間は曲の時計を止める（r02-audio：指摘「一時停止の間も曲が進み、終わりの8小節が3分の終わりからずれる」）。
// 止めた位置の塊（静の層だけ）を輪にして小さく流し、戻ったらその位置から続きを鳴らす。
// r05-audio：曲の終わりを遊びの終わりに合わせる（config/audio.ts の MUSIC_END）。並べる単位を「塊」から「元の小節が続く区間」にし、
// 1周目だけ、橋渡しの 63 小節目を必要な数だけ繰り返してから 64 小節目へ進む。小節を丸ごと足すので、小節の頭の並び（段階の切り替え）は崩れない。
// 時間切れを受けて最後の大太鼓がまだ先なら、71 小節目へ跳ぶ。同じ小節を繰り返す所と跳ぶ所だけ、20ms 重ねてつなぐ。
// r06-audio：指摘「同じ波形の 63 小節目を3〜4回足すので、8〜12秒同じ小節が回る」 足す小節は、曲の生成で別に作った「溜め」の小節
// （目録の music.hold。1回ごとに少しずつ盛り上がる4種）を頭から順に鳴らし、端数の拍は長胴のつなぎの小節の終わりの拍で埋める。
// 溜めの小節は別の塊なので、入る所と出る所は 20ms 重ねてつなぐ（重ねる窓はつなぎ目の前。新しい小節の頭の太鼓を削らない）。
// 小節の頭の並び（songStart）が変わる所（始め・端数の拍・一時停止から戻る所・跳ぶ所）は grid に残す（tools/audio-render.mjs が段階の切り替えを確かめる）。
import { MUSIC_END } from '../config/audio';
import type { BufferStore, MusicInfo } from './assets';
import { nextBarTime } from './intensity';
import type { AudioMixer } from './mixer';
import { ClockRate, extensionFor, holdIndexFor, type EndAlign } from './musicEnd';

export { ClockRate, extensionFor, holdIndexFor, resultCue, type EndAlign, type ResultCue } from './musicEnd';

/** 小節の頭の並びの記録：from（コンテキストの秒）から先の小節の頭は songStart + k × 小節の長さ */
export interface GridAnchor {
  from: number;
  songStart: number;
  why: 'play' | 'partial' | 'resume' | 'cut';
}

export interface StageChange {
  /** 求めた時刻と、実際に切り替えた小節の頭（どちらもコンテキストの秒） */
  requestedAt: number;
  at: number;
  from: number;
  to: number;
  bar: number;
  fill: boolean;
}

/** 先に並べておく秒数と、取り寄せを始める先の秒数。 */
const SCHEDULE_AHEAD = 1.5;
const FETCH_AHEAD = 22;
const UP_TAU = 0.02;
const DOWN_TAU = 0.4;
/** 一時停止で消す・戻すときの長さ（秒） */
const PAUSE_FADE = 0.15;
const RESUME_FADE = 0.25;

interface Live {
  src: AudioBufferSourceNode;
  gain: GainNode;
  start: number;
  end: number;
}

export class MusicPlayer {
  private readonly stemGains: GainNode[];
  private readonly out: GainNode;
  private songStart = 0;
  private running = false;
  /** 次に並べる小節（曲の頭から通しで数える、0 から。1周目の後も増え続ける） */
  private nextBar = 0;
  private sources: Live[] = [];
  /** 最後に並べた区間（次の区間がつなぎ目なら、この区間の尻を重ねて消す） */
  private lastSegment: { end: number; live: Live[] } | null = null;
  private readonly fills: { src: AudioBufferSourceNode; at: number }[] = [];
  private stageValue = 0;
  /** 最後に切り替えを決めた小節の頭（コンテキストの秒） */
  private lastAtRequested = -Infinity;
  /** 一時停止した曲の位置（秒、曲の頭から。止まっていなければ null）と、止めている間の輪 */
  private pausedPos: number | null = null;
  private bed: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  /** 戻した直後の区間は、この時刻より前から鳴らさない（位置をずらさないため） */
  private resumeAt = -Infinity;
  /** 1周目に足した小節の数と、それが決まったか（64 小節目へ進んだか）、最後の大太鼓の時刻 */
  private extra = 0;
  /** 小節に満たない端数（拍）。64 小節目へ進む直前に端数の拍を鳴らし、そのぶん小節の頭を後ろへずらす */
  private extraBeats = 0;
  private extraFixed = false;
  private finalAtValue: number | null = null;
  /** 1周目の最後の大太鼓を、その時刻に鳴らすよう並べたか（r06-audio：結果の音を合わせてよいか） */
  private finalDrum = false;
  /** 端数の拍で小節の頭がずれる所（at より前の小節の頭は oldStart の並び。r06-audio：段階の切り替えを古い並びの途中に置かない） */
  private pendingGrid: { at: number; oldStart: number; until: number } | null = null;
  /** 残りのゲーム内秒（遊んでいる間だけ。分からなければ null）と、遊びの時計の速さ */
  private remainingGame: number | null = null;
  private readonly clockRate = new ClockRate();
  readonly changes: StageChange[] = [];
  readonly pauses: { at: number; pos: number; resumedAt: number | null }[] = [];
  /** 小節の頭の並びが変わった記録（r06-audio） */
  readonly grid: GridAnchor[] = [];
  endAlign: EndAlign | null = null;
  lateChunks = 0;

  constructor(
    private readonly mixer: AudioMixer,
    private readonly store: BufferStore,
    readonly info: MusicInfo,
  ) {
    const ctx = mixer.ctx;
    this.out = ctx.createGain();
    this.out.connect(mixer.musicIn);
    this.stemGains = info.stems.map((_, i) => {
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 1 : 0;
      g.connect(this.out);
      return g;
    });
  }

  get stage(): number {
    return this.stageValue;
  }

  get started(): boolean {
    return this.running;
  }

  get start(): number {
    return this.songStart;
  }

  get paused(): boolean {
    return this.pausedPos !== null;
  }

  /** 1周目に足した長さ（小節の数、拍の端数を含む。r05-audio） */
  get extensionBars(): number {
    return this.extra + this.extraBeats / Math.round(this.bar / this.info.beatSeconds);
  }

  /** 1周目の最後の大太鼓（71 小節の頭）の時刻。まだ決まっていなければ null（r05-audio） */
  get finalAt(): number | null {
    return this.finalAtValue;
  }

  /** いまの曲の位置（秒、曲の頭から。一時停止の間は止めた位置のまま） */
  position(now: number): number {
    return this.pausedPos ?? now - this.songStart;
  }

  private get bars(): number {
    return this.info.bars;
  }

  private get bar(): number {
    return this.info.barSeconds;
  }

  /** 1つの塊に入っている小節の数 */
  private get chunkBars(): number {
    return Math.round(this.info.chunkSeconds / this.info.barSeconds);
  }

  /** 繰り返す小節・最後の大太鼓の小節（0 から） */
  private get spliceIndex(): number {
    return MUSIC_END.spliceBar - 1;
  }

  private get finalIndex(): number {
    return MUSIC_END.finalBar - 1;
  }

  /** 溜めの小節の数（目録に無い古い素材では 0 ＝ 63 小節目をそのまま繰り返す） */
  private get holds(): number {
    return this.info.hold ? this.info.hold.holds : 0;
  }

  /**
   * 並べる小節（通し番号）が、元の曲の何小節目（0 から）を鳴らすか。1周目は足した数だけ後ろへずれる。
   * r06-audio：足した小節は溜めの小節（bars 以上の番号＝溜めの塊の中の小節。bars + k が k 番目の溜めの小節）。
   */
  srcBarOf(out: number): number {
    const first = this.bars + this.extra;
    if (out < first) {
      if (out <= this.spliceIndex) return out;
      if (out <= this.spliceIndex + this.extra) {
        const k = out - this.spliceIndex - 1;
        return this.holds > 0 ? this.bars + holdIndexFor(k, this.holds) : this.spliceIndex;
      }
      return out - this.extra;
    }
    return (out - first) % this.bars;
  }

  /** 元の小節 src の次に元の曲で続く小節（溜めの小節は塊の中で次の小節が続く） */
  private nextSrc(src: number): number {
    return src < this.bars ? (src + 1) % this.bars : src + 1;
  }

  /** 元の小節 src が入っている塊のファイル（層 stem の） */
  private fileOf(stem: string, src: number): string {
    const h = this.info.hold;
    if (src >= this.bars && h) return h.chunks[stem];
    return this.info.chunks[stem][Math.floor(Math.min(src, this.bars - 1) / this.chunkBars)];
  }

  /** 元の小節 src の頭が、その塊のファイルの何秒目か（糊しろを含む） */
  private offsetOf(src: number): number {
    const inChunk = src >= this.bars ? src - this.bars : src % this.chunkBars;
    return this.info.pad + inChunk * this.bar;
  }

  /** 同じ塊か（溜めの小節はまとめて1つの塊） */
  private chunkKeyOf(src: number): number {
    return src >= this.bars ? -1 : Math.floor(src / this.chunkBars);
  }

  /** まだ足すかどうか決めていない小節か（1周目の繰り返しの所から先）。 */
  private undecided(out: number): boolean {
    return !this.extraFixed && out > this.spliceIndex && out < this.bars + this.extra;
  }

  /** out から始まる区間：元の小節が続き、同じ塊に入り、決めていない所の手前まで。splice は前の小節と元が続いていない所 */
  private segmentAt(out: number): { src: number; bars: number; splice: boolean } {
    const src = this.srcBarOf(out);
    const splice = out > 0 && src !== this.nextSrc(this.srcBarOf(out - 1));
    let n = 1;
    for (;;) {
      const o = out + n;
      const s = this.srcBarOf(o);
      if (s !== src + n || this.chunkKeyOf(s) !== this.chunkKeyOf(src) || this.undecided(o)) break;
      n++;
    }
    return { src, bars: n, splice };
  }

  /** 曲の頭の塊を取り寄せる（遊ぶ前に呼んでおく）。 */
  preload(chunks = 2): Promise<void> {
    const files = this.info.stems.flatMap((s) => this.info.chunks[s].slice(0, chunks));
    return this.store.loadAll([...files, ...this.info.fills]);
  }

  /** 遊びの時計を受け取る（毎コマ）。remaining は残りのゲーム内秒、playing は遊んでいる間。 */
  setGame(now: number, clock: number, remaining: number | null, playing: boolean): void {
    this.clockRate.add(now, clock, playing);
    this.remainingGame = playing ? remaining : null;
  }

  private anchor(from: number, why: GridAnchor['why']): void {
    this.grid.push({ from, songStart: this.songStart, why });
    if (this.grid.length > 50) this.grid.shift();
  }

  /** when（コンテキストの秒）に曲の頭から鳴らし始める。 */
  play(when: number, stage = 0): void {
    this.songStart = when;
    this.nextBar = 0;
    this.running = true;
    this.pausedPos = null;
    this.resumeAt = -Infinity;
    this.stageValue = stage;
    this.lastAtRequested = -Infinity;
    this.extra = 0;
    this.extraBeats = 0;
    this.extraFixed = false;
    this.finalAtValue = null;
    this.finalDrum = false;
    this.pendingGrid = null;
    this.endAlign = null;
    this.lastSegment = null;
    this.clockRate.reset();
    this.anchor(when, 'play');
    this.out.gain.cancelScheduledValues(when);
    this.out.gain.setValueAtTime(1, when);
    this.stemGains.forEach((g, i) => {
      g.gain.cancelScheduledValues(when);
      g.gain.setValueAtTime(i <= stage ? 1 : 0, when);
    });
    this.update(this.mixer.ctx.currentTime);
  }

  private stopSources(when: number): void {
    for (const s of this.sources) {
      try {
        s.src.stop(when);
      } catch {
        // まだ始まっていない区間も止める
      }
    }
    this.sources = [];
    this.lastSegment = null;
    for (const f of this.fills) {
      try {
        f.src.stop(when);
      } catch {
        // 止まっている
      }
    }
    this.fills.length = 0;
  }

  /** 曲の時計を止める（一時停止）。鳴っている区間を絞って止め、止めた位置の静の層の塊を輪で流す。 */
  pause(when: number): void {
    if (!this.running || this.pausedPos !== null) return;
    const pos = Math.max(0, when - this.songStart);
    this.pausedPos = pos;
    this.pauses.push({ at: when, pos, resumedAt: null });
    if (this.pauses.length > 50) this.pauses.shift();
    this.out.gain.cancelScheduledValues(when);
    this.out.gain.setValueAtTime(this.out.gain.value, when);
    this.out.gain.linearRampToValueAtTime(0, when + PAUSE_FADE);
    this.stopSources(when + PAUSE_FADE + 0.02);
    const { pad } = this.info;
    const outBar = Math.floor(pos / this.bar);
    const src = this.srcBarOf(outBar);
    const buf = this.store.get(this.fileOf(this.info.stems[0], src));
    if (!buf) return;
    const ctx = this.mixer.ctx;
    const node = ctx.createBufferSource();
    node.buffer = buf;
    node.loop = true;
    node.loopStart = pad;
    node.loopEnd = pad + (src >= this.bars && this.info.hold ? this.info.hold.seconds : this.info.chunkSeconds);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(0.7, when + 0.4);
    node.connect(gain).connect(this.mixer.musicIn);
    node.start(when, this.offsetOf(src) + (pos - outBar * this.bar));
    this.bed = { src: node, gain };
  }

  /** 止めた位置から曲を続ける。when（コンテキストの秒）にその位置が鳴るよう並べ直す。 */
  resume(when: number): void {
    const pos = this.pausedPos;
    if (!this.running || pos === null) return;
    this.pausedPos = null;
    const last = this.pauses[this.pauses.length - 1];
    if (last && last.resumedAt === null) last.resumedAt = when;
    if (this.bed) {
      const { src, gain } = this.bed;
      gain.gain.cancelScheduledValues(when);
      gain.gain.setValueAtTime(gain.gain.value, when);
      gain.gain.linearRampToValueAtTime(0, when + PAUSE_FADE);
      src.stop(when + PAUSE_FADE + 0.02);
      src.onended = () => src.disconnect();
      this.bed = null;
    }
    const shift = when - pos - this.songStart;
    this.songStart = when - pos;
    if (this.finalAtValue !== null) this.finalAtValue += shift;
    this.pendingGrid = null;
    this.anchor(when, 'resume');
    this.nextBar = Math.floor(pos / this.bar);
    this.resumeAt = when;
    this.out.gain.cancelScheduledValues(when);
    this.out.gain.setValueAtTime(0, when);
    this.out.gain.linearRampToValueAtTime(1, when + RESUME_FADE);
    this.update(this.mixer.ctx.currentTime);
  }

  /** fade 秒で消して止める（やり直しの前）。 */
  stop(when: number, fade = 0.4): void {
    if (!this.running) return;
    this.running = false;
    this.pausedPos = null;
    if (this.bed) {
      this.bed.src.stop(when + fade);
      this.bed = null;
    }
    this.out.gain.cancelScheduledValues(when);
    this.out.gain.setValueAtTime(this.out.gain.value, when);
    this.out.gain.linearRampToValueAtTime(0, when + fade);
    this.stopSources(when + fade + 0.02);
  }

  /** 前の区間の尻を、つなぎ目 t の x 秒前から t までで消す（次の区間は同じ窓で入り、t で 1 になる）。 */
  private fadeOutLast(t: number, x: number): void {
    const last = this.lastSegment;
    if (!last) return;
    for (const s of last.live) {
      if (s.end <= t - x) continue;
      s.gain.gain.cancelScheduledValues(t - x);
      s.gain.gain.setValueAtTime(1, t - x);
      s.gain.gain.linearRampToValueAtTime(0, t);
      try {
        s.src.stop(t + 0.005);
      } catch {
        // 止まっている
      }
      s.end = Math.min(s.end, t + 0.005);
    }
  }

  /**
   * 3層ぶんの、元の小節 src の塊を、begin（コンテキストの秒）に塊の中の offset 秒から鳴らし、end で止める。
   * fadeTo があれば begin から fadeTo へ 0→1 で入る（つなぎ目で前の区間と重ねる）。素材が無ければ null。
   */
  private startStems(src: number, begin: number, offset: number, end: number, fadeTo: number | null): Live[] | null {
    const bufs = this.info.stems.map((s) => this.store.get(this.fileOf(s, src)));
    if (bufs.some((b) => !b)) return null;
    const ctx = this.mixer.ctx;
    return bufs.map((b, i) => {
      const node = ctx.createBufferSource();
      node.buffer = b as AudioBuffer;
      const gain = ctx.createGain();
      if (fadeTo !== null) {
        gain.gain.setValueAtTime(0, begin);
        gain.gain.linearRampToValueAtTime(1, fadeTo);
      }
      node.connect(gain).connect(this.stemGains[i]);
      node.start(begin, offset);
      node.stop(end);
      node.onended = () => gain.disconnect();
      const l = { src: node, gain, start: begin, end };
      this.sources.push(l);
      return l;
    });
  }

  /** 区間を並べる。素材がまだ無ければ false（待つ）。 */
  private scheduleSegment(out: number, seg: { src: number; bars: number; splice: boolean }, now: number): boolean {
    const t0 = this.songStart + out * this.bar;
    const dur = seg.bars * this.bar;
    const ready = this.info.stems.every((s) => this.store.get(this.fileOf(s, seg.src)));
    if (!ready) {
      // 間に合わなかった：区間の途中からでも入れるよう、この区間が終わるまでは待つ
      if (now > t0 + dur - 0.2) {
        this.lateChunks++;
        this.lastSegment = null;
        return true;
      }
      return false;
    }
    const x = MUSIC_END.crossfadeSeconds;
    const cross = seg.splice && this.lastSegment !== null && Math.abs(this.lastSegment.end - t0) < 1e-3 && t0 - x >= now + 0.01;
    const begin = cross ? t0 - x : Math.max(t0, now + 0.02, this.resumeAt);
    const skip = begin - t0;
    const resumed = begin === this.resumeAt;
    if (cross) this.fadeOutLast(t0, x);
    const live = this.startStems(seg.src, begin, this.offsetOf(seg.src) + skip, t0 + dur, cross ? t0 : null) ?? [];
    this.lastSegment = { end: t0 + dur, live };
    if (skip > 0.001 && !resumed) this.lateChunks++;
    // 1周目の最後の大太鼓（71 小節の頭）を、その時刻から鳴らすよう並べたか
    const firstLoop = out < this.bars + this.extra;
    if (firstLoop && seg.src <= this.finalIndex && this.finalIndex < seg.src + seg.bars && live.length) {
      const head = t0 + (this.finalIndex - seg.src) * this.bar;
      if (begin <= head + 1e-3) this.finalDrum = true;
    }
    return true;
  }

  /** 1周目の繰り返しの所で、いま足す長さ（時間切れの見込みと、いま 64 小節目へ進んだときの最後の大太鼓を比べる）。 */
  private extensionNow(out: number, now: number): { bars: number; beats: number } {
    if (this.remainingGame === null) return { bars: 0, beats: 0 };
    const untilEnd = this.remainingGame / this.clockRate.rate + MUSIC_END.aimLateSeconds;
    const untilFinal = this.songStart + (out + (this.finalIndex - this.spliceIndex - 1)) * this.bar - now;
    return extensionFor({ untilEnd, untilFinal, barSeconds: this.bar, beatSeconds: this.info.beatSeconds, maxBars: MUSIC_END.maxExtraBars - this.extra });
  }

  /**
   * 64 小節目へ進む直前に beats 拍を鳴らし、そのぶん小節の頭（songStart）を後ろへずらす。
   * r06-audio：鳴らすのは長胴のつなぎの小節（溜めの塊の最後の小節）の終わりの beats 拍。つなぎは小節の終わりへ向けて長胴が細かく強くなり、
   * 64 小節目の頭へ運ぶ。溜めの塊が無い古い素材では、r05 と同じく 63 小節目の終わりの拍を繰り返す。
   */
  private schedulePartial(out: number, beats: number, now: number): void {
    const beat = this.info.beatSeconds;
    const t0 = this.songStart + out * this.bar;
    const h = this.info.hold;
    const src = h ? this.bars + h.leadIn : this.spliceIndex;
    const x = MUSIC_END.crossfadeSeconds;
    const cross = this.lastSegment !== null && Math.abs(this.lastSegment.end - t0) < 1e-3 && t0 - x >= now + 0.01;
    const begin = cross ? t0 - x : Math.max(t0, now + 0.02);
    const end = t0 + beats * beat;
    const offset = this.offsetOf(src) + (this.bar - beats * beat) + (begin - t0);
    if (cross) this.fadeOutLast(t0, x);
    const live = this.startStems(src, begin, offset, end, cross ? t0 : null);
    if (live) this.lastSegment = { end, live };
    this.extraBeats = beats;
    this.pendingGrid = { at: t0, oldStart: this.songStart, until: end };
    this.songStart += beats * beat;
    this.anchor(end, 'partial');
  }

  /** 毎コマ呼ぶ：先の区間を並べ、その先を取り寄せ、終わった区間を捨てる。 */
  update(now: number): void {
    if (!this.running || this.pausedPos !== null) return;
    if (this.pendingGrid && now > this.pendingGrid.until + 0.5) this.pendingGrid = null;
    while (this.songStart + this.nextBar * this.bar < now + SCHEDULE_AHEAD) {
      const out = this.nextBar;
      // 1周目の繰り返しの所：並べる直前に、もう1小節足すか、端数の拍を足して 64 小節目へ進むかを決める
      if (!this.extraFixed && out === this.spliceIndex + 1 + this.extra) {
        const ext = this.extensionNow(out, now);
        if (ext.bars > 0) this.extra++;
        else {
          this.extraFixed = true;
          if (ext.beats > 0) this.schedulePartial(out, ext.beats, now);
          this.finalAtValue = this.songStart + (this.finalIndex + this.extra) * this.bar;
          continue;
        }
      }
      const seg = this.segmentAt(out);
      if (!this.scheduleSegment(out, seg, now)) break;
      this.nextBar += seg.bars;
    }
    // 先の塊の取り寄せと、使い終わった塊の片付け（1周目の終わりが近ければ、跳ぶ先の塊と溜めの塊も持っておく）
    const cur = Math.max(0, Math.floor((now - this.songStart) / this.bar));
    const want = new Set<string>();
    const stems = this.info.stems;
    for (let o = cur; this.songStart + o * this.bar < now + FETCH_AHEAD; o++) {
      const src = this.srcBarOf(o);
      for (const s of stems) want.add(this.fileOf(s, src));
    }
    if (cur < this.bars + this.extra && cur > this.spliceIndex - 12) {
      for (const s of stems) {
        want.add(this.fileOf(s, this.finalIndex));
        if (this.info.hold) want.add(this.info.hold.chunks[s]);
      }
    }
    for (const s of stems) {
      this.info.chunks[s].forEach((f, i) => {
        if (want.has(f)) void this.store.load(f);
        else if (this.store.has(f) && i !== 0 && i !== 1) this.store.drop(f);
      });
      const hf = this.info.hold?.chunks[s];
      if (hf) {
        if (want.has(hf)) void this.store.load(hf);
        else if (this.store.has(hf)) this.store.drop(hf);
      }
    }
    this.sources = this.sources.filter((s) => s.end > now - 1);
    for (let i = this.fills.length - 1; i >= 0; i--) if (this.fills[i].at < now - 3) this.fills.splice(i, 1);
  }

  /**
   * 時間切れを受けた（r05-audio）。1周目の最後の大太鼓がまだ cutThresholdSeconds より先なら、いまの区間を 20ms で消して 71 小節目へ跳ぶ。
   * 跳んだ後は、そこから小節の頭を数え直す（結果の画面の間も、続きは拍に合う）。
   * r06-audio：返す記録の drum は、最後の大太鼓をその時刻に本当に鳴らす（鳴らした）か。結果の音を合わせるかを gameAudio.ts が決める。
   */
  endSession(now: number): EndAlign | null {
    if (!this.running || this.pausedPos !== null) return null;
    const first = this.bars + this.extra;
    const cur = Math.floor((now - this.songStart) / this.bar);
    let cut = false;
    let skipped = 0;
    let drum = this.finalDrum;
    const final = this.finalAtValue ?? this.songStart + (this.finalIndex + this.extra) * this.bar;
    if (cur < first && final - now > MUSIC_END.cutThresholdSeconds) {
      const x = MUSIC_END.crossfadeSeconds;
      const t = now + 0.06;
      skipped = final - t;
      // いま鳴っている区間を t の前の x 秒で消し、t より後に並べた区間とつなぎは鳴らさない
      for (const s of this.sources) {
        if (s.start >= t - x) {
          try {
            s.src.stop(0);
          } catch {
            // まだ始まっていない
          }
          s.end = s.start;
          continue;
        }
        s.gain.gain.cancelScheduledValues(t - x);
        s.gain.gain.setValueAtTime(1, t - x);
        s.gain.gain.linearRampToValueAtTime(0, t);
        try {
          s.src.stop(t + 0.005);
        } catch {
          // 止まっている
        }
        s.end = Math.min(s.end, t + 0.005);
      }
      for (const f of this.fills) {
        if (f.at > t) {
          try {
            f.src.stop(0);
          } catch {
            // 止まっている
          }
        }
      }
      this.fills.length = 0;
      // 段階の先の予約を消し、いまの段階のまま跳ぶ
      this.stemGains.forEach((g, i) => {
        g.gain.cancelScheduledValues(t);
        g.gain.setTargetAtTime(i <= this.stageValue ? 1 : 0, t, UP_TAU);
      });
      this.extraFixed = true;
      this.pendingGrid = null;
      this.songStart = t - (this.finalIndex + this.extra) * this.bar;
      this.anchor(t, 'cut');
      this.nextBar = this.finalIndex + this.extra;
      this.finalAtValue = t;
      // 71 小節の頭から最後まで（2小節）を t の x 秒前から重ねて入る（t で 1 になり、大太鼓の頭を削らない）
      const bars = this.bars - this.finalIndex;
      const live = this.startStems(this.finalIndex, t - x, this.offsetOf(this.finalIndex) - x, t + bars * this.bar, t);
      this.lastSegment = { end: t + bars * this.bar, live: live ?? [] };
      if (live) this.nextBar += bars;
      drum = live !== null;
      this.finalDrum = drum;
      cut = true;
    }
    this.endAlign = { sessionEndAt: now, finalAt: this.finalAtValue ?? final, extensionBars: this.extensionBars, cut, skippedSeconds: Math.round(skipped * 1000) / 1000, drum };
    return this.endAlign;
  }

  /**
   * いまから margin 秒より後で最初の小節の頭。端数の拍を並べた後でも、その拍が始まるまでは前の並びの小節の頭を使う
   * （r06-audio：新しい並びで数えると、63 小節目の後に足した小節の途中に段階の切り替えが落ちることがあった）。
   */
  private nextHead(now: number, margin: number): number {
    const p = this.pendingGrid;
    if (p && now + margin <= p.at + 1e-9) return nextBarTime(p.oldStart, now, this.bar, margin);
    return nextBarTime(this.songStart, now, this.bar, margin);
  }

  /** 段階 to へ、次の小節の頭で切り替える。上がるときは1拍前からつなぎを鳴らす。 */
  requestStage(to: number, now: number): StageChange | null {
    if (!this.running || this.pausedPos !== null || to === this.stageValue) return null;
    const { barSeconds, fillLead } = this.info;
    // 上がるときは1拍前からつなぎを鳴らしたいので、次の頭までに1拍の余裕が無ければ、その次の小節の頭で切り替える
    const margin = to > this.stageValue && this.info.fills.length ? fillLead + 0.05 : 0.06;
    const at = this.nextHead(now, margin);
    const bar = Math.round((at - this.songStart) / barSeconds);
    const sameHead = Math.abs(at - this.lastAtRequested) < 1e-6;
    if (sameHead && to < this.stageValue) return null;
    const from = this.stageValue;
    this.stemGains.forEach((g, i) => {
      const target = i <= to ? 1 : 0;
      g.gain.cancelScheduledValues(at);
      g.gain.setTargetAtTime(target, at, target > (i <= from ? 1 : 0) ? UP_TAU : DOWN_TAU);
    });
    let fill = false;
    if (to > from && !sameHead && this.info.fills.length) {
      const f = this.store.get(this.info.fills[(((bar + to) % this.info.fills.length) + this.info.fills.length) % this.info.fills.length]);
      const t = at - fillLead;
      if (f && t >= now + 0.01) {
        const src = this.mixer.ctx.createBufferSource();
        src.buffer = f;
        src.connect(this.out);
        src.start(t);
        this.fills.push({ src, at: t });
        fill = true;
      }
    }
    this.stageValue = to;
    this.lastAtRequested = at;
    const change = { requestedAt: now, at, from, to, bar, fill };
    this.changes.push(change);
    if (this.changes.length > 200) this.changes.shift();
    return change;
  }
}
