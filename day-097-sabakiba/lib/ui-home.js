// 入口画面（#/）：つづきから・方法と初心者向けの絞り込み・魚カード8枚・誠実さのフッター。
import { METHODS } from './contract.js';
import { SPECIES_META, SPECIES_ORDER } from './species/meta.js';
import { getProcedure } from './procedures/index.js';
import { filterSpecies, getResumeEntries } from './ui-format.js';
import { appendRubyText, difficultyStars, h, icon, makeRuby, thumbFor } from './ui-icons.js';

export function renderHome(container, { state, filter, onFilterChange }) {
  container.replaceChildren();

  const page = h('div', { class: 'page home-page' });

  // 導入見出し
  const hero = h('section', { class: 'home-hero' }, [
    h('p', { class: 'home-kicker' }, ['魚のさばき方を、3Dで見ながら。']),
    h('h2', { class: 'home-lead' }, ['さばく魚をえらぶ']),
    h('p', { class: 'home-sub' }, [
      '台所と同じ向きの3Dで、骨の位置や刃の通り道を確かめながら一尾をさばけます。',
    ]),
  ]);
  page.append(hero);

  // つづきから（保存済みの進捗があるとき先頭に出す）
  const resumeEntries = getResumeEntries(state.progress, state.species, SPECIES_META, getProcedure);
  if (resumeEntries.length > 0) {
    const resumeSec = h('section', { class: 'resume-section', 'aria-labelledby': 'resume-heading' }, [
      h('h3', { id: 'resume-heading', class: 'section-heading' }, ['つづきから']),
    ]);
    const list = h('div', { class: 'resume-list' });
    for (const item of resumeEntries.slice(0, 2)) {
      const card = h('a', {
        class: 'resume-card',
        href: `#/fish/${item.species}/${item.stepNumber}`,
        dataset: { testid: `resume-card-${item.species}` },
      }, [
        h('div', { class: 'resume-thumb' }, [thumbFor(item.species)]),
        h('div', { class: 'resume-body' }, [
          h('div', { class: 'resume-title-row' }, [
            h('strong', { class: 'resume-name' }, [item.meta.name]),
            appendRubyText(h('span', { class: 'badge badge--method' }), item.methodLabel),
          ]),
          h('p', { class: 'resume-step' }, [
            `手順 ${item.stepNumber} / ${item.totalSteps}：${item.stepTitle}`,
          ]),
        ]),
        h('span', { class: 'resume-cta' }, ['つづきを開く', icon('next')]),
      ]);
      list.append(card);
    }
    resumeSec.append(list);
    page.append(resumeSec);
  }

  // 絞り込みバー（方法チップ＋初心者向け）
  const filterBar = h('section', { class: 'filter-bar', 'aria-label': '魚の絞り込み' });
  const chips = h('div', { class: 'filter-chips', role: 'group', 'aria-label': 'さばき方と難易度で絞る' });
  const methodButtons = new Map();

  const beginnerBtn = h('button', {
    type: 'button',
    class: 'chip-btn chip-btn--beginner',
    'aria-label': '初心者向け（難易度★1〜2）の魚だけに絞る',
    dataset: { testid: 'filter-beginner' },
    onClick: () => changeFilter({ ...filter, beginnerOnly: !filter.beginnerOnly }),
  }, [
    icon('starFill', 'icon icon--star'),
    '初心者向け',
  ]);


  const methodEntries = [['all', 'すべて'], ...Object.entries(METHODS)];
  for (const [key, label] of methodEntries) {
    const btn = h('button', {
      type: 'button',
      class: 'chip-btn',
      dataset: { testid: `filter-method-${key}` },
      onClick: () => changeFilter({ ...filter, method: key }),
    });
    appendRubyText(btn, label);
    chips.append(btn);
    methodButtons.set(key, btn);
    // 「初心者向け」は横に流れる列の2番目（「すべて」の隣）に置く。右端だと、見落とされる。
    if (key === 'all') chips.append(beginnerBtn);
  }

  const countText = h('p', { class: 'filter-count', 'aria-live': 'polite' });
  filterBar.append(chips, h('div', { class: 'filter-subrow' }, [countText]));
  page.append(filterBar);

  // 魚カード一覧
  const grid = h('section', { class: 'species-grid', 'aria-label': '魚の一覧' });
  const empty = h('div', { class: 'empty-state' }, [
    h('p', {}, ['条件に合う魚がありませんでした。絞り込みを解除してご覧ください。']),
    h('button', {
      type: 'button',
      class: 'button',
      onClick() {
        changeFilter({ method: 'all', beginnerOnly: false });
        methodButtons.get('all').focus();
      },
    }, ['絞り込みをすべて解除する']),
  ]);

  function updateMatches() {
    const matched = filterSpecies(SPECIES_ORDER, SPECIES_META, filter);
    for (const [key, button] of methodButtons) button.setAttribute('aria-pressed', String(key === filter.method));
    beginnerBtn.setAttribute('aria-pressed', String(filter.beginnerOnly));
    countText.textContent = `${SPECIES_ORDER.length}種のうち ${matched.length}種を表示しています。`;
    grid.replaceChildren(...matched.map(sp => speciesCard(sp, state.progress)));
    if (!matched.length) grid.append(empty);
  }

  function changeFilter(nextFilter) {
    filter = nextFilter;
    updateMatches();
    onFilterChange(nextFilter);
  }

  updateMatches();
  page.append(grid);

  // フッター（誠実さの明記）
  const footer = h('footer', { class: 'site-footer' }, [
    h('p', {}, [
      '表示する魚の3Dは手続きで描いた図であり、実物の写真や計測データではありません。手順は複数の公開資料をもとにした標準的な方法で、地域や流派により異なる場合があります。',
    ]),
    h('p', {}, [
      '本アプリの情報は参考情報です。刃物と生ものの扱いは自己責任で、無理のない範囲で行ってください。',
      ' ',
      h('a', { class: 'text-link', href: '#/safety' }, ['さばく前に（安全・道具・寄生虫）を読む']),
    ]),
  ]);
  page.append(footer);

  container.append(page);
}

function speciesCard(sp, progress) {
  const proc = getProcedure(sp.id);
  const savedStep = Number.isInteger(progress?.[sp.id]) ? progress[sp.id] : null;
  const methodLabel = METHODS[sp.method] || sp.method;

  const card = h('a', {
    class: 'species-card',
    href: `#/fish/${sp.id}`,
    dataset: { testid: `species-card-${sp.id}` },
  });

  const media = h('div', { class: 'species-media' }, [thumbFor(sp.id)]);
  if (!proc) {
    media.append(h('span', { class: 'status-pill status-pill--soon' }, ['手順準備中']));
  } else if (savedStep !== null) {
    media.append(h('span', { class: 'status-pill status-pill--progress' }, [`手順 ${savedStep + 1}/${proc.steps.length}`]));
  }

  const head = h('div', { class: 'species-head' }, [
    h('div', { class: 'species-name-block' }, [
      h('h3', { class: 'species-name' }, [makeRuby(sp.name, sp.kana)]),
      h('span', { class: 'species-full' }, [sp.nameFull]),
    ]),
    appendRubyText(h('span', { class: 'badge badge--method' }), methodLabel),
  ]);

  const metaRow = h('dl', { class: 'species-meta' }, [
    h('div', { class: 'meta-item' }, [
      h('dt', {}, ['難易度']),
      h('dd', {}, [difficultyStars(sp.difficulty)]),
    ]),
    h('div', { class: 'meta-item' }, [
      h('dt', {}, ['所要時間']),
      h('dd', {}, [`初心者の目安 約${sp.minutes.novice}分`,
        h('span', { class: 'meta-skilled' }, [` ／ 慣れた人 約${sp.minutes.skilled}分`])]),
    ]),
    h('div', { class: 'meta-item meta-season' }, [
      h('dt', {}, ['大きさ・旬']),
      h('dd', {}, [`約${sp.sizeCm.typical}cm（${sp.sizeCm.min}〜${sp.sizeCm.max}cm）・${sp.season}`]),
    ]),
  ]);

  const blurb = h('p', { class: 'species-blurb' });
  appendRubyText(blurb, sp.blurb);

  const body = h('div', { class: 'species-body' }, [head, metaRow, blurb]);
  card.append(media, body);
  return card;
}
