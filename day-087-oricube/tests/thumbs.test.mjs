// The picker's pictures are generated from each model's final pose. They are committed so the
// page loads them as plain files; this test fails while one is missing or out of date.
// Fix: node day-087-oricube/tools/make-thumbs.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { MODELS } from '../lib/models/index.js';
import { allThumbs, thumbPath } from '../tools/make-thumbs.mjs';

test('every model in the list has a picture', () => {
  for (const def of MODELS) assert.ok(existsSync(thumbPath(def.id)), `assets/thumb-${def.id}.svg is missing (run tools/make-thumbs.mjs)`);
});

test('committed pictures match a fresh render of the final pose', () => {
  for (const { id, svg } of allThumbs()) {
    if (!existsSync(thumbPath(id))) continue; // reported by the test above
    assert.equal(readFileSync(thumbPath(id), 'utf8'), svg, `assets/thumb-${id}.svg is stale (run tools/make-thumbs.mjs)`);
  }
});

test('pictures are small, self-contained SVG', () => {
  for (const { id, svg } of allThumbs()) {
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 100 100"/, id);
    assert.doesNotMatch(svg, /<script|href=|url\(/i, id);
    assert.ok(svg.length < 60_000, `${id} is ${svg.length} bytes`);
    assert.ok((svg.match(/<path /g) || []).length >= 2, `${id} draws something`);
  }
});
