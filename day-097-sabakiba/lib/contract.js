// 契約: 解剖・形・時間・画面をつなぐ定数・検証・小さな純関数。three を import しない（Node で試験できる）。
// 仕様: .kiro/specs/day-097-sabakiba/interfaces-*.md。担当は、この名前・形を変えずに作る。変えたいときは親に戻す。

export const SPECIES_IDS = ['aji', 'iwashi', 'saba', 'sanma', 'tai', 'hirame', 'kisu', 'katsuo'];
export const METHODS = { sanmai: '三枚おろし', tebiraki: '手開き', seabiraki: '背開き', gomai: '五枚おろし', fushi: '節取り' };
export const FAMILIES = ['round', 'flat'];
export const SIDES = ['L', 'R'];

// 部品（piece）。魚の座標（FLF）のまま作り、動きは Object3D の変換で行う。
export const PIECE_IDS = [
  'head', 'bone', 'viscera', 'kidney',
  'L.dorsal', 'L.ventral', 'L.strip', 'R.dorsal', 'R.ventral', 'R.strip',
  'skin.L', 'skin.R', 'pinbones.L', 'pinbones.R',
];
export const OPTIONAL_PIECE_IDS = ['engawa.L.dorsal', 'engawa.L.ventral', 'engawa.R.dorsal', 'engawa.R.ventral', 'slices.L', 'slices.R'];
export const ALL_PIECE_IDS = [...PIECE_IDS, ...OPTIONAL_PIECE_IDS];

// 部品の親子。子は親の動き（変位・回転）を引き継いだうえで、自分の動きを足す。見えるかどうか（visible）も親が消えれば消える。不透明度は引き継がない。
// 例: 左の身 L.dorsal を動かすと、左の腹側・腹骨の層・皮・小骨がいっしょに動く。腹骨の層だけを外すときは L.strip に動きを書く。
export const PIECE_PARENT = {
  'L.ventral': 'L.dorsal', 'L.strip': 'L.ventral', 'skin.L': 'L.dorsal', 'pinbones.L': 'L.dorsal', 'slices.L': 'L.dorsal',
  'R.ventral': 'R.dorsal', 'R.strip': 'R.ventral', 'skin.R': 'R.dorsal', 'pinbones.R': 'R.dorsal', 'slices.R': 'R.dorsal',
  'kidney': 'bone',
  'engawa.L.dorsal': 'L.dorsal', 'engawa.L.ventral': 'L.ventral', 'engawa.R.dorsal': 'R.dorsal', 'engawa.R.ventral': 'R.ventral',
};

// アンカー（FLFの点）。`piece:<部品ID>` は、その部品の中心（動いたあとの位置を含む）。
export const ANCHOR_NAMES = [
  'snout', 'eye', 'mouth', 'opercleTop', 'opercleBottom', 'headCutTop', 'headCutBottom',
  'pectoralBase', 'pelvicBase', 'cavityStart', 'vent', 'dorsalFinStart', 'dorsalFinEnd', 'analFinStart', 'analFinEnd',
  'peduncle', 'tailTip', 'spineHeadEnd', 'bodyCenter',
];

// カーブ（FLFの折れ線・向きは頭→尾が基本）。sides=true は side:'L'|'R' が必須。inner=true は体の内側を通る線（透視で見せる）。
export const CURVE_INFO = {
  dorsalMidline: { sides: false, inner: false, note: '背の正中線（頭→尾）' },
  ventralMidline: { sides: false, inner: false, note: '腹の正中線（頭→尾）' },
  lateralLine: { sides: true, inner: false, note: '側線（体側の中ほど・頭→尾）' },
  scaleSweep: { sides: true, inner: false, note: 'うろこを引く向き（尾柄→頭）' },
  scuteRow: { sides: true, inner: false, note: 'ぜいご（稜鱗）の列（尾柄→前）' },
  headCut: { sides: true, inner: false, note: '頭を落とす斜めの線（背→腹）' },
  bellySlit: { sides: false, inner: false, note: '腹を開く線（肛門→頭の切り口）' },
  kidneyLine: { sides: false, inner: true, note: '背わた（腎臓）の線（腹腔の天井・頭→尾）' },
  dorsalCut: { sides: true, inner: false, note: '背ビレの付け根にそった切り（頭→尾・体側へ少しずらす）' },
  ventralCut: { sides: true, inner: false, note: '腹側の切り（肛門→尾・尻ビレの付け根にそう）' },
  boneCut: { sides: true, inner: true, note: '背骨の側面にそう内側の切り（頭→尾）' },
  tailCut: { sides: true, inner: true, note: '尾柄を横に切り離す線（背→腹）' },
  ribStrip: { sides: true, inner: true, note: '腹骨をすく線（腹腔の腹側・頭→肛門）' },
  pinBoneLine: { sides: true, inner: true, note: '小骨（血合い骨）の並ぶ線（S面・頭→尾）' },
  skinPeel: { sides: true, inner: false, note: '皮を引く線（尾→頭）' },
  sliceLine: { sides: true, inner: false, note: '刺身に切る線（身の上・頭→尾）' },
  lateralSplit: { sides: true, inner: false, note: '背と腹に分ける線（体側の中ほど・血合いの線・頭→尾）' },
  chiaiTrim: { sides: true, inner: false, note: '血合いを取る線（節取り）' },
  dorsalOpen: { sides: false, inner: false, note: '背開きの切り（背骨の上・頭→尾）' },
  handOpen: { sides: true, inner: true, note: '手開きで親指を通す線（腹から中骨の上・頭→尾）' },
  boneLift: { sides: false, inner: true, note: '中骨を持ち上げる線（背骨の軸・頭→尾）' },
  engawaCut: { sides: true, inner: false, note: 'ヒレの付け根の筋肉（縁側）を切り離す線（平たい魚）' },
};
export const CURVE_NAMES = Object.keys(CURVE_INFO);

// 点・線がどの部品に付いているか。動いた部品に付いたものは、その部品の動きに従う。null は動かない（休めの姿勢の魚に付く）。
export const ANCHOR_OWNER = {
  snout: 'head', eye: 'head', mouth: 'head', opercleTop: 'head', opercleBottom: 'head', pectoralBase: 'head', pelvicBase: 'head',
  headCutTop: null, headCutBottom: null, cavityStart: 'bone', vent: 'bone', dorsalFinStart: 'bone', dorsalFinEnd: 'bone',
  analFinStart: 'bone', analFinEnd: 'bone', peduncle: 'bone', tailTip: 'bone', spineHeadEnd: 'bone', bodyCenter: null,
};
/** 線の持ち主。側（L/R）のある線は、その側の身の根（L.dorsal / R.dorsal）。側のない線は、背骨の線だけ bone・ほかは null。 */
export function curveOwner(name, side) {
  const info = CURVE_INFO[name];
  if (!info) throw new Error(`カーブが無い: ${name}`);
  if (info.sides) return `${side}.dorsal`;
  return name === 'kidneyLine' || name === 'boneLift' ? 'bone' : null;
}

export const TOOL_IDS = ['deba', 'yanagi', 'petty', 'shears', 'tweezers', 'scaler'];
export const TOOL_LABELS = {
  deba: '出刃包丁', yanagi: '柳刃包丁', petty: 'ペティナイフ', shears: 'キッチンばさみ', tweezers: '骨抜き', scaler: 'うろこ取り',
};
export const MOTIONS = ['pull', 'push', 'press', 'slice', 'scrape', 'peel', 'pluck'];
export const LEADS = ['heel', 'mid', 'tip'];
export const CAMERA_PRESETS = ['cook', 'side', 'top', 'front', 'closeup'];
export const DIRS = ['L', 'R', 'F', 'B', 'U', 'D'];
export const EFFECT_KINDS = ['scales', 'water'];
export const UNIFORM_NAMES = ['scale', 'slitOpen', 'xray', 'scutes'];
export const WHO = ['dom', 'off'];

export const LIMITS = {
  title: 14, summary: 60, howLines: 3, how: 70, tip: 70, mistake: 70, done: 50, place: 40, safety: 60, label: 16, handText: 30,
  durationMin: 2500, durationMax: 9000, minSteps: 6, maxSteps: 22,
};
const BANNED = ['絶対', '100%', '世界初', '日本初', 'プロ並み', 'プロ級', '完全に安全', '必ず安全', '完璧'];

// 盤（まな板）の座標系: +x=右・+y=上・+z=手前（料理する人のほう）。魚の頭の向き(head)と背の向き(dorsal)で置き方が決まる。
export const DIR_VEC = { L: [-1, 0, 0], R: [1, 0, 0], F: [0, 0, 1], B: [0, 0, -1], U: [0, 1, 0], D: [0, -1, 0] };

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function posesPerpendicular(pose) {
  return !!pose && DIRS.includes(pose.head) && DIRS.includes(pose.dorsal) && dot(DIR_VEC[pose.head], DIR_VEC[pose.dorsal]) === 0;
}

/** 魚(FLF)→盤の変換。FLFの-x（頭の向き）が head、+y（背）が dorsal、+z（左体側）は x×y。 */
export function poseTransform(pose) {
  if (!posesPerpendicular(pose)) throw new Error(`pose の頭と背が直交していない: ${JSON.stringify(pose)}`);
  const hx = DIR_VEC[pose.head];
  const x = [-hx[0], -hx[1], -hx[2]];
  const y = DIR_VEC[pose.dorsal];
  const z = cross(x, y);
  // 列が x,y,z の回転行列 → クォータニオン
  const m00 = x[0], m10 = x[1], m20 = x[2], m01 = y[0], m11 = y[1], m21 = y[2], m02 = z[0], m12 = z[1], m22 = z[2];
  const tr = m00 + m11 + m22;
  let qx, qy, qz, qw;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2; qw = 0.25 * s; qx = (m21 - m12) / s; qy = (m02 - m20) / s; qz = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2; qw = (m21 - m12) / s; qx = 0.25 * s; qy = (m01 + m10) / s; qz = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2; qw = (m02 - m20) / s; qx = (m01 + m10) / s; qy = 0.25 * s; qz = (m12 + m21) / s;
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2; qw = (m10 - m01) / s; qx = (m02 + m20) / s; qy = (m12 + m21) / s; qz = 0.25 * s;
  }
  return { q: [qx, qy, qz, qw], p: pose.p ? [...pose.p] : [0, 0, 0] };
}

/** 文章の {L}/{R} を置き換える（右利き前提で書き、左利きは入れ替える）。残った波かっこは誤り。 */
export function resolveText(str, leftHanded = false) {
  const out = String(str).replaceAll('{L}', leftHanded ? '右' : '左').replaceAll('{R}', leftHanded ? '左' : '右');
  if (/[{}]/.test(out)) throw new Error(`未解決の記号: ${str}`);
  return out;
}

const isWin = (w) => Array.isArray(w) && w.length === 2 && w[0] >= 0 && w[1] <= 1 && w[0] < w[1];
const isVec3 = (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
const TOKEN_OK = (s) => !/[{}]/.test(String(s).replaceAll('{L}', '').replaceAll('{R}', ''));

/** 手順データの検証。誤りの一覧を返す（空なら合格）。pieceIds は実際に作れる部品、curveNames・anchorNames は解剖が返せるもの。 */
export function validateProcedure(raw, { pieceIds = ALL_PIECE_IDS, curveNames = CURVE_NAMES, anchorNames = ANCHOR_NAMES } = {}) {
  const errs = [];
  const E = (id, msg) => errs.push(`${id}: ${msg}`);
  const steps = raw && raw.steps;
  if (!Array.isArray(steps)) return ['steps が配列でない'];
  if (steps.length < LIMITS.minSteps || steps.length > LIMITS.maxSteps) errs.push(`手順の数が範囲外: ${steps.length}`);
  const seen = new Set();
  const textOk = (id, key, v, max) => {
    if (typeof v !== 'string' || !v.trim()) return E(id, `${key} が空`);
    if (v.length > max) E(id, `${key} が長い(${v.length}>${max})`);
    if (!TOKEN_OK(v)) E(id, `${key} の記号が {L}・{R} 以外`);
    for (const w of BANNED) if (v.includes(w)) E(id, `${key} に禁止語「${w}」`);
  };
  const anchorOk = (a) => typeof a === 'string' && (anchorNames.includes(a) || (a.startsWith('piece:') && pieceIds.includes(a.slice(6))));
  steps.forEach((st, i) => {
    const id = (st && st.id) || `#${i}`;
    if (!st || !/^[a-z0-9-]+$/.test(st.id || '')) return E(id, 'id が [a-z0-9-]+ でない');
    if (seen.has(st.id)) E(id, 'id が重複'); seen.add(st.id);
    textOk(id, 'title', st.title, LIMITS.title); textOk(id, 'summary', st.summary, LIMITS.summary);
    textOk(id, 'tip', st.tip, LIMITS.tip); textOk(id, 'mistake', st.mistake, LIMITS.mistake); textOk(id, 'done', st.done, LIMITS.done);
    textOk(id, 'place', st.place, LIMITS.place);
    if (!Array.isArray(st.how) || st.how.length < 1 || st.how.length > LIMITS.howLines) E(id, `how は1〜${LIMITS.howLines}行`);
    else st.how.forEach((h, k) => textOk(id, `how[${k}]`, h, LIMITS.how));
    if (st.safety !== undefined) textOk(id, 'safety', st.safety, LIMITS.safety);
    if (!Array.isArray(st.tools) || !st.tools.every((t) => TOOL_IDS.includes(t))) E(id, 'tools が不正');
    if (!posesPerpendicular(st.pose)) E(id, 'pose の頭と背が直交していない');
    if (!st.camera || !CAMERA_PRESETS.includes(st.camera.preset)) E(id, 'camera.preset が不正');
    else if (st.camera.focus !== undefined) {
      const f = st.camera.focus;
      const ok = typeof f === 'string' ? anchorOk(f) : isVec3(f) || (f && curveNames.includes(f.curve));
      if (!ok) E(id, `camera.focus が不正: ${JSON.stringify(f)}`);
    }
    if (!Number.isFinite(st.durationMs) || st.durationMs < LIMITS.durationMin || st.durationMs > LIMITS.durationMax) E(id, 'durationMs が範囲外');
    const cutIds = new Set();
    for (const c of st.cuts || []) {
      if (!c.id || cutIds.has(c.id)) E(id, `cuts の id が不正・重複: ${c.id}`); cutIds.add(c.id);
      if (!curveNames.includes(c.curve)) E(id, `cuts のカーブが無い: ${c.curve}`);
      else if (CURVE_INFO[c.curve] && CURVE_INFO[c.curve].sides && !SIDES.includes(c.side)) E(id, `cuts[${c.id}] に side が要る`);
      if (!TOOL_IDS.includes(c.tool)) E(id, `cuts の道具が不正: ${c.tool}`);
      if (!MOTIONS.includes(c.motion)) E(id, `cuts の motion が不正: ${c.motion}`);
      if (c.lead !== undefined && !LEADS.includes(c.lead)) E(id, 'cuts の lead が不正');
      if (c.angleDeg !== undefined && !(c.angleDeg >= 0 && c.angleDeg <= 90)) E(id, 'angleDeg が範囲外');
      if (!isWin(c.window)) E(id, `cuts[${c.id}] の window が不正`);
    }
    for (const m of st.moves || []) {
      if (!pieceIds.includes(m.piece)) E(id, `moves の部品が無い: ${m.piece}`);
      if (!isWin(m.window)) E(id, `moves[${m.piece}] の window が不正`);
      if (m.move !== undefined && !isVec3(m.move)) E(id, `moves[${m.piece}] の move が不正`);
      if (m.rot !== undefined && !(['x', 'y', 'z'].includes(m.rot.axis) && Number.isFinite(m.rot.deg))) E(id, `moves[${m.piece}] の rot が不正`);
      if (m.opacity !== undefined && !(m.opacity >= 0 && m.opacity <= 1)) E(id, `moves[${m.piece}] の opacity が範囲外`);
    }
    for (const [k, u] of Object.entries(st.uniforms || {})) {
      if (!UNIFORM_NAMES.includes(k)) E(id, `uniforms の名前が不正: ${k}`);
      else if (!(u && u.to >= 0 && u.to <= 1) || (u.window !== undefined && !isWin(u.window))) E(id, `uniforms.${k} が不正`);
    }
    for (const e of st.effects || []) {
      if (!EFFECT_KINDS.includes(e.kind) || !curveNames.includes(e.curve) || !isWin(e.window)) E(id, `effects が不正: ${JSON.stringify(e)}`);
    }
    for (const h of st.highlight || []) if (!curveNames.includes(h.curve)) E(id, `highlight のカーブが無い: ${h.curve}`);
    for (const h of st.hands || []) {
      if (!anchorOk(h.anchor) || !WHO.includes(h.who)) E(id, `hands が不正: ${JSON.stringify(h)}`);
      textOk(id, 'hands.text', h.text, LIMITS.handText);
    }
    for (const l of st.labels || []) {
      if (!anchorOk(l.anchor)) E(id, `labels のアンカーが無い: ${l.anchor}`);
      textOk(id, 'labels.text', l.text, LIMITS.label);
    }
    if (st.practice) {
      if (!cutIds.has(st.practice.cut)) E(id, 'practice.cut が cuts に無い');
      if (!(st.practice.tolerance > 0 && st.practice.tolerance < 3)) E(id, 'practice.tolerance が範囲外(cm)');
    }
  });
  return errs;
}

const hex = /^#[0-9a-fA-F]{6}$/;
/** 魚のデータの検証（形の数値は %SL。範囲は常識的な外れ値の検出用）。 */
export function validateSpecies(sp) {
  const errs = [];
  const E = (m) => errs.push(`${sp && sp.id}: ${m}`);
  if (!sp || !SPECIES_IDS.includes(sp.id)) return [`id が不正: ${sp && sp.id}`];
  if (!METHODS[sp.method]) E('method が不正');
  if (!FAMILIES.includes(sp.family)) E('family が不正');
  for (const k of ['name', 'nameFull', 'kana', 'season']) if (typeof sp[k] !== 'string' || !sp[k]) E(`${k} が空`);
  if (!(sp.difficulty >= 1 && sp.difficulty <= 5)) E('difficulty が範囲外');
  const s = sp.sizeCm || {};
  if (!(s.min > 0 && s.min <= s.typical && s.typical <= s.max && s.max < 300)) E('sizeCm が不正');
  const mi = sp.minutes || {};
  if (!(mi.skilled > 0 && mi.skilled <= mi.novice && mi.novice < 180)) E('minutes が不正');
  if (!Array.isArray(sp.similar)) E('similar が配列でない');
  const sh = sp.shape || {};
  const rng = (k, lo, hi) => { if (!(sh[k] >= lo && sh[k] <= hi)) E(`shape.${k} が範囲外(${lo}〜${hi}): ${sh[k]}`); };
  rng('TL_over_SL', 1, 1.5); rng('maxDepth', 5, 80); rng('maxDepthPos', 10, 70); rng('maxWidth', 3, 60);
  rng('peduncleDepth', 1, 15); rng('headLength', 15, 40); rng('opercleEdge', 12, 40);
  const c = (sp.look && sp.look.colors) || {};
  for (const k of ['dorsal', 'flank', 'belly', 'fin', 'iris']) if (!hex.test(c[k] || '')) E(`look.colors.${k} が #RRGGBB でない`);
  if (!['white', 'red', 'pink'].includes(sp.look && sp.look.flesh)) E('look.flesh が不正');
  return errs;
}
