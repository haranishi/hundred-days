// OWNER: core
// ?shot=<名前> の段取り：種と時刻を固定し、決まった刻みを進めてから window.__shotReady=true にする。
// カメラの構図は contract の SHOTS（art.html と同じ構図）。演出・討たれた・結果は、そこへ至る遊びを決まった刻みで流して作る。
import type { Screen } from './state';

export type ShotName = 'title' | 'start' | 'gate' | 'courtyard' | 'bamboo' | 'garden' | 'nobunaga' | 'finale' | 'gameover' | 'result';

export interface ShotPlan {
  name: ShotName;
  screen: Screen;
  /** カメラの構図（src/contract/shots.ts の名前）。'follow' は遊ぶときの追従カメラ。 */
  composition: string;
  /** この時刻（秒）まで進める。 */
  t: number;
  /** 最後の 0.1 秒の手前で、プレイヤーをここへ置き直す。 */
  player?: { x: number; z: number; yawDeg: number; crouch: boolean };
  /** finale：討ち取って演出をこの進みまで／gameover：明るい表門で捕まる／result：討ち取って結果まで */
  special?: 'finale' | 'gameover' | 'result';
  finaleAt?: number;
}

export const SHOT_PLANS: Record<ShotName, ShotPlan> = {
  title: { name: 'title', screen: 'title', composition: 'title', t: 12 },
  start: { name: 'start', screen: 'play', composition: 'start', t: 3 },
  gate: { name: 'gate', screen: 'play', composition: 'gate', t: 5 },
  courtyard: { name: 'courtyard', screen: 'play', composition: 'courtyard', t: 8, player: { x: -6.4, z: 19.6, yawDeg: 270, crouch: true } },
  bamboo: { name: 'bamboo', screen: 'play', composition: 'bamboo', t: 10, player: { x: -33, z: -9, yawDeg: 270, crouch: true } },
  garden: { name: 'garden', screen: 'play', composition: 'garden', t: 14, player: { x: -0.6, z: -15, yawDeg: 300, crouch: true } },
  nobunaga: { name: 'nobunaga', screen: 'play', composition: 'nobunaga', t: 16, player: { x: 3.0, z: -18.9, yawDeg: 180, crouch: true } },
  finale: { name: 'finale', screen: 'finale', composition: 'fire', t: 16, player: { x: 3.0, z: -18.9, yawDeg: 180, crouch: true }, special: 'finale', finaleAt: 0.75 },
  gameover: { name: 'gameover', screen: 'gameover', composition: 'follow', t: 0.5, player: { x: 0, z: 31.2, yawDeg: 270, crouch: false }, special: 'gameover' },
  result: { name: 'result', screen: 'result', composition: 'fire', t: 2, special: 'result' },
};

export function isShotName(s: string): s is ShotName {
  return s in SHOT_PLANS;
}
