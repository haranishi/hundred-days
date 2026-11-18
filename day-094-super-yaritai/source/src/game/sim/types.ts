/**
 * シミュレーションの中の部品どうしの境目（悪事の system・店員と客が触ってよいもの）。
 * 新しい悪事や人を足すときも、この形に合わせる。
 */
import type { NavGrid } from './nav/grid';
import type { Collider, R, RigidBody, World } from './physics';
import type { ShelfFace, StoreLayout } from '../../shared/layout/store';
import type { ScoreBook, AwardResult } from '../../shared/rules/scoring';
import type { MisdeedId, ScoreKind, SecretId } from '../../shared/rules/misdeeds';
import type { InputState } from '../../shared/input';
import type { Rng } from '../../shared/rng';
import type { ActionPrompt, AnimName, GameEvent, ModelKey, NpcRole, NpcView, PeelView, Phase, PropDef, StationsView, Vec3, WorldStatic } from '../../shared/view';

/**
 * - full：商品の物理・点・店員まで全部を回す（ひとり・部屋の主）
 * - self：ネットの参加者の端末用。動かない物とカートだけを持ち、自分のキャラだけを動かして姿勢を出す（点は数えない）
 */
export type SimMode = 'full' | 'self';

export interface PropState {
  def: PropDef;
  body: RigidBody;
  collider: Collider;
  /** 最後に触った人と時刻（誰が落としたかの判定） */
  owner: number | null;
  touchT: number;
  /** なぎ払いの印（この人が、この時刻になぎ払った） */
  sweepSlot: number | null;
  sweepT: number;
  /** 床に落ちて点を数え終えた */
  scored: boolean;
  /** 定位置から動いた（店の被害率・缶ピラミッド・ピンの判定） */
  moved: boolean;
  hidden: boolean;
  /** 持たれている・積み直しなど、外から動かしている間は true（物理の判定に入れない） */
  locked: boolean;
  /** 持っている人（いなければ null） */
  heldBy: number | null;
  face: ShelfFace | null;
  /** 速く飛ばした物だけ、この時刻まで CCD を付ける */
  ccdUntil: number;
}

export interface CartState {
  id: number;
  body: RigidBody;
  collider: Collider;
  rider: number | null;
  /** 乗っている間の向きと速さ（乗っていない間は物理まかせ） */
  yaw: number;
  speed: number;
  lastRider: number | null;
  lastRideT: number;
  /** 点を入れるための距離のたまり */
  meterAcc: number;
  crashT: number;
  /** self のとき：部屋の主の見え方で、ほかの人が乗っている */
  remoteRider: number | null;
  /** 入力があるのに動けていない秒（押し付けて固まったら少し戻す） */
  stuckFor: number;
  /** 乗った時刻（乗ってすぐは、曲がった先がふさがっているかを遠くまで見る） */
  mountedAt: number;
}

export interface Offer {
  system: MisdeedSystem;
  /** 大きいほど優先 */
  priority: number;
  prompt: ActionPrompt | null;
  /** 対象の番号（カート・棚の面など） */
  target: number;
}

/** 外から渡すキャラの姿勢（ネットの参加者が送ってくる「自分の様子」） */
export interface AvatarPose {
  /** 足元の位置 */
  pos: Vec3;
  vel: Vec3;
  yaw: number;
  anim: AnimName;
  ridingCart: number | null;
  holding: number | null;
}

/** 部屋の主から参加者のキャラへの言いつけ（参加者の端末の self で従う） */
export type AvatarOrder =
  | { kind: 'caught' }
  | { kind: 'slip'; seconds?: number }
  | { kind: 'stop'; seconds: number }
  | { kind: 'mount'; cart: number }
  | { kind: 'dismount' }
  | { kind: 'teleport'; x: number; z: number };

/** キャラ（プレイヤー・CPU・ネットの参加者） */
export interface AvatarState {
  slot: number;
  kind: 'human' | 'cpu';
  name: string;
  character: ModelKey;
  body: RigidBody;
  collider: Collider;
  /** 足元の位置 */
  pos: Vec3;
  vel: Vec3;
  yaw: number;
  grounded: boolean;
  input: InputState;
  /** 移動の速さの倍率（CPU の強さ） */
  speedScale: number;
  dashLeft: number;
  dashCooldown: number;
  dashDir: { x: number; z: number };
  /** 一回きりの動作の見た目と、その残り時間 */
  actionAnim: AnimName | null;
  actionAnimLeft: number;
  /** 動作ごとの次に使える時刻 */
  cooldowns: Record<string, number>;
  anim: AnimName;
  ridingCart: number | null;
  /** 持っている物の PropDef.id */
  holding: number | null;
  /** 捕まった・滑ったなどで動けない残り秒と、その間の見た目 */
  stunned: number;
  stunAnim: AnimName;
  /** 捕まってその場でつかまれている残り秒。0になったらサービスカウンターへ移す */
  caughtHold: number;
  /** この時刻までは連打・長押しの悪事の最中（コンボの猶予を減らさない） */
  engagedUntil: number;
  book: ScoreBook;
  /** やっちゃダメの達成までの進み具合（回数・秒・m） */
  progress: Partial<Record<MisdeedId, number>>;
  offer: Offer | null;
  /** 悪事の案内を、範囲を出てもしばらく残すための記憶（ACTION.stickyTime） */
  sticky: { offer: Offer; until: number; x: number; z: number } | null;
  connected: boolean;
  /** ネットの参加者（部屋の主の端末）：本人の端末が送ってきた姿勢と、受け取った時刻。null なら手元で動かす */
  puppet: { pose: AvatarPose; at: number } | null;
  /** 写しが届いた位置へ近づけていない秒と、前の刻みの離れ（置き直しの判定） */
  puppetStuck: number;
  puppetGap: number;
  /** self のとき：部屋の主が作った案内（アクションを押したときの見た目に使う） */
  hostPrompt: ActionPrompt | null;
  /** 決まった弧で跳ぶ動き（冷凍ケースへ出入りする）。この間は当たり判定を見ずに from→to を動く */
  script: { from: Vec3; to: Vec3; t0: number; dur: number; height: number } | null;
}

/** 店員・客など、プレイヤーではない人。Simulation が毎刻み step を呼ぶ */
export interface NpcAgent {
  readonly id: number;
  readonly role: NpcRole;
  readonly pos: Vec3;
  /** まだ店に出ていない（店長は残り60秒から） */
  readonly hidden?: boolean;
  step(ctx: SimContext, dt: number): void;
  view(): NpcView;
  /** バナナの皮で転ぶ（転べたら true） */
  slip?(ctx: SimContext, by: number | null): boolean;
  /** 放送がジャックされた */
  onPa?(ctx: SimContext, slot: number): void;
  /** 近くで悪事が起きた（点が入った） */
  onMisdeed?(ctx: SimContext, slot: number, pos: Vec3): void;
}

/** 悪事の system が使える道具 */
export interface SimContext {
  readonly R: R;
  readonly world: World;
  readonly mode: SimMode;
  readonly layout: StoreLayout;
  readonly statics: WorldStatic;
  readonly nav: NavGrid;
  readonly fx: Rng;
  readonly time: number;
  /** 試合が始まってからの秒（カウントダウン中は負） */
  readonly elapsed: number;
  /** 試合の長さ（秒） */
  readonly duration: number;
  readonly phase: Phase;
  readonly lastSpurt: boolean;
  readonly avatars: readonly AvatarState[];
  readonly props: readonly PropState[];
  readonly carts: readonly CartState[];
  readonly npcs: readonly NpcAgent[];
  /** system どうしの小さな申し送り（例：カートが缶に突っ込んだ時刻）。鍵は system の id で始める */
  readonly memo: Map<string, unknown>;
  emit(e: GameEvent): void;
  /** 悪事の点を入れる（試合中・full のときだけ）。出来事も作る。heat を渡すと目立ち度の上がり方を変える */
  award(slot: number, kind: ScoreKind, base: number, pos: Vec3, count?: number, heat?: number): AwardResult | null;
  /** 達成までの進み具合を足し、目標に届いたら達成にする。足した後の値を返す */
  progress(slot: number, id: MisdeedId, amount: number): number;
  /** 進み具合を値で置く（「1回で5本」のような単発の記録用）。目標に届いたら達成 */
  progressMax(slot: number, id: MisdeedId, value: number): void;
  achieve(slot: number, id: MisdeedId): void;
  secret(slot: number, id: SecretId): void;
  /** 目立ち度だけを上げる */
  raiseHeat(slot: number, amount: number): void;
  /** 商品に「触った人」を記録する */
  touch(prop: PropState, slot: number | null): void;
  /** 商品を飛ばす（速度を直接入れる）。速い物には CCD を付ける */
  launch(prop: PropState, vel: Vec3, spin: Vec3, slot: number | null): void;
  /** 商品の当たり判定の中心（今の位置） */
  propCenter(prop: PropState): Vec3;
  /** 当たり判定の番号から商品を引く（商品でなければ undefined） */
  propOf(colliderHandle: number): PropState | undefined;
  isMoved(prop: PropState): boolean;
  /** 商品を定位置へ戻す（積み直し・補充）。眠らせて、動いた印も消す */
  resetProp(prop: PropState): void;
  /** 持つ・離す（持っている間は運動学にして手の前に置く） */
  hold(av: AvatarState, prop: PropState): void;
  release(av: AvatarState): PropState | null;
  avatarBySlot(slot: number): AvatarState | undefined;
  /** 動作の見た目を出す */
  playAction(av: AvatarState, anim: AnimName, time?: number): void;
  /** 連打・長押しの悪事をしている（コンボの猶予を止める。連打は押すたび、長押しは毎刻み呼ぶ） */
  engage(av: AvatarState): void;
  cooldownReady(av: AvatarState, key: string): boolean;
  setCooldown(av: AvatarState, key: string, seconds: number): void;
  /** 動けなくする（捕まった・滑った） */
  stun(av: AvatarState, seconds: number, anim: AnimName): void;
  /** 店員に捕まった：サービスカウンターへ戻し、目立ち度とコンボを0に、持ち物を落とす */
  catchAvatar(slot: number, npc: number): void;
  /** キャラを置き直す（向きはそのまま） */
  teleport(slot: number, x: number, z: number): void;
}

/**
 * 悪事1つぶんの仕組み。systems/index.ts に登録すると、シミュレーションが毎刻み呼ぶ。
 * - offer：この人がいまアクションしたら何が起きるか（案内の文字と優先度）。いちばん高い候補が選ばれる
 * - act：選ばれた候補で、アクションを押した瞬間の処理
 * - hold：選ばれた候補で、アクションを押している間の処理（長押しの悪事）
 * - preStep：物理の刻みの前（乗り物を動かすなど）／postStep：物理の刻みの後（数える・元に戻すなど）
 * - stations・peels：見え方に書き込む
 * - local：self（ネットの参加者の端末）でも回す（自分の動きに関わるもの：カート・冷凍ケースに入る）
 */
export interface MisdeedSystem {
  readonly id: string;
  readonly local?: boolean;
  init?(ctx: SimContext): void;
  offer?(ctx: SimContext, av: AvatarState): Offer | null;
  act?(ctx: SimContext, av: AvatarState, offer: Offer): void;
  hold?(ctx: SimContext, av: AvatarState, offer: Offer, dt: number): void;
  preStep?(ctx: SimContext, dt: number): void;
  postStep?(ctx: SimContext, dt: number): void;
  stations?(ctx: SimContext, out: StationsView): void;
  peels?(ctx: SimContext, out: PeelView[]): void;
}
