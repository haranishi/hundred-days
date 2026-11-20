import assert from 'node:assert/strict';
import test from 'node:test';
import { pickIcon } from '../../lib/icon-pick.js';
import { buildFromRecipe } from '../../lib/recipes.js';
import { renderPage } from '../../lib/render.js';
import { ico } from '../../lib/render-kit.js';

test('項目の文字から優先順で札を選び、手掛かりがない項目の代替にハートを使わない', () => {
  for (const [name, words] of [
    ['yen', '円 料金 時給 価格 費 送料 税 無料'],
    ['clock', '時間 時 分 朝 夜 営業 受付'],
    ['calendar', '曜日 日程 予約 予定 日付 期限'],
    ['pin', '場所 道 駅 アクセス 住所 店 来て'],
    ['mail', 'メール 連絡 返信 問い合わせ 相談'],
    ['phone', '電話'], ['chat', '声 話 聞 伝え 質問'],
    ['user', '人 スタッフ お客さん 方'], ['cart', '買い かご 注文 購入'],
    ['gift', '贈り プレゼント ギフト'], ['cup', '飲み物 コーヒー お茶 カフェ 食事'],
    ['shield', '安心 守る 保証 安全'], ['heart', '好き 大切 やさしい 想い 応援 ありがとう'],
  ]) {
    for (const word of words.split(' ')) assert.equal(pickIcon(word, 1), name, word);
  }
  assert.equal(pickIcon('朝の四時間', 0), 'clock');
  assert.equal(pickIcon('朝の時給1,450円', 0), 'yen');
  assert.equal(pickIcon('残すものを決める', 3, ['spark', 'star']), 'star');
  assert.equal(pickIcon('', 2, ['star', 'heart', 'spark']), 'star');
  assert.equal(pickIcon('', 0, ['heart']), 'check');
});

test('応募の時給と勤務時間の札は、順番を入れ替えても同じ項目についてくる', () => {
  const state = buildFromRecipe('apply');
  const benefits = state.blocks.find(block => block.type === 'benefits');
  const [hours, wage] = benefits.props.items;
  for (const items of [[hours, wage], [wage, hours]]) {
    benefits.props.items = items;
    const html = renderPage(state, { mode: 'export' });
    const rows = [...html.matchAll(/<li class="uxr-ben-item">(.*?)<\/li>/g)];
    assert.equal(rows.length, 2);
    for (const [i, [, row]] of rows.entries()) {
      assert.ok(row.includes(ico(items[i] === hours ? 'clock' : 'yen')), items[i].title);
    }
  }
});

test('予約で加減を聞く行、問い合わせで残す家具を選ぶ行、応援で家族に届ける行に合う札を出す', () => {
  for (const [goal, title, icon] of [
    ['reserve', '加減を聞きながら', 'chat'],
    ['inquire', '残すものを決める', 'star'],
    ['support', '家で待つ人のぶん', 'user'],
  ]) {
    const html = renderPage(buildFromRecipe(goal), { mode: 'export' }).replaceAll('<wbr>', '');
    const rows = [...html.matchAll(/<li class="uxr-ben-item">(.*?)<\/li>/g)];
    const row = rows.find(([, content]) => content.includes(title));
    assert.ok(row?.[1].includes(ico(icon)), title);
  }
});
