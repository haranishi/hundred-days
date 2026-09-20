// Day 007のデモ。単音、和音、サステインを短い縦型動画で見せる。

async function chord(page, keys, holdMs = 900) {
  for (const key of keys) await page.keyboard.down(key);
  await page.waitForTimeout(holdMs);
  for (const key of [...keys].reverse()) await page.keyboard.up(key);
}

export async function shotSetup(page) {
  await page.evaluate(() => {
    document.querySelector('.instrument').scrollIntoView({ block: 'center' });
  });
  await page.keyboard.down('z');
  await page.keyboard.down('c');
  await page.keyboard.down('b');
  await page.waitForTimeout(250);
}

export default async function (page, h) {
  await h.pause(1300);
  await h.scrollTo('.instrument');

  await chord(page, ['z'], 650);
  await chord(page, ['c'], 650);
  await chord(page, ['b'], 650);
  await chord(page, ['z', 'c', 'b'], 1200);

  await h.scrollTo('.controls');
  await page.click('#sustain');
  await h.pause(500);
  await h.scrollTo('.instrument');
  await chord(page, ['v', 'n', 'q'], 850);
  await chord(page, ['b', 'm', 'w'], 850);
  await chord(page, ['z', 'c', 'b'], 1200);

  await h.scrollTo('.controls');
  await page.click('#stop-all');
  await h.pause(1400);
}
