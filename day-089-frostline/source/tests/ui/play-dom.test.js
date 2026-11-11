import { it, expect, vi } from 'vitest';
import { documentFixture } from './dom-fixture.js';
import { createMap } from '../../src/ui/map.js';
import { createSummary } from '../../src/ui/summary.js';
import { createPlay } from '../../src/play/index.js';
import { mountain, rider } from '../play/fixture.js';
const drops = [
  { id: 'a', name: '初雪の練習斜面', x: -500, z: -500, level: 1, best: 0, goals: [{ label: '駅まで滑りきる', earned: true }] },
  { id: 'b', name: '西壁のルンゼ', x: 500, z: 500, level: 4, best: 0, locked: true, threshold: 6000, remaining: 2600, goals: [{ label: '駅まで滑りきる', earned: false }] },
];
const data = { size: 2000, drops, stations: [], features: [] };
it('小さい印はspan、送りは44pxボタンの構造。クリックと前後送りで鍵まで選択できる', () => {
  const document = documentFixture(), onStart = vi.fn();
  const map = createMap({ document, onStart, onClose() {} }); map.update(data); map.show();
  const find = selector => map.body.querySelector(selector);
  expect(find('.map-pin').tagName).toBe('SPAN');
  expect(find('.map-names-wrap').hidden).toBe(true);
  expect(document.activeElement.dataset.action).toBe('map-start');
  find('[data-action="map-select"]').dispatch('click');
  expect(find('h3').textContent).toContain('西壁のルンゼ');
  expect(find('[data-action="map-start"]').disabled).toBe(true);
  expect(find('[data-action="map-start"]').textContent).toBe('鍵がかかっています');
  expect(find('.map-locked').textContent).toBe('滑った標高差の合計 6,000 m で開きます（あと 2,600 m）');
  expect(document.activeElement.dataset.action).toBe('map-select');
  find('[data-action="map-prev"]').dispatch('click');
  expect(document.activeElement.dataset.action).toBe('map-prev');
  // 面の座標を押して最寄りを選ぶ。印そのものの撮影セレクタでも選べる。
  find('.map-surface').dispatch('click', { clientX: 169, clientY: 169 });
  expect(find('h3').textContent).toContain('西壁のルンゼ');
  find('[data-drop="a"]').dispatch('click');
  find('[data-action="map-start"]').dispatch('click'); expect(onStart).toHaveBeenCalledWith('a');
});
it('PCでは44px丸のbuttonと一覧を保ち、先頭map-selectは可視の名前札になる', () => {
  const document = documentFixture(600), map = createMap({ document, onStart() {}, onClose() {} });
  map.update(data); map.show();
  expect(map.body.querySelector('.map-pin').tagName).toBe('BUTTON');
  expect(map.body.querySelector('.map-names-wrap').hidden).toBe(false);
  const first = map.body.querySelector('[data-action="map-select"]');
  expect(first.closest('[hidden]')).toBeNull(); expect(first.textContent).toContain('✓ 1');
  first.dispatch('click');
  map.show(); expect(document.activeElement.dataset.action).toBe('map-start');
  expect(map.element.contains(document.activeElement)).toBe(true);
});
it.each([false, true])('記録の実ボタン順・呼出先・開始焦点（今回駅到着=%s）', arrived => {
  const document = documentFixture(), p = createPlay({ world: mountain(), storage: null });
  p.begin('d0', rider());
  if (arrived) p.update(rider({ speed: 0, pos: { x: 0, y: 300, z: 500 } }), [], 5); else p.finish();
  const summary = p.snapshot().summary, onNext = vi.fn(), onAgain = vi.fn();
  const screen = createSummary({ document, onNext, onAgain, onMap() {}, onClose() {} }); screen.update(summary); screen.show();
  expect(screen.heading.textContent).toBe('一本の記録：地点0');
  expect(screen.body.querySelectorAll('button').map(b => b.dataset.action)).toEqual(['next', 'again', 'map']);
  expect(document.activeElement.dataset.action).toBe(arrived ? 'next' : 'again');
  screen.body.querySelector('[data-action="next"]').dispatch('click'); expect(onNext).toHaveBeenCalledWith(summary.next.id);
  screen.body.querySelector('[data-action="again"]').dispatch('click'); expect(onAgain).toHaveBeenCalledWith('d0');
});

it('鍵の地点で開き直しても焦点が残り、幅の切替で隠れる操作から可視操作へ移る', () => {
  const document = documentFixture(600), map = createMap({ document, onStart() {}, onClose() {} });
  map.update(data); map.show(); map.body.querySelector('[data-drop="b"]').dispatch('click');
  map.hide(); map.show();
  expect(map.element.contains(document.activeElement)).toBe(true);
  expect(document.activeElement.tagName).toBe('BUTTON');
  document.side = 225; document.resize();
  expect(document.activeElement.closest('[hidden]')).toBeNull();
  expect(document.activeElement.dataset.action).toBe('map-prev');
  map.body.querySelector('[data-action="map-select"]').dispatch('click');
  document.side = 600; document.resize();
  expect(document.activeElement.closest('[hidden]')).toBeNull();
  expect(document.activeElement.dataset.action).toBe('map-start');
});
