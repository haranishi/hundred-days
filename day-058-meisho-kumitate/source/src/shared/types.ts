// ルールの計算で使う型。ブラウザでもサーバーでも使うので、DOM・three.js・Cloudflare の型は使わない。
// 状態（GameState）はすべてただのデータにする（JSON にそのまま書ける。関数や Map は入れない）。

/** 出題範囲：日本／世界／ぜんぶ */
export type Scope = 'japan' | 'world' | 'all'
/** 名所のある地域（出題範囲から「ぜんぶ」を除いたもの） */
export type Region = 'japan' | 'world'
/** コンピューター（ガイドさん）の強さ：見習い／ベテラン／伝説 */
export type CpuLevel = 'minarai' | 'veteran' | 'densetsu'
export type PlayerKind = 'human' | 'cpu'
/** 席の番号。1P〜4P の色・形・ボタンの位置を決める */
export type PlayerSlot = 0 | 1 | 2 | 3

export interface PlayerInfo {
  id: string
  name: string
  kind: PlayerKind
  slot: PlayerSlot
  /** kind が 'cpu' のときの強さ */
  cpuLevel?: CpuLevel
}

export interface PlayerState extends PlayerInfo {
  /** マイナスにもなる */
  score: number
  /** ネット対戦で抜けた人は false。押せない・答えられない・勝敗の対象外 */
  active: boolean
}

/** 段階。countdown は1問目の前だけ。answering の間は組み立てが止まる */
export type Phase = 'countdown' | 'intro' | 'building' | 'lastcall' | 'answering' | 'reveal' | 'finished'

// ── 名所 ──

/** 名所の種類。「同じ種類が続かない出題」と「はずれ選び」に使う */
export type LandmarkCategory =
  | 'tower'
  | 'temple'
  | 'shrine'
  | 'castle'
  | 'mountain'
  | 'gate'
  | 'village'
  | 'bridge'
  | 'statue'
  | 'ruins'
  | 'tomb'
  | 'wall'
  | 'church'
  | 'palace'
  | 'nature'

/** 豆知識の出典 */
export interface FactSource {
  /** Date the primary page was checked, when available. */
  checkedAt?: string
  title: string
  url: string
}

export interface Landmark {
  /** 英小文字とハイフン。描画側も同じ id を使う */
  id: string
  /** 選択肢と答えのカードに出す短い名前 */
  name: string
  /** 正式な名前（答えのカードで添える） */
  officialName: string
  scope: Region
  /** 選択肢の2行目に出す場所（例：京都府京都市） */
  place: string
  lat: number
  lon: number
  /** 完成・建立の年（例：1958年）。答えのカードで添える。わからなければ空文字 */
  built: string
  /** 1=やさしい〜3=むずかしい */
  difficulty: 1 | 2 | 3
  category: LandmarkCategory
  /** 見間違えやすい名所の id（はずれの候補に先に使う） */
  confusables: string[]
  /** 出典で確かめた豆知識1文。確かめるまでは空文字 */
  fact: string
  factSources: FactSource[]
  /** 模型がある（出題できる） */
  modeled: boolean
  /** 名前だけ（模型なし。はずれの選択肢にだけ使う） */
  nameOnly: boolean
}

// ── 1問ぶんの状態 ──

/** 1問ぶんの出題。正解の番号を含むので、ネットには答えあわせまで出さない */
export interface QuestionSpec {
  landmarkId: string
  /** 4択の名所 id（並びは乱数） */
  choiceIds: string[]
  correctIndex: number
}

/** コンピューターが出題の時点で決める、その問題での動き */
export interface CpuPlan {
  /** 押す進み具合（0.12〜1.05。1を超えたら最後のチャンスに押す） */
  buzzProgress: number
  /** 当たるか */
  correct: boolean
  /** 押してから答えるまでの時間（ミリ秒） */
  thinkMs: number
  /** はずれのときに選ぶ番号（正解とは別の番号） */
  wrongChoiceIndex: number
}

export interface CpuQuestionPlan extends CpuPlan {
  playerId: string
  /** 押す時刻を「押せる時間（組み立て＋最後のチャンス）の経過ミリ秒」で表したもの。再開時に予定を過ぎていれば付け直す */
  buzzAtOpenMs: number
}

/** 押してから答えるまでの1回分 */
export interface Attempt {
  playerId: string
  /** 得点の計算に使った進み具合 */
  progress: number
  buzzedAt: number
  /** 答えが決まった時刻（時間切れなら締め切りの時刻） */
  answeredAt: number
  /** 選んだ番号。時間切れは null */
  choiceIndex: number | null
  correct: boolean
  /** 得た点。まちがい・時間切れは −200 */
  points: number
}

export interface QuestionState extends QuestionSpec {
  /** 0 から数える */
  index: number
  /** 「押せる時間」のうち、openResumedAt より前に使った分（ミリ秒）。BUILD_MS まで組み立て、そのあと LAST_CALL_MS が最後のチャンス */
  openElapsedMs: number
  /** いま動いている区間の始まりの時刻。止まっている間は null */
  openResumedAt: number | null
  /** いま答えている人 */
  buzzerId: string | null
  /** いま答えている人の、得点に使う進み具合 */
  buzzProgress: number | null
  buzzedAt: number | null
  answerEndsAt: number | null
  /** この問題でもう押せない人（まちがえた・時間切れ・抜けた） */
  lockedOut: string[]
  attempts: Attempt[]
  /** コンピューターごとの予定（席の順） */
  cpu: CpuQuestionPlan[]
}

/** 1問の終わり方：だれかが正解／全員が押せなくなった／最後のチャンスまで誰も当てなかった */
export type QuestionEnd = 'correct' | 'allLockedOut' | 'timeUp'

export interface QuestionResult extends QuestionSpec {
  index: number
  attempts: Attempt[]
  /** 正解した人。いなければ null */
  winnerId: string | null
  /** 正解した人が得た点（いなければ 0） */
  points: number
  endedBy: QuestionEnd
}

export interface GameOutcome {
  /** いちばん点の高い人（抜けていない人の中から）。2人以上なら「ひきわけ」 */
  winnerIds: string[]
  draw: boolean
  /** 人が抜けて途中で終わった */
  endedEarly: boolean
}

export interface GameState {
  v: 1
  /** 乱数の種。ネットには出さない（出題がすべてわかってしまう） */
  seed: number
  scope: Scope
  questionCount: number
  /** 全問の出題。ネットには出さない */
  questions: QuestionSpec[]
  /** 席の順に並べる */
  players: PlayerState[]
  phase: Phase
  /** 'start' した時刻。それまでは null（countdown のまま止まっている） */
  startedAt: number | null
  phaseStartedAt: number | null
  /** いまの段階が時間で終わる時刻（止まらなければ）。終わりがなければ null */
  phaseEndsAt: number | null
  /** いまの問題の番号（0 から）。1問目の前は -1 */
  questionIndex: number
  question: QuestionState | null
  /** 終わった問題の結果 */
  results: QuestionResult[]
  outcome: GameOutcome | null
  /** 最後に状態を進めた時刻。now が戻っても、これより前には戻さない */
  updatedAt: number
}

// ── 状態を進める操作 ──

export type Action =
  /** 「3・2・1」を始める */
  | { type: 'start' }
  /** 時間で進む遷移（締め切り・コンピューターの押しと回答）を now まで進める */
  | { type: 'tick' }
  /** 早押し。progress は端末の画面で見ていた進み具合（ネット対戦の申告）。q を付けると別の問題あての押しを捨てる */
  | { type: 'buzz'; playerId: string; progress?: number; q?: number }
  | { type: 'answer'; playerId: string; choiceIndex: number; q?: number }
  /** 答えあわせを飛ばして次へ（ひとり・ふたりの「次へ」） */
  | { type: 'skipReveal' }
  /** ネットで抜けた人を外す */
  | { type: 'removePlayer'; playerId: string }

// ── ネットで配る形（toPublicState の結果） ──

export interface PublicQuestion {
  index: number
  landmarkId: string
  choiceIds: string[]
  /** 答えあわせより前は null */
  correctIndex: number | null
  openElapsedMs: number
  openResumedAt: number | null
  /** serverNow の時点の進み具合 */
  progress: number
  buzzerId: string | null
  buzzProgress: number | null
  buzzedAt: number | null
  answerEndsAt: number | null
  lockedOut: string[]
  attempts: Attempt[]
}

export interface PublicGameState {
  v: 1
  scope: Scope
  questionCount: number
  phase: Phase
  started: boolean
  phaseStartedAt: number | null
  phaseEndsAt: number | null
  /** この形を作ったときのサーバー時刻 */
  serverNow: number
  questionIndex: number
  players: PlayerState[]
  question: PublicQuestion | null
  results: QuestionResult[]
  outcome: GameOutcome | null
}
