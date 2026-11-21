// 魚の前置き画面（#/fish/<id>）：基本情報・道具・似た魚・安全のひとこと・さばき始める。
import { METHODS, TOOL_LABELS } from './contract.js';
import { SPECIES_META } from './species/meta.js';
import { getProcedure } from './procedures/index.js';
import { collectProcedureTools } from './ui-format.js';
import { appendRubyText, difficultyStars, h, icon, makeRuby, thumbFor } from './ui-icons.js';

const FALLBACK_TOOLS_BY_METHOD = {
  sanmai: ['deba'],
  tebiraki: [],
  seabiraki: ['deba', 'petty'],
  gomai: ['deba'],
  fushi: ['deba', 'yanagi'],
};

export function renderIntro(container, { speciesId, state }) {
  container.replaceChildren();
  const sp = SPECIES_META[speciesId];
  if (!sp) return;

  const proc = getProcedure(speciesId);
  const methodLabel = METHODS[sp.method] || sp.method;
  const savedStep = state.progress && Number.isInteger(state.progress[speciesId]) ? state.progress[speciesId] : null;
  const tools = proc
    ? collectProcedureTools(proc)
    : (FALLBACK_TOOLS_BY_METHOD[sp.method] || []).map((id) => ({ id, label: TOOL_LABELS[id] })).filter((t) => t.label);

  const page = h('div', { class: 'page page--narrow intro-page' });

  // 戻るリンク
  page.append(h('div', { class: 'page-head' }, [
    h('a', { class: 'button button--ghost', href: '#/' }, [icon('back'), '魚をえらぶ']),
    h('a', { class: 'button button--ghost', href: `#/parts/${speciesId}` }, [icon('label'), '部位の名前']),
  ]));

  // メイン見出しカード
  const hero = h('section', { class: 'intro-hero' }, [
    h('div', { class: 'intro-thumb' }, [thumbFor(speciesId)]),
    h('div', { class: 'intro-title-wrap' }, [
      h('div', { class: 'intro-badges' }, [
        h('span', { class: 'badge badge--method' }, [methodLabel]),
        proc
          ? h('span', { class: 'badge badge--neutral' }, [`全${proc.steps.length}手順`])
          : h('span', { class: 'badge badge--warn' }, ['手順準備中']),
      ]),
      h('h2', { class: 'intro-name' }, [makeRuby(sp.name, sp.kana)]),
      h('p', { class: 'intro-full' }, [sp.nameFull]),
    ]),
  ]);
  const blurb = h('p', { class: 'intro-blurb' });
  appendRubyText(blurb, sp.blurb);
  hero.append(blurb);

  // スペック一覧
  const specs = h('dl', { class: 'spec-grid' }, [
    h('div', { class: 'spec-cell' }, [
      h('dt', {}, ['難易度']),
      h('dd', {}, [difficultyStars(sp.difficulty)]),
    ]),
    h('div', { class: 'spec-cell' }, [
      h('dt', {}, ['所要時間']),
      h('dd', {}, [`初心者 約${sp.minutes.novice}分 ／ 慣れた人 約${sp.minutes.skilled}分`]),
    ]),
    h('div', { class: 'spec-cell' }, [
      h('dt', {}, ['大きさの目安']),
      h('dd', {}, [`約${sp.sizeCm.typical}cm（${sp.sizeCm.min}〜${sp.sizeCm.max}cm）`]),
    ]),
    h('div', { class: 'spec-cell' }, [
      h('dt', {}, ['旬']),
      h('dd', {}, [sp.season]),
    ]),
  ]);
  hero.append(specs);
  page.append(hero);

  // 主操作（さばき始める）
  const ctaWrap = h('div', { class: 'intro-cta-wrap' });
  if (proc) {
    ctaWrap.append(h('a', {
      class: 'button button--primary button--large',
      href: `#/fish/${speciesId}/1`,
      dataset: { testid: 'btn-start' },
    }, ['さばき始める', icon('next')]));

    if (savedStep !== null && savedStep > 0 && savedStep < proc.steps.length) {
      const st = proc.steps[savedStep];
      ctaWrap.append(h('a', {
        class: 'button button--large',
        href: `#/fish/${speciesId}/${savedStep + 1}`,
        dataset: { testid: 'btn-resume-fish' },
      }, [`手順 ${savedStep + 1}（${st.title}）のつづきから`]));
    }
  } else {
    ctaWrap.append(h('div', { class: 'callout callout--info' }, [
      h('div', { class: 'callout-body' }, [
        h('p', {}, [`${sp.name}の詳しい手順データは現在準備中です。先に「アジ」のガイドをお試しいただけます。`]),
        h('a', { class: 'button button--primary', href: '#/fish/aji/1' }, ['アジのガイドを見る', icon('next')]),
      ]),
    ]));
  }
  page.append(ctaWrap);

  // 用意する道具
  const toolsSec = h('section', { class: 'card-section' }, [
    h('h3', { class: 'section-heading' }, [icon('knife'), '用意する道具']),
  ]);
  if (tools.length > 0) {
    const ul = h('ul', { class: 'chip-list' });
    for (const t of tools) {
      const li = h('li', { class: 'chip' });
      appendRubyText(li, t.label);
      ul.append(li);
    }
    toolsSec.append(ul);
  } else {
    toolsSec.append(h('p', { class: 'muted' }, ['包丁を使わず、指とキッチンペーパーで進められます。']));
  }
  toolsSec.append(h('p', { class: 'muted small-note' }, [
    'あわせて、まな板・濡れ布巾（滑り止め）・キッチンペーパー・水受けがあると安心です。',
  ]));
  page.append(toolsSec);

  // この手順が使える魚
  if (Array.isArray(sp.similar) && sp.similar.length > 0) {
    const simSec = h('section', { class: 'card-section' }, [
      h('h3', { class: 'section-heading' }, ['この手順が使える魚']),
      h('ul', { class: 'chip-list' }, sp.similar.map((name) => h('li', { class: 'chip chip--soft' }, [name]))),
      h('p', { class: 'muted small-note' }, ['体のつくりが近い魚にも、同じ流れを応用できます。']),
    ]);
    page.append(simSec);
  }

  // 安全のひとこと
  const safetyBox = h('section', { class: 'callout callout--warn' }, [
    icon('alert', 'icon icon--warn'),
    h('div', { class: 'callout-body' }, [
      h('h3', { class: 'callout-title' }, ['さばく前の安全のひとこと']),
      h('p', {}, [
        'まな板の下に濡れ布巾を敷いて滑らないように固定し、包丁の刃が進む先に手を置かないようにしてください。濡れた手や魚はこまめに拭くと安全です。',
      ]),
      h('p', { class: 'small-note' }, [
        '本アプリの情報は参考情報です。刃物と生ものの扱いは自己責任で行ってください。手順は標準的な方法であり、流派による違いがあります。',
      ]),
      h('p', {}, [
        h('a', { class: 'text-link', href: '#/safety' }, ['「さばく前に」（寄生虫・食中毒・道具の注意）を読む']),
      ]),
    ]),
  ]);
  page.append(safetyBox);

  container.append(page);
}
