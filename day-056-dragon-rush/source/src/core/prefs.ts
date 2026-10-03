// OWNER: core
// 遊ぶ人の好み（音量）をブラウザに覚える。読めない・書けない環境（プライベートモードなど）では既定値のまま動く。
// 音（r00d）はここの volume・bgm・sfx を読む。
// r03-roster：最後に選んだ怪獣（creature）も覚え、次に開いたときもその怪獣で始める（名前の確かめは読む側がする）。

import { LOOK } from '../config/controls';

const KEY = 'dragon-rampage.prefs';

export interface Prefs {
  /** 全体の音量（0〜1） */
  volume: number;
  /** BGM と効果音の音量（0〜1）。r00d：一時停止の画面に「全体・BGM・効果音」の3つを置いた */
  bgm: number;
  sfx: number;
  /** r02-controls：マウスの感度（倍、config/controls.ts の LOOK.scaleMin〜scaleMax）と上下反転。本物のマウスの動きにだけ効く */
  lookScale: number;
  invertY: boolean;
  /** 最後に選んだ怪獣の名前（config/creatures の CreatureId）。選んだことが無ければ null */
  creature: string | null;
}

export type VolumeKind = 'volume' | 'bgm' | 'sfx';

const DEFAULTS: Prefs = { volume: 0.8, bgm: 0.8, sfx: 0.9, lookScale: 1, invertY: false, creature: null };

export function loadPrefs(): Prefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    const read = (k: VolumeKind): number => {
      const v = parsed[k];
      return typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULTS[k];
    };
    const lookScale = typeof parsed.lookScale === 'number' && Number.isFinite(parsed.lookScale) ? Math.min(LOOK.scaleMax, Math.max(LOOK.scaleMin, parsed.lookScale)) : DEFAULTS.lookScale;
    const invertY = typeof parsed.invertY === 'boolean' ? parsed.invertY : DEFAULTS.invertY;
    const creature = typeof parsed.creature === 'string' ? parsed.creature : DEFAULTS.creature;
    return { volume: read('volume'), bgm: read('bgm'), sfx: read('sfx'), lookScale, invertY, creature };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePrefs(prefs: Prefs): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // 保存できなくても遊べる
  }
}
