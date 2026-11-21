import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnose } from '../../lib/rules.js';
import { block, RESERVE_SAMPLE } from '../fixtures/states.js';

const expected = {
  'has-action': '一部確認',
  'hero-first': '一部確認',
  'flow-complete': '独自の整理',
  'trust-before-action': '一部確認',
  'honest-limited': '一部確認',
  'price-before-action': '一部確認',
  'button-label-result': '確認済み',
  'button-label-consistent': '確認済み',
  'form-short': '確認済み',
  'hero-title-short': '一部確認',
  'faq-before-last-action': '一部確認',
  'action-reachable-again': '一部確認',
  'no-adjacent-same': '独自の整理',
  'not-too-long': '独自の整理',
  'replace-samples': '一部確認',
};

// 予約の見本に期限の部品を加えると、同じ診断結果で15項目を照合できる。
const blocks = [...RESERVE_SAMPLE.blocks, block('limit', 'limited', 0)];
const { items } = diagnose({ ...RESERVE_SAMPLE, blocks });
const sourcesFor = id => items.find(item => item.id === id).sources;

for (const [id, confidence] of Object.entries(expected)) {
  test(`${id} の根拠は「${confidence}」`, () => {
    const actual = new Set(sourcesFor(id).map(entry => entry.confidence));
    assert.deepEqual(actual, new Set([confidence]));
  });
}

test('15項目のうち、出典が直接支えるのはボタン名の2項目と入力欄の1項目', () => {
  assert.deepEqual(items.map(item => item.id).sort(), Object.keys(expected).sort());
  const confirmed = items.filter(item => item.sources.some(entry => entry.confidence === '確認済み'));
  assert.deepEqual(confirmed.map(item => item.id).sort(), ['button-label-consistent', 'button-label-result', 'form-short']);
});

test('同じ英国政府の資料でも、手続きの入口とボタン名では参照する内容が違う', () => {
  const button = 'https://design-system.service.gov.uk/components/button/';
  assert.deepEqual(sourcesFor('has-action'), [
    { label: '英国政府デザインシステム・ボタン（開始のボタンを含む）', url: button, confidence: '一部確認' },
  ]);
  assert.deepEqual(sourcesFor('button-label-result'), [
    { label: '英国政府デザインシステム・ボタンの名前', url: button, confidence: '確認済み' },
  ]);
});

test('申し込み前の費用の根拠には、通販の送料とサービス開始前の案内がある', () => {
  const sources = sourcesFor('price-before-action');
  assert.deepEqual(new Map(sources.map(entry => [entry.url, entry.label])), new Map([
    ['https://baymard.com/research-articles/show-shipping-costs-on-product-pages', 'Baymard・注文前にわかる送料'],
    ['https://design-system.service.gov.uk/patterns/start-using-a-service/', '英国政府デザインシステム・サービスを使い始める前の案内'],
  ]));
});

test('見本の書き換えでは、Studioの編集手順とShopifyの商品説明を区別する', () => {
  const sources = sourcesFor('replace-samples');
  assert.deepEqual(new Map(sources.map(entry => [entry.url, entry.label])), new Map([
    ['https://help.studio.design/ja/articles/9974045-テンプレートを編集する', 'Studio・テンプレートの文章を編集する手順'],
    ['https://www.shopify.com/jp/blog/seo-product-descriptions', 'Shopify・商品説明の書き方'],
  ]));
});
