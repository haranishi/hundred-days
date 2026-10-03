// OWNER: audio
// 鳴らした記録：出来事を受けた時刻（ページの時計）と、その音がスピーカーに出る時刻の見積もりを並べる。
// 見積もり＝出力の時刻印（getOutputTimestamp）で「鳴らし始めのコンテキストの時刻」をページの時計へ直し、素材の立ち上がり（onsetMs）を足す。
// 遠い音は音速の遅れ（prop）をわざと足しているので、ずれ（skewMs）はそれを引いた値で見る。tools/audio-render.mjs と E2E が window.__audioLog を読む。

export interface SyncEntry {
  /** 出来事の種類（音を鳴らした理由） */
  ev: string;
  sound: string;
  variant: number;
  /** ゲーム内時刻（出来事の t） */
  t: number;
  /** 出来事を受けたページの時計（ms） */
  wall: number;
  /** 鳴らし始めのコンテキストの時刻（秒、音速の遅れを含む） */
  start: number;
  /** わざと足した音速の遅れ（秒） */
  prop: number;
  /** r06-audio：わざと待った秒数（結果の音を曲の最後の大太鼓に合わせる）。ずれ（skewMs）はこれも引いて見る */
  wait?: number;
  /** 音が出る時刻の見積もり（ページの時計、ms、素材の立ち上がりを含む） */
  out: number;
  /** ずれ（ms）＝ out − wall − prop − wait */
  skewMs: number;
  distance: number;
  gainDb: number;
  /** 鳴らさなかった理由（上限・まとめ・未読み込み） */
  dropped?: 'limit' | 'merged' | 'missing' | 'suspended';
}

export interface AudioLog {
  state: string;
  sampleRate: number;
  baseLatency: number;
  outputLatency: number;
  limiter: string;
  limiterMaxGrDb: number;
  loaded: number;
  failed: number;
  /** stolenTails は stolen のうち、余韻を絞って新しい頭を通した回数（r05-audio） */
  voices: { active: number; peak: number; dropped: number; stolen: number; stolenTails?: number };
  music: {
    started: boolean;
    stage: number;
    changes: { requestedAt: number; at: number; from: number; to: number; bar: number; fill: boolean }[];
    lateChunks: number;
    songStart: number;
    /** 一時停止で曲の時計が止まっているか、曲の位置（秒）、止めた記録（コンテキストの秒と曲の位置） */
    paused: boolean;
    position: number;
    pauses: { at: number; pos: number; resumedAt: number | null }[];
    /** r05-audio：1周目の最後の大太鼓の時刻（コンテキストの秒、決まる前は null）・繰り返した小節の数・時間切れの時点の記録 */
    finalAt?: number | null;
    extensionBars?: number;
    cutToEnd?: { sessionEndAt: number; finalAt: number | null; extensionBars: number; cut: boolean; skippedSeconds: number; drum?: boolean } | null;
    /** r06-audio：小節の頭の並びが変わった記録（from から先は songStart + k × 小節）と、時間切れの結果の音の鳴らし方 */
    grid?: { from: number; songStart: number; why: string }[];
    result?: { kind: 'gong' | 'full'; at: number; sessionEndAt: number } | null;
  };
  counts: Record<string, number>;
  entries: SyncEntry[];
  /** 曲の引き（low: で始まるのは低い帯の引き、near: は近い崩落の体積の記録。v は決めた理由の数、end は低い帯を引いていると数える区間の終わり） */
  ducks: { kind: string; at: number; v?: number; end?: number }[];
}

declare global {
  interface Window {
    /** 音の記録（tools/audio-render.mjs と E2E が読む） */
    __audioLog?: AudioLog;
  }
}

/** 直近の記録の上限（3分の自動プレイで出る数より多め）。r06-audio：曲の引きも 3分ぶん全部残す（200→2000） */
const LIMIT = 6000;
const DUCK_LIMIT = 2000;

export class SyncLog {
  readonly entries: SyncEntry[] = [];
  readonly counts: Record<string, number> = {};
  readonly ducks: { kind: string; at: number; v?: number; end?: number }[] = [];

  constructor(private readonly ctx: BaseAudioContext) {}

  /** ページの時計とコンテキストの時刻の対応（出力側）。OfflineAudioContext では null。 */
  private stamp(): { contextTime: number; performanceTime: number } | null {
    const c = this.ctx as AudioContext;
    if (typeof c.getOutputTimestamp !== 'function') return null;
    const ts = c.getOutputTimestamp();
    if (!ts || !ts.performanceTime || ts.contextTime === undefined) return null;
    return { contextTime: ts.contextTime, performanceTime: ts.performanceTime };
  }

  add(e: Omit<SyncEntry, 'wall' | 'out' | 'skewMs'>, onsetMs: number): void {
    const wall = typeof performance !== 'undefined' ? performance.now() : 0;
    const ts = this.stamp();
    let out = wall;
    if (ts) out = ts.performanceTime + (e.start - ts.contextTime) * 1000 + onsetMs;
    else {
      const c = this.ctx as AudioContext;
      const lat = ((c.baseLatency ?? 0) + (c.outputLatency ?? 0)) * 1000;
      out = wall + (e.start - this.ctx.currentTime) * 1000 + lat + onsetMs;
    }
    const entry: SyncEntry = { ...e, wall: round(wall), out: round(out), skewMs: round(out - wall - (e.prop + (e.wait ?? 0)) * 1000) };
    this.entries.push(entry);
    if (this.entries.length > LIMIT) this.entries.splice(0, this.entries.length - LIMIT);
    this.counts[e.sound] = (this.counts[e.sound] ?? 0) + 1;
  }

  /** 曲の引きの記録。v は決めた理由の数（崩落の体積など）、end は引いていると数える区間の終わり（低い帯の引き。コンテキストの秒） */
  duck(kind: string, at: number, v?: number, end?: number): void {
    const e: { kind: string; at: number; v?: number; end?: number } = { kind, at: round(at * 1000) / 1000 };
    if (v !== undefined) e.v = Math.round(v);
    if (end !== undefined) e.end = round(end * 1000) / 1000;
    this.ducks.push(e);
    if (this.ducks.length > DUCK_LIMIT) this.ducks.shift();
  }
}

const round = (x: number): number => Math.round(x * 100) / 100;
