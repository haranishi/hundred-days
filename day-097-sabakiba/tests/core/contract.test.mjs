// 契約（lib/contract.js）の試験。親の担当。担当者は消さない・直さない（直したいときは親へ報告）。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_PIECE_IDS, ANCHOR_NAMES, ANCHOR_OWNER, PIECE_PARENT, curveOwner, CURVE_INFO, CURVE_NAMES, DIRS, DIR_VEC, LIMITS, METHODS, PIECE_IDS, SPECIES_IDS, TOOL_IDS, TOOL_LABELS,
  poseTransform, posesPerpendicular, resolveText, validateProcedure, validateSpecies,
} from '../../lib/contract.js';

const rotate = (q, v) => { // クォータニオンでベクトルを回す
  const [x, y, z, w] = q; const [vx, vy, vz] = v;
  const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
};
const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);

test('定数: 名前に重複がなく、数が約束どおり', () => {
  for (const list of [SPECIES_IDS, PIECE_IDS, ALL_PIECE_IDS, ANCHOR_NAMES, CURVE_NAMES, TOOL_IDS, DIRS]) assert.equal(new Set(list).size, list.length);
  assert.equal(SPECIES_IDS.length, 8);
  assert.equal(Object.keys(METHODS).length, 5);
  assert.ok(TOOL_IDS.every((t) => TOOL_LABELS[t]));
  assert.ok(CURVE_NAMES.every((c) => typeof CURVE_INFO[c].sides === 'boolean' && typeof CURVE_INFO[c].inner === 'boolean'));
});

test('poseTransform: 頭が左・背が奥なら、魚の左体側(+z)が上を向く（まな板に右体側を下にして置く）', () => {
  const { q } = poseTransform({ head: 'L', dorsal: 'B' });
  assert.ok(near(rotate(q, [-1, 0, 0]), DIR_VEC.L), '魚の頭(-x)は盤の左');
  assert.ok(near(rotate(q, [0, 1, 0]), DIR_VEC.B), '魚の背(+y)は盤の奥');
  assert.ok(near(rotate(q, [0, 0, 1]), DIR_VEC.U), '魚の左体側(+z)は上');
});

test('poseTransform: 全ての直交する置き方で、頭・背が指定どおりで回転は右手系', () => {
  let n = 0;
  for (const head of DIRS) for (const dorsal of DIRS) {
    if (!posesPerpendicular({ head, dorsal })) continue;
    const { q } = poseTransform({ head, dorsal }); n++;
    assert.ok(near(rotate(q, [-1, 0, 0]), DIR_VEC[head]), `${head}/${dorsal} 頭`);
    assert.ok(near(rotate(q, [0, 1, 0]), DIR_VEC[dorsal]), `${head}/${dorsal} 背`);
    assert.ok(Math.abs(Math.hypot(...q) - 1) < 1e-9, '単位クォータニオン');
  }
  assert.equal(n, 24);
  assert.throws(() => poseTransform({ head: 'L', dorsal: 'R' }));
});

test('resolveText: 左利きで左右が入れ替わり、残った記号は例外', () => {
  assert.equal(resolveText('頭は{L}、{R}手に包丁'), '頭は左、右手に包丁');
  assert.equal(resolveText('頭は{L}、{R}手に包丁', true), '頭は右、左手に包丁');
  assert.throws(() => resolveText('{X}'));
});

const step = (over = {}) => ({
  id: 'head-cut', title: '頭を落とす', summary: '胸ビレの後ろから背骨まで斜めに切ります。', how: ['{R}手の出刃包丁を、胸ビレの後ろに当てます。'],
  tip: '背骨の手前で刃を止めず、ひと息で。', mistake: '力まかせに押すと身が崩れます。', done: '頭が体から離れた。', place: '頭は{L}、腹を手前に',
  tools: ['deba'], pose: { head: 'L', dorsal: 'B' }, camera: { preset: 'cook', focus: 'opercleTop' }, durationMs: 6000,
  cuts: [{ id: 'c1', curve: 'headCut', side: 'L', tool: 'deba', motion: 'pull', lead: 'heel', angleDeg: 25, window: [0.05, 0.55] }],
  moves: [{ piece: 'head', window: [0.6, 0.95], move: [-6, 0, 2], rot: { axis: 'y', deg: -10 } }],
  hands: [{ anchor: 'opercleTop', who: 'off', text: '{L}手で頭を押さえる' }], labels: [{ anchor: 'opercleTop', text: '鰓蓋' }],
  practice: { cut: 'c1', tolerance: 0.5 }, ...over,
});
const proc = (n = 6, over = {}) => ({ steps: Array.from({ length: n }, (_, i) => step({ id: `s${i}`, ...over })) });

test('validateProcedure: 正しい手順は合格する', () => assert.deepEqual(validateProcedure(proc()), []));

test('validateProcedure: 誤りを1つずつ検出する', () => {
  const bad = (over, re) => assert.ok(validateProcedure(proc(6, over)).some((m) => re.test(m)), `${JSON.stringify(over)} → ${re}`);
  bad({ title: 'あ'.repeat(LIMITS.title + 1) }, /title が長い/);
  bad({ summary: '' }, /summary が空/);
  bad({ how: [] }, /how は/);
  bad({ tools: ['hammer'] }, /tools/);
  bad({ pose: { head: 'L', dorsal: 'R' } }, /pose/);
  bad({ camera: { preset: 'fly' } }, /camera.preset/);
  bad({ durationMs: 100 }, /durationMs/);
  bad({ cuts: [{ id: 'c1', curve: 'nope', side: 'L', tool: 'deba', motion: 'pull', window: [0, 1] }] }, /カーブが無い/);
  bad({ cuts: [{ id: 'c1', curve: 'headCut', tool: 'deba', motion: 'pull', window: [0, 1] }] }, /side が要る/);
  bad({ cuts: [{ id: 'c1', curve: 'headCut', side: 'L', tool: 'deba', motion: 'pull', window: [0.6, 0.2] }] }, /window/);
  bad({ moves: [{ piece: 'tail', window: [0, 1] }] }, /部品が無い/);
  bad({ uniforms: { shine: { to: 1 } } }, /uniforms/);
  bad({ hands: [{ anchor: 'nowhere', who: 'off', text: 'x' }] }, /hands/);
  bad({ labels: [{ anchor: 'piece:L.dorsal', text: 'あ'.repeat(LIMITS.label + 1) }] }, /labels.text が長い/);
  bad({ practice: { cut: 'zz', tolerance: 0.5 } }, /practice.cut/);
  bad({ tip: '絶対に失敗しません。' }, /禁止語/);
  bad({ place: '頭は{X}に' }, /記号/);
  assert.ok(validateProcedure(proc(3)).some((m) => /手順の数/.test(m)));
  const dup = proc(); dup.steps[1].id = dup.steps[0].id;
  assert.ok(validateProcedure(dup).some((m) => /重複/.test(m)));
});

const species = () => ({
  id: 'aji', name: 'アジ', nameFull: 'マアジ', kana: 'あじ', method: 'sanmai', family: 'round', season: '春〜夏', difficulty: 1,
  sizeCm: { typical: 18, min: 12, max: 30 }, minutes: { novice: 20, skilled: 4 }, similar: ['コノシロ'],
  shape: { TL_over_SL: 1.2, maxDepth: 22, maxDepthPos: 33, maxWidth: 13, peduncleDepth: 4.5, headLength: 27, opercleEdge: 25 },
  look: { colors: { dorsal: '#3b6f8f', flank: '#b9c6cc', belly: '#f2f0ea', fin: '#d9d2a8', iris: '#d8b04a' }, flesh: 'white' },
});

test('validateSpecies: 正しいデータは合格・外れ値は検出', () => {
  assert.deepEqual(validateSpecies(species()), []);
  const s = species(); s.shape.maxDepth = 200; s.look.colors.fin = 'red'; s.difficulty = 9;
  const errs = validateSpecies(s).join('\n');
  assert.match(errs, /maxDepth/); assert.match(errs, /fin/); assert.match(errs, /difficulty/);
  assert.ok(validateSpecies({ id: 'unicorn' })[0].includes('id が不正'));
});

test('部品の親子: 親は実在し、循環せず、根は決まった部品だけ', () => {
  for (const [child, parent] of Object.entries(PIECE_PARENT)) {
    assert.ok(ALL_PIECE_IDS.includes(child) && ALL_PIECE_IDS.includes(parent), `${child}→${parent}`);
    let p = parent, n = 0;
    while (PIECE_PARENT[p]) { p = PIECE_PARENT[p]; assert.ok(++n < 5, `${child} が循環`); }
  }
  const roots = ALL_PIECE_IDS.filter((id) => !PIECE_PARENT[id]).sort();
  assert.deepEqual(roots, ['L.dorsal', 'R.dorsal', 'bone', 'head', 'viscera'].sort());
});

test('持ち主: 全アンカー・全カーブに決まった持ち主があり、実在の部品', () => {
  for (const a of ANCHOR_NAMES) assert.ok(a in ANCHOR_OWNER, a);
  for (const [a, o] of Object.entries(ANCHOR_OWNER)) assert.ok(o === null || ALL_PIECE_IDS.includes(o), a);
  for (const c of CURVE_NAMES) {
    const o = curveOwner(c, CURVE_INFO[c].sides ? 'L' : null);
    assert.ok(o === null || ALL_PIECE_IDS.includes(o), c);
  }
  assert.equal(curveOwner('skinPeel', 'R'), 'R.dorsal');
  assert.equal(curveOwner('boneLift', null), 'bone');
  assert.equal(curveOwner('bellySlit', null), null);
});
