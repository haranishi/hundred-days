// OWNER: ui
// 遊んでいる間の表示（UX-5LAYERS.md の骨格）：左上に残り時間と被害総額、右上に破壊率、下の中央に案内の1行、右下に連鎖と怒りのゲージ
// （r06-camera2：下の中央から移した。怪獣の足もとに重なったため）、画面の中央に照準。数字が変わったときだけ DOM を書き換える。
// r02-controls：照準は炎が届く所で明るく、届かない所で暗くし、当たった瞬間に光らせる。空振りと怒り不足は照準の横に小さく出す。
// 案内は9行の表を10秒出すのをやめ、今やることを1行ずつ出す（gameplay/coach.ts の段）。遊んでいる途中の R は長押しで、進み具合を出す。
// r03-roster：キーの役割は3体で同じ。案内の文と操作の表は、遊んでいる怪獣の技の名前で出す。
import type { CreatureId } from '../config/creatures';
import type { CueKind } from '../gameplay/combat';
import type { CoachStep } from '../gameplay/coach';
import { formatPercent, formatTime, formatYen } from './format';
import { el, installUiCss } from './styles';
import { isTouchDevice } from '../mobile/input';
import { touchCoachLine, TOUCH_GUIDE } from '../mobile/hints';

export interface HudState {
  timeLeft: number;
  yen: number;
  destruction: number;
  combo: number;
  multiplier: number;
  /** 0〜100 */
  rage: number;
  rageFull: boolean;
  /** 照準の先に炎が届くか */
  reach: boolean;
  /** 照準の合図の回数（増えたら光らせる・出す） */
  cues: Record<CueKind, number>;
  /** 今出す案内の段（null で出さない）と、地上にいるか（爪の段の文を変える） */
  coach: CoachStep | null;
  grounded: boolean;
  /** 遊んでいる途中の R の長押しの進み（0〜1、0 で出さない） */
  restartHold: number;
  /** 遊んでいる怪獣（案内の文を選ぶ。省くと紅竜） */
  creature?: CreatureId;
}

/** 3体で同じ行（視点と画面の操作）。 */
const COMMON_TAIL: [string, string][] = [
  ['Esc', '一時停止'],
  ['R', '長押しでやり直し（結果の画面では1回）'],
  ['P', '撮影モード'],
];

/** 操作の表（GAME-DESIGN.md と CHARACTERS.md のキーの表）。一時停止の画面で出す。 */
const GUIDE_BY_CREATURE: Record<CreatureId, [string, string][]> = {
  kurenai: [
    ['WASD', '歩く・走る／空中で向きを変えて進む'],
    ['マウス', '視点（感度と上下反転はこの画面で）'],
    ['Space', '飛び立つ／押し続けて上がる'],
    ['C', '空中で押し続けてゆっくり降りる'],
    ['Shift', '地上で走る／空中で急降下（離すか Space でやめる）'],
    ['左クリック長押し', '炎（照準が明るい所まで届く）'],
    ['右クリック', '爪（照準の方へ向き直って振る）'],
    ['Q', '尾（照準に背を向けて払う）'],
    ['E', '怒りが満タンで大技'],
    ...COMMON_TAIL,
  ],
  raiyoku: [
    ['WASD', '歩く（地上は遅い）／空中で向きを変えて進む（空は速い）'],
    ['マウス', '視点（感度と上下反転はこの画面で）'],
    ['Space', '飛び立つ／押し続けて速く上がる'],
    ['C', '空中で押し続けてゆっくり降りる'],
    ['Shift', '地上で走る／空中で急降下（離すか Space でやめる）'],
    ['左クリック長押し', '雷の息（当たったビルから近くのビルへ跳ねる。燃やさず窓を割る）'],
    ['右クリック', '翼の打ち据え（広く遠いが弱い）'],
    ['Q', '尾の鞭（照準に背を向けて遠くまで払う）'],
    ['E', '怒りが満タンで落雷の輪（空中なら雷の急降下）'],
    ...COMMON_TAIL,
  ],
  homuratsuno: [
    ['WASD', '歩く（飛べない）'],
    ['マウス', '視点（感度と上下反転はこの画面で）'],
    ['Space', '跳んでのしかかる（着地の周りを押しつぶす）'],
    ['Shift＋W', '突進（当たったビルを傾くまで押し倒して進む）'],
    ['左クリック長押し', '溶岩の礫（放物線で飛び、弾けて燃やす）'],
    ['右クリック', '角の突き上げ（近く狭く重い）'],
    ['Q', '尾の鎚（照準に背を向けて近くを重く払う）'],
    ['E', '怒りが満タンで地割れ（前へ裂け目が走る）'],
    ...COMMON_TAIL,
  ],
};

/** 紅竜の操作の表（r02-controls の E2E が読む行と同じ）。 */
export const GUIDE_ROWS: [string, string][] = GUIDE_BY_CREATURE.kurenai;

export function guideRows(creature: CreatureId = 'kurenai'): [string, string][] {
  return GUIDE_BY_CREATURE[creature];
}

/**
 * 操作の表を、キーと説明の2列の格子で作る（r02-controls：バグ B3「Q尾」のように1語に見えた）。
 * className は外側の箱に付ける（文字の大きさなど）。
 */
export function guideElement(className: string, creature: CreatureId = 'kurenai'): HTMLDivElement {
  const g = el('div', `${className} dr-keys`);
  fillGuide(g, creature);
  return g;
}

/** 操作の表の中身を、怪獣の行で書き直す。 */
export function fillGuide(g: HTMLElement, creature: CreatureId): void {
  const rows = isTouchDevice() ? TOUCH_GUIDE : guideRows(creature);
  g.replaceChildren(...rows.flatMap(([key, what]) => [el('span', 'dr-key', key), el('span', 'dr-key-what', what)]));
}

/** 案内の1行（段ごと）。キーは <b> で囲んで目立たせる。 */
export function coachLine(step: CoachStep, grounded: boolean, creature: CreatureId = 'kurenai'): [string, string][] {
  switch (step) {
    case 'move':
      return [['WASD', ' で動く・'], ['マウス', ' で向きを変える']];
    case 'breath':
      if (creature === 'raiyoku') return [['左クリック長押し', ' で雷の息（ビルからビルへ跳ねる）']];
      if (creature === 'homuratsuno') return [['左クリック長押し', ' で溶岩の礫を投げる（照準が明るい所まで届く）']];
      return [['左クリック長押し', ' で炎を吐く（照準が明るい所まで届く）']];
    case 'claw': {
      const what = creature === 'raiyoku' ? '翼で打ち据える' : creature === 'homuratsuno' ? '角で突き上げる' : '爪を振る';
      const short = creature === 'raiyoku' ? '翼' : creature === 'homuratsuno' ? '角' : '爪';
      // 飛べない焔角は、跳んでいる間でも「着地したら」ではなく、そのまま角の案内にする
      return grounded || creature === 'homuratsuno' ? [['右クリック', ` で${what}`]] : [['Shift', ' で急降下して、着地したら '], ['右クリック', ` で${short}`]];
    }
    case 'fly':
      if (creature === 'raiyoku') return [['Space 長押し', ' で飛び上がる（上昇が速い。'], ['C', ' でゆっくり降りる）']];
      if (creature === 'homuratsuno') return [['Space', ' で跳んでのしかかる（'], ['Shift＋W', ' で突進）']];
      return [['Space 長押し', ' で飛び上がる（'], ['C', ' でゆっくり降りる）']];
    case 'rage':
      if (creature === 'raiyoku') return [['E', ' で落雷の輪（空中なら雷の急降下）']];
      if (creature === 'homuratsuno') return [['E', ' で地割れ（怒りが満タン）']];
      return [['E', ' で大技（怒りが満タン）']];
    default:
      return [];
  }
}

/** r06-camera2：下の中央の箱の高さ（px）。連鎖の数（30）と怒りの帯の行（17）を右下へ移した後も、案内の1行を前と同じ高さに出す */
const HUD_BOTTOM_HEIGHT = 47;

/** 照準の横に出す合図の文と出す秒数 */
const CUE_TEXT: Record<Exclude<CueKind, 'hit'>, string> = { miss: '空振り', noRage: '怒りが足りない' };
const CUE_SECONDS = 0.9;

export class Hud {
  readonly root: HTMLDivElement;
  private readonly time: HTMLDivElement;
  private readonly yen: HTMLDivElement;
  private readonly rate: HTMLDivElement;
  private readonly combo: HTMLDivElement;
  private readonly rageRow: HTMLDivElement;
  private readonly rageFill: HTMLDivElement;
  private readonly rageHint: HTMLSpanElement;
  private readonly reticle: HTMLDivElement;
  private readonly cue: HTMLDivElement;
  private readonly coach: HTMLDivElement;
  private readonly hold: HTMLDivElement;
  private readonly holdFill: HTMLDivElement;
  private readonly last = new Map<string, string>();
  private seen: Record<CueKind, number> | null = null;
  private cueTimer = 0;

  constructor(parent: HTMLElement) {
    installUiCss();
    this.root = el('div', 'dr-ui');
    this.root.setAttribute('data-testid', 'hud');
    const tl = el('div', 'dr-tl');
    tl.append(el('div', 'dr-label', '残り時間'));
    this.time = el('div', 'dr-time dr-num', '3:00');
    tl.append(this.time, el('div', 'dr-label', '被害総額'));
    this.yen = el('div', 'dr-yen dr-num', '0円');
    tl.append(this.yen);
    const tr = el('div', 'dr-tr');
    tr.append(el('div', 'dr-label', '破壊率'));
    this.rate = el('div', 'dr-rate dr-num', '0.0%');
    tr.append(this.rate);
    const bottom = el('div', 'dr-bottom');
    this.coach = el('div', 'dr-coach');
    this.coach.setAttribute('data-testid', 'coach');
    this.combo = el('div', 'dr-combo dr-num');
    this.rageRow = el('div', 'dr-rage-row');
    const bar = el('div', 'dr-rage');
    this.rageFill = el('div', 'dr-rage-fill');
    bar.append(this.rageFill);
    this.rageHint = el('span', 'dr-rage-hint', '怒り');
    this.rageRow.append(bar, this.rageHint);
    // r06-camera2：連鎖の数と怒りの帯は右下の隅へ（体験の採点 r05：下の中央では、見下ろした怪獣の足もとに重なった）。
    // 肩越しのずれで怪獣は画面の中央より左に写るので、右下がいちばん離れる。案内の1行は下の中央のまま、前と同じ高さに保つ
    bottom.style.minHeight = `${HUD_BOTTOM_HEIGHT}px`;
    bottom.append(this.coach);
    const corner = el('div', 'dr-corner');
    corner.setAttribute('data-testid', 'combo-rage');
    corner.append(this.combo, this.rageRow);
    this.reticle = el('div', 'dr-reticle');
    this.reticle.setAttribute('data-testid', 'reticle');
    this.reticle.append(el('div', 'dr-reticle-dot'));
    this.cue = el('div', 'dr-cue');
    this.cue.setAttribute('data-testid', 'reticle-cue');
    this.hold = el('div', 'dr-hold dr-gone');
    this.hold.setAttribute('data-testid', 'restart-hold');
    const holdBar = el('div', 'dr-hold-bar');
    this.holdFill = el('div', 'dr-hold-fill');
    holdBar.append(this.holdFill);
    this.hold.append(el('span', '', 'R 長押しでやり直し'), holdBar);
    this.root.append(tl, tr, bottom, corner, this.reticle, this.cue, this.hold);
    parent.appendChild(this.root);
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle('dr-gone', !visible);
  }

  /** frameDt は合図の文を消すための実時間の刻み。 */
  update(s: HudState, frameDt = 1 / 60): void {
    this.text(this.time, formatTime(s.timeLeft));
    this.time.classList.toggle('dr-low', s.timeLeft <= 20);
    this.text(this.yen, formatYen(s.yen));
    this.text(this.rate, formatPercent(s.destruction));
    const comboKey = s.combo >= 2 ? `${s.combo}|${s.multiplier.toFixed(1)}` : '';
    if (this.last.get('combo') !== comboKey) {
      this.last.set('combo', comboKey);
      this.combo.classList.toggle('dr-on', s.combo >= 2);
      if (s.combo >= 2) {
        this.combo.replaceChildren(document.createTextNode(`${s.combo} 連鎖`), el('small', '', `×${s.multiplier.toFixed(1)}`));
      }
    }
    const fill = `${Math.round(Math.min(100, s.rage))}%`;
    if (this.last.get('rage') !== fill) {
      this.last.set('rage', fill);
      this.rageFill.style.width = fill;
    }
    this.rageRow.classList.toggle('dr-full', s.rageFull);
    this.text(this.rageHint, s.rageFull ? (isTouchDevice() ? '大技を押す' : 'E で大技') : '怒り');
    this.updateReticle(s, frameDt);
    this.updateCoach(s);
    this.hold.classList.toggle('dr-gone', s.restartHold <= 0);
    if (s.restartHold > 0) this.holdFill.style.width = `${Math.round(Math.min(1, s.restartHold) * 100)}%`;
  }

  private updateReticle(s: HudState, frameDt: number): void {
    this.reticle.classList.toggle('dr-reach', s.reach);
    const seen = this.seen ?? { ...s.cues };
    if (s.cues.hit > seen.hit) this.flash();
    for (const k of ['miss', 'noRage'] as const) {
      if (s.cues[k] > seen[k]) {
        this.cue.textContent = CUE_TEXT[k];
        this.cue.classList.add('dr-on');
        this.cueTimer = CUE_SECONDS;
      }
    }
    this.seen = { ...s.cues };
    if (this.cueTimer > 0) {
      this.cueTimer -= frameDt;
      if (this.cueTimer <= 0) this.cue.classList.remove('dr-on');
    }
  }

  /** 当たった瞬間：照準の輪を0.14秒だけ大きく明るくする（連続で当たっても毎回やり直す）。 */
  private flash(): void {
    this.reticle.classList.remove('dr-hit');
    void this.reticle.offsetWidth;
    this.reticle.classList.add('dr-hit');
    this.reticle.setAttribute('data-hits', String((Number(this.reticle.getAttribute('data-hits')) || 0) + 1));
  }

  private updateCoach(s: HudState): void {
    const creature = s.creature ?? 'kurenai';
    const key = s.coach ? `${s.coach}|${s.coach === 'claw' ? s.grounded : ''}|${creature}` : '';
    if (this.last.get('coach') === key) return;
    this.last.set('coach', key);
    this.coach.classList.toggle('dr-on', s.coach !== null);
    this.coach.setAttribute('data-step', s.coach ?? 'none');
    if (!s.coach) return;
    const line = isTouchDevice() ? touchCoachLine(s.coach, s.grounded, creature) : coachLine(s.coach, s.grounded, creature);
    const parts = line.flatMap(([k, rest]) => [el('b', '', k), document.createTextNode(rest)]);
    this.coach.replaceChildren(...parts);
  }

  private text(e: HTMLElement, value: string): void {
    if (e.textContent !== value) e.textContent = value;
  }
}
