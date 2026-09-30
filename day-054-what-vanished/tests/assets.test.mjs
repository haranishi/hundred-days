import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { FURNITURE, PROPS, LEVELS } from '../lib/catalog.js';
import { appDir, manifest } from './helpers.mjs';

const files = [...new Set([...Object.values(FURNITURE).map(f => f.file), ...Object.values(PROPS).map(p => p.file)])];

test('一覧にある模型は、寸法の記録とファイルがそろっている', () => {
  for (const f of files) {
    assert.ok(manifest.models[f], `寸法の記録がない: ${f}`);
    assert.ok(existsSync(join(appDir, 'assets/models', `${f}.glb`)), `ファイルがない: ${f}`);
  }
});

test('使っていない模型を同梱していない', () => {
  const shipped = readdirSync(join(appDir, 'assets/models')).map(n => n.replace(/\.glb$/, ''));
  assert.deepEqual(shipped.filter(n => !files.includes(n)), []);
});

test('読み込む素材は合計15MB以下（遅い回線でも待たせすぎない）', () => {
  let bytes = 0;
  for (const dir of ['assets/models', 'assets/textures']) {
    for (const n of readdirSync(join(appDir, dir))) bytes += statSync(join(appDir, dir, n)).size;
  }
  assert.ok(bytes <= 15 * 1024 * 1024, `合計 ${(bytes / 1024 / 1024).toFixed(2)}MB`);
});

test('消える物にはどれも日本語の名前と大きさの組があり、名前は重ならない', () => {
  const names = new Set();
  for (const [id, p] of Object.entries(PROPS)) {
    assert.match(p.name, /[ぁ-んァ-ヶ一-龠]/, id);
    assert.ok(['L', 'M', 'S'].includes(p.size), id);
    assert.ok(!names.has(p.name), `名前が重なる: ${p.name}`);
    names.add(p.name);
  }
});

test('どのむずかしさも、3問ぶんと候補の数に足りる物がある', () => {
  for (const level of Object.values(LEVELS)) {
    const pool = Object.values(PROPS).filter(p => level.pool.includes(p.size));
    assert.ok(pool.length >= 3 + Math.max(...level.choices), `${level.name}: ${pool.length}個`);
  }
});

test('模型の大きさが実物の範囲に収まる（縮尺の壊れを見つける）', () => {
  const size = (entry) => manifest.models[entry.file].size.map(v => v * (entry.scale ?? 1));
  const within = (id, entry, lo, hi) => {
    const tallest = Math.max(...size(entry));
    assert.ok(tallest >= lo && tallest <= hi, `${id} の一番長い辺 ${tallest.toFixed(2)}m`);
  };
  within('sofa', FURNITURE.sofa, 1.3, 2.4);
  within('bed', FURNITURE.bed, 1.8, 2.3);
  within('grandfather-clock', PROPS['grandfather-clock'], 1.8, 2.4);
  within('apple', PROPS.apple, 0.06, 0.14);
  within('lemon', PROPS.lemon, 0.05, 0.14);
  within('microwave', PROPS.microwave, 0.4, 0.75);
  within('laptop', PROPS.laptop, 0.25, 0.5);
});
