// 3Dが使えないとき（?gl=off・WebGL初期化失敗）の文章ガイド。純粋なデータ整形とDOM描画を分ける。
import { METHODS } from './contract.js';
import { collectProcedureTools, formatStepView } from './ui-format.js';
import { appendRubyText, h, icon, makeRuby } from './ui-icons.js';

/** 3Dが使えない環境向けの文章ガイド用データを組み立てる（純関数・Node試験可能）。 */
export function buildTextGuideData({
  speciesMeta,
  procedure,
  partsData = null,
  safetyIntro = '',
  leftHanded = false,
  reason = 'この端末では3D表示を使えないため、文章のガイドを表示しています。',
}) {
  const steps = procedure && Array.isArray(procedure.steps)
    ? procedure.steps.map((st, idx) => formatStepView(st, idx, procedure.steps.length, leftHanded))
    : [];
  const tools = collectProcedureTools(procedure);
  return {
    reason: String(reason || '3D表示を使えないため、文章のガイドを表示しています。'),
    speciesMeta,
    methodLabel: speciesMeta ? (METHODS[speciesMeta.method] || '') : '',
    leftHanded: Boolean(leftHanded),
    tools,
    steps,
    parts: partsData && Array.isArray(partsData.parts) ? partsData.parts : [],
    keep: partsData && partsData.keep ? partsData.keep : '',
    safetyIntro: safetyIntro || '参考情報です。刃物と生ものを扱います。自己責任で無理のない範囲で行ってください。',
  };
}

/** 文章だけのガイドを DOM へ描画する。 */
export function renderTextGuide(container, data, { onToggleLeftHanded } = {}) {
  container.replaceChildren();
  const root = h('div', { class: 'page page--narrow text-guide', dataset: { testid: 'text-guide' } });

  // 理由バナー（1行）
  const notice = h('div', { class: 'callout callout--warn text-guide-reason', role: 'status', dataset: { testid: 'gl-off-reason' } }, [
    icon('alert', 'icon icon--warn'),
    h('p', {}, [data.reason]),
  ]);
  root.append(notice);

  // ヘッダー帯
  const sp = data.speciesMeta;
  const topBar = h('div', { class: 'page-head' }, [
    h('a', { class: 'button button--ghost', href: sp ? `#/fish/${sp.id}` : '#/' }, [
      icon('back'),
      '前置きへ戻る',
    ]),
    h('button', {
      type: 'button',
      class: 'pill',
      'aria-pressed': String(data.leftHanded),
      dataset: { testid: 'toggle-left' },
      onClick: () => onToggleLeftHanded && onToggleLeftHanded(),
    }, [
      icon('hand'),
      data.leftHanded ? '左利き：オン' : '左利き',
    ]),
  ]);
  root.append(topBar);

  if (sp) {
    const title = h('h2', { class: 'page-title' });
    title.append(makeRuby(sp.name, sp.kana), document.createTextNode(`のさばき方（${data.methodLabel}・文章版）`));
    root.append(title);
  }

  // 道具一覧
  if (data.tools.length > 0) {
    const toolsSec = h('section', { class: 'card-section' }, [
      h('h3', { class: 'section-heading' }, [icon('knife'), '用意する道具']),
    ]);
    const list = h('ul', { class: 'chip-list' });
    for (const t of data.tools) {
      const li = h('li', { class: 'chip' });
      appendRubyText(li, t.label);
      list.append(li);
    }
    toolsSec.append(list);
    root.append(toolsSec);
  }

  // 安全のひとこと
  const safetySec = h('section', { class: 'card-section callout callout--warn' }, [
    h('div', { class: 'callout-body' }, [
      h('p', { class: 'callout-title' }, [icon('shield', 'icon icon--warn'), 'さばく前の確認']),
      h('p', {}, [data.safetyIntro]),
      h('a', { class: 'text-link', href: '#/safety' }, ['「さばく前に」の詳しい注意を読む']),
    ]),
  ]);
  root.append(safetySec);

  // 全手順（<ol>）
  const stepsSec = h('section', { class: 'card-section' }, [
    h('h3', { class: 'section-heading' }, [`手順（全${data.steps.length}手順）`]),
  ]);

  if (data.steps.length === 0) {
    stepsSec.append(h('p', {}, ['この魚の手順データは現在準備中です。']));
  } else {
    const ol = h('ol', { class: 'text-guide-list' });
    for (const st of data.steps) {
      const li = h('li', { class: 'text-step', dataset: { testid: `text-step-${st.id}` } });

      const head = h('div', { class: 'text-step-head' }, [
        h('span', { class: 'step-num' }, [`${st.stepNumber}`]),
        h('h4', { class: 'text-step-title' }, []),
      ]);
      appendRubyText(head.lastChild, st.title);
      li.append(head);

      const summary = h('p', { class: 'text-step-summary' });
      appendRubyText(summary, st.summary);
      li.append(summary);

      const placeBox = h('p', { class: 'place-bar' }, [
        icon('place'),
        h('strong', {}, ['魚の置き方：']),
      ]);
      appendRubyText(placeBox, st.place);
      li.append(placeBox);

      const howList = h('ul', { class: 'how-list' });
      for (const line of st.how) {
        const item = h('li');
        appendRubyText(item, line);
        howList.append(item);
      }
      li.append(howList);

      if (st.hands.length > 0) {
        const handBox = h('div', { class: 'hand-box' });
        for (const hand of st.hands) {
          const row = h('p', { class: 'hand-row' }, [
            icon('hand', 'icon icon--hand'),
            h('strong', {}, [`${hand.whoLabel}：`]),
          ]);
          appendRubyText(row, hand.text);
          handBox.append(row);
        }
        li.append(handBox);
      }

      const meta = h('dl', { class: 'step-notes' });
      const addRow = (dtLabel, textVal, cls = '') => {
        if (!textVal) return;
        const dt = h('dt', { class: cls }, [dtLabel]);
        const dd = h('dd', { class: cls });
        appendRubyText(dd, textVal);
        meta.append(dt, dd);
      };
      addRow('コツ', st.tip);
      addRow('やりがち', st.mistake);
      addRow('✓ できた目印', st.done, 'note--done');
      if (st.safety) addRow('▲ 安全の注意', st.safety, 'note--warn');
      li.append(meta);

      ol.append(li);
    }
    stepsSec.append(ol);
  }
  root.append(stepsSec);

  // 部位と使い道
  if (data.parts.length > 0) {
    const partsSec = h('section', { class: 'card-section' }, [
      h('h3', { class: 'section-heading' }, ['さばいたあとの部位と使い道']),
    ]);
    const grid = h('div', { class: 'parts-grid' });
    for (const part of data.parts) {
      const card = h('article', { class: 'part-card' });
      const title = h('h4', { class: 'part-name' });
      title.append(makeRuby(part.name, part.kana));
      const where = h('p', { class: 'part-where' });
      appendRubyText(where, part.where);
      const uses = h('ul', { class: 'chip-list' }, (part.uses || []).map((u) => {
        const chip = h('li', { class: 'chip' });
        appendRubyText(chip, u);
        return chip;
      }));
      card.append(title, where, uses);
      grid.append(card);
    }
    partsSec.append(grid);
    if (data.keep) {
      partsSec.append(h('p', { class: 'keep-note' }, [`保存の目安：${data.keep}`]));
    }
    if (sp) {
      partsSec.append(h('p', {}, [h('a', { class: 'text-link', href: `#/parts/${sp.id}` }, ['部位と用語集のページを開く'])]));
    }
    root.append(partsSec);
  }

  // 完了リンク
  if (sp) {
    root.append(h('div', { class: 'page-actions' }, [
      h('a', { class: 'button button--primary', href: `#/done/${sp.id}` }, [icon('check'), 'できた画面へ進む']),
      h('a', { class: 'button', href: '#/' }, ['魚一覧へ戻る']),
    ]));
  }

  container.append(root);
}
