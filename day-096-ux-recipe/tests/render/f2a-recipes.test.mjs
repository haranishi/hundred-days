import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFromRecipe } from '../../lib/recipes.js';
import { renderPage } from '../../lib/render.js';
import { diagnose } from '../../lib/rules.js';

test('参加レシピでは日程と料金を読み、過去の実績を確かめてから申し込める', () => {
  const state = buildFromRecipe('event');
  const html = renderPage(state, { mode: 'export' });
  const sections = [...html.matchAll(/<section class="uxr-block uxr-(\w+)/g)].map(m => m[1]);
  const relevant = sections.filter(type => ['schedule', 'menu', 'plans', 'proof', 'limited', 'form', 'cta'].includes(type));
  assert.deepEqual(relevant, ['schedule', 'menu', 'proof', 'limited', 'form']);
  const report = diagnose(state);
  assert.ok(report.score >= 85 && report.stages.length === 5 && report.stages.every(stage => stage.ok));
});

test('予約レシピでは受付の曜日と時間が希望日時の入力欄のラベルで読める', () => {
  const state = buildFromRecipe('reserve');
  const label = '希望日時 火〜土10〜18時';
  const page = renderPage(state);
  assert.match(page, new RegExp(`data-path="items\\.1\\.label">${label}</p><div class="uxr-input-mock"`));
  const html = renderPage(state, { mode: 'export' });
  assert.match(html, new RegExp(`<label[^>]*for="([^"]+)">${label}</label><input[^>]*id="\\1"`));
  assert.ok(html.includes('火曜から土曜の10時〜18時です。'), '院の案内でも同じ受付時間が読める');
});
