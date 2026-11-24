import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as T from '../../tools/promo/timeline.mjs';

test('基本定数と selftestStoryboard がすべて合格する', () => {
  assert.equal(T.DURATION_SECONDS, 30);
  assert.equal(T.FPS, 30);
  assert.equal(T.TOTAL_FRAMES, 900);
  assert.equal(T.BPM, 120);
  assert.equal(T.BARS, 15);
  assert.equal(T.BAR, 2);
  assert.equal(T.BEAT, 0.5);
  const res = T.selftestStoryboard();
  assert.equal(res.ok, true, res.errors.join('\n'));
  assert.equal(res.totalFrames, 900);
  assert.equal(res.captions, 9);
});

test('字幕の文言は設計の正本と一字一句一致し、禁止表現を含まない', () => {
  const expected = [
    [0.2, 2.0, '電話、つながらなかった。'],
    [2.0, 4.0, 'かけ直し、忘れてない？'],
    [4.0, 7.3, '「不在のため再架電を予約」にチェックして、保存して次へ。'],
    [7.3, 11.5, '土日を除く翌日の朝9時に、再架電が入る。'],
    [11.5, 14.0, '商談は、段階ごとにひと目で。'],
    [14.0, 17.0, '段階は、選んで動かすだけ。'],
    [17.0, 20.0, '動かした分が、今月の着地に。'],
    [20.0, 23.0, '目標との差も、担当別に。'],
    [23.0, 26.0, '朝9時、かけ直せる。'],
  ];
  assert.equal(T.CAPTIONS.length, expected.length);
  expected.forEach(([start, end, text], i) => {
    assert.equal(T.CAPTIONS[i].start, start);
    assert.equal(T.CAPTIONS[i].end, end);
    assert.equal(T.CAPTIONS[i].lines.join(''), text);
  });
  assert.deepEqual(T.CAPTIONS[2].lines, ['「不在のため再架電を予約」に', 'チェックして、保存して次へ。']);

  const allCopy = [
    ...T.CAPTIONS.flatMap((c) => c.lines),
    ...T.CAPTIONS.map((c) => c.tag).filter(Boolean),
    T.END_CARD.sub,
    T.END_CARD.badge,
    T.END_CARD.cta,
    T.END_CARD.disclosure,
    T.STAGE.footerBrand.text,
    T.STAGE.footerNote.text,
  ].join('\n');
  const localPrefix = ['', 'Users', ''].join('/');
  const volumePrefix = ['', 'Volumes', ''].join('/');
  for (const forbidden of ['速い', '他より優れる', localPrefix, volumePrefix]) {
    assert.equal(allCopy.includes(forbidden), false, `禁止語を含む: ${forbidden}`);
  }
  assert.equal(T.CAPTIONS[1].tag, '営業リストの架電に');
  assert.equal(T.captionAt(2.5)?.tag, '営業リストの架電に');
  assert.equal(T.captionAt(0.5)?.tag, null);
  assert.equal(T.captionAt(5.0)?.tag, null);
});

test('字幕切り替え時に透明度が 1 未満の薄いコマを作らない', () => {
  for (let f = 0; f < T.TOTAL_FRAMES; f++) {
    const cap = T.captionAt(f / T.FPS);
    if (cap) {
      assert.equal(cap.alpha, 1, `frame ${f} の alpha が 1 ではない`);
      assert.ok(cap.dy >= 0 && cap.dy <= 14, `frame ${f} の dy が範囲外: ${cap.dy}`);
    }
  }
  assert.equal(T.captionAt(0.0), null);
  assert.equal(T.captionAt(26.0), null);
});

test('レイヤー合成とクロスフェードが場面の境で連続に動く', () => {
  const f0 = T.layerMixAt(0);
  assert.equal(f0.mode, 'ai-a');
  assert.equal(f0.aiAlpha, 1);
  assert.equal(f0.uiAlpha, 0);

  const midIn = T.layerMixAt(4.2);
  assert.equal(midIn.mode, 'crossfade-in');
  assert.ok(midIn.aiAlpha > 0.45 && midIn.aiAlpha < 0.55);
  assert.equal(midIn.uiAlpha, 1);

  const ui = T.layerMixAt(10.0);
  assert.equal(ui.mode, 'ui');
  assert.equal(ui.aiAlpha, 0);
  assert.equal(ui.uiAlpha, 1);

  const midOut = T.layerMixAt(23.2);
  assert.equal(midOut.mode, 'crossfade-out');
  assert.ok(midOut.aiAlpha > 0.45 && midOut.aiAlpha < 0.55);
  assert.equal(midOut.uiAlpha, 1);

  const aiB = T.layerMixAt(26.5);
  assert.equal(aiB.mode, 'ai-b');
  assert.equal(aiB.aiAlpha, 1);
  assert.equal(aiB.uiAlpha, 0);
});

test('カメラ計算は窓アスペクト比と文字可読幅（540px以下）を保ち、clip はビューポート内に収まる', () => {
  const cam = T.computeCameraForRect(
    { x: 840, y: 310, width: 400, height: 480 },
    { padX: 24, padY: 20, preferredWidth: 490, alignY: 'top', bounds: { width: 1280, height: 2200 } },
  );
  assert.ok(cam.w <= T.MAX_READABLE_CAMERA_WIDTH);
  assert.ok(Math.abs(cam.w / cam.h - T.WINDOW_ASPECT) < 1e-9);

  // 極端に大きな要素でも可読上限幅を超えない
  const wide = T.computeCameraForRect(
    { x: 0, y: 0, width: 1200, height: 1000 },
    { bounds: { width: 1280, height: 2200 } },
  );
  assert.equal(wide.w, T.MAX_READABLE_CAMERA_WIDTH);

  // 縦に長い画面で下部を撮るときは scrollY を使って clip をビューポート内へ収める
  const vp = { width: 960, height: 1600 };
  const deep = T.cameraToClip({ cx: 480, cy: 1900, w: 500, h: 540 }, vp, 2400);
  assert.ok(deep.scrollY > 0);
  assert.ok(deep.clip.x >= 0 && deep.clip.x + deep.clip.width <= vp.width + 0.01);
  assert.ok(deep.clip.y >= 0 && deep.clip.y + deep.clip.height <= vp.height + 0.01);
});

test('アプリ座標からステージ座標への変換が窓の中心・端で正確', () => {
  const camDoc = { x: 100, y: 200, width: 500, height: 540 };
  const center = T.appToStagePoint({ x: 350, y: 470 }, camDoc);
  assert.equal(center.x, T.STAGE.window.x + T.STAGE.window.width / 2);
  assert.equal(center.y, T.STAGE.window.y + T.STAGE.window.height / 2);

  const rect = T.appToStageRect({ x: 150, y: 250, width: 100, height: 50 }, camDoc);
  assert.deepEqual(rect, { x: T.STAGE.window.x + 50, y: T.STAGE.window.y + 50, w: 100, h: 50 });

  // 窓の外に完全に出た矩形は null
  assert.equal(T.appToStageRect({ x: 900, y: 250, width: 50, height: 50 }, camDoc), null);
});

test('UI-1 後半は幅 1280 のまま架電モード終了→1行目の次回対応と大きな札を出し、UI-2 開始時に幅 960 へ切り替える', () => {
  const ui1 = T.ACTIONS.filter((a) => a.scene === 'ui-1');
  assert.equal(ui1.some((a) => a.type === 'set-viewport'), false);
  for (const retired of ['navHome', 'followupCard', 'followupFirst']) {
    assert.equal(T.ACTIONS.some((a) => a.target === retired), false, `廃止対象が残っている: ${retired}`);
  }
  assert.equal(T.ACTIONS.some((a) => a.type === 'nav-click' || a.type === 'show-landing-callout'), false);

  const exitFocus = ui1.find((a) => a.at === 6.9 && a.type === 'camera-focus' && a.target === 'exitCallMode');
  assert.ok(exitFocus && exitFocus.over === 0.3);
  const exitClick = ui1.find((a) => a.type === 'exit-call-mode');
  assert.ok(exitClick && exitClick.cue?.kind === 'nav' && exitClick.lead > 0);

  const nextFocus = ui1.find((a) => a.at === 7.5 && a.type === 'camera-focus' && a.target === 'firstRowNextAction');
  assert.ok(nextFocus && nextFocus.width <= T.MAX_READABLE_CAMERA_WIDTH);
  const nextHl = ui1.find((a) => a.at === 7.5 && a.type === 'highlight' && a.target === 'firstRowNextActionCell');
  assert.ok(nextHl && nextHl.hold >= 2.0 && nextHl.cue?.kind === 'pop'); // 札を長く止めすぎない（2.4秒。採点で「静止が長い」と指摘された）
  const nextCallout = ui1.find((a) => a.at === 7.5 && a.type === 'show-callout');
  assert.ok(nextCallout && nextCallout.calloutLabel === '次回対応' && nextCallout.valueFrom === 'nextAction');

  const navDeals = ui1.find((a) => a.at === 11.05 && a.type === 'camera-focus' && a.target === 'navDeals');
  assert.ok(navDeals);

  const ui2Viewport = T.ACTIONS.find((a) => a.scene === 'ui-2' && a.at === 11.5 && a.type === 'set-viewport');
  assert.ok(ui2Viewport && ui2Viewport.width === 960);
  const ui3Callout = T.ACTIONS.find((a) => a.scene === 'ui-3' && a.type === 'show-callout' && a.valueFrom === 'landingForecast');
  assert.ok(ui3Callout && ui3Callout.calloutLabel === '着地予測' && ui3Callout.hold === 0.9);
});

test('UI-2 の受注移動・UI-3 の担当別札・終わりのカード CTA・AI-B 入り点が設計どおり', () => {
  // 1. UI-2: 14.0 カード強調 -> 14.2 指着地 -> 14.3 表示値だけ '4' (click) -> 14.75 change 発火 (won) -> 14.9 受注列へ
  const hlCard = T.ACTIONS.find((a) => a.at === 14.0 && a.type === 'highlight' && a.target === 'proposalTopDealCard');
  const focusStage = T.ACTIONS.find((a) => a.at === 14.2 && a.type === 'focus-deal-stage');
  const previewStage = T.ACTIONS.find((a) => a.at === 14.3 && a.type === 'preview-deal-stage');
  const moveWon = T.ACTIONS.find((a) => a.at === 14.75 && a.type === 'move-deal-won');
  const panWon = T.ACTIONS.find((a) => a.type === 'board-pan' && a.toLane === '受注');
  assert.ok(hlCard && hlCard.hold === 0.75);
  assert.ok(focusStage && focusStage.lead === 0.4);
  assert.ok(previewStage && previewStage.stageValue === '4' && previewStage.cue?.kind === 'click');
  assert.ok(moveWon && moveWon.stageValue === '4' && moveWon.cue?.kind === 'won');
  assert.ok(panWon && panWon.at >= 14.75);

  // 2 & 3. UI-3: 着地予測札は 19.0..19.9 で完全消去、20.0 に担当別の表の右側（目標との差の列）へ寄せて停止、20.3..22.2 に目標との差2行札と列強調（札は23.0のクロスフェードの前に消し切る）
  const landing = T.ACTIONS.find((a) => a.type === 'show-callout' && a.valueFrom === 'landingForecast');
  assert.equal(landing.at, 19.0);
  assert.equal(landing.hold, 0.9);
  assert.ok(landing.at + landing.hold < 20.0);
  assert.equal(T.ACTIONS.some((a) => a.target === 'projectionLeft'), false); // 左側（担当名の列）には寄せない。担当名は札で補う
  const projLeft = T.ACTIONS.find((a) => a.at === 20.0 && a.type === 'camera-focus' && a.target === 'projectionRight');
  const projCallout = T.ACTIONS.find((a) => a.at === 20.3 && a.type === 'show-callout' && a.valueFrom === 'projectionDiffs');
  const projColHl = T.ACTIONS.find((a) => a.type === 'highlight' && a.target === 'projectionDiffColumn');
  assert.ok(projLeft);
  assert.ok(projCallout && projCallout.calloutLabel === '目標との差' && projCallout.hold === 1.9 && projCallout.at + projCallout.hold < 22.5);
  assert.ok(projColHl);

  // 4. 終わりのカード CTA と安全域・非重複レイアウト計算
  assert.equal(T.END_CARD.cta, 'GitHubで見る');
  const layout = T.computeEndCardLayout();
  assert.equal(layout.withinSafeY, true);
  assert.equal(layout.hasOverlap, false);
  assert.ok(layout.topY >= T.STAGE.safeY.min && layout.bottomY <= T.STAGE.safeY.max);
  const ctaBox = layout.boxes.find((b) => b.key === 'cta');
  const urlBox = layout.boxes.find((b) => b.key === 'url');
  assert.ok(ctaBox && urlBox && ctaBox.bottom < urlBox.top);

  // 7 & 9. 下端ブランド表示と AI-B 入り点既定 0.5 秒
  assert.equal(T.STAGE.footerBrand.text, '営業リスト向けのCRM');
  assert.equal(T.AI_CLIPS.b.defaultIn, 0.5);
});

test('README.md は 100 行以内で、ローカルパスや禁止語を含まない', () => {
  const readme = readFileSync(new URL('../../tools/promo/README.md', import.meta.url), 'utf8');
  const lines = readme.trimEnd().split('\n');
  assert.ok(lines.length <= 100, `README.md が 100 行を超えている: ${lines.length}行`);
  const localPrefix = ['', 'Users', ''].join('/');
  const volumePrefix = ['', 'Volumes', ''].join('/');
  for (const forbidden of [localPrefix, volumePrefix, '速い', '他より優れる']) {
    assert.equal(readme.includes(forbidden), false, `README に禁止語: ${forbidden}`);
  }
});

// design.md の照合表を読んで、字幕とその時刻が CAPTIONS と一致することを確かめる（文書とコードの食い違いを、機械で止める）。
test('design.md の照合表に、字幕とその時刻（開始–終了）が CAPTIONS のとおり書かれている', async () => {
  const { readFileSync } = await import('node:fs');
  const design = readFileSync(new URL('../../../.kiro/specs/day-099-meibo/design.md', import.meta.url), 'utf8');
  const fmt = (n) => (Math.round(n * 10) / 10).toFixed(1);
  for (const c of T.CAPTIONS) {
    const expected = `${c.lines.join('')}（${fmt(c.start)}–${fmt(c.end)}）`;
    assert.ok(design.includes(expected), `design.md に「${expected}」が無い`);
  }
});

// 事実と違う言い方を、公開する文面に戻さない（meibo は祝日も平日として数える＝「営業日」と書くと事実と違う）。
test('公開する文面に「営業日」を使わない（土日を除く翌日、と書く）', async () => {
  const { readFileSync } = await import('node:fs');
  const meta = JSON.parse(readFileSync(new URL('../../meta.json', import.meta.url), 'utf8'));
  const copy = [
    ...T.CAPTIONS.flatMap((c) => c.lines),
    T.PREP_ACTIVITY_NOTE,
    meta.description,
    meta.social?.x?.summary,
    meta.social?.x?.body,
    ...(meta.social?.x?.replies ?? []),
  ].join('\n');
  assert.equal(copy.includes('営業日'), false);
});
