// OWNER: audio
// 音の土台：コンテキスト・系統（mixer）・素材の倉庫・声・BGM・散らし・記録を1つにまとめる。遊びの出来事は知らない（それは gameAudio.ts）。
// AudioContext でも OfflineAudioContext でも同じに動くので、tools/audio-render.mjs は同じ仕組みを時間を決めて書き出して確かめる。
import { AUDIO_FILES, DEFAULT_MONSTER, MONSTER_SOUNDS, SOUNDS, VOICES, type MonsterSoundId, type SoundDef, type SoundId } from '../config/audio';
import type { P3 } from '../core/events';
import { BufferStore, fetchManifest, type AudioManifest } from './assets';
import { AudioMixer, type ReverbName } from './mixer';
import { MusicPlayer } from './music';
import { place, type Listener } from './spatial';
import { SyncLog, type SyncEntry } from './syncLog';
import { Variety } from './variety';
import { LoopVoice, VoicePlayer } from './voices';

export interface PlayExtra {
  /** 鳴らした理由（出来事の種類）とゲーム内時刻。記録に使う */
  ev: string;
  t: number;
  gainDb?: number;
  semis?: number;
  /** 変化を決め打ちする（UI の節目の音など） */
  variant?: number;
  /** r06-audio：鳴らし始める時刻（コンテキストの秒）。今より先なら待って鳴らす（結果の音を曲の最後の大太鼓に合わせる） */
  at?: number;
}

const dbToGain = (db: number): number => 10 ** (db / 20);
/**
 * 先に読む音（遊び始めてすぐ鳴る。読み終わるまで鳴らし始めない）、同時に読み始める音（待たない）、後から読む音。
 * r05-audio：指摘「始まって数秒の着火が読み込み前で鳴らなかった」 建物と炎の音を「後から」から「同時に読み始める」へ（最初の崩落は 2.6 秒）
 */
const FIRST = ['ui/', 'attack/'];
const EARLY = ['building/', 'fire/'];
const LATER = ['air/'];

export class AudioEngine {
  readonly mixer: AudioMixer;
  readonly store: BufferStore;
  readonly voices: VoicePlayer;
  readonly variety = new Variety();
  readonly log: SyncLog;
  manifest: AudioManifest | null = null;
  music: MusicPlayer | null = null;
  listener: Listener | null = null;
  ready = false;
  private readonly last = new Map<string, { at: number; pos: P3 | null }>();
  /** 鳴らす怪獣（MONSTER_SOUNDS の名前）。r03-roster：結果の画面から怪獣を替えたら setMonster で切り替える */
  monster: string;

  constructor(
    readonly ctx: BaseAudioContext,
    monster = DEFAULT_MONSTER,
    base = AUDIO_FILES.base,
  ) {
    this.monster = monster;
    this.mixer = new AudioMixer(ctx);
    this.store = new BufferStore(ctx, base);
    this.voices = new VoicePlayer(this.mixer);
    this.log = new SyncLog(ctx);
  }

  /** 目録・制限器・残響・音を読む。all で全部を待つ（書き出しの確かめ用）。遊びでは最初の組だけ待ち、残りは裏で読む。 */
  async load(all = false, manifestUrl = AUDIO_FILES.manifest): Promise<void> {
    const m = await fetchManifest(manifestUrl);
    this.manifest = m;
    await this.mixer.init();
    const files = (prefixes: string[]): string[] => this.bankFiles(prefixes);
    const irs = (Object.keys(m.ir) as ReverbName[]).map(async (name) => {
      const buf = await this.store.load(m.ir[name].file);
      if (buf) this.mixer.setReverb(name, buf);
    });
    if (m.music) this.music = new MusicPlayer(this.mixer, this.store, m.music);
    const early = this.store.loadAll(files(EARLY));
    await Promise.all([this.store.loadAll(files([...FIRST, `${this.monster}/`])), ...irs, this.music?.preload() ?? Promise.resolve()]);
    this.ready = true;
    // 残りの怪獣の音も裏で読む（r03-roster：結果の画面から別の怪獣で始めても、最初の音から鳴るように）
    const others = (m.monsters ?? []).filter((k) => k !== this.monster).map((k) => `${k}/`);
    const rest = this.store.loadAll(files([...LATER, ...others]));
    if (all) await Promise.all([early, rest]);
  }

  /** 目録の音のうち、名前が prefixes のどれかで始まる音のファイル。目録を読む前は空。 */
  private bankFiles(prefixes: string[]): string[] {
    const m = this.manifest;
    if (!m) return [];
    return Object.entries(m.sfx)
      .filter(([k]) => prefixes.some((p) => k.startsWith(p)))
      .flatMap(([, b]) => b.variants.map((v) => v.file));
  }

  /** 鳴らす怪獣を替える（MONSTER_SOUNDS の名前）。まだ読んでいなければ、その怪獣の音を読み始める。 */
  setMonster(monster: string): void {
    if (monster === this.monster) return;
    this.monster = monster;
    void this.store.loadAll(this.bankFiles([`${monster}/`]));
  }

  /** 音の表の名前 → 目録の音の名前（'@' は怪獣ごとの表から引く）。その怪獣に無い音なら null。 */
  bankOf(id: SoundId): string | null {
    const bank = SOUNDS[id].bank;
    if (!bank.startsWith('@')) return bank;
    return this.monsterBank(bank.slice(1) as MonsterSoundId);
  }

  /** 1回鳴らす。pos が null なら空間を通さない。鳴らしたら true。 */
  play(id: SoundId, pos: P3 | null, x: PlayExtra): boolean {
    const m = this.manifest;
    const def: SoundDef = SOUNDS[id];
    const now = this.ctx.currentTime;
    const wait = x.at !== undefined && x.at > now ? x.at - now : 0;
    const entry = (dropped: SyncEntry['dropped'], variant = -1, start = now, prop = 0, distance = 0, gainDb = 0, onset = 0): void =>
      this.log.add({ ev: x.ev, sound: id, variant, t: x.t, start, prop, ...(wait > 0 ? { wait: Math.round(wait * 1e4) / 1e4 } : {}), distance: Math.round(distance), gainDb: Math.round(gainDb * 10) / 10, dropped }, onset);
    if (!m) return false;
    const bank = this.bankOf(id);
    const info = bank ? m.sfx[bank] : undefined;
    if (!info) {
      entry('missing');
      return false;
    }
    // 同じ音を同じ所で続けて鳴らさない（数十ms の内の重なりは1つにまとめる）
    const prev = this.last.get(id);
    if (prev && now - prev.at < VOICES.mergeSeconds && (!pos || !prev.pos || Math.hypot(pos[0] - prev.pos[0], pos[1] - prev.pos[1], pos[2] - prev.pos[2]) < VOICES.mergeDistance)) {
      entry('merged');
      return false;
    }
    let v = x.variant ?? this.variety.pick(bank as string, info.variants.length);
    let buf = this.store.get(info.variants[v].file);
    if (!buf) {
      // その変化がまだ読めていなければ、読めている別の変化で鳴らす
      const alt = info.variants.findIndex((iv) => this.store.has(iv.file));
      void this.store.load(info.variants[v].file);
      if (alt < 0) {
        entry('missing');
        return false;
      }
      v = alt;
      buf = this.store.get(info.variants[v].file) as AudioBuffer;
    }
    const p = place(pos, this.listener, def.space, def.size ?? 1);
    const gainDb = def.gainDb + (x.gainDb ?? 0) + this.variety.jitterDb(def.jitterDb);
    const rate = 2 ** ((this.variety.semis(def.pitch) + (x.semis ?? 0)) / 12);
    const when = now + wait + p.delay;
    const r = this.voices.play(buf, { category: def.category, when, gain: dbToGain(gainDb), rate, place: p, bus: def.space === 'ui' ? 'ui' : 'sfx' });
    const onset = info.variants[v].onsetMs / rate;
    if (!r) {
      entry('limit', v, when, p.delay, p.distance, gainDb, onset);
      return false;
    }
    this.last.set(id, { at: now, pos });
    entry(undefined, v, when, p.delay, p.distance, gainDb + 20 * Math.log10(p.gain), onset);
    return true;
  }

  /** 繰り返しの音を作る（bank の変化の1つ）。まだ読めていない・その怪獣に無い音なら null。 */
  loop(bank: string | null, sendNear = 0.12): LoopVoice | null {
    if (!bank) return null;
    const info = this.manifest?.sfx[bank];
    if (!info) return null;
    const v = this.variety.pick(bank, info.variants.length);
    const buf = this.store.get(info.variants[v].file) ?? info.variants.map((iv) => this.store.get(iv.file)).find(Boolean);
    if (!buf) return null;
    return new LoopVoice(this.mixer, buf, sendNear);
  }

  monsterBank(id: MonsterSoundId): string | null {
    return (MONSTER_SOUNDS[this.monster] ?? MONSTER_SOUNDS[DEFAULT_MONSTER])[id] ?? null;
  }
}
