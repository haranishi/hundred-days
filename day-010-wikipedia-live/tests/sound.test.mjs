import test from "node:test";
import assert from "node:assert/strict";
import { SCALE, toneFor } from "../lib/sound.js";

test("toneFor は必ず音階の上に乗る", () => {
  for (const delta of [0, 1, -1, 12, 300, -2048, 99999]) {
    assert.ok(SCALE.includes(toneFor(delta).freq), `delta=${delta}`);
  }
});

test("toneFor は大きい編集ほど低く鳴らす", () => {
  const sizes = [0, 10, 100, 1000, 4096, 40000];
  const freqs = sizes.map((size) => toneFor(size).freq);
  for (let i = 1; i < freqs.length; i += 1) {
    assert.ok(freqs[i] <= freqs[i - 1], `${sizes[i - 1]} → ${sizes[i]}`);
  }
  assert.equal(freqs[0], SCALE[SCALE.length - 1], "0バイトはいちばん高い音");
  assert.equal(freqs[freqs.length - 1], SCALE[0], "上限を超えた編集はいちばん低い音");
});

test("toneFor は大きい編集ほど大きく長く鳴らす", () => {
  const small = toneFor(5);
  const large = toneFor(4096);
  assert.ok(large.gain > small.gain);
  assert.ok(large.durationMs > small.durationMs);
  // 耳を痛めない範囲に収める
  assert.ok(large.gain <= 0.15);
  assert.ok(large.durationMs <= 1200);
});

test("toneFor は増減の向きで音色を変える", () => {
  assert.equal(toneFor(210).timbre, "sine");
  assert.equal(toneFor(-210).timbre, "triangle");
  // 削っても足しても、大きさが同じなら高さは同じ
  assert.equal(toneFor(-210).freq, toneFor(210).freq);
});

test("toneFor は壊れた値でも鳴らせる値を返す", () => {
  for (const bad of [NaN, undefined, null, "210"]) {
    const tone = toneFor(bad);
    assert.ok(Number.isFinite(tone.freq) && tone.freq > 0, String(bad));
    assert.ok(tone.gain > 0);
  }
});
