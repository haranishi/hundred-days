// 補助画面群：できた（#/done/<id>）・さばく前に（#/safety）・部位の名前（#/parts/<id>）・設定ダイアログの同期。
import { METHODS } from './contract.js';
import { SPECIES_META, SPECIES_ORDER } from './species/meta.js';
import { getProcedure } from './procedures/index.js';
import safetyContent from './content/safety.js';
import partsContent from './content/parts.js';
import glossaryContent from './content/glossary.js';
import { formatConfidence, getNextSpeciesId } from './ui-format.js';
import { appendRubyText, h, icon, makeRuby, thumbFor } from './ui-icons.js';

/** できた画面（#/done/<id>）を描画する。 */
export function renderDone(container, { speciesId, onOpenShare }) {
  container.replaceChildren();
  const sp = SPECIES_META[speciesId];
  if (!sp) return;
  const partsData = partsContent[speciesId] || null;
  const nextId = getNextSpeciesId(speciesId, SPECIES_ORDER, getProcedure);
  const nextMeta = SPECIES_META[nextId];

  const page = h('div', { class: 'page page--narrow done-page' });

  const banner = h('section', { class: 'done-banner' }, [
    h('div', { class: 'done-icon-circle', 'aria-hidden': 'true' }, [icon('check', 'icon icon--done-lg')]),
    h('h2', { class: 'page-title' }, [
      makeRuby(sp.name, sp.kana),
      document.createTextNode('をさばき終えました'),
    ]),
    h('p', { class: 'muted' }, [
      `${METHODS[sp.method] || ''}の手順を最後まで完了しました。さばいたあとの部位の使い道と保存の目安をまとめています。`,
    ]),
  ]);
  page.append(banner);

  // 部位と使い道
  const partsSec = h('section', { class: 'card-section' }, [
    h('h3', { class: 'section-heading' }, [icon('label'), '部位と使い道']),
  ]);
  if (partsData && Array.isArray(partsData.parts) && partsData.parts.length > 0) {
    const grid = h('div', { class: 'parts-grid' });
    for (const part of partsData.parts) {
      const card = h('article', { class: 'part-card' });
      const heading = h('h4', { class: 'part-name' }, [makeRuby(part.name, part.kana)]);
      const where = h('p', { class: 'part-where' });
      appendRubyText(where, part.where);
      const uses = h('ul', { class: 'chip-list' }, (part.uses || []).map((u) => {
        const li = h('li', { class: 'chip' });
        appendRubyText(li, u);
        return li;
      }));
      card.append(heading, where, uses);
      grid.append(card);
    }
    partsSec.append(grid);
  } else {
    partsSec.append(h('p', { class: 'muted' }, ['この魚の詳しい部位データは準備中です。']));
  }
  partsSec.append(h('p', { class: 'section-link-row' }, [
    h('a', { class: 'text-link', href: `#/parts/${speciesId}` }, ['部位の名前と用語集をくわしく見る']),
  ]));
  page.append(partsSec);

  // 保存の目安
  if (partsData && partsData.keep) {
    const keepSec = h('section', { class: 'callout callout--info' }, [
      icon('shield'),
      h('div', { class: 'callout-body' }, [
        h('h3', { class: 'callout-title' }, ['保存の目安']),
        h('p', {}, [partsData.keep]),
        h('p', { class: 'small-note muted' }, ['鮮度や室温によって傷みやすさが変わります。匂いや色を確認のうえ、早めに調理してください。']),
      ]),
    ]);
    page.append(keepSec);
  }

  // アクション群（共有・もう一度・次の魚へ）
  const actions = h('div', { class: 'done-actions' }, [
    h('button', {
      type: 'button',
      class: 'button button--primary button--large',
      dataset: { testid: 'btn-done-share' },
      onClick: (e) => onOpenShare && onOpenShare(e.currentTarget),
    }, [icon('share'), 'このアプリを共有する']),
    h('div', { class: 'done-sub-actions' }, [
      h('a', { class: 'button', href: `#/fish/${speciesId}/1`, dataset: { testid: 'btn-again' } }, [
        icon('reset'),
        'もう一度さばく',
      ]),
      nextMeta ? h('a', { class: 'button', href: `#/fish/${nextMeta.id}`, dataset: { testid: 'btn-next-fish' } }, [
        `次の魚へ（${nextMeta.name}）`,
        icon('next'),
      ]) : null,
      h('a', { class: 'button button--ghost', href: '#/' }, ['魚一覧へ戻る']),
    ]),
  ]);
  page.append(actions);

  container.append(page);
}

/** さばく前に画面（#/safety）を描画する。 */
export function renderSafety(container) {
  container.replaceChildren();
  const page = h('div', { class: 'page page--narrow safety-page' });

  page.append(h('div', { class: 'page-head' }, [
    h('a', { class: 'button button--ghost', href: '#/' }, [icon('back'), '魚をえらぶ']),
  ]));

  page.append(h('h2', { class: 'page-title' }, ['さばく前に']));

  // 導入の注意
  page.append(h('section', { class: 'callout callout--warn' }, [
    icon('alert', 'icon icon--warn'),
    h('div', { class: 'callout-body' }, [
      h('p', { class: 'callout-title' }, ['参考情報・自己責任について']),
      h('p', {}, [safetyContent.intro]),
      h('p', { class: 'small-note' }, [
        'フグなど毒のある魚のさばき方は資格が必要なため、このアプリでは扱っていません。見分けがつかない魚や、毒の有無が不明な魚はさばかないでください。',
      ]),
      h('p', { class: 'small-note' }, [
        '掲載している手順は複数の公開資料をもとにした標準的な方法です。地域や流派によって手順が異なる場合があります。',
      ]),
    ]),
  ]));

  // 開閉項目（<details>）
  const listWrap = h('section', { class: 'safety-list', 'aria-label': '安全の確認項目' });
  safetyContent.items.forEach((item, idx) => {
    const conf = formatConfidence(item.confidence);
    const details = h('details', { class: 'safety-item', open: idx === 0 });
    const summary = h('summary', { class: 'safety-summary' }, [
      h('span', { class: 'safety-summary-main' }, [
        h('span', { class: 'safety-summary-title-group' }, [
          h('strong', { class: 'safety-item-title' }, [item.title]),
          h('span', { class: `conf-badge conf-badge--${conf.code}` }, [`${conf.symbol} ${conf.label}`]),
        ]),
        icon('chevronDown', 'icon safety-chevron'),
      ]),
      h('span', { class: 'safety-item-lead' }, [item.summary]),
    ]);
    const body = h('div', { class: 'safety-detail' });
    for (const line of item.detail || []) {
      const p = h('p');
      appendRubyText(p, line);
      body.append(p);
    }
    if (Array.isArray(item.sources) && item.sources.length > 0) {
      const srcList = h('ul', { class: 'source-list' });
      for (const src of item.sources) {
        srcList.append(h('li', {}, [
          h('a', {
            class: 'text-link source-link',
            href: src.url,
            target: '_blank',
            rel: 'noopener noreferrer',
          }, [src.label, icon('external', 'icon icon--sm')]),
        ]));
      }
      body.append(h('div', { class: 'source-block' }, [
        h('p', { class: 'source-heading' }, ['出典リンク']),
        srcList,
      ]));
    }
    details.append(summary, body);
    listWrap.append(details);
  });
  page.append(listWrap);

  container.append(page);
}

/** 部位の名前・用語集画面（#/parts/<id>）を描画する。 */
export function renderParts(container, { speciesId }) {
  container.replaceChildren();
  const sp = SPECIES_META[speciesId] || SPECIES_META.aji;
  const partsData = partsContent[sp.id] || null;

  const page = h('div', { class: 'page page--narrow parts-page' });

  page.append(h('div', { class: 'page-head' }, [
    h('a', { class: 'button button--ghost', href: `#/fish/${sp.id}` }, [icon('back'), `${sp.name}の前置きへ`]),
    h('a', { class: 'button button--ghost', href: '#/' }, ['魚一覧']),
  ]));

  const hero = h('div', { class: 'parts-hero' }, [
    h('div', { class: 'parts-hero-thumb' }, [thumbFor(sp.id)]),
    h('div', {}, [
      h('h2', { class: 'page-title' }, [
        makeRuby(sp.name, sp.kana),
        document.createTextNode('の部位と名前'),
      ]),
      h('p', { class: 'muted' }, ['さばく前後に出てくる部位の読み方と使い道をまとめています。']),
    ]),
  ]);
  page.append(hero);

  // 部位一覧
  const partsSec = h('section', { class: 'card-section' }, [
    h('h3', { class: 'section-heading' }, [`${sp.name}の部位`]),
  ]);
  if (partsData && Array.isArray(partsData.parts) && partsData.parts.length > 0) {
    const grid = h('div', { class: 'parts-grid' });
    for (const part of partsData.parts) {
      const card = h('article', { class: 'part-card' });
      const title = h('h4', { class: 'part-name' }, [makeRuby(part.name, part.kana)]);
      const where = h('p', { class: 'part-where' });
      appendRubyText(where, part.where);
      const uses = h('ul', { class: 'chip-list' }, (part.uses || []).map((u) => {
        const li = h('li', { class: 'chip' });
        appendRubyText(li, u);
        return li;
      }));
      card.append(title, where, uses);
      grid.append(card);
    }
    partsSec.append(grid);
    if (partsData.keep) {
      partsSec.append(h('p', { class: 'keep-note' }, [`保存の目安：${partsData.keep}`]));
    }
  } else {
    partsSec.append(h('p', { class: 'muted' }, [`${sp.name}の個別部位データは現在準備中です。`]));
  }
  page.append(partsSec);

  // 用語集（読み仮名 <ruby>）
  const glossSec = h('section', { class: 'card-section' }, [
    h('h3', { class: 'section-heading' }, ['よく使う言葉（用語集）']),
  ]);
  const dl = h('dl', { class: 'glossary-list' });
  for (const item of glossaryContent) {
    const dt = h('dt', { class: 'glossary-term' }, [makeRuby(item.term, item.kana)]);
    const dd = h('dd', { class: 'glossary-desc' });
    appendRubyText(dd, item.text);
    dl.append(dt, dd);
  }
  glossSec.append(dl);
  page.append(glossSec);

  container.append(page);
}

/** 設定ダイアログの入力状態と表示を最新状態へ合わせる。 */
export function syncSettingsDialog(dialog, { state, speechSupported, wakeSupported, wakeActive }) {
  if (!dialog) return;
  const leftInput = dialog.querySelector('#setting-left');
  const speechInput = dialog.querySelector('#setting-speech');
  const speechNote = dialog.querySelector('#setting-speech-note');
  const wakeInput = dialog.querySelector('#setting-wake');
  const wakeNote = dialog.querySelector('#setting-wake-note');
  const qualitySelect = dialog.querySelector('#setting-quality');

  if (leftInput) leftInput.checked = Boolean(state.leftHanded);
  if (speechInput) {
    speechInput.checked = Boolean(state.speech && speechSupported);
    speechInput.disabled = !speechSupported;
  }
  if (speechNote) {
    speechNote.textContent = speechSupported
      ? '手順を切り替えたときや読み上げボタンを押したときに、日本語で手順を読み上げます。'
      : 'このブラウザでは音声読み上げに対応していません。';
  }
  if (wakeInput) {
    wakeInput.checked = Boolean(state.wake && wakeSupported);
    wakeInput.disabled = !wakeSupported;
  }
  if (wakeNote) {
    wakeNote.textContent = !wakeSupported
      ? 'この環境では画面を消さない機能（Wake Lock）に対応していません。'
      : wakeActive
        ? 'ガイド表示中は画面が自動で暗くなりにくくなっています。'
        : 'ガイドを開いているあいだ、画面を点灯したままに保ちます。';
  }
  if (qualitySelect) qualitySelect.value = state.quality;
}
