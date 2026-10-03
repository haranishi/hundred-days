// OWNER: ui
// 重ねる画面：始まる前の「クリックで始める」、一時停止（再開・やり直し・画質・音量）、結果（被害総額・破壊率・最大連鎖）、撮影モードの案内。
// タイトル画面は置かない（街の上空から始める。UX-5LAYERS.md の構造）。
// r03-roster：始まる前の重ねの下と結果の画面に、怪獣の札を3枚並べる（CHARACTERS.md の UX5）。初回は紅竜が選ばれていて、
// どこをクリックしても始まる。札を押すとその怪獣で始まり、数字キー 1〜3 で選び直せる（キーは play.ts が読む）。
import { CREATURE_CONFIG, type CreatureId } from '../config/creatures';
import type { QualityName } from '../config/quality';
import { isTouchDevice } from '../mobile/input';
import { LOOK } from '../config/controls';
import type { LookPrefs } from '../core/input';
import type { VolumeKind } from '../core/prefs';
import { CreatureCards } from './cards';
import { formatCountDiff, formatPercent, formatPercentDiff, formatYen, formatYenDiff } from './format';
import { fillGuide, guideElement } from './hud';
import type { RunComparison } from './records';
import { el, installUiCss } from './styles';

export interface OverlayHandlers {
  start(): void;
  resume(): void;
  restart(): void;
  quality(q: QualityName): void;
  volume(kind: VolumeKind, v: number): void;
  /** r02-controls：マウスの感度（倍）と上下反転 */
  look(prefs: LookPrefs): void;
  /** r03-roster：札を押した（始まる前ならその怪獣で始め、結果の画面ならその怪獣でやり直す） */
  choose(id: CreatureId): void;
}

/** 一時停止の画面の音量のつまみ（r00d：全体・BGM・効果音の3つ） */
const VOLUME_ROWS: [VolumeKind, string][] = [
  ['volume', '全体'],
  ['bgm', 'BGM'],
  ['sfx', '効果音'],
];

export interface ResultInfo {
  yen: number;
  destruction: number;
  maxCombo: number;
  collapsed: number;
  /** r02-controls：自己ベストと前回との比べ（記録を読めない環境では無し） */
  records?: RunComparison;
  /** r03-roster：遊んだ怪獣（自己ベストは怪獣ごと） */
  creature?: CreatureId;
}

export type OverlayKind = 'none' | 'ready' | 'paused' | 'result';

const QUALITY_LABELS: [QualityName, string][] = [
  ['high', '高'],
  ['medium', '中'],
  ['low', '低'],
];

export class Overlays {
  private readonly start: HTMLDivElement;
  private readonly pause: HTMLDivElement;
  private readonly result: HTMLDivElement;
  private readonly resultBody: HTMLDivElement;
  private readonly photo: HTMLDivElement;
  private readonly startCards: CreatureCards;
  private readonly resultCards: CreatureCards;
  private readonly guide: HTMLDivElement;
  private readonly resultTitle: HTMLDivElement;
  private shown: OverlayKind = 'none';
  private photoTimer = 0;
  private creature: CreatureId;

  constructor(
    parent: HTMLElement,
    h: OverlayHandlers,
    quality: QualityName,
    volume: Record<VolumeKind, number>,
    look: LookPrefs = { scale: 1, invertY: false },
    creature: CreatureId = 'kurenai',
  ) {
    installUiCss();
    this.creature = creature;
    this.start = el('div', 'dr-overlay');
    this.start.setAttribute('data-testid', 'start-overlay');
    const sp = el('div', 'dr-panel dr-start');
    this.startCards = new CreatureCards('creature-cards', false, (id) => h.choose(id));
    sp.append(el('div', 'dr-title', '夕暮れ破壊紀行'), el('div', 'dr-sub', '3分で、夕暮れの湾岸の街をどれだけ壊せるか'), el('div', 'dr-cta', isTouchDevice() ? 'タップで始める' : 'クリックで始める'));
    // r05-play（体験の採点 r04 の B4）：札は画面の下に置く（CHARACTERS.md の骨格「札は画面の下に小さく3枚」）。
    // 旧は題と同じ中央の板に並べ、画面のちょうど中央に雷翼の札が来て、初めての人が中央を押すと紅竜でなく雷翼で始まった。
    // 札の外（板・空き）を押せば選んでいる怪獣（初回は紅竜）で始まり、札を押せばその怪獣ですぐ始まる
    const dock = el('div', 'dr-start-dock');
    dock.append(this.startCards.root, el('div', 'dr-small dr-cards-hint', isTouchDevice() ? '怪獣の札をタップして始める' : '数字キー 1〜3 で怪獣を選べる（札を押すと、その怪獣ですぐ始まる）'));
    this.start.append(sp, dock);
    this.start.addEventListener('click', () => h.start());

    this.pause = el('div', 'dr-overlay');
    this.pause.setAttribute('data-testid', 'pause-overlay');
    const pp = el('div', 'dr-panel');
    pp.addEventListener('click', (e) => e.stopPropagation());
    const buttons = el('div', 'dr-row');
    buttons.append(this.button('再開', h.resume), this.button('やり直し', h.restart));
    const qRow = el('div', 'dr-row');
    qRow.append(el('span', 'dr-label', isTouchDevice() ? 'スマホは軽量画質固定' : '画質（読み込み直します）'));
    for (const [q, label] of QUALITY_LABELS) {
      const b = this.button(label, () => h.quality(q));
      if (isTouchDevice()) { b.hidden = q !== 'low'; b.disabled = true; }
      if (q === quality) b.classList.add('dr-sel');
      qRow.append(b);
    }
    const vRows = VOLUME_ROWS.map(([kind, label]) => {
      const vRow = el('div', 'dr-row');
      const slider = el('input', 'dr-slider');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '100';
      slider.value = String(Math.round(volume[kind] * 100));
      slider.setAttribute('aria-label', `音量（${label}）`);
      slider.setAttribute('data-testid', `volume-${kind}`);
      slider.addEventListener('input', () => h.volume(kind, Number(slider.value) / 100));
      vRow.append(el('span', 'dr-label', `音量・${label}`), slider);
      return vRow;
    });
    const lookRows = this.lookRows(h, look);
    const guide = guideElement('dr-small', creature);
    guide.style.textAlign = 'left';
    this.guide = guide;
    pp.append(el('div', 'dr-title', '一時停止'), buttons, qRow, ...vRows, ...lookRows, guide, el('div', 'dr-small', isTouchDevice() ? '「再開」で続ける。入口・共有は画面左上から。' : 'Esc かクリックで再開'));
    this.pause.append(pp);
    this.pause.addEventListener('click', () => h.resume());

    this.result = el('div', 'dr-overlay');
    this.result.setAttribute('data-testid', 'result-overlay');
    const rp = el('div', 'dr-panel');
    rp.addEventListener('click', (e) => e.stopPropagation());
    this.resultBody = el('div');
    const again = el('div', 'dr-row');
    again.append(this.button(isTouchDevice() ? 'もう一度' : 'もう一度（R）', h.restart));
    this.resultCards = new CreatureCards('result-cards', true, (id) => h.choose(id));
    this.resultTitle = el('div', 'dr-title', '結果');
    rp.append(this.resultTitle, this.resultBody, again, el('div', 'dr-label dr-change', isTouchDevice() ? '札をタップして怪獣を変える' : '怪獣を変える（1〜3）'), this.resultCards.root);
    this.result.append(rp);

    this.photo = el('div', 'dr-photo-hint', '撮影モード：WASD・Q/E で移動、マウスで向き、Enter で PNG を保存、P で戻る');
    for (const o of [this.start, this.pause, this.result, this.photo]) {
      o.classList.add('dr-gone');
      parent.appendChild(o);
    }
    this.setCreature(creature);
  }

  /** 選んでいる怪獣：札の縁と、一時停止の操作の表をその怪獣のものにする。 */
  setCreature(id: CreatureId): void {
    this.creature = id;
    this.startCards.select(id);
    this.resultCards.select(id);
    fillGuide(this.guide, id);
  }

  /** 札の下に出す自己ベスト（被害総額の文字）。 */
  setBests(bests: Partial<Record<CreatureId, string>>): void {
    this.startCards.setBests(bests);
    this.resultCards.setBests(bests);
  }

  /** r02-controls：マウスの感度（1画素あたり 0.05〜0.3 度、つまみは倍率の対数）と上下反転。変えたらすぐ効き、保存する */
  private lookRows(h: OverlayHandlers, look: LookPrefs): HTMLDivElement[] {
    const span = Math.log(LOOK.scaleMax / LOOK.scaleMin);
    const toScale = (v: number): number => LOOK.scaleMin * Math.exp((span * v) / 100);
    const current = { ...look };
    const sRow = el('div', 'dr-row');
    const slider = el('input', 'dr-slider');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.value = String(Math.round((100 * Math.log(Math.min(LOOK.scaleMax, Math.max(LOOK.scaleMin, look.scale)) / LOOK.scaleMin)) / span));
    const lookLabel = isTouchDevice() ? '視点の感度' : 'マウスの感度';
    slider.setAttribute('aria-label', lookLabel);
    slider.setAttribute('data-testid', 'look-sensitivity');
    const shown = el('span', 'dr-label dr-num', `×${look.scale.toFixed(2)}`);
    slider.addEventListener('input', () => {
      current.scale = toScale(Number(slider.value));
      shown.textContent = `×${current.scale.toFixed(2)}`;
      h.look({ ...current });
    });
    sRow.append(el('span', 'dr-label', lookLabel), slider, shown);
    const iRow = el('div', 'dr-row');
    const label = el('label', 'dr-check');
    const box = el('input');
    box.type = 'checkbox';
    box.checked = look.invertY;
    box.setAttribute('data-testid', 'look-invert');
    box.addEventListener('change', () => {
      current.invertY = box.checked;
      h.look({ ...current });
    });
    label.append(box, document.createTextNode(isTouchDevice() ? '上下反転（上へなぞると下を向く）' : '上下反転（マウスを前へ押すと下を向く）'));
    iRow.append(label);
    return [sRow, iRow];
  }

  private button(label: string, fn: () => void): HTMLButtonElement {
    const b = el('button', 'dr-btn', label);
    b.type = 'button';
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      fn();
    });
    return b;
  }

  show(kind: OverlayKind, result?: ResultInfo): void {
    if (kind === 'result' && result) {
      this.resultTitle.textContent = `結果（${CREATURE_CONFIG[result.creature ?? this.creature].name}）`;
      const stats = el('div', 'dr-stats');
      for (const [k, v] of [
        ['破壊率', formatPercent(result.destruction)],
        ['最大連鎖', `${result.maxCombo}`],
        ['崩した建物', `${result.collapsed} 棟`],
      ]) {
        stats.append(el('span', '', k), el('span', 'dr-num', v));
      }
      this.resultBody.replaceChildren(el('div', 'dr-label', '被害総額'), el('div', 'dr-result-big dr-num', formatYen(result.yen)), stats, ...this.recordLines(result.records));
    }
    if (kind === this.shown) return;
    this.shown = kind;
    this.start.classList.toggle('dr-gone', kind !== 'ready');
    this.pause.classList.toggle('dr-gone', kind !== 'paused');
    this.result.classList.toggle('dr-gone', kind !== 'result');
  }

  /** r02-controls：自己ベストと前回との差（項目ごとに1行）。初回は「初めての記録」だけ出す */
  private recordLines(r: RunComparison | undefined): HTMLDivElement[] {
    if (!r) return [];
    const box = el('div', 'dr-best');
    box.setAttribute('data-testid', 'result-records');
    const who = CREATURE_CONFIG[this.creature].name;
    if (!r.bestBefore || !r.lastBefore) {
      box.textContent = `${who}ではじめての記録。次はこれを超えよう`;
      return [box];
    }
    const best = r.bestBefore;
    const d = r.diffLast;
    const rows: [string, string, string, boolean][] = [
      ['被害総額', formatYen(Math.max(best.yen, r.run.yen)), d ? formatYenDiff(d.yen) : '', r.newBest.yen],
      ['破壊率', formatPercent(Math.max(best.destruction, r.run.destruction)), d ? formatPercentDiff(d.destruction) : '', r.newBest.destruction],
      ['最大連鎖', `${Math.max(best.maxCombo, r.run.maxCombo)}`, d ? formatCountDiff(d.maxCombo) : '', r.newBest.maxCombo],
    ];
    return rows.map(([k, b, diff, isNew], i) => {
      const line = el('div', 'dr-best');
      if (i === 0) line.setAttribute('data-testid', 'result-records');
      line.append(document.createTextNode(`${k}：${who}の自己ベスト ${b}`), el('span', diff.startsWith('+') ? 'dr-up' : '', diff ? `（前回より ${diff}）` : ''));
      if (isNew) line.append(el('span', 'dr-new', '更新'));
      return line;
    });
  }

  /** 撮影モードの案内：入った直後だけ出して消す。保存の瞬間は隠す。 */
  showPhotoHint(on: boolean): void {
    window.clearTimeout(this.photoTimer);
    this.photo.classList.toggle('dr-gone', !on);
    this.photo.classList.remove('dr-hidden');
    if (on) this.photoTimer = window.setTimeout(() => this.photo.classList.add('dr-hidden'), 2500);
  }

  hidePhotoHintNow(): void {
    this.photo.classList.add('dr-gone');
  }
}
