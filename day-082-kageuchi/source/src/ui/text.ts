// OWNER: core
// 画面の文言。見つかった理由の文は、sim が残した記録（誰が・何で・明るさの段・構え・距離）から組み立てる。
import type { Rank } from '../config/rules';
import type { LightTier } from '../sim/query';
import type { DetectRecord } from '../sim/types';
import type { SurfaceKind } from '../stage/types';
import type { GameStateOut } from '../game/state';

export const TIER_LABEL: Record<LightTier, string> = { dark: '闇', dim: '薄明', lit: '灯り' };
export const SURFACE_LABEL: Record<SurfaceKind, string> = { gravel: '白砂', stone: '石畳', moss: '苔', dirt: '土' };
export const PHASE_LABEL = { normal: '', caution: '警戒', evasion: '捜索', alert: '発見' } as const;

/** 各面に共通する、評価と再挑戦の案内。役割・対象・クリア条件は StageMeta.mission が持つ。 */
export const MISSION_HELP = {
  rating: '見つからずに達成すると高評価。番兵を倒すか、小石を使うかは自由。',
  retry: '見つかっても、逃げ切れば続行できる。討たれたら R で再挑戦。',
  hudClear: '討ち取ればクリア',
} as const;

function stanceText(r: DetectRecord): string {
  if (r.stance === 'run') return '走っていた';
  if (r.stance === 'crouch') return r.inBush ? '植え込みでしゃがんでいた' : 'しゃがんでいた';
  return r.still ? '立ち止まっていた' : '歩いていた';
}

function where(r: DetectRecord): string {
  return `${TIER_LABEL[r.lightTier]}の中で${stanceText(r)}ところを、${r.distance.toFixed(1)}m 先から`;
}

/** 最初の発見のきっかけ。 */
export function causeText(r: DetectRecord): string {
  switch (r.cause) {
    case 'noise':
      return `${r.guardName}が物音を聞きつけ、${where(r)}見つけた。`;
    case 'stone':
      return `小石の音を調べに来た${r.guardName}が、${where(r)}見つけた。`;
    case 'body':
      return `倒れた仲間に気づいた${r.guardName}が、${where(r)}見つけた。`;
    case 'takedown':
      return `当て身の最中を、${r.guardName}に ${r.distance.toFixed(1)}m 先から見られた。`;
    case 'debug':
      return `${r.guardName}に討たれた（試しの操作）。`;
    default:
      return `${r.guardName}に、${where(r)}見られた。`;
  }
}

export function captureText(r: DetectRecord): string {
  return `${r.guardName}の槍に突かれた（${r.distance.toFixed(1)}m）。`;
}

/** 次に活かす一言（最初の発見の状況から）。 */
export function hintText(r: DetectRecord | null): string {
  if (!r) return '番兵の扇と頭の上の「？」を見て、闇を選べ。';
  if (r.cause === 'takedown') return '当て身の前に、ほかの番兵の目がどこを向いているかを確かめよ。';
  if (r.cause === 'body') return '倒した番兵は、灯りから遠い暗がりで。';
  if (r.cause === 'noise' && r.surface === 'gravel') return '白砂は足音が響く。しゃがむか、苔の上を行け。';
  if (r.cause === 'noise') return '走ると足音が遠くまで響く。近くではしゃがめ。';
  if (r.lightTier === 'lit') return '灯りの中では遠くから見つかる。闇を選べ。';
  if (r.stance === 'run') return '走ると遠くまで見える。番兵の近くでは歩くか、しゃがめ。';
  if (r.stance !== 'crouch') return 'しゃがめば、見える距離が縮む。植え込みの中ならさらに。';
  return '「？」が出たら、すぐに扇の外へ。';
}

export const RANK_TEXT: Record<Rank, string> = {
  影: '誰にも気づかれず、誰も倒さず。影のごとく討った。',
  梟: '闇を見通し、一度も見つからなかった。',
  狐: '一度は見つかったが、知恵で切り抜けた。',
  猪: '力ずくの突破だった。次は闇と灯りを読め。',
};

export function formatTime(t: number): string {
  // 刻みの足し算の誤差（1.9999…秒）で 1 秒少なく出ないように
  const s = Math.max(0, Math.floor(t + 1e-6));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * 発見に入ったとき、帯の下に一度だけ出す逃げ方（r02-fix-play 追加：体験の採点 4 位「見つかった後の逃げ方を教える」）。
 * r03-fix-play: 旧「走れば足音で追われる。視線を切ったら歩いて離れろ」は、追っ手が最後に見た位置まで走ってくる動きと合わず、
 * 案内どおりに歩くと捕まった（体験の採点 1 位）。視線が切れた所でしゃがんでも同じく見つかるので、「離れてから」を入れた（tests/escape.test.ts）
 */
export const ALERT_TIP = '走って物陰へ。視線が切れたら、その場を離れてしゃがめ';

/** 発見中の帯の添え書き：見られている間（残りの秒は止まっている）と、誰にも見られていない間（残りの秒が減る）。r03-fix-play 追加 */
export const WATCH_LABEL = { seen: '見られている', unseen: '見られていない' } as const;

/** 狙っている間の添え書き。r03-fix-play：右クリックか Esc で投げずにやめられることを足した */
export const AIM_HINT = 'Q を離して投げる　右クリックでやめる（マウスの上下で遠近）';

/** HUD の右下の操作：キー（角ゴ）と働き（明朝）の組。 */
export const HUD_KEYS: [string, string][] = [
  ['F', '近接攻撃（音が大きい）'],
  ['E', '制圧・仕掛けを使う'],
  ['Q', '長押しで狙う・離して投げる'],
  ['C', 'しゃがむ'],
  ['Shift', '走る'],
  ['Esc', '止める'],
];

export const CONTROLS: [string, string][] = [
  ['W A S D', '歩く（カメラの向きが前）'],
  ['Shift', '走る（足音が大きい）'],
  ['C / Ctrl', 'しゃがむ（切り替え）'],
  ['マウス', '視点（クリックで固定）・ホイールで寄り引き'],
  ['E', '背後から当て身／信長を討つ'],
  ['F', '正面から近接攻撃。番兵は2撃で制圧（音が出る）'],
  ['E', '板戸・消灯・補充・偵察。作業中の移動で中断'],
  ['Q 長押し', '小石を狙う・離して投げる（右クリックか Esc でやめる）'],
  ['Esc', '一時停止　　R　やり直す'],
];

// ---------------------------------------------------------------- タッチ操作の文言（2026-11-03 スマホ対応・tasks 3.2）
// タッチのときは、画面のどこにもキー名（Enter・Esc・R・WASD・E・F・Q・C・Shift・Ctrl・M）を出さない（requirements 6.3）。
// 規則やステージの文（src/sim・src/stage）は書き換えられないので、画面に出す直前に touchWording で言い換える。

/** 画面の文にキー名・マウスの操作が含まれていれば true（試験と、言い換えの漏れの検出用）。 */
export function hasKeyName(s: string): boolean {
  return /Enter|Esc|Shift|Ctrl|WASD|W A S D|右クリック|ホイール|マウス|(?<![A-Za-z])[EFQRCMWASD](?![A-Za-z])/.test(s);
}

/** 規則・ステージの文の、キー名を含む言い回しを、タッチのボタンの名前に言い換える。決まった言い回しを先に、残りは1文字ずつ。 */
const TOUCH_PHRASES: [RegExp, string][] = [
  [/「E 討ち取る」が出たら、Eキーを押す。/g, '当て身のボタンが「討つ」に変わったら押す。'],
  [/背後に近づいて E/g, '背後に近づいて当て身'],
  [/背後で E/g, '背後で当て身'],
  [/Eの背後制圧/g, '当て身での背後制圧'],
  [/正面攻撃は F/g, '正面からは「攻撃」'],
  [/を E で開く/g, 'を「使う」で開く'],
  [/Eで消灯・補充・偵察/g, '「使う」で消灯・補充・偵察'],
  [/討たれたら R で再挑戦/g, '討たれたら「やり直す」で再挑戦'],
];
const TOUCH_LETTERS: [RegExp, string][] = [
  [/(?<![A-Za-z])E\s?キー/g, '当て身'],
  [/(?<![A-Za-z])E(?![A-Za-z])/g, '当て身'],
  [/(?<![A-Za-z])F(?![A-Za-z])/g, '「攻撃」'],
  [/(?<![A-Za-z])Q(?![A-Za-z])/g, '「小石」'],
  [/(?<![A-Za-z])C(?![A-Za-z])/g, '「しゃがむ」'],
  [/(?<![A-Za-z])R(?![A-Za-z])/g, '「やり直す」'],
];

export function touchWording(s: string): string {
  let out = s;
  for (const [re, to] of TOUCH_PHRASES) out = out.replace(re, to);
  for (const [re, to] of TOUCH_LETTERS) out = out.replace(re, to);
  return out;
}

/** 評価と再挑戦の案内（タッチ）。 */
export const MISSION_HELP_TOUCH = {
  ...MISSION_HELP,
  retry: '見つかっても、逃げ切れば続行できる。討たれたら「やり直す」で再挑戦。',
} as const;

/** 説明の画面の「操作」（タッチ）。左がボタン・なぞる場所、右が働き。 */
export const CONTROLS_TOUCH: [string, string][] = [
  ['左をなぞる', '歩く（倒した分だけ速く。いちばん外の輪まで倒すと走る・足音が大きい）'],
  ['右をなぞる', '見回す'],
  ['しゃがむ', 'しゃがむ（切り替え）'],
  ['当て身', '背後で討つ・制圧。板戸・消灯・補充・偵察の前では「使う」に変わる。作業中に動くと中断'],
  ['攻撃', '正面から攻撃。番兵は2撃で制圧（音が出る）'],
  ['小石', '押している間ねらい、離して投げる。ちょんと押せばねらいを保つ。「やめる」で投げずに戻る'],
  ['右上の二本線', '一時停止'],
];

/** 狙っている間の添え書き（タッチ）。2行に分けて出す。 */
export const AIM_HINT_TOUCH: readonly [string, string] = ['離して投げる　ちょん押しなら「投げる」', '「やめる」で中止　なぞって向きと遠近'];

/** 遊び始めに一度だけ出す操作のヒント（タッチ）。 */
export const TOUCH_HINT_LINES: readonly [string, string] = ['左をなぞって歩く　右をなぞって見回す', 'いちばん外の輪まで　倒すと走る'];

/** 縦向きのときの注記（タイトル・選択・説明）。 */
export const PORTRAIT_NOTE = 'スマホは横向きで遊びます';

/** 「いまできること」のひとこと。touch が偽ならキーボードの文（変更前と同じ）、真ならキー名を含まない文。 */
export function promptText(st: Pick<GameStateOut, 'player' | 'mission' | 'guards'>, touch: boolean): string {
  const guardNear = st.guards.some((g) => !g.down && g.id !== 'nobunaga' && Math.hypot(st.player.x - g.x, st.player.z - g.z) < 2.5);
  const p = st.player.prompt;
  const it = st.mission.interaction;
  const pct = Math.floor(st.mission.progress * 100);
  if (!touch) {
    return p === 'assassinate' ? 'E　討ち取る' : p === 'takedown' ? 'E　背後から制圧　／　F　近接攻撃'
      : it ? (st.mission.progress > 0 ? `${it}　${pct}%（移動で中断）` : `E　${it}`)
      : guardNear ? 'F　近接攻撃　／　背後へ回ると E で制圧' : '';
  }
  return p === 'assassinate' ? '背後から討ち取る' : p === 'takedown' ? '背後から「当て身」　／　正面から「攻撃」'
    : it ? (st.mission.progress > 0 ? `${it}　${pct}%（動くと中断）` : `「使う」で${it}`)
    : guardNear ? '正面から「攻撃」／背後へ回って「当て身」' : '';
}
