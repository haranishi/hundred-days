// OWNER: core
// 画面の文言。見つかった理由の文は、sim が残した記録（誰が・何で・明るさの段・構え・距離）から組み立てる。
import type { Rank } from '../config/rules';
import type { LightTier } from '../sim/query';
import type { DetectRecord } from '../sim/types';
import type { SurfaceKind } from '../stage/types';

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
