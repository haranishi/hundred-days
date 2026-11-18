/**
 * やっちゃダメの定義（設計の正本は docs/03_ルール.md）。
 * ここには「何を・どこで・どう達成するか」と画面に出す文言だけを置く。
 * 点数・秒数などの数値は rules/tuning.ts に集める（体験ループで直すのはそちら）。
 */

export type MisdeedId =
  | 'sweep'
  | 'pyramid'
  | 'cart'
  | 'bowling'
  | 'samples'
  | 'pa'
  | 'freezer'
  | 'banana'
  | 'tantrum'
  | 'bell';

export type SecretId = 'secret-staff-slip' | 'secret-cart-strike';

/**
 * 点が入る出来事の種類。コンボは「直前と別の種類」で段が上がる。
 * knock＝悪事に紐づかない落下（体当たりや投げた物で落ちた商品）、escape＝店員から逃げ切った。
 */
export type ScoreKind = MisdeedId | 'knock' | 'escape';

export type GoalKind =
  | 'count' // 回数・個数の合計
  | 'once' // 1回やれば達成
  | 'seconds' // 続けた秒数
  | 'meters' // 進んだ距離の合計
  | 'single'; // 1回の行為で target 以上（なぎ払い1回・1投など）

export interface MisdeedDef {
  id: MisdeedId;
  /** やっちゃダメリストに出す名前 */
  name: string;
  /** アクションボタンに出す短い動詞 */
  verb: string;
  /** ボタンの押し方 */
  press: 'press' | 'hold' | 'mash';
  /** あそびかた画面に出す場所 */
  where: string;
  /** あそびかた画面に出すやり方 */
  how: string;
  /** 現場に立てる店の注意書き（これがそのまま遊び方のヒントになる） */
  sign: string;
  goal: { kind: GoalKind; target: number };
  /** 達成条件の文言 */
  goalText: string;
}

export const MISDEEDS: readonly MisdeedDef[] = [
  {
    id: 'bell',
    name: '呼び出しベルを連打する',
    verb: '鳴らす',
    press: 'mash',
    where: '入口のそばのサービスカウンター',
    how: 'ベルの前でアクションを連打',
    sign: 'ベルは1回だけ押してください',
    goal: { kind: 'count', target: 20 },
    goalText: '合計20回鳴らす',
  },
  {
    id: 'sweep',
    name: '棚の商品をなぎ払う',
    verb: 'なぎ払う',
    press: 'press',
    where: 'どの棚でも',
    how: '棚の前でアクション。目の前の商品をまとめて落とす',
    sign: '商品はていねいにお取りください',
    goal: { kind: 'count', target: 20 },
    goalText: 'なぎ払いで合計20個落とす',
  },
  {
    id: 'cart',
    name: 'カートで爆走する',
    verb: '乗る',
    press: 'press',
    where: '入口のカート置き場',
    how: 'カートの近くでアクションで乗る。もう一度で降りる',
    sign: 'カートで遊ばないでください',
    goal: { kind: 'meters', target: 30 },
    goalText: '合計30m走る',
  },
  {
    id: 'pyramid',
    name: '缶ピラミッドを崩す',
    verb: '蹴る',
    press: 'press',
    where: '缶詰の通路の端の特売台',
    how: '体当たり・蹴る・投げる・カートで突っ込む',
    sign: '商品を崩さないでください',
    goal: { kind: 'once', target: 1 },
    goalText: '缶の8割を崩す',
  },
  {
    id: 'bowling',
    name: 'スイカでボウリング',
    verb: '転がす',
    press: 'press',
    where: '日用品の通路（手前にスイカのワゴン、奥にピン）',
    how: 'スイカを持って、アクションで転がす',
    sign: 'スイカを転がさないでください',
    goal: { kind: 'single', target: 5 },
    goalText: '1投で5本以上倒す',
  },
  {
    id: 'samples',
    name: '試食を食べ尽くす',
    verb: '食べる',
    press: 'mash',
    where: 'パン売り場の横の試食台',
    how: '台の前でアクションを連打',
    sign: '試食はお一人様1本まで',
    goal: { kind: 'count', target: 8 },
    goalText: '8本食べる',
  },
  {
    id: 'freezer',
    name: '冷凍ケースで涼む',
    verb: '入る',
    press: 'press',
    where: '奥の平台の冷凍ケース',
    how: 'ジャンプして中に入る',
    sign: '冷凍ケースに入らないでください',
    goal: { kind: 'seconds', target: 3 },
    goalText: '3秒続けて入る',
  },
  {
    id: 'tantrum',
    name: 'お菓子売り場で駄々をこねる',
    verb: '駄々をこねる',
    press: 'hold',
    where: 'お菓子の通路',
    how: '止まってアクションを長押し。床で手足をばたばた',
    sign: 'お菓子売り場で寝転ばないでください',
    goal: { kind: 'seconds', target: 3 },
    goalText: '3秒こねる',
  },
  {
    id: 'banana',
    name: 'バナナの皮を仕掛ける',
    verb: '皮を置く',
    press: 'press',
    where: '青果売り場のバナナ',
    how: 'バナナを持ってアクション。食べて皮を足元に置く',
    sign: 'バナナの皮を捨てないでください',
    goal: { kind: 'once', target: 1 },
    goalText: '自分以外を1回滑らせる',
  },
  {
    id: 'pa',
    name: '店内放送をジャックする',
    verb: '放送する',
    press: 'hold',
    where: '奥の放送ブースのマイク',
    how: 'マイクの前でアクションを2秒長押し',
    sign: '放送室 関係者以外立入禁止',
    goal: { kind: 'once', target: 1 },
    goalText: '1回放送する',
  },
];

export interface SecretDef {
  id: SecretId;
  name: string;
  goalText: string;
}

export const SECRETS: readonly SecretDef[] = [
  {
    id: 'secret-staff-slip',
    name: '店員さんをバナナで滑らせる',
    goalText: '店員か店長をバナナの皮で転ばせる',
  },
  {
    id: 'secret-cart-strike',
    name: 'カートで缶ピラミッドに突っ込む',
    goalText: 'カートに乗ったままぶつかり、2秒以内に缶10個以上を落とす',
  },
];

export const MISDEED_IDS: readonly MisdeedId[] = MISDEEDS.map((m) => m.id);

export function misdeedById(id: MisdeedId): MisdeedDef {
  const def = MISDEEDS.find((m) => m.id === id);
  if (!def) throw new Error(`unknown misdeed: ${id}`);
  return def;
}
