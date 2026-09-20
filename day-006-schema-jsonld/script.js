'use strict';

/* 構造化データ、いま出るやつだけ — Day 006
   外部通信なし / 外部ライブラリなし / 保存なし。

   フォームの項目・必須条件・組み立て関数は SCHEMA_TYPES に集約する。
   仕様変更時に、表示とJSON生成が別々の定義へ分かれないようにするため。 */

const TOAST_MS = 1800;

const BUSINESS_TYPES = [
  ['LocalBusiness', '指定しない'], ['Restaurant', '飲食店'], ['CafeOrCoffeeShop', 'カフェ'],
  ['Bakery', 'パン屋'], ['BarOrPub', 'バー・居酒屋'], ['Store', '小売店'],
  ['ClothingStore', '衣料品店'], ['BeautySalon', '美容室・サロン'], ['Dentist', '歯科'],
  ['MedicalClinic', 'クリニック'], ['RealEstateAgent', '不動産'],
  ['ProfessionalService', '士業・専門サービス'], ['AutoRepair', '自動車整備'], ['Florist', '花屋']
];

const DAYS = [
  ['Monday', '月'], ['Tuesday', '火'], ['Wednesday', '水'], ['Thursday', '木'],
  ['Friday', '金'], ['Saturday', '土'], ['Sunday', '日']
];

const field = (id, label, type, extra = {}) => ({ id, label, type, ...extra });

const SCHEMA_TYPES = {
  business: {
    label: '店舗・事業所',
    intro: '<b>必須は「店名・事業所名」と「住所」の2つだけです。</b>住所には国コード「JP」を自動で付けます。推奨欄は空ならJSONに出しません。',
    fields: [
      field('name', '店名・事業所名', 'text', { required: true, placeholder: '例：喫茶みどり' }),
      field('address', '住所', 'address', { required: true, note: '4欄で1つのPostalAddressを組みます。入力した欄だけを出力します。' }),
      field('businessType', '業種', 'select', { recommended: true, options: BUSINESS_TYPES, note: '当てはまる中で最も具体的な業種を選びます。' }),
      field('telephone', '電話番号', 'tel', { recommended: true, placeholder: '例：03-1234-5678', note: '市外局番を含めます。' }),
      field('url', 'サイトURL', 'url', { recommended: true, placeholder: 'https://example.com/' }),
      field('priceRange', '価格帯', 'text', { recommended: true, maxlength: 99, placeholder: '例：¥1,000〜¥2,000', note: '100文字未満で入力します。' }),
      field('hours', '営業時間', 'hours', { recommended: true, note: '同じ開店・閉店時刻の曜日は、月曜始まりで1件にまとめます。' })
    ],
    missing(values) {
      const hasAddress = ['postalCode', 'addressRegion', 'addressLocality', 'streetAddress'].some((key) => values[key].trim());
      return values.name.trim() && hasAddress ? '' : '店名と住所を入れると出ます';
    },
    build(values) {
      const address = compact({
        '@type': 'PostalAddress',
        postalCode: values.postalCode,
        addressRegion: values.addressRegion,
        addressLocality: values.addressLocality,
        streetAddress: values.streetAddress,
        addressCountry: 'JP'
      });
      return compact({
        '@context': 'https://schema.org',
        '@type': values.businessType || 'LocalBusiness',
        name: values.name,
        address,
        telephone: values.telephone,
        url: values.url,
        priceRange: values.priceRange,
        openingHoursSpecification: buildOpeningHours(values.hours)
      });
    }
  },
  article: {
    label: '記事・お知らせ',
    intro: '<b>必須プロパティは1つもありません。</b>記事の内容に当てはまるものだけを追加します。空の推奨欄はJSONに出しません。',
    fields: [
      field('articleType', '種類', 'select', { recommended: true, options: [['Article', '記事'], ['NewsArticle', 'ニュース記事'], ['BlogPosting', 'ブログ投稿']] }),
      field('headline', '見出し', 'text', { recommended: true, note: '長すぎる見出しは、端末によって途中で切られることがあります。' }),
      field('image', '画像URL', 'url', { recommended: true, placeholder: 'https://example.com/image.jpg', note: 'クロール可能な画像URLを指定します。16:9、4:3、1:1の画像が好まれます。' }),
      field('datePublished', '公開日時', 'datetime-local', { recommended: true }),
      field('dateModified', '更新日時', 'datetime-local', { recommended: true }),
      field('authorType', '著者の種類', 'select', { recommended: true, options: [['Person', '個人'], ['Organization', '組織']] }),
      field('authorName', '著者名', 'text', { recommended: true }),
      field('authorUrl', '著者URL', 'url', { recommended: true, placeholder: 'https://example.com/profile', note: 'プロフィールページなど。著者名が空なら、著者情報は丸ごと出しません。' })
    ],
    missing() { return ''; },
    build(values) {
      const author = values.authorName.trim() ? compact({
        '@type': values.authorType || 'Person', name: values.authorName, url: values.authorUrl
      }) : undefined;
      return compact({
        '@context': 'https://schema.org',
        '@type': values.articleType || 'Article',
        headline: values.headline,
        image: values.image,
        datePublished: toJstIso(values.datePublished),
        dateModified: toJstIso(values.dateModified),
        author
      });
    }
  },
  breadcrumb: {
    label: 'パンくず',
    intro: '<b>positionは1から自動で連番にします。</b>最終項目のURLは、そのページ自身になるため入力も出力も不要です。',
    fields: [
      field('crumbCount', '段数', 'select', { required: true, options: [[2, '2段'], [3, '3段'], [4, '4段'], [5, '5段'], [6, '6段']], value: '3' }),
      field('crumbs', 'パンくずの項目', 'breadcrumbs', { required: true })
    ],
    missing(values) {
      return values.crumbs.every((item) => item.name.trim()) ? '' : 'すべての項目名を入れると出ます';
    },
    build(values) {
      return {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: values.crumbs.map((item, index) => compact({
          '@type': 'ListItem', position: index + 1, name: item.name, item: index === values.crumbs.length - 1 ? undefined : item.item
        }))
      };
    }
  },
  faq: {
    label: 'よくある質問', retired: true,
    warning: {
      title: { before: 'これは', date: '2026年5月7日', after: 'に廃止されました' },
      lead: 'FAQのリッチリザルトは、Google検索に表示されなくなりました。',
      body: '2026年6月にはリッチリザルトテストとSearch Consoleのレポートから削除され、2026年8月にはSearch Console APIからも削除されます。貼っても検索結果の見た目は変わりません。Q&Aとしてページの中身を整えること自体には意味がありますが、それは構造化データの仕事ではありません。',
      sources: [['Google検索セントラル：FAQPage', 'https://developers.google.com/search/docs/appearance/structured-data/faqpage?hl=ja']]
    }
  },
  howto: {
    label: '手順・使い方', retired: true,
    warning: {
      title: { before: 'これは', date: '2023年9月13日', after: 'に廃止されました' },
      lead: 'HowToのリッチリザルトは、Google検索に表示されなくなりました。',
      body: '2023年8月にモバイルでの表示が終わってデスクトップ限定になり、その1か月後の2023年9月13日にデスクトップからも表示されなくなりました。スキーマ自体は書けますが検索結果への効果はなく、現在の対応タイプ一覧にも載っていないため、この画面ではJSONを生成しません。',
      sources: [
        ['Google検索セントラル：2023年8月の変更', 'https://developers.google.com/search/blog/2023/08/howto-faq-changes?hl=ja'],
        ['Google検索セントラル：現在の対応タイプ一覧', 'https://developers.google.com/search/docs/appearance/structured-data/search-gallery?hl=ja']
      ]
    }
  }
};

const ADDRESS_FIELDS = [
  field('postalCode', '郵便番号', 'text', { placeholder: '例：100-0001' }),
  field('addressRegion', '都道府県', 'text', { placeholder: '例：東京都' }),
  field('addressLocality', '市区町村', 'text', { placeholder: '例：千代田区' }),
  field('streetAddress', '番地・建物', 'text', { placeholder: '例：千代田1-1' })
];

// ---------------------------------------------------------------- DOM

const $ = (id) => document.getElementById(id);
const el = {
  types: $('types'), formPanel: $('form-panel'), formTitle: $('form-title'), formIntro: $('form-intro'),
  form: $('schema-form'), warning: $('warning'), outputSection: $('output-section'),
  output: $('output-code'), codeBox: document.querySelector('.code'), copy: $('copy'),
  copyStatus: $('copy-status'), guide: $('guide')
};

let activeType = 'business';
let copyTimer = 0;

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function compact(object) {
  const result = {};
  for (const [key, value] of Object.entries(object)) {
    if (value === '' || value === undefined || value === null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    result[key] = value;
  }
  return result;
}

// ---------------------------------------------------------------- フォーム生成

function renderTypeButtons() {
  for (const [key, definition] of Object.entries(SCHEMA_TYPES)) {
    const button = make('button', `type-button${definition.retired ? ' type-button--retired' : ''}`);
    button.type = 'button';
    button.dataset.type = key;
    button.append(make('span', 'type-button__label', definition.label));
    // 「廃止」を打ち消し線と文字色だけで示すと、読み上げにも色覚特性のある人にも届かない。
    // このアプリの主張そのものなので、文字でも持たせる
    if (definition.retired) button.append(make('span', 'type-button__badge', '廃止'));

    // 5つから1つを選ぶ集合であることを支援技術へ伝える（トグルボタンの集まりではない）。
    // 選択中のものだけをタブ順に置き、集合内は矢印キーで移動する＝ラジオグループの作法
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', String(key === activeType));
    button.tabIndex = key === activeType ? 0 : -1;
    el.types.appendChild(button);
  }
}

/** 矢印・Home・Endで選択を動かす。端は反対側へ回す。 */
function moveType(current, step) {
  const keys = Object.keys(SCHEMA_TYPES);
  const next = step === 'first' ? 0
    : step === 'last' ? keys.length - 1
      : (keys.indexOf(current) + step + keys.length) % keys.length;
  const key = keys[next];
  selectType(key);
  el.types.querySelector(`.type-button[data-type="${key}"]`).focus();
}

function tagFor(definition) {
  if (definition.required) return make('span', 'field__tag', '必須');
  if (definition.recommended) return make('span', 'field__tag field__tag--recommended', '推奨');
  return null;
}

function buildControl(definition) {
  let control;
  if (definition.type === 'select') {
    control = make('select', 'field__control');
    for (const [value, label] of definition.options) {
      const option = make('option', '', label);
      option.value = String(value);
      control.appendChild(option);
    }
  } else {
    control = make('input', 'field__control');
    control.type = definition.type;
    if (definition.placeholder) control.placeholder = definition.placeholder;
    if (definition.maxlength) control.maxLength = definition.maxlength;
  }
  control.id = definition.id;
  control.name = definition.id;
  if (definition.value) control.value = definition.value;
  return control;
}

function renderStandardField(definition) {
  const wrap = make('div', 'field');
  const label = make('label', 'field__label', definition.label);
  label.htmlFor = definition.id;
  const tag = tagFor(definition);
  if (tag) label.appendChild(tag);
  wrap.append(label, buildControl(definition));
  if (definition.note) wrap.appendChild(make('p', 'field__note', definition.note));
  return wrap;
}

function renderAddress(definition) {
  const group = make('fieldset', 'group');
  const legend = make('legend', 'group__legend', definition.label);
  const tag = tagFor(definition);
  if (tag) legend.appendChild(tag);
  group.appendChild(legend);
  group.appendChild(make('p', 'group__note', definition.note));
  const grid = make('div', 'address-grid');
  for (const addressField of ADDRESS_FIELDS) grid.appendChild(renderStandardField(addressField));
  group.appendChild(grid);
  return group;
}

function renderHours(definition) {
  const group = make('fieldset', 'group');
  const legend = make('legend', 'group__legend', definition.label);
  const tag = tagFor(definition);
  if (tag) legend.appendChild(tag);
  group.append(legend, make('p', 'group__note', definition.note));

  const hours = make('div', 'hours');
  const head = make('div', 'hours__head');
  for (const text of ['曜日', '区分', '開店', '閉店']) head.appendChild(make('span', '', text));
  hours.appendChild(head);

  DAYS.forEach(([english, japanese], index) => {
    const row = make('div', 'hours__row');
    row.dataset.day = english;
    row.appendChild(make('span', 'hours__day', `${japanese}曜`));

    const status = make('select', 'field__control');
    status.name = `hours-${index}-status`;
    status.setAttribute('aria-label', `${japanese}曜日の営業区分`);
    for (const [value, label] of [['open', '営業'], ['closed', '定休'], ['allDay', '24時間']]) {
      const option = make('option', '', label);
      option.value = value;
      status.appendChild(option);
    }

    const opens = make('input', 'field__control');
    opens.type = 'time';
    opens.name = `hours-${index}-opens`;
    opens.setAttribute('aria-label', `${japanese}曜日の開店時刻`);
    const closes = make('input', 'field__control');
    closes.type = 'time';
    closes.name = `hours-${index}-closes`;
    closes.setAttribute('aria-label', `${japanese}曜日の閉店時刻`);
    row.append(status, opens, closes);
    hours.appendChild(row);
  });
  group.appendChild(hours);
  return group;
}

function renderBreadcrumbs(definition) {
  const group = make('fieldset', 'group');
  const legend = make('legend', 'group__legend', definition.label);
  const tag = tagFor(definition);
  if (tag) legend.appendChild(tag);
  group.appendChild(legend);
  const rows = make('div', 'crumbs');
  rows.id = 'crumbs';
  group.appendChild(rows);
  return group;
}

const FIELD_RENDERERS = { address: renderAddress, hours: renderHours, breadcrumbs: renderBreadcrumbs };

function renderForm() {
  const definition = SCHEMA_TYPES[activeType];
  el.form.textContent = '';
  el.formTitle.textContent = `${definition.label}の内容を入れる`;
  el.formIntro.className = 'form-intro';
  el.formIntro.innerHTML = definition.intro;

  for (const item of definition.fields) {
    const renderer = FIELD_RENDERERS[item.type];
    el.form.appendChild(renderer ? renderer(item) : renderStandardField(item));
  }
  if (activeType === 'breadcrumb') renderCrumbRows();
}

function renderCrumbRows() {
  const container = $('crumbs');
  const countControl = $('crumbCount');
  if (!container || !countControl) return;
  const count = Number(countControl.value);
  const previous = [...container.querySelectorAll('.crumb-row')].map((row) => ({
    name: row.querySelector('[data-part="name"]').value,
    item: row.querySelector('[data-part="item"]').value
  }));
  container.textContent = '';

  for (let index = 0; index < count; index++) {
    const isLast = index === count - 1;
    const row = make('div', 'crumb-row');
    row.appendChild(make('span', 'crumb-row__position', String(index + 1)));
    const fields = make('div', 'crumb-row__fields');

    const name = make('input', 'field__control');
    name.type = 'text';
    name.dataset.part = 'name';
    name.placeholder = index === 0 ? '例：ホーム' : '項目名';
    name.setAttribute('aria-label', `${index + 1}番目の名前`);
    name.value = previous[index]?.name || '';

    const item = make('input', 'field__control');
    item.type = 'url';
    item.dataset.part = 'item';
    item.placeholder = 'https://example.com/';
    item.setAttribute('aria-label', `${index + 1}番目のURL`);
    item.value = previous[index]?.item || '';
    item.disabled = isLast;
    fields.append(name, item);
    if (isLast) fields.appendChild(make('p', 'crumb-row__hint', 'このページ自身になるので、最終項目のURLは不要です。'));
    row.appendChild(fields);
    container.appendChild(row);
  }
}

// ---------------------------------------------------------------- 値の取得とJSON生成

function collectValues() {
  const values = {};
  for (const control of el.form.querySelectorAll('input:not([data-part]), select')) {
    if (!control.name.startsWith('hours-')) values[control.name] = control.value;
  }
  for (const item of ADDRESS_FIELDS) values[item.id] = $(item.id)?.value || '';

  values.hours = [...el.form.querySelectorAll('.hours__row')].map((row) => ({
    day: row.dataset.day,
    status: row.querySelector('select').value,
    opens: row.querySelector('input[type="time"]:first-of-type').value,
    closes: row.querySelector('input[type="time"]:last-of-type').value
  }));
  values.crumbs = [...el.form.querySelectorAll('.crumb-row')].map((row) => ({
    name: row.querySelector('[data-part="name"]').value,
    item: row.querySelector('[data-part="item"]').value
  }));
  return values;
}

function buildOpeningHours(rows) {
  const grouped = new Map();
  for (const row of rows) {
    let opens = row.opens;
    let closes = row.closes;
    if (row.status === 'allDay') [opens, closes] = ['00:00', '23:59'];
    if (row.status === 'closed') [opens, closes] = ['00:00', '00:00'];
    if (!opens || !closes) continue;

    const key = `${opens}|${closes}`;
    if (!grouped.has(key)) grouped.set(key, { '@type': 'OpeningHoursSpecification', dayOfWeek: [], opens, closes });
    grouped.get(key).dayOfWeek.push(row.day);
  }
  return [...grouped.values()];
}

function toJstIso(value) {
  if (!value) return undefined;
  const withSeconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00` : value;
  return `${withSeconds}+09:00`;
}

function formatJsonLd(data) {
  return `<script type="application/ld+json">\n${JSON.stringify(data, null, 2)}\n<\/script>`;
}

function updateOutput() {
  const definition = SCHEMA_TYPES[activeType];
  if (definition.retired) return;
  const values = collectValues();
  const missing = definition.missing(values);
  el.copyStatus.textContent = '';
  el.copy.classList.remove('is-copied');

  if (missing) {
    el.output.textContent = missing;
    el.codeBox.classList.add('is-message');
    el.copy.disabled = true;
    return;
  }
  el.output.textContent = formatJsonLd(definition.build(values));
  el.codeBox.classList.remove('is-message');
  el.copy.disabled = false;
}

function updateHoursRow(status) {
  const row = status.closest('.hours__row');
  if (!row) return;
  const fixed = status.value !== 'open';
  for (const input of row.querySelectorAll('input[type="time"]')) {
    input.disabled = fixed;
    if (fixed) input.value = status.value === 'allDay' ? (input === row.querySelector('input') ? '00:00' : '23:59') : '00:00';
    else input.value = '';
  }
}

// ---------------------------------------------------------------- 廃止タイプ

function renderWarning(definition) {
  const warning = definition.warning;
  el.warning.textContent = '';

  // 廃止日だけを nowrap の span で包む。日付が行末で割れると見出しが読めなくなるため
  const title = make('h2', 'warning__title');
  title.append(
    document.createTextNode(warning.title.before),
    make('span', 'keep', warning.title.date),
    document.createTextNode(warning.title.after)
  );

  el.warning.append(
    make('p', 'warning__eyebrow', '生成しません'),
    title,
    make('p', 'warning__lead', warning.lead),
    make('p', 'warning__body', warning.body)
  );
  const sources = make('ul', 'warning__sources');
  for (const [label, url] of warning.sources) {
    const item = make('li');
    const link = make('a', '', label);
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    item.appendChild(link);
    sources.appendChild(item);
  }
  const button = make('button', 'warning__action', '代わりに記事で作る');
  button.type = 'button';
  button.dataset.switchArticle = '';
  el.warning.append(sources, button);
}

function selectType(key, focusForm = false) {
  const definition = SCHEMA_TYPES[key];
  if (!definition) return;
  activeType = key;
  for (const button of el.types.querySelectorAll('.type-button')) {
    const selected = button.dataset.type === key;
    button.setAttribute('aria-checked', String(selected));
    button.tabIndex = selected ? 0 : -1;
  }

  const retired = Boolean(definition.retired);
  el.formPanel.hidden = retired;
  el.outputSection.hidden = retired;
  el.guide.hidden = retired;
  el.warning.hidden = !retired;
  if (retired) renderWarning(definition);
  else {
    renderForm();
    updateOutput();
    if (focusForm) {
      el.formPanel.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      const first = el.form.querySelector('input, select');
      if (first) first.focus({ preventScroll: true });
    }
  }
}

// ---------------------------------------------------------------- コピーと操作

async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (error) {
    // file:// や権限なしでは古いコピー手段へ落とす
  }
  return legacyCopy(text);
}

function legacyCopy(text) {
  const textarea = make('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.inset = '0 auto auto 0';
  textarea.style.width = '1px';
  textarea.style.height = '1px';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, text.length);
  let copied = false;
  try { copied = document.execCommand('copy'); } catch (error) { copied = false; }
  textarea.remove();
  return copied;
}

el.types.addEventListener('click', (event) => {
  const button = event.target.closest('.type-button');
  if (button) selectType(button.dataset.type);
});

const ARROW_STEPS = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, Home: 'first', End: 'last' };
el.types.addEventListener('keydown', (event) => {
  const button = event.target.closest('.type-button');
  const step = ARROW_STEPS[event.key];
  if (!button || step === undefined) return;
  event.preventDefault();
  moveType(button.dataset.type, step);
});

el.form.addEventListener('input', updateOutput);
el.form.addEventListener('change', (event) => {
  if (event.target.id === 'crumbCount') renderCrumbRows();
  if (event.target.name?.endsWith('-status')) updateHoursRow(event.target);
  updateOutput();
});

el.warning.addEventListener('click', (event) => {
  if (event.target.closest('[data-switch-article]')) selectType('article', true);
});

el.copy.addEventListener('click', async () => {
  if (el.copy.disabled) return;
  if (await copyText(el.output.textContent)) {
    clearTimeout(copyTimer);
    el.copy.textContent = 'コピーしました';
    el.copy.classList.add('is-copied');
    el.copyStatus.textContent = 'コード全体をコピーしました。';
    copyTimer = setTimeout(() => {
      el.copy.textContent = 'コピー';
      el.copy.classList.remove('is-copied');
    }, TOAST_MS);
  } else {
    el.copyStatus.textContent = 'コピーできませんでした。コードを選択してコピーしてください。';
  }
});

renderTypeButtons();
selectType(activeType);
