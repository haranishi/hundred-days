// OWNER: ui
// 怪獣の札（r03-roster、docs/CHARACTERS.md の UX5 の骨格と表層）：影絵・名前・一行の遊び方・速さ／力／飛行の3本の棒。
// 「クリックで始める」の重ねの下と、結果の画面に小さく3枚並べる。選んでいる札だけ縁を明るくする。数字キー 1〜3 と同じ並び。
// 影絵は標本の撮影から作った画像（public/assets/ui/card-<名前>.png、tools/silhouettes.mjs）を CSS の型抜き（mask）に使う。
import { CREATURE_CONFIG, CREATURE_IDS, type CreatureId } from '../config/creatures';
import { el } from './styles';
import { publicBase } from '../core/publicBase';

const BAR_LABELS: [keyof (typeof CREATURE_CONFIG)['kurenai']['card']['bars'], string][] = [
  ['speed', '速さ'],
  ['power', '力'],
  ['flight', '飛行'],
];

/** 影絵の画像の道のり（public/ から）。 */
export function silhouetteUrl(id: CreatureId): string {
  return `${publicBase}assets/ui/card-${id}.png`;
}

export class CreatureCards {
  readonly root: HTMLDivElement;
  private readonly cards = new Map<CreatureId, HTMLButtonElement>();
  private readonly bests = new Map<CreatureId, HTMLDivElement>();

  /** compact は結果の画面の小さい札（一行の遊び方と棒を省く）。choose は札を押したとき。 */
  constructor(testId: string, compact: boolean, choose: (id: CreatureId) => void) {
    this.root = el('div', compact ? 'dr-cards dr-cards-compact' : 'dr-cards');
    this.root.setAttribute('data-testid', testId);
    CREATURE_IDS.forEach((id, i) => {
      const c = CREATURE_CONFIG[id];
      const card = el('button', 'dr-card');
      card.type = 'button';
      card.setAttribute('data-creature', id);
      card.setAttribute('aria-label', `${i + 1}：${c.name}（${c.card.reading}）`);
      const art = el('div', 'dr-card-art');
      art.style.setProperty('--dr-art', `url("${silhouetteUrl(id)}")`);
      const head = el('div', 'dr-card-head');
      head.append(el('span', 'dr-card-key', `${i + 1}`), el('span', 'dr-card-name', c.name));
      card.append(art, head);
      if (!compact) {
        card.append(el('div', 'dr-card-line', c.card.tagline));
        const bars = el('div', 'dr-card-bars');
        for (const [k, label] of BAR_LABELS) {
          const v = c.card.bars[k];
          const bar = el('span', 'dr-bar');
          const fill = el('i');
          fill.style.width = `${(v / 5) * 100}%`;
          bar.append(fill);
          bars.append(el('span', 'dr-bar-label', label), bar);
        }
        card.append(bars);
      }
      const best = el('div', 'dr-card-best');
      card.append(best);
      this.bests.set(id, best);
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        choose(id);
      });
      this.cards.set(id, card);
      this.root.append(card);
    });
  }

  /** 選んでいる札の縁を明るくする。 */
  select(id: CreatureId): void {
    for (const [k, card] of this.cards) {
      card.classList.toggle('dr-sel', k === id);
      card.setAttribute('aria-pressed', String(k === id));
    }
    this.root.setAttribute('data-selected', id);
  }

  /** 札の下に自己ベスト（被害総額）を出す。記録が無ければ空。 */
  setBests(bests: Partial<Record<CreatureId, string>>): void {
    for (const [id, line] of this.bests) line.textContent = bests[id] ? `最高 ${bests[id]}` : '';
  }
}
