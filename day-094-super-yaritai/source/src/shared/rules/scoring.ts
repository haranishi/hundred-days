/**
 * 点数・コンボ・目立ち度・達成・称号・順位（docs/03）。DOM も物理も使わない純TS。
 * シミュレーションは点が入る出来事をすべて ScoreBook に通し、返ってきた結果から GameEvent を作る。
 */
import type { ComboView, MatchResult, ModelKey, PlayerResult, WorldStatic, WorldView } from '../view';
import { MISDEED_IDS, SECRETS, type MisdeedId, type ScoreKind, type SecretId } from './misdeeds';
import { COMPLETE_BADGE, HEAT, MATCH, SCORE, TITLES } from './tuning';

export interface AwardResult {
  points: number;
  multiplier: number;
  /** この点で段が上がった */
  comboUp: boolean;
  level: number;
}

export interface AchieveResult {
  id: MisdeedId;
  bonus: number;
  /** これで10個そろった（completeBonus は bonus と別に入る） */
  complete: boolean;
  completeBonus: number;
}

/** 1人ぶんの点の帳簿 */
export class ScoreBook {
  score = 0;
  heat = 0;
  level = 0;
  lastKind: ScoreKind | null = null;
  comboExpiresAt = -Infinity;
  lastScoreAt = -Infinity;
  caught = 0;
  complete = false;
  readonly achieved: MisdeedId[] = [];
  readonly secrets: SecretId[] = [];
  readonly breakdown: Partial<Record<ScoreKind, { count: number; points: number }>> = {};
  /** 内訳の行に入らない加点（完全制覇・ひみつ）。breakdown の合計＋extras の合計＝score */
  readonly extras: { label: string; points: number }[] = [];

  /**
   * 悪事の点を入れる。倍率＝コンボ×ラストスパート。
   * コンボ：猶予のうちに別の種類なら段が上がり、同じ種類なら猶予だけ延びる。上がった段の倍率をこの点から使う。
   */
  award(kind: ScoreKind, base: number, now: number, lastSpurt: boolean, count = 1, heat?: number): AwardResult {
    if (now > this.comboExpiresAt) {
      this.level = 0;
      this.lastKind = null;
    }
    let comboUp = false;
    if (this.lastKind !== null && kind !== this.lastKind && this.level < SCORE.comboMultipliers.length - 1) {
      this.level += 1;
      comboUp = true;
    }
    const multiplier = SCORE.comboMultipliers[this.level] ?? 1;
    const points = Math.round(base * multiplier * (lastSpurt ? MATCH.lastSpurtMultiplier : 1));
    this.lastKind = kind;
    this.comboExpiresAt = now + SCORE.comboWindow;
    this.lastScoreAt = now;
    this.score += points;
    this.addBreakdown(kind, points, count);
    // 目立ち度は「点÷10（1回最大25）」。試食・放送のように決まった上がり方の悪事は heat で渡す
    this.raiseHeat(heat ?? Math.min(points / HEAT.perPointsDivisor, HEAT.maxPerScore));
    return { points, multiplier, comboUp, level: this.level };
  }

  /** 倍率をかけない点（達成・ひみつ）。内訳は関係する悪事の行に足す */
  addBonus(kind: ScoreKind | null, points: number): void {
    this.score += points;
    if (kind) this.addBreakdown(kind, points, 0);
  }

  /** 初めての達成なら +300（10個そろえば +3000 も）。2回目以降は null */
  achieve(id: MisdeedId): AchieveResult | null {
    if (this.achieved.includes(id)) return null;
    this.achieved.push(id);
    this.addBonus(id, SCORE.achieveBonus);
    const complete = !this.complete && MISDEED_IDS.every((m) => this.achieved.includes(m));
    if (complete) {
      this.complete = true;
      this.addBonus(null, SCORE.completeBonus);
      this.extras.push({ label: COMPLETE_BADGE, points: SCORE.completeBonus });
    }
    return { id, bonus: SCORE.achieveBonus, complete, completeBonus: complete ? SCORE.completeBonus : 0 };
  }

  /** ひみつを初めて見つけたら +800（内訳の行ではなく extras に入れる） */
  secret(id: SecretId): number | null {
    if (this.secrets.includes(id)) return null;
    this.secrets.push(id);
    this.addBonus(null, SCORE.secretBonus);
    this.extras.push({ label: `ひみつ：${SECRETS.find((s) => s.id === id)?.name ?? id}`, points: SCORE.secretBonus });
    return SCORE.secretBonus;
  }

  raiseHeat(amount: number): void {
    this.heat = Math.min(HEAT.max, this.heat + amount);
  }

  /** 毎刻み。しばらく何もしなければ目立ち度が下がる */
  tick(dt: number, now: number): void {
    if (now - this.lastScoreAt >= HEAT.calmAfter) this.heat = Math.max(0, this.heat - HEAT.decayPerSecond * dt);
  }

  /** 捕まった：コンボと目立ち度を0に戻す */
  onCaught(): void {
    this.caught += 1;
    this.level = 0;
    this.lastKind = null;
    this.comboExpiresAt = -Infinity;
    this.heat = 0;
  }

  /** 連打・長押しの悪事の最中：猶予を減らさない（残りをそのまま保つ） */
  holdCombo(dt: number, now: number): void {
    if (this.lastKind !== null && now <= this.comboExpiresAt) this.comboExpiresAt += dt;
  }

  /** 猶予が切れたか（切れた瞬間に一度だけ true を返す） */
  comboExpired(now: number): boolean {
    if (this.lastKind !== null && now > this.comboExpiresAt) {
      const hadCombo = this.level > 0;
      this.level = 0;
      this.lastKind = null;
      return hadCombo;
    }
    return false;
  }

  comboView(now: number): ComboView {
    const active = this.lastKind !== null && now <= this.comboExpiresAt;
    const level = active ? this.level : 0;
    return {
      level,
      multiplier: SCORE.comboMultipliers[level] ?? 1,
      remaining: active ? Math.max(0, this.comboExpiresAt - now) : 0,
    };
  }

  private addBreakdown(kind: ScoreKind, points: number, count: number): void {
    const row = this.breakdown[kind] ?? { count: 0, points: 0 };
    row.count += count;
    row.points += points;
    this.breakdown[kind] = row;
  }
}

export function titleFor(score: number): string {
  for (const t of TITLES) if (score >= t.min) return t.title;
  return TITLES[TITLES.length - 1]!.title;
}

export { COMPLETE_BADGE };

export interface RankInput {
  slot: number;
  score: number;
  achievedCount: number;
}

/**
 * 順位を決める。点の高い順、同点なら達成した数の多い順。両方同じなら同じ順位（勝者が複数になる）。
 * 返す順位は1始まり（同順位のあとは飛ばす：1,1,3）。
 */
export function rankPlayers(players: readonly RankInput[]): { ranks: Map<number, number>; winners: number[] } {
  const sorted = [...players].sort((a, b) => b.score - a.score || b.achievedCount - a.achievedCount || a.slot - b.slot);
  const ranks = new Map<number, number>();
  sorted.forEach((p, i) => {
    const prev = sorted[i - 1];
    const same = prev && prev.score === p.score && prev.achievedCount === p.achievedCount;
    ranks.set(p.slot, same ? ranks.get(prev.slot)! : i + 1);
  });
  const winners = sorted.filter((p) => ranks.get(p.slot) === 1).map((p) => p.slot);
  return { ranks, winners };
}

export interface ResultInput {
  slot: number;
  kind: 'human' | 'cpu';
  name: string;
  character: ModelKey;
  book: ScoreBook;
}

export function buildMatchResult(opts: {
  duration: number;
  players: readonly ResultInput[];
  damage: number;
  aborted?: boolean;
}): MatchResult {
  const { ranks, winners } = rankPlayers(
    opts.players.map((p) => ({ slot: p.slot, score: p.book.score, achievedCount: p.book.achieved.length })),
  );
  const players: PlayerResult[] = opts.players
    .map((p) => ({
      slot: p.slot,
      kind: p.kind,
      name: p.name,
      character: p.character,
      score: p.book.score,
      rank: ranks.get(p.slot) ?? opts.players.length,
      title: titleFor(p.book.score),
      complete: p.book.complete,
      achieved: [...p.book.achieved],
      secrets: [...p.book.secrets],
      breakdown: structuredCloneBreakdown(p.book.breakdown),
      extras: p.book.extras.map((e) => ({ ...e })),
      caught: p.book.caught,
    }))
    .sort((a, b) => a.rank - b.rank || a.slot - b.slot);
  return { duration: opts.duration, players, winnerSlots: winners, damage: opts.damage, aborted: opts.aborted ?? false };
}

function structuredCloneBreakdown(b: ScoreBook['breakdown']): PlayerResult['breakdown'] {
  const out: PlayerResult['breakdown'] = {};
  for (const [k, v] of Object.entries(b)) if (v) out[k as ScoreKind] = { count: v.count, points: v.points };
  return out;
}

/**
 * 見え方（最後に届いた1枚）から結果を作る。ネットの参加者が、部屋の主が途中で抜けたときに使う。
 * 見え方には内訳と捕まった回数がないので、内訳は空にし、完全制覇とひみつ以外の点は extras の「それまでの荒らし度」1行にまとめる
 * （breakdown の合計＋extras の合計＝score を守るため）。
 */
export function resultFromView(view: WorldView, world: WorldStatic, opts: { aborted?: boolean } = {}): MatchResult {
  void world;
  const players = view.avatars.map((a) => {
    const extras: { label: string; points: number }[] = [];
    const complete = MISDEED_IDS.every((m) => a.achieved.includes(m));
    if (complete) extras.push({ label: COMPLETE_BADGE, points: SCORE.completeBonus });
    for (const id of a.secrets) extras.push({ label: `ひみつ：${SECRETS.find((s) => s.id === id)?.name ?? id}`, points: SCORE.secretBonus });
    const rest = a.score - extras.reduce((n, e) => n + e.points, 0);
    if (rest !== 0) extras.unshift({ label: 'それまでの荒らし度', points: rest });
    return { a, extras, complete };
  });
  const { ranks, winners } = rankPlayers(players.map(({ a }) => ({ slot: a.slot, score: a.score, achievedCount: a.achieved.length })));
  const out: PlayerResult[] = players
    .map(({ a, extras, complete }) => ({
      slot: a.slot,
      kind: a.kind,
      name: a.name,
      character: a.character,
      score: a.score,
      rank: ranks.get(a.slot) ?? players.length,
      title: titleFor(a.score),
      complete,
      achieved: [...a.achieved],
      secrets: [...a.secrets],
      breakdown: {},
      extras,
      caught: 0,
    }))
    .sort((x, y) => x.rank - y.rank || x.slot - y.slot);
  return { duration: view.duration, players: out, winnerSlots: winners, damage: view.damage, aborted: opts.aborted ?? true };
}
