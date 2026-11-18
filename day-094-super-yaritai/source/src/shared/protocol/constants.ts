// ネット対戦の数値（docs/05「部屋の決まり」「使用量と無料枠」）。
// 遊びの数値（rules/tuning.ts）とは分ける。こちらは通信と無料枠の都合で決まるもので、体験ループでは触らない。

// ── 人数と試合 ──

export const ROOM_MIN_PLAYERS = 2
/** 友だちの部屋の席の数 */
export const FRIENDS_MAX_PLAYERS = 4
/** 相手探しの部屋の席の数 */
export const MATCH_PLAYERS = 2
/** 部屋の主が選べる試合の長さ（秒） */
export const MATCH_DURATIONS = [90, 120, 180] as const
export type MatchDuration = (typeof MATCH_DURATIONS)[number]
export const DEFAULT_DURATION: MatchDuration = 120
/** start から試合開始までの待ち（カウントダウン3秒＋届くまでの余裕0.5秒） */
export const COUNTDOWN_MS = 3500

/**
 * キャラを選ばずに入った人（相手探しなど）に席の番号で配るキャラ。src/client/contracts.ts の PLAYER_CHARACTERS と同じ並び
 * （Worker は端末のコードを読まないので写してある。食い違いは tests/unit/net-protocol.test.ts が見つける）
 */
export const DEFAULT_CHARACTERS = [
  'ch/character-female-b',
  'ch/character-male-f',
  'ch/character-female-f',
  'ch/character-male-a',
  'ch/character-female-e',
  'ch/character-male-e',
] as const
/** キャラの鍵として受け付ける形（ModelKey の 'ch/〜'） */
export const CHARACTER_PATTERN = /^ch\/[a-z0-9-]{1,40}$/

// ── 時間（実時間・ミリ秒） ──

/** 待合室と結果の画面で、切れた人の席を残す時間 */
export const LOBBY_GRACE_MS = 60_000
/** 試合中（カウントダウンを含む）に、切れた人の席を残す時間 */
export const PLAYING_GRACE_MS = 20_000
/** 全員が抜けてから部屋を片付けるまで */
export const EMPTY_ROOM_TTL_MS = 10 * 60_000
/** 試合の長さを過ぎても主から final が来ないとき、部屋が打ち切るまでの余裕 */
export const FINAL_GRACE_MS = 15_000
/**
 * 試合中に主の店の様子（種類2）がこれだけ届かなければ、主の離脱とみなす（2026-10-06 設計者の判断）。
 * 主のタブが裏に回ると描画が止まり、接続は生きたまま試合が止まるため。席の保持（20秒）と同じ長さにそろえる
 */
export const HOST_SILENT_MS = 20_000
/** つないでから名乗る（hello）までの期限 */
export const HELLO_DEADLINE_MS = 5000
/** 相手探しで、端末があきらめるまで */
export const MATCH_TIMEOUT_MS = 20_000
/** 相手が見つかってから、相手が部屋に来るのを待つ上限（端末側） */
export const MATCH_JOIN_TIMEOUT_MS = 10_000
/** 相手探しの行列に残しておく上限（端末の20秒より長く。取り残された接続の掃除） */
export const LOBBY_MAX_WAIT_MS = 30_000

// ── 1通の大きさと通数 ──

/** バイナリ1通の上限（docs/05：1通16KBまで） */
export const MAX_BINARY_BYTES = 16 * 1024
/** JSON 1通の上限（文字数）。いちばん大きい final（4人の結果）でも 4KB ほど */
export const MAX_TEXT_CHARS = 8192
/**
 * 1接続の通数の上限：平均で毎秒40通。通信が詰まったあとにまとめて届く分を許すため、2秒分（80通）までの溜めを持つ。
 * ふつうは主が毎秒15〜30通（店の様子＋出来事）、参加者が毎秒15〜30通（自分の様子＋意図）
 */
export const RATE_PER_SEC = 40
export const RATE_BURST = 80
/** 通数の制限で切った札を受け付けない時間 */
export const BAN_MS = 30_000

// ── 試合中のデータ ──

/** 主が店の様子を、参加者が自分の様子を送る回数（毎秒） */
export const SNAPSHOT_HZ = 15
/** 店の様子の「鍵」（動いた物を全部送る）の間隔 */
export const KEYFRAME_INTERVAL_MS = 2000
/** 参加者の画面で、届いた店の様子を遅らせて補間する時間 */
export const INTERP_DELAY_MS = 100
/**
 * 試合中のデータの時刻（t）が、いまの試合の時計からこれ以上ずれていたら捨てる。
 * もう一回の直後に、前の試合の終わりの1通が遅れて届くことがあるため（部屋はバイナリの中身を見ないので、受け取る側で見分ける）
 */
export const STALE_FRAME_MS = 5000

// ── WebSocket を閉じる理由の番号（4000〜4999 はアプリが自由に使える） ──

/** 入れなかった（直前に error を送る） */
export const CLOSE_REJECTED = 4000
/** 端末が自分から部屋を出た（席をすぐに空ける。ほかの切れ方は席を残す） */
export const CLOSE_LEAVE = 4001
/** 同じ札で新しい接続が来たので、古い接続を閉じた */
export const CLOSE_REPLACED = 4002
/** 相手探しで相手が見つかった（直前に matched を送る） */
export const CLOSE_MATCHED = 4003
/** 通数の上限を超えた */
export const CLOSE_RATE_LIMITED = 4008

/**
 * つなぎっぱなしの確かめ。試合をしていない間、端末はこの文字列を30秒ごとに送り、
 * 部屋は Durable Object を起こさずに同じ文字列を返す（setWebSocketAutoResponse）。待合室で部屋が休止できるようにするため
 */
export const KEEPALIVE_MESSAGE = '{"type":"ka"}'
export const KEEPALIVE_INTERVAL_MS = 30_000

/** 試験用の見出し。localhost に届いたときだけ読む（公開先では無視する。worker/budget.ts） */
export const TEST_USAGE_HEADER = 'x-sy-test-usage'
