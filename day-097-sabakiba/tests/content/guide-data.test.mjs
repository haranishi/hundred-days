import test from 'node:test';
import assert from 'node:assert/strict';
import safety from '../../lib/content/safety.js';
import parts from '../../lib/content/parts.js';
import glossary from '../../lib/content/glossary.js';
import { SPECIES_META, SPECIES_ORDER } from '../../lib/species/meta.js';
import { LIMITS, METHODS, SPECIES_IDS, TOOL_LABELS, validateSpecies } from '../../lib/contract.js';

const beginnerOrder = ['iwashi', 'aji', 'sanma', 'saba', 'kisu', 'tai', 'katsuo', 'hirame'];
const kana = /^[ぁ-ゖ]+$/u;

test('8種とも、部位の読み・場所・使い道と、保存・失敗したときの使い道がある', () => {
  assert.deepEqual(Object.keys(parts).sort(), [...SPECIES_IDS].sort());
  for (const [species, entry] of Object.entries(parts)) {
    assert.ok(Array.isArray(entry.parts) && entry.parts.length >= 2, species);
    assert.equal(new Set(entry.parts.map(part => part.id)).size, entry.parts.length, species);
    for (const { id, name, kana: reading, where, uses, note } of entry.parts) {
      assert.match(id, /^[a-z0-9-]+$/u);
      assert.ok(name.trim(), id);
      assert.match(reading, kana, name);
      assert.ok(where.trim() && !where.includes('\n'), name);
      assert.ok(Array.isArray(uses) && uses.length >= 2 && uses.length <= 4, name);
      assert.equal(new Set(uses).size, uses.length, name);
      assert.ok(uses.every(use => typeof use === 'string' && use.trim()), name);
      if (note !== undefined) assert.ok(note.trim(), name);
    }
    assert.ok(entry.parts.some(part => part.note?.trim()), species);
    assert.ok(entry.parts.some(part => part.name.includes('中骨')), species);
    assert.ok(entry.keep.trim() && entry.rescue.trim(), species);
  }
});

test('魚別の注意があり、ヒラメの寄生虫やカツオの保冷不良を食感の問題として扱わない', () => {
  const cautions = Object.fromEntries(Object.entries(parts).map(([id, { parts: entries }]) =>
    [id, entries.map(part => part.note ?? '').join('\n')]));
  assert.match(cautions.aji, /ぜいご/u);
  assert.match(cautions.iwashi, /鮮度/u);
  assert.match(cautions.saba, /傷み/u);
  assert.match(cautions.sanma, /内臓[^。]*丸焼き[^。]*中心/u);
  assert.match(cautions.tai, /硬いうろこ/u);
  assert.match(cautions.tai, /硬い骨/u);
  assert.match(cautions.hirame, /クドア[^。]*目で見分けられません/u);
  assert.match(cautions.kisu, /小骨/u);
  assert.match(cautions.katsuo, /ヒスタミン[^。]*加熱しても残る/u);
});

test('刺身は切った当日、加熱用の冷凍は魚ごとの品質の目安として案内する', () => {
  for (const [id, { keep }] of Object.entries(parts)) {
    if (id !== 'kisu' && id !== 'saba') assert.match(keep, /刺身[^。]*当日中/u, id);
    assert.match(keep, id === 'hirame' ? /冷凍[^。]*1〜2週間/u : /冷凍[^。]*約2週間/u, id);
    assert.match(keep, /品質|おいしく/u, id);
  }
  assert.match(parts.kisu.keep, /一般の切り身から見積もった/u);
  assert.match(parts.saba.keep, /翌日[^。]*冷蔵[^。]*加熱/u);
});

test('用語は重複せず、5つのおろし方を含み、読みと60字以内の説明がある', () => {
  assert.ok(Array.isArray(glossary) && glossary.length >= 25);
  const terms = new Set(glossary.map(entry => entry.term));
  assert.equal(terms.size, glossary.length);
  for (const term of [...Object.values(METHODS), '血合い', '血合い骨', '背わた']) assert.ok(terms.has(term), term);
  for (const { term, kana: reading, text } of glossary) {
    assert.ok(term.trim());
    assert.match(reading, /^[ぁ-ゖー]+$/u, term);
    assert.ok(text.trim() && [...text].length <= 60, term);
  }
});

test('魚の紹介は全8種が契約の画面項目を満たし、登録済みの道具を参照する', () => {
  assert.deepEqual(Object.keys(SPECIES_META).sort(), [...SPECIES_IDS].sort());
  for (const [id, fish] of Object.entries(SPECIES_META)) {
    assert.equal(fish.id, id);
    // 形と材質は別担当のデータで組み合わせる。画面項目は本番の検証をそのまま通す。
    const errors = validateSpecies(fish).filter(error => !/^[^:]+: (shape|look)\./u.test(error));
    assert.deepEqual(errors, []);
    assert.match(fish.kana, kana, id);
    for (const value of [fish.name, fish.nameFull, fish.season, ...fish.similar]) assert.ok(value.trim(), id);
    assert.ok(Number.isInteger(fish.difficulty), id);
    assert.ok([...Object.values(fish.sizeCm), ...Object.values(fish.minutes)].every(Number.isFinite), id);
    assert.ok(Array.isArray(fish.tools) && fish.tools.length > 0, id);
    assert.equal(new Set(fish.tools).size, fish.tools.length, id);
    assert.ok(fish.tools.every(tool => Object.hasOwn(TOOL_LABELS, tool)), id);
    const sentences = fish.blurb.match(/[^。]+。/gu) ?? [];
    assert.ok(sentences.length >= 1 && sentences.length <= 2 && sentences.join('') === fish.blurb, id);
    assert.ok(sentences.every(line => [...line].length <= LIMITS.summary), id);
    assert.ok(fish.minutes.skilled > 0 && fish.minutes.skilled <= fish.minutes.novice, id); // 所要時間は「目安」と画面のラベルで示す（紹介文には書かない）
  }
});

test('初心者向けの順に8種が一度ずつ並び、ヒラメが単独で最も難しい', () => {
  assert.deepEqual(SPECIES_ORDER, beginnerOrder);
  assert.deepEqual([...SPECIES_ORDER].sort(), [...SPECIES_IDS].sort());
  const levels = SPECIES_ORDER.map(id => SPECIES_META[id].difficulty);
  assert.deepEqual(levels.slice(0, 3), [1, 2, 2]);
  assert.deepEqual(levels, [...levels].sort((a, b) => a - b));
  assert.ok(levels.at(-1) > levels.at(-2));
});

test('一尾をおろす所要時間は調査が示した初心者・経験者の見積もりの範囲内', () => {
  const estimates = {
    iwashi: [[10, 10], [3, 5]], aji: [[20, 20], [10, 10]], sanma: [[15, 20], [5, 10]],
    saba: [[20, 30], [10, 15]], kisu: [[7, 12], [2, 4]], tai: [[30, 45], [10, 20]],
    katsuo: [[30, 50], [10, 20]], hirame: [[30, 45], [15, 25]],
  };
  for (const [id, [novice, skilled]] of Object.entries(estimates)) {
    const minutes = SPECIES_META[id].minutes;
    assert.ok(minutes.novice >= novice[0] && minutes.novice <= novice[1], id);
    assert.ok(minutes.skilled >= skilled[0] && minutes.skilled <= skilled[1], id);
  }
});

test('画面の文章に安全を保証する表現や契約の禁止語がない', () => {
  // contract.js の BANNED は非公開。この9語に、食品の安全を言い切る表現を加える。
  const banned = ['絶対', '100%', '世界初', '日本初', 'プロ並み', 'プロ級', '完全に安全', '必ず安全', '完璧',
    '安全です', '必ず防げ'];
  const copy = JSON.stringify([safety, parts, glossary, SPECIES_META]);
  for (const word of banned) assert.ok(!copy.includes(word), word);
});
