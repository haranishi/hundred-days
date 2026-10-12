// 運行図の行と、同じ内容の文（要約・行ごと）。描画（SVG）は E2E で見る。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../lib/levels-data.js';
import { simulate, buildPath } from '../lib/sim.js';
import { chartRows, chartText, chartTrace } from '../lib/chart.js';

const L = Object.fromEntries(LEVELS.map((x) => [x.id, x]));
const run = (level, order, choices = {}) => simulate(level, {
  order,
  paths: Object.fromEntries(level.trains.map((t) => [t.id, buildPath(level, choices[t.id] || {})])),
});

describe('運行図の行', () => {
  it('出庫線・使われた駅（左から）・配膳の手前の順', () => {
    const sim = run(L.L2, ['t1', 't2'], { t1: { J1: 'J2' }, t2: { J1: 'J2' } });
    assert.deepStrictEqual(chartRows(L.L2, sim).map((r) => r.label), ['出庫線', '🔥焼く', '配膳の手前']);
  });

  it('同じ種類の駅は時間か近・遠、配膳へ入る線路が2本使われた面では長さで見分ける（上・下は使わない）', () => {
    const level = L.L3;
    const sim = run(level, level.solution.order, level.solution.choices);
    // 焼きにんじんは遠い焼き場から1分の線路で、お刺身は切る駅から2分の迂回線で配膳へ入る
    assert.deepStrictEqual(chartRows(level, sim).map((r) => r.label), ['出庫線', '🔪切る', '🔥焼く（近）', '🔥焼く（遠）', '配膳の手前（1分）', '配膳の手前（2分）']);
    const rows = chartRows(level, sim);
    assert.equal(rows.find((r) => r.label === '配膳の手前（2分）').key, 'e:e11');
  });
});

describe('運行図を文で', () => {
  it('手前の線路で待った分を、駅の行の文に入れる', () => {
    const sim = run(L.L2, ['t1', 't2'], { t1: { J1: 'J2' }, t2: { J1: 'J2' } });
    const { items, summary } = chartText(L.L2, sim);
    const grill = items.find((x) => x.label === '🔥焼く');
    assert.equal(grill.text, '焼きにんじん 3〜6分、ステーキ 6〜9分（その前に手前で2分待ち）');
    assert.match(summary, /いちばん長い待ちは🔥焼く駅の手前の2分（ステーキ）/);
  });

  it('焦げた駅と、車庫で待った分も文に出る', () => {
    const sim = run(L.L4, ['t1', 't2', 't3', 't4'], { t1: { J1: 'G2' } });
    const { items, summary, traces } = chartText(L.L4, sim);
    // 焦げた分＝仕上がり（9分）＋猶予1分＋1分＝11分。再生の「焦げた！」・運行図の✖と同じ分
    assert.match(summary, /焦げたのは🔥焼く駅（3分）（ゆで卵・11分）/);
    const g1 = items.find((x) => x.label === '🔥焼く（3分）');
    assert.match(g1.text, /ゆで卵 6〜11分（その前に手前で2分待ち）（うち2分は先が空くのを待った）・11分に焦げた/);
    assert.match(traces.find((t) => t.train === 't3').text, /🔥焼く（3分） 6〜11分（うち2分待ち）・11分に焦げた/);
    const yard = run(L.L5, ['t1', 't2', 't3', 't4'], { t4: { J1: 'G2' } });
    const exit = chartText(L.L5, yard).items.find((x) => x.label === '出庫線');
    assert.match(exit.text, /ローストビーフ 4〜5分（その前に車庫で1分待ち）/);
  });
});

describe('列車ごとの道のり（運行図を文で読む）：走っている時間も落とさない', () => {
  it('行のあいだの線路は「走る」にまとめ、出発から配膳まで途切れない', () => {
    const level = L.L1;
    const sim = run(level, level.solution.order, level.solution.choices);
    assert.deepStrictEqual(chartTrace(level, sim).map((t) => `${t.label}：${t.text}`), [
      '焼きにんじん：出庫線 0〜1分 → 走る 1〜3分 → 🔥焼く 3〜6分 → 配膳の手前 6〜7分 → 7分に着いた',
    ]);
  });

  it('手前の線路で待った分は「走る」に（うちN分待ち）で付く', () => {
    const sim = run(L.L2, ['t1', 't2'], { t1: { J1: 'J2' }, t2: { J1: 'J2' } });
    const steak = chartTrace(L.L2, sim).find((t) => t.train === 't2');
    assert.equal(steak.text, '出庫線 1〜2分 → 走る 2〜6分（うち2分待ち） → 🔥焼く 6〜9分 → 配膳の手前 9〜10分 → 10分に着いた');
  });

  it('出発前に車庫で待った分は先頭に出る', () => {
    const sim = run(L.L5, ['t1', 't2', 't3', 't4'], { t4: { J1: 'G2' } });
    const roast = chartTrace(L.L5, sim).find((t) => t.train === 't4');
    assert.equal(roast.text, '車庫で待つ 3〜4分 → 出庫線 4〜5分 → 走る 5〜7分 → 🔥焼く（遠） 7〜10分 → 走る 10〜12分 → 🔪切る（遠） 12〜14分 → 走る 14〜15分 → 配膳の手前 15〜16分 → 16分に着いた');
  });

  it('chartText は場所ごとの文に加えて、列車ごとの道のりを全列車ぶん返す', () => {
    const level = L.L6;
    const sim = run(level, level.solution.order, level.solution.choices);
    const { traces } = chartText(level, sim);
    assert.equal(traces.length, 5);
    for (const t of traces) assert.match(t.text, /^出庫線 \d+〜\d+分 → .* → \d+分に着いた$/);
  });
});

describe('焦げた分は、駅を出た分ではなく「仕上がり＋猶予＋1分」', () => {
  it('仕上がってから3分待たされたときも、✖と文の分は仕上がりの2分後（駅を出た分より前）', () => {
    // 面4：ステーキ・ゆで卵・煮物の列車を3分の焼く駅へ、焼き魚を4分の焼く駅へ。煮物の列車は11分に仕上がり、出口が空くのは14分
    const sim = run(L.L4, ['t1', 't2', 't3', 't4'], { t1: { J1: 'G1' }, t2: { J1: 'G2' }, t3: { J1: 'G1' }, t4: { J1: 'G1' } });
    const seg = sim.timeline.t4.find((x) => x.id === 'G1');
    assert.deepStrictEqual([seg.ready, seg.leave], [11, 14]);
    assert.equal(sim.results.find((r) => r.train === 't4').burnt, true);
    const { items, traces, summary } = chartText(L.L4, sim);
    assert.match(traces.find((t) => t.train === 't4').text, /🔥焼く（3分） 8〜14分（うち3分待ち）・13分に焦げた/);
    assert.match(items.find((x) => x.label === '🔥焼く（3分）').text, /にんじんの煮物 8〜14分.*・13分に焦げた/);
    assert.match(summary, /（にんじんの煮物・13分）/);
  });
});
