import { describe, expect, it } from 'vitest';
import { HUD_CSS } from '../../src/client/ui/hud/style';
import { edgePinPlacement, escapePointsFor, nextTodoHtml, type TodoHint } from '../../src/client/ui/hud/index';
import type { GameEvent } from '../../src/shared/view';

describe('HUD 品質改善（文節折り返し・逃げ切り得点・画面端方位・視認性スタイル）', () => {
  it('「近く：〜」の表示に文節 <wbr> が入り、「な／ぎ払う」のような途中改行を防ぐ', () => {
    const hint: TodoHint = { id: 'sweep', name: '棚の商品をなぎ払う', arrow: '↗', dist: 4 };
    const html = nextTodoHtml(hint);
    expect(html).toBe('近く：<wbr>棚の商品を<wbr>なぎ払う');
    expect(HUD_CSS).toMatch(/\.syh-next span\s*\{[^}]*word-break:\s*keep-all/);
  });

  it('逃げ切りバナーの得点は同じフレームの escape 得点イベント（倍率込み）を使う', () => {
    const events: GameEvent[] = [
      { t: 'score', slot: 1, kind: 'escape', points: 300, multiplier: 3, pos: { x: 0, y: 1, z: 0 } },
      { t: 'score', slot: 0, kind: 'escape', points: 150, multiplier: 1.5, pos: { x: 1, y: 1, z: 1 } },
      { t: 'escape', slot: 0 },
    ];
    expect(escapePointsFor(events, 0)).toBe(150);
    expect(escapePointsFor(events, 1)).toBe(300);
    expect(escapePointsFor([], 0)).toBe(100);
  });

  it('画面外インジケーターの位置計算はカメラ裏側も反転し画面端マージン内に収める', () => {
    const inside = edgePinPlacement(200, 300, true, 1000, 800);
    expect(inside.inside).toBe(true);
    const frontOff = edgePinPlacement(1500, 400, true, 1000, 800, 46, 56);
    expect(frontOff.inside).toBe(false);
    expect(frontOff.x).toBeCloseTo(954, 1);
    // カメラの後ろ（visible=false）は反対側の端へ反転される
    const behind = edgePinPlacement(1500, 400, false, 1000, 800, 46, 56);
    expect(behind.inside).toBe(false);
    expect(behind.x).toBeCloseTo(46, 1);
  });

  it('円形ボタンの暗い縁取り・上帯高さ揃え・カウント数字の下地ピル・PCカード非縮小が入る', () => {
    expect(HUD_CSS).toMatch(/\.syh-btn\s*\{[^}]*border:\s*3px solid var\(--sy-ink\)/);
    expect(HUD_CSS).toMatch(/\.syh-top\s*\{[^}]*align-items:\s*stretch/);
    expect(HUD_CSS).not.toMatch(/\.syh-card\.is-rival\s*\{[^}]*transform:\s*scale\(/);
    expect(HUD_CSS).toMatch(/\.syh-count\s*\{[^}]*background:\s*var\(--sy-panel\)/);
  });
});
