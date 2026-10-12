// 地図の高さ（面ごとの viewBox）と、2分以上の線路の分の札の置き場所。描画（SVG）は E2E で見る。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../lib/levels-data.js';
import { mapView, lengthTags, VIEW } from '../lib/render.js';

const L = Object.fromEntries(LEVELS.map((x) => [x.id, x]));

describe('地図の高さ（viewBox）', () => {
  it('駅・分岐・曲げ点の y の範囲に、上下26の余白を足した高さ（盤の0〜240を超えない）。上端に近い火の駅があれば、文字の分だけ上を広げる', () => {
    assert.deepStrictEqual(mapView(L.L1), { top: 34, h: 112 });
    assert.deepStrictEqual(mapView(L.L2), { top: 34, h: 112 });
    assert.deepStrictEqual(mapView(L.L3), { top: 22, h: 218 }); // 上の焼き場（y64）の上に文字の分
    assert.deepStrictEqual(mapView(L.L4), { top: 8, h: 208 }); // 上の焼き場（y50）の上に文字の分
    assert.deepStrictEqual(mapView(L.L5), { top: 0, h: 240 });
    assert.deepStrictEqual(mapView(L.L6), { top: 0, h: 232 });
  });

  it('どの面でも、全ノードと曲げ点が地図の中に入る', () => {
    for (const level of LEVELS) {
      const { top, h } = mapView(level);
      const ys = [...Object.values(level.nodes).map((n) => n.pos[1]), ...level.edges.flatMap((e) => (e.via ?? []).map((p) => p[1]))];
      for (const y of ys) assert.ok(y >= top && y <= top + h, `${level.id} y=${y}`);
      assert.ok(top >= 0 && top + h <= VIEW.h);
    }
  });
});

describe('分の札', () => {
  const branchesOf = (level) => Object.keys(level.nodes)
    .filter((id) => level.nodes[id].kind === 'junction' && level.edges.filter((e) => e.from === id).length > 1)
    .map((id) => level.nodes[id].pos);
  const gap = (b, [x, y]) => Math.hypot(Math.max(b[0] - x, 0, x - b[2]), Math.max(b[1] - y, 0, y - b[3]));
  const overlap = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

  it('2分以上の線路にだけ出る（1分の線路には出ない）', () => {
    for (const level of LEVELS) {
      const want = level.edges.filter((e) => e.len >= 2).map((e) => e.id).sort();
      assert.deepStrictEqual(lengthTags(level).map((t) => t.edge).sort(), want, level.id);
    }
    assert.deepStrictEqual(lengthTags(L.L1), []);
  });

  it('面3：遠い焼き場（下）の側の線路に札が出て、近い焼き場（上）の側には出ない', () => {
    const tags = lengthTags(L.L3).map((t) => t.edge);
    assert.ok(tags.includes('e8') && tags.includes('e9'), '下の焼き場へ行く線路・出る線路');
    assert.ok(!tags.includes('e6') && !tags.includes('e7'), '上の焼き場の線路');
  });

  it('分岐ボタン（320px幅で半径約27単位）・建物・ほかの札・地図の端にかからない', () => {
    for (const level of LEVELS) {
      const view = mapView(level);
      const tags = lengthTags(level);
      const branches = branchesOf(level);
      tags.forEach((t, i) => {
        assert.equal(t.fallback, false, `${level.id} ${t.edge} の置き場所が見つからなかった`);
        for (const c of branches) assert.ok(gap(t.box, c) >= 28, `${level.id} ${t.edge} が分岐ボタンにかかる`);
        assert.ok(t.box[1] >= view.top && t.box[3] <= view.top + view.h && t.box[0] >= 0 && t.box[2] <= VIEW.w, `${level.id} ${t.edge} が地図の外`);
        // 建物の形（描画と同じ）：駅は±29×±21、車庫は屋根まで、配膳駅は右上の旗まで
        const shape = { junction: [-6.5, -6.5, 6.5, 6.5], yard: [-20, -24, 20, 15], serve: [-17, -36, 24, 20] };
        for (const n of Object.values(level.nodes)) {
          const [x, y] = n.pos;
          const d = shape[n.kind] ?? [-29, -21, 29, 21];
          assert.ok(!overlap(t.box, [x + d[0], y + d[1], x + d[2], y + d[3]]), `${level.id} ${t.edge} が建物にかかる`);
        }
        tags.slice(i + 1).forEach((u) => assert.ok(!overlap(t.box, u.box), `${level.id} ${t.edge} と ${u.edge} が重なる`));
      });
    }
  });
});
