// 自作のSVGアイコン・魚のシルエット（thumbFor の1か所に集約）・DOM組み立て補助。絵文字は使わない。
import { tokenizeRuby } from './ui-format.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** SVG 要素を属性付きで生成する。 */
export function svgEl(tag, attrs = {}, children = []) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== null && v !== undefined) el.setAttribute(k, String(v));
  }
  for (const child of children) {
    if (child) el.append(child);
  }
  return el;
}

/** HTML 要素を安全に生成する（インライン style 属性は使わない）。 */
export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'dataset' && typeof v === 'object') {
      for (const [dk, dv] of Object.entries(v)) {
        if (dv !== null && dv !== undefined) el.dataset[dk] = String(dv);
      }
    } else if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v === true) {
      el.setAttribute(k, '');
    } else {
      el.setAttribute(k, String(v));
    }
  }
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child === null || child === undefined || child === false) continue;
    el.append(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
  }
  return el;
}

/** 本文を一つのインライン要素に収め、親の flex や grid の間隔がルビの前後に入るのを防ぎます。 */
export function appendRubyText(parent, text, opts = {}) {
  const tokens = tokenizeRuby(text, opts);
  if (!tokens.length) return parent;
  const span = document.createElement('span');
  for (const tok of tokens) {
    span.append(tok.type === 'ruby' ? makeRuby(tok.base, tok.rt) : document.createTextNode(tok.text));
  }
  parent.append(span);
  return parent;
}

/** コツなどの説明欄に、本文または初出の手順番号を表示します。 */
export function stepNoteBody(text, sameAs, className = '') {
  if (sameAs) return h('dd', { class: 'note-reference' }, [`手順${sameAs}と同じです。`]);
  return appendRubyText(h('dd', { class: className }), text);
}

/** 明示的な読み仮名付き <ruby> を1つ作る。 */
export function makeRuby(base, kana) {
  if (!kana || base === kana) return document.createTextNode(base);
  const ruby = document.createElement('ruby');
  ruby.append(document.createTextNode(base));
  const rp1 = document.createElement('rp');
  rp1.textContent = '（';
  const rt = document.createElement('rt');
  rt.textContent = kana;
  // 読みが親文字より長いと、ふりがなが前後の語を押し広げて空きが出る。親文字の幅＋少しに収まる大きさに縮める（下限は0.5em）。
  const fit = (Array.from(base).length + 0.3) / Array.from(kana).length;
  if (fit < 0.62 && rt.style) rt.style.fontSize = Math.max(0.5, fit).toFixed(3) + 'em';
  const rp2 = document.createElement('rp');
  rp2.textContent = '）';
  ruby.append(rp1, rt, rp2);
  return ruby;
}

const ICON_PATHS = {
  brand: [
    ['path', { d: 'M3.5 11.5c2.6-3.7 7.1-5.2 11.8-3.6l2.2-1.9v8.8l-2.2-1.9c-4.7 1.6-9.2.1-11.8-1.4z' }],
    ['circle', { cx: '7.5', cy: '10.6', r: '0.9', fill: 'currentColor', stroke: 'none' }],
    ['path', { d: 'M9.5 6.8l3.5 7.4', class: 'icon-accent' }],
  ],
  play: [['polygon', { points: '6.5,4.5 16.5,10 6.5,15.5', fill: 'currentColor', stroke: 'none' }]],
  pause: [
    ['rect', { x: '5.5', y: '4.5', width: '3.2', height: '11', rx: '0.8', fill: 'currentColor', stroke: 'none' }],
    ['rect', { x: '11.3', y: '4.5', width: '3.2', height: '11', rx: '0.8', fill: 'currentColor', stroke: 'none' }],
  ],
  prev: [['path', { d: 'M12.5 5l-5 5 5 5' }]],
  next: [['path', { d: 'M7.5 5l5 5-5 5' }]],
  back: [['path', { d: 'M14 5l-6 5 6 5' }], ['path', { d: 'M8 10h9' }]],
  repeat: [
    ['path', { d: 'M4.5 9.5a5.5 5.5 0 0 1 9.5-3.7L16 7.8' }],
    ['path', { d: 'M16 4.5v3.3h-3.3' }],
    ['path', { d: 'M15.5 10.5a5.5 5.5 0 0 1-9.5 3.7L4 12.2' }],
    ['path', { d: 'M4 15.5v-3.3h3.3' }],
  ],
  list: [
    ['path', { d: 'M4 6h12' }],
    ['path', { d: 'M4 10h12' }],
    ['path', { d: 'M4 14h8' }],
  ],
  xray: [
    ['ellipse', { cx: '10', cy: '10', rx: '7', ry: '4.2' }],
    ['path', { d: 'M5.5 10h9' }],
    ['path', { d: 'M8 8v4M10.5 7.6v4.8M13 8.3v3.4' }],
  ],
  view: [
    ['path', { d: 'M2.5 10s3-4.8 7.5-4.8S17.5 10 17.5 10s-3 4.8-7.5 4.8S2.5 10 2.5 10z' }],
    ['circle', { cx: '10', cy: '10', r: '2.2' }],
  ],
  label: [
    ['path', { d: 'M3.5 10.2V4.5h5.7l7.3 7.3-5.7 5.7-7.3-7.3z' }],
    ['circle', { cx: '7', cy: '7.5', r: '1', fill: 'currentColor', stroke: 'none' }],
  ],
  hand: [
    ['path', { d: 'M6.5 11V5.8a1 1 0 1 1 2 0V9.5' }],
    ['path', { d: 'M8.5 9.5V4.8a1 1 0 1 1 2 0V9.5' }],
    ['path', { d: 'M10.5 9.5V5.5a1 1 0 1 1 2 0V9.8' }],
    ['path', { d: 'M12.5 9.8V7a1 1 0 1 1 2 0v5c0 3-2 5-4.8 5H9c-2 0-3.2-1.2-4.2-3.2l-1.1-2.2a1 1 0 0 1 1.7-1l1.1 1.4' }],
  ],
  trace: [
    ['path', { d: 'M3.5 14.5c2.5-5 6.5-7.5 12-8.5', 'stroke-dasharray': '2.5 2' }],
    ['path', { d: 'M13.2 4.2l3.1 1.5-1.5 3.1' }],
  ],
  cut: [
    ['path', { d: 'M3.5 14.5L15 5.5', 'stroke-dasharray': '3 2' }],
    ['path', { d: 'M12 4.8l3.5.5-.6 3.5' }],
  ],
  check: [['path', { d: 'M4.5 10.5l3.6 3.6 7.4-8' }]],
  alert: [
    ['path', { d: 'M10 3.5l7.5 13H2.5L10 3.5z' }],
    ['path', { d: 'M10 8.2v3.6' }],
    ['circle', { cx: '10', cy: '14.2', r: '0.8', fill: 'currentColor', stroke: 'none' }],
  ],
  shield: [
    ['path', { d: 'M10 3l6 2.5v4.8c0 3.6-2.5 6-6 7.2-3.5-1.2-6-3.6-6-7.2V5.5L10 3z' }],
    ['path', { d: 'M10 7.5v3.2' }],
    ['circle', { cx: '10', cy: '13.2', r: '0.8', fill: 'currentColor', stroke: 'none' }],
  ],
  share: [
    ['path', { d: 'M10 3.5v8.5' }],
    ['path', { d: 'M6.8 6.7L10 3.5l3.2 3.2' }],
    ['path', { d: 'M4.5 11.5v4a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-4' }],
  ],
  settings: [
    ['circle', { cx: '10', cy: '10', r: '2.6' }],
    ['path', { d: 'M10 3.2v1.8M10 15v1.8M3.2 10H5M15 10h1.8M5.2 5.2l1.3 1.3M13.5 13.5l1.3 1.3M14.8 5.2l-1.3 1.3M6.5 13.5l-1.3 1.3' }],
  ],
  close: [
    ['path', { d: 'M5.5 5.5l9 9' }],
    ['path', { d: 'M14.5 5.5l-9 9' }],
  ],
  reset: [
    ['path', { d: 'M4.8 10a5.2 5.2 0 1 1 1.5 3.7' }],
    ['path', { d: 'M4.5 6.5v3.5H8' }],
  ],
  volume: [
    ['path', { d: 'M3.5 8v4h3l4 3V5l-4 3h-3z' }],
    ['path', { d: 'M13.5 7.5a3.5 3.5 0 0 1 0 5' }],
    ['path', { d: 'M15.8 5.5a6.2 6.2 0 0 1 0 9' }],
  ],
  knife: [
    ['path', { d: 'M3.5 15.5l3.5-3.5' }],
    ['path', { d: 'M6.5 12.5l8.2-8.2c1.2 1.8.8 4.4-1.2 6.4l-4.2 4.2-2.8-2.4z' }],
  ],
  tip: [
    ['path', { d: 'M10 3.5a4.5 4.5 0 0 0-2.5 8.2V14h5v-2.3A4.5 4.5 0 0 0 10 3.5z' }],
    ['path', { d: 'M8 16.2h4' }],
  ],
  place: [
    ['rect', { x: '2.8', y: '5', width: '14.4', height: '10', rx: '1.8' }],
    ['path', { d: 'M6 10c1.8-1.8 4.8-2 7.2-.8l1.2-1v3.6l-1.2-1c-2.4 1.2-5.4 1-7.2-.8z' }],
  ],
  starFill: [
    ['polygon', { points: '10,2.6 12.2,7.2 17.3,7.9 13.6,11.5 14.5,16.6 10,14.1 5.5,16.6 6.4,11.5 2.7,7.9 7.8,7.2', fill: 'currentColor', stroke: 'none' }],
  ],
  starEmpty: [
    ['polygon', { points: '10,3.2 12,7.4 16.6,8 13.3,11.3 14.1,15.9 10,13.7 5.9,15.9 6.7,11.3 3.4,8 8,7.4' }],
  ],
  external: [
    ['path', { d: 'M11 4h5v5' }],
    ['path', { d: 'M9 11l7-7' }],
    ['path', { d: 'M14 11.5V15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3.5' }],
  ],
  chevronDown: [['path', { d: 'M5.5 7.5L10 12l4.5-4.5' }]],
};

/** 名前で統一スタイルの SVG アイコンを作る。 */
export function icon(name, className = 'icon') {
  const defs = ICON_PATHS[name] || ICON_PATHS.info || [];
  const children = defs.map(([tag, attrs]) => svgEl(tag, attrs));
  return svgEl('svg', {
    class: className,
    viewBox: '0 0 20 20',
    'aria-hidden': 'true',
    focusable: 'false',
  }, children);
}

/** 難易度の星（SVG）を返す。 */
export function difficultyStars(level) {
  const n = Math.min(5, Math.max(1, Math.round(Number(level) || 1)));
  const wrap = h('span', { class: 'stars', role: 'img', 'aria-label': `難易度 5段階中 ${n}` });
  for (let i = 1; i <= 5; i++) {
    wrap.append(icon(i <= n ? 'starFill' : 'starEmpty', i <= n ? 'icon star star--on' : 'icon star star--off'));
  }
  return wrap;
}

// 魚シルエットの形状と配色。後で3Dサムネへ差し替えるときは thumbFor(id) の1か所だけを置換する。
const FISH_SILHOUETTES = {
  aji: {
    dorsal: '#356887', flank: '#c5d2d9', belly: '#f2f0ea', fin: '#cbbd8a',
    body: 'M 22 44 C 38 22, 86 18, 128 34 L 146 21 L 141 44 L 146 67 L 128 54 C 86 70, 38 66, 22 44 Z',
    dorsalBand: 'M 24 42 C 40 23, 86 20, 127 35 C 94 37, 54 38, 24 42 Z',
    topFin: 'M 64 25 L 82 14 L 106 25 Z',
    bottomFin: 'M 86 62 L 106 70 L 116 58 Z',
    pecFin: 'M 54 46 L 76 52 L 58 55 Z',
    eye: [38, 40],
    detail: 'scute',
  },
  iwashi: {
    dorsal: '#2d577a', flank: '#cdd8df', belly: '#f6f5f0', fin: '#a7b5bf',
    body: 'M 20 45 C 40 28, 92 26, 130 38 L 147 26 L 142 45 L 147 64 L 130 52 C 92 64, 40 62, 20 45 Z',
    dorsalBand: 'M 22 43 C 42 29, 92 28, 129 39 C 96 40, 56 41, 22 43 Z',
    topFin: 'M 68 30 L 82 21 L 96 30 Z',
    bottomFin: 'M 95 58 L 112 64 L 118 55 Z',
    pecFin: 'M 52 48 L 68 54 L 54 55 Z',
    eye: [35, 42],
    detail: 'spots',
  },
  sanma: {
    dorsal: '#295f75', flank: '#cfd9df', belly: '#f7f6f2', fin: '#9ab0ba',
    body: 'M 14 45 C 34 34, 96 33, 134 40 L 149 30 L 145 45 L 149 60 L 134 50 C 96 57, 34 56, 14 45 Z',
    dorsalBand: 'M 17 44 C 38 35, 96 34, 133 41 C 98 42, 54 42, 17 44 Z',
    topFin: 'M 102 36 L 118 29 L 124 38 Z',
    bottomFin: 'M 102 54 L 118 61 L 124 52 Z',
    pecFin: 'M 48 48 L 62 52 L 50 53 Z',
    eye: [30, 43],
    detail: 'slender',
  },
  saba: {
    dorsal: '#226576', flank: '#c4d2d9', belly: '#f2f1eb', fin: '#94a8b0',
    body: 'M 18 44 C 38 24, 90 22, 129 36 L 148 20 L 142 44 L 148 68 L 129 52 C 90 66, 38 64, 18 44 Z',
    dorsalBand: 'M 20 42 C 40 25, 90 24, 128 37 C 96 39, 56 39, 20 42 Z',
    topFin: 'M 62 27 L 78 16 L 94 26 Z',
    bottomFin: 'M 94 60 L 114 67 L 120 56 Z',
    pecFin: 'M 52 46 L 70 52 L 54 54 Z',
    eye: [34, 41],
    detail: 'mackerel',
  },
  kisu: {
    dorsal: '#b5a68e', flank: '#e5dfd1', belly: '#faf8f2', fin: '#d2c8b2',
    body: 'M 16 46 C 36 30, 92 29, 132 39 L 146 28 L 143 46 L 146 64 L 132 53 C 92 63, 36 62, 16 46 Z',
    dorsalBand: 'M 18 44 C 38 31, 92 31, 131 40 C 98 42, 54 42, 18 44 Z',
    topFin: 'M 60 32 L 76 21 L 112 34 Z',
    bottomFin: 'M 86 58 L 116 64 L 122 55 Z',
    pecFin: 'M 52 49 L 68 55 L 54 56 Z',
    eye: [34, 42],
    detail: 'none',
  },
  tai: {
    dorsal: '#c96868', flank: '#ebd2cf', belly: '#faf3f0', fin: '#d98a82',
    body: 'M 22 46 C 36 16, 86 12, 124 34 L 146 18 L 139 46 L 146 74 L 124 58 C 86 78, 36 74, 22 46 Z',
    dorsalBand: 'M 24 43 C 38 17, 86 14, 123 35 C 94 36, 56 38, 24 43 Z',
    topFin: 'M 52 21 L 78 10 L 112 27 Z',
    bottomFin: 'M 86 67 L 110 74 L 118 61 Z',
    pecFin: 'M 54 49 L 79 56 L 59 59 Z',
    eye: [39, 39],
    detail: 'none',
  },
  katsuo: {
    dorsal: '#234263', flank: '#c1ced7', belly: '#eff1f2', fin: '#7a8f9e',
    body: 'M 18 44 C 36 18, 92 16, 130 37 L 148 18 L 141 44 L 148 70 L 130 51 C 92 72, 36 70, 18 44 Z',
    dorsalBand: 'M 20 42 C 38 19, 92 18, 129 38 C 94 39, 54 40, 20 42 Z',
    topFin: 'M 60 22 L 76 11 L 96 22 Z',
    bottomFin: 'M 94 64 L 114 71 L 120 58 Z',
    pecFin: 'M 54 46 L 74 52 L 56 54 Z',
    eye: [34, 39],
    detail: 'bonito',
  },
  hirame: {
    dorsal: '#86755b', flank: '#a89678', belly: '#c9bba0', fin: '#9d8c6f',
    body: 'M 22 45 C 40 12, 98 10, 132 37 L 147 26 L 144 45 L 147 64 L 132 53 C 98 80, 40 78, 22 45 Z',
    dorsalBand: 'M 32 45 C 46 20, 96 18, 128 39 C 96 68, 46 68, 32 45 Z',
    topFin: 'M 42 22 C 70 11, 102 14, 126 32 C 102 22, 70 20, 42 22 Z',
    bottomFin: 'M 42 68 C 70 79, 102 76, 126 58 C 102 68, 70 70, 42 68 Z',
    pecFin: 'M 56 44 L 74 49 L 58 53 Z',
    eye: [38, 38],
    detail: 'flat',
  },
};

/**
 * 魚カードのサムネイルを作る（この1関数に閉じ込め、後で3Dサムネに差し替える）。
 */
export function thumbFor(id) {
  const s = FISH_SILHOUETTES[id] || FISH_SILHOUETTES.aji;
  const parts = [
    // 白木のまな板の淡い敷き面
    svgEl('rect', { x: '6', y: '8', width: '148', height: '74', rx: '10', fill: '#eee4cf', stroke: '#dfd3bc', 'stroke-width': '1' }),
    svgEl('path', { d: s.topFin, fill: s.fin, stroke: '#5d6b73', 'stroke-width': '0.9', 'stroke-linejoin': 'round' }),
    svgEl('path', { d: s.bottomFin, fill: s.fin, stroke: '#5d6b73', 'stroke-width': '0.9', 'stroke-linejoin': 'round' }),
    svgEl('path', { d: s.body, fill: s.flank, stroke: '#2c3d47', 'stroke-width': '1.3', 'stroke-linejoin': 'round' }),
    svgEl('path', { d: s.dorsalBand, fill: s.dorsal, opacity: '0.88' }),
    svgEl('path', { d: s.pecFin, fill: s.fin, opacity: '0.85', stroke: '#4c5b63', 'stroke-width': '0.8' }),
  ];

  // 種ごとの特徴的な模様
  if (s.detail === 'scute') {
    parts.push(svgEl('path', { d: 'M 52 44 Q 84 42, 126 44', fill: 'none', stroke: '#5e6d75', 'stroke-width': '1.2', 'stroke-dasharray': '3 2' }));
  } else if (s.detail === 'spots') {
    for (let x = 56; x <= 104; x += 12) {
      parts.push(svgEl('circle', { cx: x, cy: 42, r: '1.5', fill: '#223b52' }));
    }
  } else if (s.detail === 'mackerel') {
    for (let x = 50; x <= 110; x += 10) {
      parts.push(svgEl('path', { d: `M ${x} 28 Q ${x + 3} 33, ${x - 1} 38`, fill: 'none', stroke: '#173e4c', 'stroke-width': '1.4', 'stroke-linecap': 'round' }));
    }
  } else if (s.detail === 'bonito') {
    for (const y of [49, 54, 59]) {
      parts.push(svgEl('path', { d: `M 54 ${y} Q 86 ${y + 2}, 116 ${y - 2}`, fill: 'none', stroke: '#2c4259', 'stroke-width': '1.4', opacity: '0.75' }));
    }
  } else if (s.detail === 'flat') {
    // 左ヒラメ：両目が左側に寄る特徴を描く
    parts.push(svgEl('circle', { cx: '42', cy: '47', r: '3.1', fill: '#f6f3ea', stroke: '#2c3d47', 'stroke-width': '1' }));
    parts.push(svgEl('circle', { cx: '41.5', cy: '47', r: '1.5', fill: '#1c2b33' }));
    for (const [cx, cy] of [[68, 36], [86, 46], [76, 56], [102, 42]]) {
      parts.push(svgEl('circle', { cx, cy, r: '2.2', fill: '#6c5c44', opacity: '0.45' }));
    }
  }

  // 鰓蓋と目
  if (s.detail !== 'flat') {
    parts.push(svgEl('path', { d: 'M 49 32 Q 55 44, 49 56', fill: 'none', stroke: '#4c5e69', 'stroke-width': '1.2' }));
  }
  parts.push(
    svgEl('circle', { cx: s.eye[0], cy: s.eye[1], r: '3.3', fill: '#f7f4ec', stroke: '#2c3d47', 'stroke-width': '1' }),
    svgEl('circle', { cx: s.eye[0] - 0.5, cy: s.eye[1], r: '1.7', fill: '#1c2b33' }),
    svgEl('circle', { cx: s.eye[0] - 1.1, cy: s.eye[1] - 0.8, r: '0.6', fill: '#ffffff' })
  );

  return svgEl('svg', {
    class: 'fish-thumb',
    viewBox: '0 0 160 90',
    'aria-hidden': 'true',
    focusable: 'false',
  }, parts);
}
