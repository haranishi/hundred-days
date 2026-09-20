// Day 004 のデモ動画の振り付け。scripts/record-demo.mjs から読まれる。
//
// 見せたいこと：借りる額を上げると返還年数まで一緒に伸びる＝年数は自分で選べない、という一点。

// 一覧カードのサムネは「返し終わるのは◯歳」が主役なので、そこが入る位置まで下げて撮る。
export const shotScroll = 235;

export default async function (page, h) {
  // 1. 第一種・54,000円・4年の初期状態を見せる（37歳・毎月14,400円）
  await h.pause(1600);

  // 2. 月額を54,000→64,000へ。1万円増やしただけで15年→18年、37歳→40歳に伸びる
  await h.slide('#amount', 6, 7, 900);
  await h.pause(1700);

  // 3. 第二種（有利子）へ。利率の選択肢が現れ、利息が乗る
  await page.click('#seg-kind button[data-v="2"]');
  await h.pause(1500);

  // 4. 利率を1%→3%へ。返す総額と毎月の額が上がる
  await page.click('#seg-rate button[data-v="0.03"]');
  await h.pause(1800);

  // 5. 手取りに対する負担を見せる（22万→18万で割合が跳ねる）
  await h.scrollTo('.burden');
  await h.pause(700);
  await page.click('#seg-take button[data-v="180000"]');
  await h.pause(1600);

  // 6. 「なぜこの年数になるのか」を開いて、年数が決まる道筋を見せる
  await page.click('details.why > summary');
  await h.pause(500);
  await h.scrollTo('.path');
  await h.pause(2600);

  // 7. 先頭に戻って締める
  await h.scrollTop(800);
  await h.pause(1200);
}
