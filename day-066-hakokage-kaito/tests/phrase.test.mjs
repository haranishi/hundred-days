// 画面の文が、作業記録の 02_ui_text.md の表と一字一句同じであること（表をこのファイルに打ち直して突き合わせる）。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadLevel } from '../lib/sim.js';
import { LEVELS } from '../lib/levels-data.js';
import * as T from '../lib/phrase.js';

const level = (no) => loadLevel(LEVELS[no - 1]);
const L1 = level(1); // 見張り1つ
const L2 = level(2); // 見張り2つ
const L5 = level(5); // 警備員（巡回）1つ
const L7 = level(7); // 警備員とレーザー
const L8 = level(8); // 警備員・見張り・レーザー

describe('光源の呼び名（見張り・警備員・レーザー。同じ種類が2つ以上ある面だけ番号）', () => {
  it('見張りが1つの面は「見張り」、2つの面は「見張り1」「見張り2」', () => {
    assert.equal(T.sourceLabel(L1, { kind: 'guard', index: 0 }), '見張り');
    assert.equal(T.sourceLabel(L2, { kind: 'guard', index: 0 }), '見張り1');
    assert.equal(T.sourceLabel(L2, { kind: 'guard', index: 1 }), '見張り2');
  });

  it('巡回は「警備員」、レーザーは「レーザー」。面8は種類ごとに数えるので番号が付かない', () => {
    assert.equal(T.sourceLabel(L5, { kind: 'guard', index: 0 }), '警備員');
    assert.equal(T.sourceLabel(L7, { kind: 'laser', index: 0 }), 'レーザー');
    assert.equal(T.sourceLabel(L8, { kind: 'guard', index: 0 }), '警備員');
    assert.equal(T.sourceLabel(L8, { kind: 'guard', index: 1 }), '見張り');
    assert.equal(T.sourceLabel(L8, { kind: 'laser', index: 0 }), 'レーザー');
  });

  it('面データ（levels-data）でも読み込んだ面でも同じ呼び名', () => {
    assert.equal(T.sourceLabel(LEVELS[1], { kind: 'guard', index: 1 }), '見張り2');
    assert.deepEqual(T.guardNumbers(LEVELS[1]), [1, 2]);
  });

  it('盤の番号札：同じ種類が2つ以上のときだけ番号、それ以外は null', () => {
    assert.deepEqual(T.guardNumbers(L1), [null]);
    assert.deepEqual(T.guardNumbers(L2), [1, 2]);
    assert.deepEqual(T.guardNumbers(L8), [null, null]);
  });
});

describe('見つかった文（6つの理由 × 光源の呼び名）', () => {
  const caught = (reason, source, step) => ({ reason, source, step });
  const g0 = { kind: 'guard', index: 0 };
  const g1 = { kind: 'guard', index: 1 };
  const lz = { kind: 'laser', index: 0 };

  it('見出しと共通の2行目', () => {
    const t = T.caughtText(L1, caught('walked-in', g0, 2));
    assert.equal(t.title, '見つかった！');
    assert.equal(t.lines[1], '太い二重の枠が、その光の通り道。');
    assert.equal(t.lines.length, 2);
  });

  it('walked-in／uncovered／guard-move／guard-turn／guard-turn-box／guard-rotate の文（見張りが1つ）', () => {
    const f = (reason) => T.caughtText(L1, caught(reason, g0, 3)).lines[0];
    assert.equal(f('walked-in'), '3手目、見張りの光の中へ入ってしまった。');
    assert.equal(f('uncovered'), '3手目、光を止めていた箱をどかしたので、見張りの光が届いた。');
    assert.equal(f('guard-move'), '3手目、見張りが1歩進んで、光が届いた。');
    assert.equal(f('guard-turn'), '3手目、見張りが道の端で向きを変えて、光が届いた。');
    assert.equal(f('guard-turn-box'), '3手目、見張りが箱の前で引き返して、光が届いた。');
    assert.equal(f('guard-rotate'), '3手目、見張りが向きを変えて、光が届いた。');
  });

  it('光源の呼び名が文に入る：見張り2・警備員・レーザー', () => {
    assert.equal(T.caughtText(L2, caught('guard-rotate', g1, 12)).lines[0], '12手目、見張り2が向きを変えて、光が届いた。');
    assert.equal(T.caughtText(L5, caught('guard-turn', g0, 7)).lines[0], '7手目、警備員が道の端で向きを変えて、光が届いた。');
    assert.equal(T.caughtText(L7, caught('guard-turn-box', g0, 16)).lines[0], '16手目、警備員が箱の前で引き返して、光が届いた。');
    assert.equal(T.caughtText(L7, caught('walked-in', lz, 5)).lines[0], '5手目、レーザーの光の中へ入ってしまった。');
  });

  it('どの文も34字以内（最も長い文：99手目・見張り2・uncovered）', () => {
    for (const reason of ['walked-in', 'uncovered', 'guard-move', 'guard-turn', 'guard-turn-box', 'guard-rotate']) {
      for (const source of [g0, g1]) {
        const line = T.caughtText(L2, caught(reason, source, 99)).lines[0];
        assert.ok(line.length <= 34, `${line}（${line.length}字）`);
      }
    }
  });
});

describe('無効な手の一言（5つ）・詰み・1手ごとの読み上げ', () => {
  it('無効な手の一言', () => {
    assert.equal(T.bumpText('wall'), '壁があって進めない');
    assert.equal(T.bumpText('edge'), 'ここから先へは進めない');
    assert.equal(T.bumpText('locked'), '出口は、宝を取ると開く');
    assert.equal(T.bumpText('guard'), '警備員がいて通れない');
    assert.equal(T.bumpText('stuck'), '箱の先がふさがっていて押せない');
  });

  it('ぶつかった相手が見張りなら「見張りがいて通れない」、警備員（巡回）ならそのまま。guard 以外の理由は相手を見ない', () => {
    assert.equal(T.bumpText('guard', 'watch'), '見張りがいて通れない');
    assert.equal(T.bumpText('guard', 'patrol'), '警備員がいて通れない');
    assert.equal(T.bumpText('guard', undefined), '警備員がいて通れない');
    assert.equal(T.bumpText('wall', 'watch'), '壁があって進めない');
    assert.equal(T.bumpText('watch'), ''); // 'watch' は理由ではない（種類）。理由として渡しても文は出ない
  });

  it('表にない理由（over・unknown・nopush）は空の文字列（何も出さない）', () => {
    for (const r of ['over', 'unknown', 'nopush', undefined]) assert.equal(T.bumpText(r), '');
  });

  it('一言は20字以内', () => {
    for (const r of ['wall', 'edge', 'locked', 'guard', 'stuck']) assert.ok(T.bumpText(r).length <= 20, T.bumpText(r));
    assert.ok(T.bumpText('guard', 'watch').length <= 20);
    assert.ok(T.RESTART_TOAST.length <= 20, T.RESTART_TOAST);
  });

  it('詰みの欄', () => {
    assert.deepEqual(T.deadText(), { title: 'もう出られない', lines: ['この箱の位置では、宝を持って出口まで行けない。押す前に戻そう。'] });
  });

  it('動いた・押した・待った・宝を取った（続けて）', () => {
    const move = (dir) => ({ type: 'move', from: [0, 0], to: [1, 0], dir });
    assert.equal(T.moveText([move('U')], 3), '上へ。3手目');
    assert.equal(T.moveText([move('R')], 4), '右へ。4手目');
    assert.equal(T.moveText([move('D')], 5), '下へ。5手目');
    assert.equal(T.moveText([move('L')], 6), '左へ。6手目');
    assert.equal(T.moveText([{ type: 'push', box: 0, from: [1, 0], to: [2, 0] }, move('R')], 7), '箱を右へ押した。7手目');
    assert.equal(T.moveText([{ type: 'wait', at: [0, 0] }], 8), '待った。8手目');
    assert.equal(T.moveText([move('D'), { type: 'treasure', at: [1, 0] }], 9), '下へ。9手目。宝を取った。出口が開いた');
  });

  it('キーの案内：文字のキー（WASD・Z・R）を使うときと、使わないとき', () => {
    assert.equal(T.keyHelp(true), '矢印かWASDで移動・スペースで待つ・Zでひとつ戻す・Rで最初へ');
    assert.equal(T.keyHelp(false), '矢印で移動・スペースで待つ・Backspaceでひとつ戻す');
    // 使わないときの案内は、効かないキー（W・A・S・D・Z・R）を含まない
    assert.equal(/WASD|Z|R/.test(T.keyHelp(false).replace('Backspace', '')), false);
  });

  it('お手本・最初へ・コピーの文', () => {
    assert.equal(T.DEMO_START, 'お手本を再生する');
    assert.equal(T.DEMO_END, 'お手本はここまで。最初から自分でやってみよう');
    assert.equal(T.RESTART_TOAST, '最初に戻した。「ひとつ戻す」で取り消せる');
    assert.equal(T.COPIED, 'コピーしました');
    assert.equal(T.COPY_LABEL, 'リンクをコピー');
    assert.equal(T.HINT_CLOSE_LABEL, 'ヒントをとじる');
    assert.equal(T.demoProgress(3, 19), 'お手本 3/19手');
  });
});

describe('成功の欄と共有文', () => {
  it('最少手数：星3つ・「最少手数で脱出！」', () => {
    const t = T.clearText({ par: 10, steps: 10, best: 10, prevBest: null });
    assert.equal(t.title, '脱出成功！');
    assert.equal(t.stars, 3);
    assert.equal(t.starsText, '星3つ');
    assert.equal(t.stepsText, '10手（最少 10手）');
    assert.equal(t.note, '最少手数で脱出！');
    assert.equal(t.record, '');
  });

  it('★2：「あと{steps−par}手短くできれば星3つ」。★1も同じ言い方', () => {
    const two = T.clearText({ par: 19, steps: 23, best: 23, prevBest: null });
    assert.equal(two.stars, 2);
    assert.equal(two.starsText, '星2つ');
    assert.equal(two.stepsText, '23手（最少 19手）');
    assert.equal(two.note, 'あと4手短くできれば星3つ');
    const one = T.clearText({ par: 10, steps: 16, best: 16, prevBest: null });
    assert.equal(one.stars, 1);
    assert.equal(one.note, 'あと6手短くできれば星3つ');
  });

  it('記録を縮めたときだけ「記録を更新」（初めての成功・同じ手数・長くなったときは出さない）', () => {
    assert.equal(T.clearText({ par: 10, steps: 12, best: 12, prevBest: 14 }).record, '記録を更新');
    assert.equal(T.clearText({ par: 10, steps: 12, best: 12, prevBest: null }).record, '');
    assert.equal(T.clearText({ par: 10, steps: 12, best: 12, prevBest: 12 }).record, '');
    assert.equal(T.clearText({ par: 10, steps: 15, best: 12, prevBest: 12 }).record, '');
  });

  it('全面クリアの文：見出しは「全8面クリア！」、星の合計は「星 24/24」', () => {
    assert.equal(T.allClearText(), '全8面クリア！');
    assert.equal(T.starTotalText(24), '星 24/24');
    assert.equal(T.starTotalText(17), '星 17/24');
    assert.equal(T.NEXT_BUTTON, '次の面へ');
    assert.equal(T.LEVELS_BUTTON, '面をえらぶ');
  });

  it('結果の共有文は、面3・★2・23手の例で文字列が完全一致する', () => {
    assert.equal(
      T.shareText({ no: 3, name: 'レーザーの線', stars: 2, steps: 23 }),
      '箱影の怪盗 Day66｜面3「レーザーの線」★2 23手で脱出 #100日チャレンジ #個人開発',
    );
  });

  it('共有のリンク：Xは本文とURL、LINEはURLと本文を載せる', () => {
    const text = T.shareText({ no: 1, name: 'はじめの影', stars: 3, steps: 10 });
    const x = T.xIntentUrl(text, 'https://hundred-days.pages.dev/day-066-hakokage-kaito/');
    assert.ok(x.startsWith('https://x.com/intent/post?text='));
    assert.ok(decodeURIComponent(x).includes(text));
    assert.ok(x.includes(encodeURIComponent('https://hundred-days.pages.dev/day-066-hakokage-kaito/')));
    const line = T.lineIntentUrl(text, 'https://hundred-days.pages.dev/day-066-hakokage-kaito/');
    assert.ok(line.startsWith('https://social-plugins.line.me/lineit/share?url='));
  });
});

describe('名前（読み上げ）と見える文字', () => {
  it('面の帯の中央のボタン：星があれば「（星{s}つ）」、まだなら「（まだ）」', () => {
    assert.equal(T.levelButtonLabel(3, 'レーザーの線', 2), '面3/8 レーザーの線（星2つ）。面をえらぶ');
    assert.equal(T.levelButtonLabel(1, 'はじめの影', 0), '面1/8 はじめの影（まだ）。面をえらぶ');
    assert.equal(T.levelNo(3), '面3/8');
  });

  it('面の一覧の行', () => {
    assert.equal(T.levelRowLabel(3, 'レーザーの線', 2, 23), '面3 レーザーの線。星2つ。記録23手');
    assert.equal(T.levelRowLabel(4, 'まわる見張り', 0, null), '面4 まわる見張り。まだ');
    assert.equal(T.levelRowRecord(23), '記録 23手');
    assert.equal(T.levelRowRecord(null), 'まだ');
    assert.equal(T.levelHeading(3, 'レーザーの線'), '面3 レーザーの線');
  });

  it('星の絵の名前・音の切替・宝の状態', () => {
    assert.equal(T.starsLabel(2), '星3つ中2つ');
    assert.equal(T.starsLabel(0), '星3つ中0つ');
    assert.equal(T.soundLabel(false), '音を消す');
    assert.equal(T.soundLabel(true), '音を出す');
    assert.equal(T.treasureWord(false), 'まだ');
    assert.equal(T.treasureWord(true), '持っている');
  });

  it('盤の aria-label：位置は左から・上からの数（1から）', () => {
    assert.equal(T.boardLabel({ no: 2, cols: 6, rows: 6, x: 1, y: 1, treasure: false }), '面2の盤。横6・縦6マス。あなたは左から2・上から2。宝はまだ');
    assert.equal(T.boardLabel({ no: 8, cols: 8, rows: 7, x: 0, y: 5, treasure: true }), '面8の盤。横8・縦7マス。あなたは左から1・上から6。宝は持っている');
  });
});

describe('面の名前とヒントは levels-data と 02_ui_text.md の表が同じ', () => {
  const names = ['はじめの影', '交わる光', 'レーザーの線', 'まわる見張り', '引き返す警備員', '通り道をふさがない', '一つで二役', '宝物庫'];
  // ヒントは「ルールは言うが、答えは言わない」（体験評価で、面2・5・6・7は解き方の核心を先に言い、面4は「待つ」へ誘導すると指摘された）
  const hints = [
    '光に入ると見つかる。箱を光の中へ押すと、その先に影ができる。',
    '光が2本ある。1つの箱で、2本ともさえぎれる場所はないか。',
    'レーザーは壁から出る。影は、光が来る向きの反対側にできる。',
    '見張りは1手ごとに右へ回る。点線は次の光。光のない所に、何手いられるか数えよう。',
    '警備員は道を行き来する。どこで引き返せば、通れるだろう。',
    '箱は引けない。押したあと、自分はどこを通るか考えよう。',
    'レーザーと警備員、両方をさえぎれる場所はないか。',
    '箱は2つ。どちらを、どこへ押すか。見張りの回る向きも見よう。',
  ];
  it('8面の名前（9字以内）とヒント（40字以内）', () => {
    LEVELS.forEach((L, i) => {
      assert.equal(L.name, names[i]);
      assert.equal(L.hint, hints[i]);
      assert.ok(L.name.length <= 9 && L.hint.length <= 40);
    });
  });

  it('答えを言い切らない：面2・4・5・6・7のヒントは、解き方の中身（置く場所・押す先・待つこと）を指さず、問いか考える向きで終わる', () => {
    const old = ['交わるマスに箱を置けば', '待つのも1手', '巡回の道に箱を置くと', 'ふさがない場所へ押そう', '巡回の道の端が重なるマス'];
    for (const phrase of old) assert.equal(LEVELS.some((L) => L.hint.includes(phrase)), false, phrase);
  });
});

describe('絵文字を使わない（★☆は文字として可）', () => {
  it('phrase.js が返す文に絵文字が無い', () => {
    const samples = [
      T.shareText({ no: 1, name: 'x', stars: 3, steps: 1 }),
      T.caughtText(L1, { reason: 'walked-in', source: { kind: 'guard', index: 0 }, step: 1 }).lines.join(''),
      T.deadText().lines.join(''),
      T.clearText({ par: 10, steps: 12, best: 12, prevBest: 14 }).note,
      T.moveText([{ type: 'wait' }], 1),
      ...Object.values(T).filter((v) => typeof v === 'string'),
    ];
    for (const s of samples) assert.equal(/\p{Extended_Pictographic}/u.test(s.replaceAll('★', '').replaceAll('☆', '')), false, s);
  });
});
