// OWNER: core
// 出来事の口。遊びの側（gameplay）が出し、画面の効果（fx）・音（r00d で作る）・記録（harness）が購読する。
// どの出来事にもゲーム内時刻 t（秒、一時停止中は進まない）を入れる。名前と中身は購読側との契約なので、
// 足すのはよいが、消したり意味を変えたりするときは購読側（src/fx・src/audio・tools/play.mjs）も同時に直す。

export type P3 = [number, number, number];
export type Foot = 'FL' | 'FR' | 'HL' | 'HR';
/** 建物の外壁の材質（音と破片の色の出し分けに使う）。 */
export type BuildingMaterial = 'glass' | 'tile' | 'concrete' | 'wood' | 'metal';
/**
 * 壊した原因。fire は燃え広がりによる損傷で、連鎖には数えない。
 * r03-roster：雷翼の雷（lightning）、焔角の溶岩の礫（lava）・地割れ（fissure）・のしかかり（slam）・突進（charge）を足した
 */
export type DamageCause = 'breath' | 'claw' | 'tail' | 'roar' | 'dive' | 'rageDive' | 'trample' | 'bump' | 'fire' | 'lightning' | 'lava' | 'fissure' | 'slam' | 'charge';
/** 怪獣の名前（config/creatures の CreatureId と同じ。core から config を読まないよう、ここでは文字列で持つ） */
export type CreatureName = 'kurenai' | 'raiyoku' | 'homuratsuno';

export interface BuildingEvent {
  t: number;
  id: number;
  /** 当たった所（段階が進んだ瞬間の目安の位置） */
  pos: P3;
  /** 建物の体積（m³） */
  volume: number;
  /** 建物の高さ（m） */
  height: number;
  material: BuildingMaterial;
  cause: DamageCause;
}

export interface GameEventMap {
  'dragon.step': { t: number; foot: Foot; pos: P3; speed: number };
  'dragon.wingFlap': { t: number; strength: number; pos: P3 };
  /** impact は 0〜1（急降下の全力で 1）、speed は接地の瞬間の落下速度（m/s）。slam は焔角が跳んでのしかかった着地（r03-roster） */
  'dragon.land': { t: number; pos: P3; impact: number; speed: number; dive: boolean; slam?: boolean };
  'dragon.roar': { t: number; pos: P3; dir: P3 };
  'dragon.breath.start': { t: number; pos: P3; dir: P3 };
  'dragon.breath.stop': { t: number; pos: P3; dir: P3 };
  'dragon.claw': { t: number; pos: P3; hit: boolean; count: number };
  'dragon.tail': { t: number; pos: P3; hit: boolean; count: number };
  'building.crack': BuildingEvent;
  'building.peel': BuildingEvent;
  'building.tilt': BuildingEvent;
  'building.collapse': BuildingEvent;
  /** count は割れた窓の枚数の目安 */
  'glass.shatter': { t: number; id: number; pos: P3; count: number };
  /** size は燃え始めた建物の大きさの目安（m、体積の立方根） */
  'fire.ignite': { t: number; id: number; pos: P3; size: number };
  'fire.spread': { t: number; id: number; pos: P3; size: number; from: number };
  'combo.change': { t: number; value: number; multiplier: number };
  'rage.full': { t: number; value: number };
  /** kind：地上の大技（咆哮・雷翼の落雷の輪）が roar、空中が dive、焔角の地割れが fissure */
  'rage.release': { t: number; kind: 'roar' | 'dive' | 'fissure'; value: number };
  /** creature は遊ぶ怪獣（r03-roster。音はこれで怪獣ごとの音を引く） */
  'session.start': { t: number; creature?: CreatureName };
  /**
   * r03-roster：怪獣ごとの技（docs/CHARACTERS.md のキーの表）。どれも creature に怪獣の名前を載せる。
   * 雷（雷翼）：hop 0 は口から最初の建物（外れたら id -1 で地面か空）、1〜4 は建物から建物へ跳ねた雷。from・to は雷の両端
   */
  'lightning.hop': { t: number; creature: CreatureName; hop: number; from: P3; to: P3; id: number; damage: number };
  /** 落雷の輪の1本（雷翼の E）。pos は落ちた地面の点、hits は当たった棟数 */
  'lightning.bolt': { t: number; creature: CreatureName; pos: P3; index: number; hits: number };
  /** 溶岩の礫（焔角の左クリック）：投げた（pos は口、vel は初速、flight は届くまでの予定の秒数）・弾けた */
  'lava.launch': { t: number; creature: CreatureName; id: number; pos: P3; vel: P3; flight: number };
  'lava.impact': { t: number; creature: CreatureName; id: number; pos: P3; hits: number };
  /** 地割れ（焔角の E）：走り始め（pos は最初の裂け目、dir は向き、length は予定の長さ m）と、裂け目1つごと */
  'fissure.start': { t: number; creature: CreatureName; id: number; pos: P3; dir: P3; length: number; segments: number };
  'fissure.crack': { t: number; creature: CreatureName; id: number; pos: P3; index: number; hits: number };
  /** 突進（焔角の Shift＋W）：始まり・終わりと、当たったビルを傾きまで押し倒した瞬間 */
  'charge.start': { t: number; creature: CreatureName; pos: P3 };
  'charge.stop': { t: number; creature: CreatureName; pos: P3 };
  'charge.shove': { t: number; creature: CreatureName; id: number; pos: P3 };
  /** 跳んだ（焔角の Space。屈み終えて地面を離れた瞬間） */
  'dragon.jump': { t: number; creature: CreatureName; pos: P3 };
  'session.end': { t: number; yen: number; destruction: number; maxCombo: number };
  'ui.click': { t: number; target: string };
}

export type GameEventType = keyof GameEventMap;
export type GameEvent = { [K in GameEventType]: { type: K } & GameEventMap[K] }[GameEventType];

/** 1回の遊びで必ず出る出来事の一覧（テストと play.mjs が数を確かめる）。 */
export const GAME_EVENT_TYPES: readonly GameEventType[] = [
  'dragon.step',
  'dragon.wingFlap',
  'dragon.land',
  'dragon.roar',
  'dragon.breath.start',
  'dragon.breath.stop',
  'dragon.claw',
  'dragon.tail',
  'building.crack',
  'building.peel',
  'building.tilt',
  'building.collapse',
  'glass.shatter',
  'fire.ignite',
  'fire.spread',
  'combo.change',
  'rage.full',
  'rage.release',
  'session.start',
  'session.end',
  'ui.click',
];

/**
 * r03-roster：怪獣ごとの技の出来事。その怪獣の3分の自動プレイで必ず出る（テストと play.mjs が確かめる）。
 * 紅竜は GAME_EVENT_TYPES の炎と羽ばたきを、雷翼は羽ばたきと雷を、焔角は溶岩・地割れ・突進・跳ぶを使う（焔角は羽ばたかない）。
 */
export const CREATURE_EVENT_TYPES: Record<CreatureName, readonly GameEventType[]> = {
  kurenai: ['dragon.breath.start', 'dragon.wingFlap', 'dragon.roar'],
  raiyoku: ['dragon.breath.start', 'dragon.wingFlap', 'lightning.hop', 'lightning.bolt'],
  homuratsuno: ['lava.launch', 'lava.impact', 'fissure.start', 'fissure.crack', 'charge.start', 'charge.shove', 'dragon.jump'],
};

type Listener<K extends GameEventType> = (event: GameEventMap[K]) => void;
type AnyListener = (event: GameEvent) => void;

export class EventBus {
  private readonly listeners = new Map<GameEventType, Set<Listener<GameEventType>>>();
  private readonly anyListeners = new Set<AnyListener>();
  private readonly counter = new Map<GameEventType, number>();
  /** 直近の出来事（新しいものが末尾）。記録と E2E の確認用 */
  readonly recent: GameEvent[] = [];

  constructor(private readonly recentLimit = 256) {}

  on<K extends GameEventType>(type: K, fn: Listener<K>): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(fn as Listener<GameEventType>);
    return () => set.delete(fn as Listener<GameEventType>);
  }

  onAny(fn: AnyListener): () => void {
    this.anyListeners.add(fn);
    return () => this.anyListeners.delete(fn);
  }

  emit<K extends GameEventType>(type: K, payload: GameEventMap[K]): void {
    this.counter.set(type, (this.counter.get(type) ?? 0) + 1);
    const event = { type, ...payload } as GameEvent;
    this.recent.push(event);
    if (this.recent.length > this.recentLimit) this.recent.splice(0, this.recent.length - this.recentLimit);
    const set = this.listeners.get(type);
    if (set) for (const fn of set) fn(payload);
    for (const fn of this.anyListeners) fn(event);
  }

  count(type: GameEventType): number {
    return this.counter.get(type) ?? 0;
  }

  /** 種類ごとの回数（出ていない種類は含めない）。 */
  counts(): Partial<Record<GameEventType, number>> {
    return Object.fromEntries(this.counter) as Partial<Record<GameEventType, number>>;
  }

  /** 回数と直近の記録を消す（購読はそのまま）。やり直しで使う。 */
  resetLog(): void {
    this.counter.clear();
    this.recent.length = 0;
  }
}
