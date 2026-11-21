import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import safety from '../../lib/content/safety.js';

const topics = {
  anisakis: 'アニサキス', kudoa: 'クドア', histamine: 'ヒスタミン', bacteria: '腸炎ビブリオなど',
  toxic: '有毒魚', hygiene: '刺身の衛生', knife: 'けが', fresh: '鮮度',
};

// 委任用のコピーと統合先のどちらでも、同じ調査本文を使う。
function readResearch() {
  const paths = ['../../../spec/research/safety.md', '../../../.kiro/specs/day-097-sabakiba/research/safety.md'];
  const file = paths.map(path => new URL(path, import.meta.url)).find(url => existsSync(url));
  assert.ok(file, '照合に必要な research/safety.md がありません');
  return readFileSync(file, 'utf8');
}

function topicRow(research, id) {
  const row = research.split('\n').map(line => line.split('|')).find(([, heading]) =>
    heading?.trim().replace(/^\d+\s+/u, '') === topics[id]);
  assert.ok(row, `調査表に「${topics[id]}」がありません`);
  return row;
}

function body(id) {
  const { summary, detail } = safety.items.find(item => item.id === id);
  return [summary, ...detail].join('\n');
}

function assertShort(line, limit) {
  assert.equal(typeof line, 'string');
  assert.ok(line.trim() && !line.includes('\n') && [...line].length <= limit, line);
}

test('さばく前に：8項目を短い結論と2〜4行の説明で読める', () => {
  assert.deepEqual(safety.items.map(item => item.id), Object.keys(topics));
  for (const item of safety.items) {
    assert.ok(item.title.trim(), item.id);
    assertShort(item.summary, 50);
    assert.match(item.summary, /^[^。]+。$/u, item.id);
    assert.ok(Array.isArray(item.detail) && item.detail.length >= 2 && item.detail.length <= 4, item.id);
    for (const line of item.detail) assertShort(line, 80);
  }
});

test('8項目の確度・出典URL・リンクの資料名が調査記録と一致する', () => {
  const research = readResearch();
  const citations = new Map([...research.matchAll(/^\[([^\]]+)\]: (https:\/\/\S+) "(.+)"$/gmu)]
    .map(([, key, url, citation]) => [url, { key, citation }]));
  const confidences = { '○': 'verified', '△': 'partial' };
  for (const { id, sources, confidence } of safety.items) {
    const references = topicRow(research, id)[4].trim();
    const mark = references.at(-1);
    assert.ok(Object.hasOwn(confidences, mark), id);
    assert.equal(confidence, confidences[mark], id);
    assert.ok(Array.isArray(sources) && sources.length > 0, id);
    const citedKeys = new Set([...references.matchAll(/\[[^\]]+\]\[([^\]]+)\]/gu)].map(([, key]) => key));
    // 家庭での4℃以下の根拠は、衛生の行にある厚労省通知の出典注記にも明記されている。
    if (id === 'bacteria') citedKeys.add('time');
    for (const { label, url } of sources) {
      assert.equal(new URL(url).protocol, 'https:', url);
      const title = label.match(/^.+?「(.+)」$/u)?.[1];
      const source = citations.get(url);
      assert.ok(title && source?.citation.includes(title), `${id} ${label} ${url}`);
      assert.ok(citedKeys.has(source.key), `${id} の出典欄にない資料: ${label}`);
    }
  }
});

// 符号・単位・範囲をひとまとまりにし、別の欄の数字や出典URLの数字では合格させない。
function quantities(text) {
  const normalized = text.replaceAll('～', '〜');
  return normalized.match(/[−+\-]?\d+(?:\.\d+)?(?:〜[−+\-]?\d+(?:\.\d+)?)?(?:℃|時間|分|秒|週間|日|か月)?/gu) ?? [];
}

test('本文の数値は同じ衛生項目の調査本文に符号・単位を含めて存在する', () => {
  const research = readResearch();
  const allEvidence = new Set();
  for (const { id, title } of safety.items) {
    const row = topicRow(research, id);
    const evidence = new Set(quantities(row.slice(2, 4).join(' ')));
    for (const value of quantities(`${title}\n${body(id)}`)) {
      assert.ok(evidence.has(value), `${id} の調査本文に ${value} がありません`);
    }
    for (const value of evidence) allEvidence.add(value);
  }
  for (const value of quantities([safety.intro, ...safety.stepNotes].join('\n'))) {
    assert.ok(allEvidence.has(value), value);
  }
});

test('寄生虫の温度・時間は、対象・中心温度・完全凍結の起算点と組で読める', () => {
  const anisakis = body('anisakis');
  assert.match(anisakis, /−20℃以下[^。]*魚全体が完全に凍ってから24時間以上/u);
  assert.match(anisakis, /中心60℃で1分以上/u);
  assert.match(anisakis, /中心70℃以上[^。]*瞬時/u);
  const kudoa = body('kudoa');
  assert.match(kudoa, /−20℃で4時間以上/u);
  assert.match(kudoa, /中心75℃で5分以上/u);
});

test('生食用の保存基準、家庭の推奨温度、食べ終えるまでの時間を区別する', () => {
  assert.match(body('bacteria'), /生食用[^。]*切り身[^。]*10℃以下/u);
  assert.match(body('bacteria'), /家庭[^。]*できるだけ4℃以下/u);
  assert.match(body('hygiene'), /冷蔵庫から出してから食べ終えるまで[^。]*2時間以内/u);
  assert.match(body('histamine'), /10℃でも[^。]*長く/u);
});

test('冒頭で毒魚の扱いを示し、営業上の免許・登録には東京と大阪の例を付ける', () => {
  assert.match(safety.intro, /^釣ったフグはさばかず、持ち帰らない/u);
  assert.match(safety.intro, /ソウシハギや種類の分からない魚も食べない/u);
  for (const word of ['参考情報', '刃物', '生もの', '自己責任']) assert.ok(safety.intro.includes(word), word);
  const toxic = body('toxic');
  assert.match(toxic, /営業[^。]*条例/u);
  assert.match(toxic, /東京都[^。]*ふぐ取扱責任者[^。]*免許/u);
  assert.match(toxic, /大阪府[^。]*ふぐ処理登録者[^。]*登録/u);
});

test('手順に添える注意書きは10通りで、各24字以内', () => {
  assert.equal(safety.stepNotes.length, 10);
  assert.equal(new Set(safety.stepNotes).size, 10);
  const actions = [/冷や.*持ち帰/u, /前後.*石けん.*手/u, /柄.*拭/u, /刃.*指/u, /アジ.*尾.*うろこ/u,
    /内臓.*生.*食べ/u, /腹.*血.*洗/u, /ペーパー.*水気/u, /刺身用.*包丁/u, /盛り付け.*すぐ/u];
  safety.stepNotes.forEach((line, index) => {
    assertShort(line, 24);
    assert.match(line, actions[index]);
  });
});
