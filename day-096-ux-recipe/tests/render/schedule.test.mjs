// 日程・プログラム（schedule）の部品固有の試験。
// v0の縦タイムライン・v1の時間チップつきカード・件数（2〜6件）・空・無害化を確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPage } from '../../lib/render.js';
import { emptyProps, maxProps, oneEach } from '../fixtures/states.js';

const sample = {
  heading: '当日の流れ',
  items: [
    { time: '10:00', title: '受付開始', text: '会場にて受付を行います。' },
    { time: '10:30', title: '体験ワーク', text: '手を動かして学びます。' },
  ],
};

test('schedule v0（縦）: 時間の列と縦の線・点が描かれる', () => {
  const html = renderPage(oneEach('schedule', 0, sample), { mode: 'export' });
  assert.ok(html.includes('<ol class="uxr-sched-list">'));
  assert.equal((html.match(/class="uxr-sched-item"/g) ?? []).length, 2);
  assert.equal((html.match(/class="uxr-sched-dot"/g) ?? []).length, 2);
  assert.ok(html.includes('10:00') && html.includes('受付開始'));
});

test('schedule v1（カード）: 時間のチップつきカードが描かれる', () => {
  const html = renderPage(oneEach('schedule', 1, sample), { mode: 'export' });
  assert.ok(html.includes('<ol class="uxr-sched-cards">'));
  assert.equal((html.match(/uxr-chip uxr-sched-chip/g) ?? []).length, 2);
  // 時間が空の項目ではチップ自体を出さない
  const noTime = renderPage(oneEach('schedule', 1, {
    heading: '予定',
    items: [{ time: '', title: '自由見学', text: '' }, { time: '11:00', title: '説明会', text: '' }],
  }), { mode: 'export' });
  assert.equal((noTime.match(/uxr-chip uxr-sched-chip/g) ?? []).length, 1);
});

test('schedule: 最大件数（6件）と空の扱い・危険な文字の無害化', () => {
  const xss = '<img src=x onerror=alert(1)>"\'&';
  for (const variant of [0, 1]) {
    const maxHtml = renderPage(oneEach('schedule', variant, maxProps('schedule')), { mode: 'export' });
    const re = variant === 0 ? /class="uxr-sched-item"/g : /uxr-card uxr-sched-card/g;
    assert.equal((maxHtml.match(re) ?? []).length, 6, `v${variant}: 最大6件`);

    const emptyExp = renderPage(oneEach('schedule', variant, emptyProps('schedule')), { mode: 'export' });
    assert.ok(!emptyExp.includes('<ol'), `v${variant}: export で空リストを出さない`);

    const emptyPre = renderPage(oneEach('schedule', variant, emptyProps('schedule')), { mode: 'preview' });
    assert.ok(emptyPre.includes('data-path="items.0.time"') && emptyPre.includes('data-path="items.0.text"'));

    const safe = renderPage(oneEach('schedule', variant, {
      heading: xss,
      items: [{ time: xss, title: xss, text: xss }, { time: '10:00', title: '次', text: '' }],
    }), { mode: 'export' });
    assert.ok(!safe.includes('<img src=x') && safe.includes('&lt;img src=x'));
  }
});
