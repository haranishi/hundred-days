import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GOALS } from '../../lib/contract.js';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);

test('画面・パネル・ダイアログには一意の入口があり、タブと図記号の参照先が存在する', () => {
  assert.equal(new Set(ids).size, ids.length);
  for (const name of [
    'screen-goal', 'screen-edit', 'screen-view', 'slot-topbar', 'slot-outline', 'slot-preview', 'slot-panel',
    'panel-outline', 'panel-edit', 'panel-diagnosis', 'panel-look',
    'dlg-share', 'dlg-slots', 'dlg-palette', 'dlg-app-share', 'share', 'toasts',
    ...GOALS.map(goal => 'i-' + goal),
  ]) assert.ok(ids.includes(name), name);
  for (const [, target] of html.matchAll(/(?:aria-(?:controls|labelledby|describedby)="|<use href="#)([^"]+)"/g)) {
    for (const id of target.split(/\s+/)) assert.ok(ids.includes(id), id);
  }
  assert.equal((html.match(/<dialog\b[^>]*>/g) ?? []).length, (html.match(/<\/dialog>/g) ?? []).length);
});

test('共有欄は両方の画面から開ける。起動用のスクリプトと共有部品は同じ配布物にある', () => {
  assert.equal((html.match(/<button\b[^>]*data-app-send[^>]*>このアプリを共有する<\/button>/g) ?? []).length, 2);
  assert.match(html, /<dialog\b[^>]*id="dlg-app-share"[^>]*>(?:(?!<\/dialog>)[\s\S])*id="share"/);
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 2);
  for (const [, attrs, content] of scripts) {
    assert.match(attrs, /\bsrc="\.\/[^"]+\.js"/);
    assert.equal(content.trim(), '');
  }
  assert.match(html, /<script type="module" src="\.\/app\.js"><\/script>/);
  assert.match(html, /<script src="\.\/shared\/share\.js" defer><\/script>/);
  assert.doesNotMatch(html, /\son[a-z]+\s*=|data-ready="true"/i);
});
