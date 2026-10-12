// 結果の文（成功・焦げ・工程違い・遅れ）・一行・星の境界・共有文・場所と分岐の呼び方。
// 期待する文は、運行を手で追って確かめた（L2 の遅れ・L4 の焦げ・L5 の車庫待ちは、各列車の区間を分ごとに追った）。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { LEVELS } from '../lib/levels-data.js';
import { simulate, buildPath, starsOf } from '../lib/sim.js';
import { explainTrain, explainAll, headline, shareText, starsFor, starsWords, placeName, stationName, stationQualifiers, stationDistance, branchLabel, waitsOf, waitPlaces, blockersOf, timeLossLine, routeMinutes, shortestRouteForDish } from '../lib/explain.js';
import { chartText } from '../lib/chart.js';
import { allPlans } from './solver.mjs';

const L = Object.fromEntries(LEVELS.map((x) => [x.id, x]));
const run = (level, order, choices = {}) => simulate(level, {
  order,
  paths: Object.fromEntries(level.trains.map((t) => [t.id, buildPath(level, choices[t.id] || {})])),
});
const sample = (level) => run(level, level.solution.order, level.solution.choices);

describe('列車ごとの結果の文', () => {
  it('成功：料理名・到着・締切', () => {
    const r = explainTrain(L.L1, sample(L.L1), 't1');
    assert.equal(r.kind, 'ok');
    assert.equal(r.text, '焼きにんじん 7分（締切9分）');
    assert.equal(r.short, '7分');
  });

  it('工程違い：通った駅と注文の工程を並べる', () => {
    const r = explainTrain(L.L1, run(L.L1, ['t1']), 't1');
    assert.equal(r.kind, 'wrong');
    assert.equal(r.text, '通った駅は 🔪→🔥。注文は 🔥 だけ');
    assert.equal(r.short, '工程違い');
  });

  it('工程違い：どの駅も通らなかったとき', () => {
    // 面3の魚を、切る駅を通らない近道（分岐→分岐→配膳）へ
    const r = explainTrain(L.L3, run(L.L3, ['t1', 't2', 't3', 't4'], { t1: { J1: 'J2', J2: 'S' } }), 't1');
    assert.equal(r.text, 'どの駅も通らなかった。注文は 🔪 だけ');
  });

  it('遅れ：待たされた場所・待たせた相手の料理名と分数が文に入る', () => {
    // 面2：にんじんを先に出すと、牛肉は焼く駅の手前で2分待ち、10分着（締切8分）
    const sim = run(L.L2, ['t1', 't2'], { t1: { J1: 'J2' }, t2: { J1: 'J2' } });
    const r = explainTrain(L.L2, sim, 't2');
    assert.equal(r.kind, 'late');
    assert.equal(r.text, 'ステーキが2分遅れ。🔥焼く駅の手前で『焼きにんじん』に2分待たされた。待たされなければ8分に着いた');
    assert.equal(r.short, '2分遅れ');
    assert.equal(explainTrain(L.L2, sim, 't1').text, '焼きにんじん 7分（締切11分）');
  });

  it('遅れ：いちばん長く待った場所を出し、ほかの待ちは分数を足す', () => {
    // 面5：見本と逆の順。ひと口ステーキは 出庫線1分・切る駅（近）の手前1分・焼く駅（近）の手前2分 待つ（17分着・締切15分）
    const sim = run(L.L5, ['t1', 't2', 't3', 't4'], { t4: { J1: 'G2' } });
    const r = explainTrain(L.L5, sim, 't3');
    assert.equal(r.text, 'ひと口ステーキが2分遅れ。🔥焼く駅（近）の手前で『ステーキ』に2分待たされた。ほかでも2分待った。待たされなければ13分に着いた');
    assert.deepStrictEqual(waitPlaces(L.L5, sim, 't3').map((p) => [p.name, p.waited]), [['出庫線', 1], ['🔪切る駅（近）の手前', 1], ['🔥焼く駅（近）の手前', 2]]);
  });

  it('遅れ：出発前に車庫で待った分も「待たされた場所」に数える（sim は記録しない）', () => {
    // 同じ計画のローストビーフ：3分に出るはずが、出庫線にひと口ステーキが居座っていて4分に出た
    const sim = run(L.L5, ['t1', 't2', 't3', 't4'], { t4: { J1: 'G2' } });
    assert.deepStrictEqual(waitsOf(L.L5, sim, 't4').map((w) => [w.type, w.waited, w.blockedBy]), [['yard', 1, 't3']]);
    assert.equal(explainTrain(L.L5, sim, 't4').text, 'ローストビーフが4分遅れ。車庫で『ひと口ステーキ』に1分待たされた。待たされなくても15分かかる（締切12分）');
  });

  it('遅れ：どこでも待っていないときは、出た分とかかった分を出す', () => {
    const level = {
      id: 'X', no: 9, title: 'テスト', headway: 1, burnGrace: 1, par: 6,
      nodes: { Y: { kind: 'yard', pos: [0, 0] }, C: { kind: 'cut', pos: [0, 0] }, S: { kind: 'serve', pos: [0, 0] } },
      edges: [{ id: 'e1', from: 'Y', to: 'C', len: 1 }, { id: 'e2', from: 'C', to: 'S', len: 3 }],
      trains: [{ id: 't1', ingredient: 'fish', order: 'o1' }],
      orders: [{ id: 'o1', ingredient: 'fish', steps: ['cut'], due: 4 }],
    };
    const r = explainTrain(level, run(level, ['t1']), 't1');
    assert.equal(r.text, 'お刺身が2分遅れ。待たされてはいない。出発が1番目（0分後）で、道のりが6分かかり、6分に着く（締切4分）');
  });

  it('焦げ：焦げた駅・仕上がってから待った分・出口をふさいだ相手の料理名', () => {
    // 面4：登録順のまま、牛肉だけ4分の焼く駅へ。卵は3分の焼く駅で 6〜9分に仕上がるが、出口に焼き魚が居て11分まで出られない
    const sim = run(L.L4, ['t1', 't2', 't3', 't4'], { t1: { J1: 'G2' } });
    const r = explainTrain(L.L4, sim, 't3');
    assert.equal(r.kind, 'burnt');
    assert.equal(r.text, '🔥焼く駅（3分）で、仕上がってから2分待たされて焦げた。出口を『焼き魚』の列車がふさいでいた');
    assert.equal(r.short, '焦げた');
    assert.deepStrictEqual(explainAll(L.L4, sim).map((x) => x.kind), ['ok', 'ok', 'burnt', 'wrong']);
    assert.equal(explainTrain(L.L4, sim, 't4').text, '通った駅は 🔥。注文は 🍲 だけ');
  });
});

describe('遅れの内訳（面3）：待ちが原因か、道のりと出発順が原因か', () => {
  // 魚は切る駅→配膳への近道、ステーキは切らずに焼く、焼きにんじんは下の焼き場。ひと口ステーキの道（近い焼き場／遠い焼き場）と出発順だけを変える
  const base = { t1: { J1: 'C', J2: 'S' }, t2: { J1: 'J2' }, t4: { J1: 'J2', J3: 'G2' } };
  const near = {};
  const far = { J3: 'G2' };
  const t3 = (order, route) => explainTrain(L.L3, run(L.L3, order, { ...base, t3: route }), 't3');

  it('待ちだけが原因（待たされなければ締切に間に合った）。文の指示どおり、先にいた列車を後ろへ回していくと間に合う', () => {
    const first = t3(['t1', 't3', 't2', 't4'], near);
    assert.equal(first.text, 'ひと口ステーキが1分遅れ。🔪切る駅の手前で『お刺身』に1分待たされた。待たされなければ13分に着いた');
    assert.ok(first.withoutWaits <= 13);
    // お刺身を後ろへ回すと、次は上の焼き場でステーキに待たされる（これも待ちだけが原因）
    const second = t3(['t3', 't1', 't2', 't4'], near);
    assert.equal(second.text, 'ひと口ステーキが1分遅れ。🔥焼く駅（近）の手前で『ステーキ』に2分待たされた。待たされなければ12分に着いた');
    // ステーキを先に出すと間に合う（見本と同じ組み方）
    assert.equal(t3(['t2', 't3', 't1', 't4'], near).kind, 'ok');
  });

  it('道のりと出発順だけが原因（待たされていない）。もっと短い道で間に合うときだけ、その道のりを出す', () => {
    // 4番目（3分後）に出ると、一番短い道（12分）でも15分＞締切13分。道を変えても間に合わないので、短い道の一文は出さない
    const r = t3(['t1', 't2', 't4', 't3'], far);
    assert.equal(r.text, 'ひと口ステーキが4分遅れ。待たされてはいない。出発が4番目（3分後）で、道のりが14分かかり、17分に着く（締切13分）');
    assert.equal(r.waited, 0);
    assert.equal(r.withoutWaits, 17);
    // 1番目（0分後）なら、一番短い道（12分）で間に合う。このときだけ出す
    assert.equal(t3(['t3', 't2', 't1', 't4'], far).text, 'ひと口ステーキが1分遅れ。待たされてはいない。出発が1番目（0分後）で、道のりが14分かかり、14分に着く（締切13分）。同じ料理を作る道で一番短いのは道のり12分');
    assert.equal(t3(['t3', 't2', 't1', 't4'], near).kind, 'ok');
    // 短い道にしても4番目のままでは15分。文は出発順の問題として示す（短い道の一文は消える）
    assert.equal(t3(['t1', 't2', 't4', 't3'], near).text, 'ひと口ステーキが2分遅れ。待たされてはいない。出発が4番目（3分後）で、道のりが12分かかり、15分に着く（締切13分）');
    assert.equal(t3(['t1', 't2', 't3', 't4'], near).text, 'ひと口ステーキが1分遅れ。待たされてはいない。出発が3番目（2分後）で、道のりが12分かかり、14分に着く（締切13分）');
  });

  it('両方（待ちもあり、待たされなくても間に合わない）。評価者が面3で踏んだ形。短い道にして前へ出すと間に合う', () => {
    // 3番目（2分後）だと一番短い道でも14分＞13分なので、短い道の一文は出さない
    const r = t3(['t2', 't1', 't3', 't4'], far);
    assert.equal(r.text, 'ひと口ステーキが4分遅れ。🔪切る駅の手前で『お刺身』に1分待たされた。待たされなくても16分かかる（締切13分）');
    assert.equal(r.withoutWaits, 16);
    assert.equal(r.route, 14);
    assert.equal(r.shortest, 12);
    // 短い道にすると「待たされなくても14分」。まだ足りないので、お刺身より前に出すと間に合う
    assert.equal(t3(['t2', 't1', 't3', 't4'], near).text, 'ひと口ステーキが2分遅れ。🔪切る駅の手前で『お刺身』に1分待たされた。待たされなくても14分かかる（締切13分）');
    assert.equal(t3(['t2', 't3', 't1', 't4'], near).kind, 'ok');
  });
});

describe('待たせた相手を全員、分数つきで（合流では、先に出発した列車が先に進む）', () => {
  // 面5：ロースト→ステーキ→ひと口→お刺身、どれも工程どおりの進路。お刺身は11分から合流の先で待つが、
  // 11分はローストビーフ、12分は後から来たひと口ステーキ（出発が早い）が配膳への線路に入り、13分まで待つ
  const ch5 = { t4: { J1: 'G2' }, t2: { J1: 'J2' }, t3: {}, t1: { J2: 'J5' } };
  it('面5［ローストビーフ→ステーキ→ひと口ステーキ→お刺身］：お刺身の文に2両の名前と分数', () => {
    const sim = run(L.L5, ['t4', 't2', 't3', 't1'], ch5);
    const r = explainTrain(L.L5, sim, 't1');
    assert.equal(r.text, 'お刺身が2分遅れ。配膳の手前で『ローストビーフ』に1分、『ひと口ステーキ』に1分待たされた（合計2分）。ほかでも1分待った。待たされなければ11分に着いた');
    assert.deepStrictEqual(r.blockers, [{ train: 't4', minutes: 1 }, { train: 't3', minutes: 1 }]);
  });

  for (const level of LEVELS) {
    it(`${level.id}：どの待ちも、待たせた相手の分数の合計が待った分と一致し、自分は数えない（全計画）`, () => {
      for (const plan of allPlans(level)) {
        const sim = simulate(level, plan);
        for (const r of sim.results) {
          for (const w of waitsOf(level, sim, r.train)) {
            const b = blockersOf(level, sim, r.train, w);
            assert.equal(b.reduce((sum, x) => sum + x.minutes, 0), w.waited, `${r.train} ${w.type} ${w.id}`);
            assert.ok(b.every((x) => x.train !== r.train));
          }
          const places = waitPlaces(level, sim, r.train);
          for (const p of places) assert.equal(p.blockers.reduce((sum, x) => sum + x.minutes, 0), p.waited);
        }
      }
    });

    it(`${level.id}：「一番短い道」の一言は、その道なら待たずに間に合うときだけ出る（全計画）`, () => {
      for (const plan of allPlans(level)) {
        const sim = simulate(level, plan);
        for (const row of explainAll(level, sim)) {
          if (row.kind !== 'late') continue;
          const start = sim.results.findIndex((x) => x.train === row.train) * (level.headway ?? 1);
          const route = routeMinutes(level, plan.paths[row.train]);
          const short = shortestRouteForDish(level, row.train);
          const want = short < route && start + short <= row.due;
          assert.equal(row.text.includes('一番短いのは道のり'), want, row.text);
        }
      }
    });
  }
});

describe('★1・★2のクリアで、時間をどこで失ったか', () => {
  const ch5 = { t4: { J1: 'G2' }, t2: { J1: 'J2' }, t3: {}, t1: { J2: 'J5' } };
  it('いちばん長く待った列車と場所（面5：ロースト→ステーキ→お刺身→ひと口は15分・★1）', () => {
    const sim = run(L.L5, ['t4', 't2', 't1', 't3'], ch5);
    assert.equal(sim.cleared, true);
    assert.equal(sim.finish, 15);
    assert.equal(timeLossLine(L.L5, sim), '最短は13分。あと2分縮められる。いちばん待たされたのは『ひと口ステーキ』（🔪切る駅（近）の手前で1分）');
  });
  it('待ちが無いときは、出発順か道のりを変えるよう言う（面5：ロースト→お刺身→ステーキ→ひと口は14分・★2）', () => {
    const sim = run(L.L5, ['t4', 't1', 't2', 't3'], ch5);
    assert.equal(sim.cleared, true);
    assert.equal(sim.finish, 14);
    assert.equal(timeLossLine(L.L5, sim), '最短は13分。あと1分縮められる。待たされた列車は無い。出発順か道のりを変えると縮まる');
  });
});

describe('結果の一行', () => {
  it('最短でクリア／あと何分で★★★／見本でクリア', () => {
    assert.equal(headline(L.L1, sample(L.L1), { stars: 3 }), '完食！ 7分 最短ダイヤ！');
    assert.equal(headline(L.L1, { cleared: true, finish: 8, problems: [] }, { stars: 2 }), '完食！ 8分 あと1分で★★★');
    assert.equal(headline(L.L1, { cleared: true, finish: 10, problems: [] }, { stars: 1 }), '完食！ 10分 あと3分で★★★');
    assert.equal(headline(L.L1, sample(L.L1), { stars: 1, usedSample: true }), '完食！ 7分 見本のダイヤなので★1');
  });

  it('失敗：失敗した料理の数と種類', () => {
    assert.equal(headline(L.L1, run(L.L1, ['t1']), { stars: 0 }), '焼きにんじんが工程違い');
    assert.equal(headline(L.L2, run(L.L2, ['t1', 't2'], { t1: { J1: 'J2' }, t2: { J1: 'J2' } }), { stars: 0 }), '2つの注文のうち1つが遅れた');
    assert.equal(headline(L.L4, run(L.L4, ['t1', 't2', 't3', 't4'], { t1: { J1: 'G2' } }), { stars: 0 }), '4つの注文のうち2つが失敗（焦げ1・工程違い1）');
    assert.equal(headline(L.L3, run(L.L3, ['t1', 't2', 't3', 't4']), { stars: 0 }), '4つの注文のうち4つが失敗（工程違い3・遅れ1）');
  });
});

describe('星の境界', () => {
  const level = L.L4; // par 22
  const cleared = (finish) => ({ cleared: true, finish, problems: [] });
  it('finish が par／par+1／par+2 のとき ★3／★2／★1。失敗は0', () => {
    assert.equal(starsFor(level, cleared(22), starsOf), 3);
    assert.equal(starsFor(level, cleared(23), starsOf), 2);
    assert.equal(starsFor(level, cleared(24), starsOf), 1);
    assert.equal(starsFor(level, { cleared: false, finish: 22, problems: [{}] }, starsOf), 0);
  });
  it('見本を使ったクリアは★1（失敗は0のまま）', () => {
    assert.equal(starsFor(level, cleared(22), starsOf, { usedSample: true }), 1);
    assert.equal(starsFor(level, { cleared: false, finish: 30, problems: [{}] }, starsOf, { usedSample: true }), 0);
  });
  it('読み上げ用の言葉', () => {
    assert.equal(starsWords(3), '星3つ');
    assert.equal(starsWords(0), '失敗');
  });
});

describe('共有文', () => {
  it('「定刻ごはん Day65｜面{n}「{題}」★{星} {finish}分で完食 #100日チャレンジ #個人開発」', () => {
    assert.equal(shareText(L.L3, 2, 15), '定刻ごはん Day65｜面3「ふたつの焼き場」★2 15分で完食 #100日チャレンジ #個人開発');
  });
});

describe('場所と分岐の呼び方', () => {
  // 線路の区間は、その列車の timeline の中の区間（次に着く駅を探すのに使う）
  const segOf = (sim, train, id) => sim.timeline[train].find((x) => x.id === id);

  it('線路は「その列車が次に着く駅の手前」と呼ぶ（次に駅が無ければ配膳の手前）。分岐・合流の名前は使わない', () => {
    const one = run(L.L1, ['t1'], { t1: { J1: 'J2' } }); // 分岐→合流→焼く駅
    assert.equal(placeName(L.L1, segOf(one, 't1', 'e1'), one.timeline.t1), '出庫線');
    assert.equal(placeName(L.L1, segOf(one, 't1', 'e3'), one.timeline.t1), '🔥焼く駅の手前'); // 合流へ入る線路（以前は「合流の手前」）
    assert.equal(placeName(L.L1, segOf(one, 't1', 'e5'), one.timeline.t1), '🔥焼く駅の手前');
    assert.equal(placeName(L.L1, segOf(one, 't1', 'e6'), one.timeline.t1), '配膳の手前');
    const cut = run(L.L1, ['t1']);
    assert.equal(placeName(L.L1, segOf(cut, 't1', 'e2'), cut.timeline.t1), '🔪切る駅の手前');
    // 面3：分岐へ入る同じ線路（e4）でも、その先の行き先で呼び方が変わる
    const three = run(L.L3, ['t1', 't2', 't3', 't4'], { t1: { J1: 'J2', J2: 'S' }, t2: { J1: 'J2' } });
    assert.equal(placeName(L.L3, segOf(three, 't1', 'e4'), three.timeline.t1), '配膳の手前');
    assert.equal(placeName(L.L3, segOf(three, 't2', 'e4'), three.timeline.t2), '🔥焼く駅（近）の手前');
    assert.equal(placeName(L.L1, { type: 'station', id: 'G' }), '🔥焼く駅');
    assert.equal(placeName(L.L1, { type: 'yard' }), '車庫');
  });

  it('同じ種類の駅が複数ある面では、時間がちがえば時間、同じなら出庫線からの道のりで「近」「遠」', () => {
    assert.deepStrictEqual(stationQualifiers(L.L3), { C: '', G1: '近', G2: '遠' });
    assert.deepStrictEqual(stationQualifiers(L.L4), { G1: '3分', G2: '4分', M: '' });
    assert.deepStrictEqual(stationQualifiers(L.L5), { C1: '近', C2: '遠', G1: '近', G2: '遠' });
    assert.deepStrictEqual(stationQualifiers(L.L6), { C: '', G: '近', M: '', G2: '遠' });
    assert.equal(stationName(L.L5, 'C2'), '🔪切る駅（遠）');
    assert.equal(stationName(L.L5, 'G1', { icon: false, suffix: '' }), '焼く（近）');
  });

  it('道のり：出庫線から一度も待たずに着く分。同じなら、その駅を通って配膳駅までの道のりで比べる', () => {
    assert.deepStrictEqual(stationDistance(L.L3, 'G1'), { reach: 4, through: 9 }); // 1+1+1+1 ／ +焼く3+1+1
    assert.deepStrictEqual(stationDistance(L.L3, 'G2'), { reach: 5, through: 11 }); // 遠い焼き場は線路が2分
    assert.deepStrictEqual(stationDistance(L.L6, 'G'), { reach: 3, through: 10 });
    assert.deepStrictEqual(stationDistance(L.L6, 'G2'), { reach: 4, through: 12 });
    // 面5の焼く駅は着く分が同じ（3分）。配膳までの道のりで「近」（上の線 8分）と「遠」（下の線 10分）
    assert.deepStrictEqual(stationDistance(L.L5, 'G1'), { reach: 3, through: 8 });
    assert.deepStrictEqual(stationDistance(L.L5, 'G2'), { reach: 3, through: 10 });
  });

  it('どの面でも、同じ種類の駅は時間か道のりで必ず区別できる（上下・左右の呼び方は使わない）', () => {
    for (const level of LEVELS) {
      const q = stationQualifiers(level);
      for (const v of Object.values(q)) assert.match(v, /^(|\d+分|近|遠)$/, `${level.id} ${v}`);
      const kinds = {};
      for (const [id, n] of Object.entries(level.nodes)) if (q[id] !== undefined) (kinds[n.kind] ||= []).push(id);
      for (const ids of Object.values(kinds)) {
        if (ids.length < 2 || q[ids[0]].endsWith('分')) continue;
        const d = ids.map((id) => stationDistance(level, id));
        assert.ok(d[0].reach !== d[1].reach || d[0].through !== d[1].through, `${level.id} ${ids.join('/')} の道のりが同じ`);
      }
    }
  });

  it('分岐ボタンの名前は、出口の先を列車の選択どおりにたどった最初の駅（か配膳駅）', () => {
    assert.equal(branchLabel(L.L1, {}, 'J1', 'J2'), '分岐 焼く駅へ');
    assert.equal(branchLabel(L.L1, {}, 'J1', 'C'), '分岐 切る駅へ');
    assert.deepStrictEqual(['G1', 'G2', 'M'].map((to) => branchLabel(L.L4, {}, 'J1', to)), ['分岐 焼く駅（3分）へ', '分岐 焼く駅（4分）へ', '分岐 煮る駅へ']);
    assert.equal(branchLabel(L.L3, {}, 'J2', 'S'), '分岐 配膳駅へ');
    assert.equal(branchLabel(L.L3, { J2: 'J3', J3: 'G2' }, 'J1', 'J2'), '分岐 焼く駅（遠）へ');
    assert.equal(branchLabel(L.L6, {}, 'J2', 'J3'), '分岐 配膳駅へ');
  });
});

describe('結果の文と運行図は、待った場所を同じ呼び方・同じ分数で示す', () => {
  // 正しい料理になる全計画（allPlans）で、遅れた列車の文が名指しした場所を、運行図の文（場所ごと）でも見つける
  const rowFor = (level, place) => {
    if (place === '車庫' || place === '出庫線') return ['出庫線'];
    if (place === '配膳の手前') return ['配膳の手前', '配膳の手前（'];
    const name = place.replace(/の手前$/, '');
    const id = Object.keys(level.nodes).find((n) => level.nodes[n].kind !== 'junction' && stationName(level, n) === name);
    return [stationName(level, id, { suffix: '' })];
  };
  for (const level of LEVELS) {
    it(`${level.id}：文の「〇〇で合計N分待った」が、運行図の同じ場所の行に同じ分数で出る。「合流」「分岐の手前」は出ない`, () => {
      let checked = 0;
      for (const plan of allPlans(level)) {
        const sim = simulate(level, plan);
        const { items } = chartText(level, sim);
        for (const row of explainAll(level, sim)) {
          assert.doesNotMatch(row.text, /合流|分岐の手前|（上）|（下）/, row.text);
          if (row.kind !== 'late' || !row.waited) continue;
          const labels = rowFor(level, row.place);
          const item = items.find((x) => labels.some((l) => (l.endsWith('（') ? x.label.startsWith(l) : x.label === l)) && x.text.includes(`${row.dish} `));
          assert.ok(item, `${row.place} の行が運行図に無い：${row.text}`);
          const part = item.text.split('、').find((t) => t.startsWith(`${row.dish} `));
          const want = row.place === '車庫' ? `（その前に車庫で${row.waited}分待ち）`
            : row.place === '出庫線' || !row.place.endsWith('の手前') ? `（うち${row.waited}分は先が空くのを待った）`
              : `（その前に手前で${row.waited}分待ち）`;
          assert.ok(part.includes(want), `${row.text} ／ 運行図：${part}`);
          checked += 1;
        }
      }
      if (['L3', 'L4', 'L5', 'L6'].includes(level.id)) assert.ok(checked > 0, '遅れて待った列車が1つも無かった');
    });
  }
});

describe('保存の定数名', () => {
  it('配信するコードに「_KEY」で終わる定数名が無い（gitleaks がAPIキーと誤検知した前例）', () => {
    const dir = new URL('../lib/', import.meta.url);
    for (const name of readdirSync(dir)) {
      const src = readFileSync(new URL(name, dir), 'utf8');
      assert.doesNotMatch(src, /\b[A-Z][A-Z0-9_]*_KEY\b/, `${name} に _KEY で終わる名前がある`);
    }
    const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
    assert.doesNotMatch(app, /\b[A-Z][A-Z0-9_]*_KEY\b/);
  });
});
