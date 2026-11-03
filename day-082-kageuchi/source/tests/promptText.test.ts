// OWNER: core
// タッチの文言（2026-11-03 スマホ対応・tasks 3.2）：タッチのとき、画面に出す文にキー名（Enter・Esc・R・WASD・E・F・Q・C・Shift・Ctrl・M）が無い。
// キーボードの文は変更前のまま。規則とステージの文（src/sim・src/stage）は書き換えず、画面に出す直前に touchWording で言い換える。
import { describe, expect, it } from 'vitest';
import type { GameStateOut } from '../src/game/state';
import { MISSION_PHASES } from '../src/sim/mission';
import { STAGE_LIST, getStage } from '../src/stage';
import {
  AIM_HINT,
  AIM_HINT_TOUCH,
  CONTROLS,
  CONTROLS_TOUCH,
  MISSION_HELP,
  MISSION_HELP_TOUCH,
  PORTRAIT_NOTE,
  TOUCH_HINT_LINES,
  hasKeyName,
  promptText,
  touchWording,
} from '../src/ui/text';

type PromptState = Pick<GameStateOut, 'player' | 'mission' | 'guards'>;

function st(o: { prompt?: string | null; interaction?: string | null; progress?: number; guardAt?: number | null }): PromptState {
  const guards = o.guardAt === undefined || o.guardAt === null ? [] : [{ id: 'omote-l', x: o.guardAt, z: 0, down: false }];
  return {
    player: { x: 0, z: 0, prompt: o.prompt ?? null } as unknown as GameStateOut['player'],
    mission: { step: 1, label: '', hint: '', prepared: 0, interaction: o.interaction ?? null, progress: o.progress ?? 0, message: '' },
    guards: guards as unknown as GameStateOut['guards'],
  };
}

const CASES: { name: string; s: PromptState }[] = [
  { name: '討ち取れる', s: st({ prompt: 'assassinate' }) },
  { name: '背後から制圧できる', s: st({ prompt: 'takedown' }) },
  { name: '仕掛けの前', s: st({ interaction: '竹林の板戸を開く' }) },
  { name: '仕掛けの途中', s: st({ interaction: '竹林の板戸を開く', progress: 0.634 }) },
  { name: '番兵の近く', s: st({ guardAt: 1.5 }) },
  { name: '何もない', s: st({ guardAt: 9 }) },
];

describe('promptText', () => {
  it('タッチのとき、どの状態でもキー名を含まない', () => {
    for (const c of CASES) expect(hasKeyName(promptText(c.s, true)), c.name).toBe(false);
  });

  it('タッチの文は、ボタンの名前で言う', () => {
    expect(promptText(st({ prompt: 'assassinate' }), true)).toBe('背後から討ち取る');
    expect(promptText(st({ interaction: '竹林の板戸を開く', progress: 0.634 }), true)).toBe('竹林の板戸を開く　63%（動くと中断）');
    expect(promptText(st({ guardAt: 1.5 }), true)).toBe('正面から「攻撃」／背後へ回って「当て身」');
    expect(promptText(st({ guardAt: 9 }), true)).toBe('');
  });

  it('キーボードの文は変更前のまま', () => {
    expect(promptText(st({ prompt: 'assassinate' }), false)).toBe('E　討ち取る');
    expect(promptText(st({ prompt: 'takedown' }), false)).toBe('E　背後から制圧　／　F　近接攻撃');
    expect(promptText(st({ interaction: '竹林の板戸を開く' }), false)).toBe('E　竹林の板戸を開く');
    expect(promptText(st({ interaction: '竹林の板戸を開く', progress: 0.634 }), false)).toBe('竹林の板戸を開く　63%（移動で中断）');
    expect(promptText(st({ guardAt: 1.5 }), false)).toBe('F　近接攻撃　／　背後へ回ると E で制圧');
  });

  it('倒れた番兵と信長は「近くの番兵」に数えない', () => {
    const s = st({ guardAt: 1.5 });
    (s.guards[0] as unknown as { down: boolean }).down = true;
    expect(promptText(s, true)).toBe('');
  });
});

describe('タッチの文言', () => {
  it('キー名の検出は、キーボードの文で働く（門番の確かめ）', () => {
    for (const t of [AIM_HINT, MISSION_HELP.retry, ...CONTROLS.map(([k]) => k), 'Enter でも進める', '再開する（Esc）', '信長の背後で E。']) expect(hasKeyName(t), t).toBe(true);
    // 距離の m・題字の英字は数えない
    expect(hasKeyName('信長　12m')).toBe(false);
    expect(hasKeyName('KAGEUCHI')).toBe(false);
  });

  it('タッチ用の定数にキー名が無い', () => {
    for (const t of [...AIM_HINT_TOUCH, ...CONTROLS_TOUCH.flat(), ...TOUCH_HINT_LINES, PORTRAIT_NOTE, MISSION_HELP_TOUCH.retry, MISSION_HELP_TOUCH.rating]) expect(hasKeyName(t), t).toBe(false);
  });

  it('攻略段階のヒントと、ステージの文（説明・物見・選択の札）を言い換えると、キー名が残らない', () => {
    const texts: string[] = MISSION_PHASES.flat();
    for (const m of STAGE_LIST) texts.push(m.mission.clearCondition, m.objective ?? "", ...m.mission.steps.flat());
    const h = getStage('honnoji').meta;
    texts.push(...(h.briefing ?? []), ...(h.scoutReport ?? []));
    for (const t of texts) expect(hasKeyName(touchWording(t)), `${t} → ${touchWording(t)}`).toBe(false);
  });

  it('言い換えの例', () => {
    expect(touchWording('信長の背後で E。討ち取った時点でクリア')).toBe('信長の背後で当て身。討ち取った時点でクリア');
    expect(touchWording('「E 討ち取る」が出たら、Eキーを押す。')).toBe('当て身のボタンが「討つ」に変わったら押す。');
    expect(touchWording('西の裏門　提灯持ちを抜け、竹林の板戸を E で開く。')).toBe('西の裏門　提灯持ちを抜け、竹林の板戸を「使う」で開く。');
    // キー名が無い文はそのまま
    expect(touchWording('表門・裏門・水抜き穴から境内へ')).toBe('表門・裏門・水抜き穴から境内へ');
  });
});
