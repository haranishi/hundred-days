// 折り返しのかたまり分け：つなげると元に戻り、名前・数と単位・場所が1つのかたまりになる。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { phraseSegments, chunkSegments } from '../lib/phrase.js';
import { LEVELS } from '../lib/levels-data.js';

const kept = (text) => phraseSegments(text).filter((s) => s.keep).map((s) => s.text);

describe('かたまり分け', () => {
  it('つなげると元の文に戻る（面のヒント全部）', () => {
    for (const L of LEVELS) assert.equal(phraseSegments(L.hint).map((s) => s.text).join(''), L.hint);
  });

  it('遅れの文：料理名・場所・合計の分・『』の名前と閉じ括弧が、それぞれ1つのかたまり', () => {
    assert.deepStrictEqual(
      kept('ステーキが2分遅れ。🔥焼く駅の手前で合計2分待った（先にいたのは『焼きにんじん』）'),
      ['ステーキ', '2分遅れ', '🔥焼く駅の手前', '合計2分', '『焼きにんじん』）'],
    );
  });

  it('工程違いの文：工程アイコンの並びと「だけ」', () => {
    assert.deepStrictEqual(kept('通った駅は 🔪→🔥。注文は 🔥 だけ'), ['🔪→🔥', '🔥 だけ']);
  });

  it('遅れの内訳の文：道のり・待たされなくてもの分・締切', () => {
    assert.deepStrictEqual(
      kept('待たされなくても16分かかる（締切13分）。同じ料理を作る道で一番短いのは道のり12分'),
      ['16分', '締切13分', '道のり12分'],
    );
  });

  it('結果の一行：数と、失敗の種類と数', () => {
    assert.deepStrictEqual(kept('4つの注文のうち2つが失敗（焦げ1・工程違い1）'), ['4つ', '2つ', '焦げ1', '工程違い1']);
    assert.deepStrictEqual(kept('焼きにんじんが工程違い'), ['焼きにんじん', '工程違い']);
  });

  it('見分けの付いた駅の名前と、締切の分', () => {
    assert.deepStrictEqual(kept('🔥焼く駅（3分）で、仕上がってから2分待たされて焦げた'), ['🔥焼く駅（3分）', '2分']);
    assert.deepStrictEqual(kept('ひと口ステーキ 16分（締切17分）'), ['ひと口ステーキ', '16分', '締切17分']);
  });
});

// 文節の切れ目だけで折り返す：語の途中（「ど／ちら」「焦げ／る」「待た／されなければ」）では切らない
describe('文節のかたまり分け（chunkSegments）', () => {
  const chunks = (text) => chunkSegments(text).filter((s) => s.text.trim()).map((s) => s.text);
  const SENTENCES = [
    '待たされなければ8分に着いた',
    'ステーキが2分遅れ。🔥焼く駅の手前で『焼きにんじん』に2分待たされた。待たされなければ8分に着いた',
    'お刺身が2分遅れ。配膳の手前で『ローストビーフ』に1分、『ひと口ステーキ』に1分待たされた（合計2分）。ほかでも1分待った。待たされなければ11分に着いた',
    '🔥焼く駅（3分）で、仕上がってから2分待たされて焦げた。出口を『焼き魚』の列車がふさいでいた',
    '通った駅は 🔪→🔥。注文は 🔥 だけ',
    '4つの注文のうち2つが失敗（焦げ1・工程違い1）',
    '完食！ 21分 見本のダイヤなので★1',
    '帯（列車の色・出発番号）＝その区間にいた時間',
  ];

  it('つなげると元の文に戻る（面のヒント全部と、結果の文・凡例の例）', () => {
    for (const text of [...LEVELS.map((L) => L.hint), ...SENTENCES]) {
      assert.equal(chunkSegments(text).map((s) => s.text).join(''), text);
    }
  });

  it('面のヒント：助詞のあとと句読点のあとで切り、語の中では切らない', () => {
    assert.deepStrictEqual(chunks(LEVELS[1].hint), ['同じ焼き場に', '並ぶと、', 'あとの', '列車は', '待たされる。', 'どちらを', '先に', '出そう？']);
    assert.deepStrictEqual(chunks(LEVELS[3].hint), ['🔥🍲は、', '仕上がってから', '1分以内に', '出ないと', '焦げる。', '出口の', '線路がふさがっていないか', '見よう。']);
    assert.deepStrictEqual(chunks(LEVELS[4].hint), ['「切ってから焼く」と', '「焼いてから切る」は', '別の', '料理。', '通る順番が', 'レシピになる。']);
  });

  it('評価で割れた語が、1つのかたまりのまま：どちらを・焦げる。・料理。・待たされなければ・列車が・出口を・仕上がってから・区間にいた時間', () => {
    const all = [...LEVELS.map((L) => L.hint), ...SENTENCES].flatMap(chunks);
    for (const word of ['どちらを', '焦げる。', '料理。', '待たされなければ', '出口を', '仕上がってから', '切るだけで', '焼き場は']) {
      assert.ok(all.some((c) => c === word), `「${word}」が1つのかたまりになっていない`);
    }
    assert.ok(all.some((c) => c.startsWith('列車が')), '「列車が」が割れている');
    assert.ok(all.some((c) => c.includes('区間にいた時間')), '「区間にいた時間」が割れている');
  });

  it('文末の「。」「、」「）」は、前のかたまりに付く（行頭に来ない）', () => {
    for (const text of SENTENCES) {
      for (const c of chunks(text)) assert.ok(!/^[、。，．！？）」』]/u.test(c), `行頭に来る句読点：${c}`);
    }
  });

  it('場所の名前「配膳の手前」は1つのかたまり。直後の助詞も付く', () => {
    assert.ok(chunks('お刺身が2分遅れ。配膳の手前で『ローストビーフ』に1分待たされた').includes('配膳の手前で'));
  });

  it('助詞は、直前の名前・数と単位に付く（「ステーキが」「5つの」）', () => {
    assert.ok(chunks('ステーキが2分遅れ').includes('ステーキが'));
    assert.ok(chunks(LEVELS[5].hint).includes('5つの'));
  });

  it('18文字を超えるかたまりは、折れない span にしない（狭い幅ではみ出さない）', () => {
    const long = 'あいうえおかきくけこさしすせそたちつてとなにぬねの';
    assert.equal(chunkSegments(long).every((s) => !s.keep || [...s.text].length <= 18), true);
  });
});
