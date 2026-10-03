// OWNER: audio
// 音の目録（public/assets/audio/manifest.json、tools/audio/build.mjs が書く）の型と、音のファイルの読み込み。
// 読み込みは遊びを待たせない：目録 → UI と竜の音 → 攻撃と建物の音 → 残響 → 曲の最初の塊、の順に裏で取り、無い音は鳴らさないだけにする。

export interface SfxVariant {
  file: string;
  seconds: number;
  /** 最初に音が立ち上がる位置（ms）。同期の測定で「鳴った時刻」に足す */
  onsetMs: number;
  momentaryMax: number;
  truePeakDb: number;
}

export interface SfxBankInfo {
  loop: boolean;
  variants: SfxVariant[];
}

export interface MusicInfo {
  bpm: number;
  beatsPerBar: number;
  bars: number;
  barSeconds: number;
  beatSeconds: number;
  length: number;
  chunkSeconds: number;
  /** 塊の前後の糊しろ（秒）。鳴らすときは pad 秒目から chunkSeconds 秒だけ使う */
  pad: number;
  stems: string[];
  chunks: Record<string, string[]>;
  fills: string[];
  /** つなぎを鳴らし始める、小節の頭の前の秒数 */
  fillLead: number;
  sections: { name: string; bar: number }[];
  /**
   * r06-audio：63 小節目の後に足す「溜め」の小節の塊（層ごとに1つ、前後に pad 秒の糊しろ）。holds 個の溜めの小節（1回ごとに盛り上がる順）と、
   * 端数の拍を埋める長胴のつなぎの小節（leadIn 番目）が並ぶ。無ければ r05 と同じく 63 小節目を繰り返す
   */
  hold?: { bars: number; holds: number; leadIn: number; seconds: number; chunks: Record<string, string> };
}

export interface AudioManifest {
  sampleRate: number;
  monsters: string[];
  ir: Record<'near' | 'mid' | 'far', { file: string; seconds: number }>;
  sfx: Record<string, SfxBankInfo>;
  music: MusicInfo | null;
}

export async function fetchManifest(url: string): Promise<AudioManifest> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`音の目録を読めない（${res.status}）: ${url}`);
  return (await res.json()) as AudioManifest;
}

/** 音のファイルを取ってきて復号し、覚えておく。同じファイルを2回取りに行かない。 */
export class BufferStore {
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly pending = new Map<string, Promise<AudioBuffer | null>>();
  failed = 0;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly base: string,
  ) {}

  get(file: string): AudioBuffer | undefined {
    return this.buffers.get(file);
  }

  has(file: string): boolean {
    return this.buffers.has(file);
  }

  load(file: string): Promise<AudioBuffer | null> {
    const have = this.buffers.get(file);
    if (have) return Promise.resolve(have);
    let p = this.pending.get(file);
    if (!p) {
      p = fetch(this.base + file)
        .then((r) => {
          if (!r.ok) throw new Error(`${r.status}`);
          return r.arrayBuffer();
        })
        .then((bytes) => this.ctx.decodeAudioData(bytes))
        .then((buf) => {
          this.buffers.set(file, buf);
          this.pending.delete(file);
          return buf;
        })
        .catch(() => {
          this.failed++;
          this.pending.delete(file);
          return null;
        });
      this.pending.set(file, p);
    }
    return p;
  }

  /** 並べて読む（同時に取りに行く数を limit に抑える）。 */
  async loadAll(files: string[], limit = 6): Promise<void> {
    const queue = files.filter((f) => !this.buffers.has(f));
    const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
      while (queue.length) await this.load(queue.shift() as string);
    });
    await Promise.all(workers);
  }

  drop(file: string): void {
    this.buffers.delete(file);
  }

  get size(): number {
    return this.buffers.size;
  }
}
