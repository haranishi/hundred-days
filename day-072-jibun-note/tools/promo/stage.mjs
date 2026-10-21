export const FPS = 30;
export const DURATION = 30;
export const SCENES = [
  { start: 0, end: 4, label: 'まだ知らない、自分に会いに。', title: ['就活の軸、', 'まだ見つからない？'], detail: 'その「分からない」から、始めよう。' },
  { start: 4, end: 9, label: '01 / CHOOSE', title: ['書けなくても。', 'まずは、選ぶだけ。'], detail: '文字入力なし。12問の5択。' },
  { start: 9, end: 13, label: '02 / COLLECT', title: ['答えるほど、', '手がかりが集まる。'], detail: 'どの答えも、自分を知る一歩に。' },
  { start: 13, end: 18, label: '03 / FIND', title: ['自分の軸が、', '言葉になる。'], detail: '根拠になった回答も、一緒に。' },
  { start: 18, end: 24, label: '04 / EXPLORE', title: ['次に調べる業界も。', '企業へ聞くことも。'], detail: '仕事の中身を、確かめるヒントへ。' },
  { start: 24, end: 30, label: 'YOUR NEXT CHAPTER', title: ['じぶんの手がかり'], detail: '選んで答える、就活のヒント探し。' },
];

export async function installStage(page, assets) {
  await page.setContent('<!doctype html><html lang="ja"><meta charset="utf-8"><body style="margin:0"><canvas width="1080" height="1920"></canvas></body></html>');
  await page.evaluate(async ({ scenes, assets }) => {
    const images = {};
    await Promise.all(Object.entries(assets).map(async ([name, url]) => { const image = new Image(); image.src = url; await image.decode(); images[name] = image; }));
    const ctx = document.querySelector('canvas').getContext('2d');
    const paper = '#f7f6f0', ink = '#233e36', green = '#214c3f', lime = '#d8ed85';
    const font = 'system-ui,-apple-system,BlinkMacSystemFont,"Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif';
    let bounds = [];
    const box = (x, y, w, h, r, fill) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); };
    function text(value, x, y, size, weight = 700, color = ink, align = 'left') {
      ctx.font = `${weight} ${size}px ${font}`; ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = color;
      const m = ctx.measureText(value), left = align === 'center' ? x - m.width / 2 : x;
      const b = { value, left, right: left + m.width, top: y - m.actualBoundingBoxAscent, bottom: y + m.actualBoundingBoxDescent };
      if (b.left < 76 || b.right > 1004 || b.top < 100 || b.bottom > 1680) throw new Error('Caption outside safe area: ' + value);
      bounds.push(b); ctx.fillText(value, x, y);
    }
    function photo(name, y, maxHeight = 980, width = 916, drift = 0) {
      const image = images[name], scale = Math.min(width / image.width, maxHeight / image.height), w = image.width * scale, h = image.height * scale;
      const x = (1080 - w) / 2;
      ctx.save(); ctx.shadowColor = '#243e3618'; ctx.shadowBlur = 25; ctx.shadowOffsetY = 13;
      box(x - 9, y + drift - 9, w + 18, h + 18, 26, '#fffefa'); ctx.restore();
      ctx.drawImage(image, x, y + drift, w, h);
      return { x, y: y + drift, width: w, height: h };
    }
    function star(x, y, time) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(time * .08); ctx.strokeStyle = '#a34c2c'; ctx.lineWidth = 3;
      for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 4); ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(22, 0); ctx.stroke(); } ctx.restore();
    }
    window.drawPromo = time => {
      bounds = [];
      const index = Math.max(0, scenes.findIndex(s => time >= s.start && time < s.end)), scene = scenes[index], local = time - scene.start;
      const drift = 7 * Math.exp(-local * 5) + 2 * Math.sin(time * 1.1);
      ctx.fillStyle = paper; ctx.fillRect(0, 0, 1080, 1920);
      ctx.strokeStyle = '#dfe4d6'; ctx.lineWidth = 1;
      for (let x = 60; x < 1080; x += 46) for (let y = 560; y < 1740; y += 46) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 1, y); ctx.stroke(); }
      text('DAY 072 / 100', 84, 150, 26, 700); star(955, 140, time);
      ctx.fillStyle = '#d3dcc8'; ctx.fillRect(84, 181, 912, 2);
      text(scene.label, 84, 243, 28, 650, '#607358');
      let picture;
      if (index !== 5) {
        box(82, 375, 590, 28, 2, lime);
        scene.title.forEach((line, i) => text(line, 82, 343 + i * 97, 76, 800));
        text(scene.detail, 84, 516, 35, 550, '#52664e');
        if (index === 0) picture = photo('preview', 610, 925, 870, drift);
        if (index === 1) picture = photo(local < 2.5 ? 'question1' : 'question2', 613, 955, 916, drift);
        if (index === 2) {
          const name = local < 1.1 ? 'passport0' : local < 2.2 ? 'passport3' : 'passport6';
          photo(name.replace('passport', 'journey'), 610, 60, 916, 0); picture = photo(name, 737, 780, 916, drift);
        }
        if (index === 3) picture = photo('axis', 615, 950, 916, drift);
        if (index === 4) {
          picture = photo('industry', 606, 560, 916, drift);
          box(84, 1200, 912, 340, 25, '#e6e1f1');
          text('企業へ聞く質問の例', 124, 1260, 28, 650, '#52664e');
          ['利用者やお客さまと、', 'どのくらい継続して', '関われますか？'].forEach((line, i) => text(line, 124, 1337 + i * 64, 45, 650));
        }
        text('架空の回答例・操作画面を短縮編集', 84, 1646, 29, 550, '#64745c');
      } else {
        ctx.save(); ctx.translate(540, 510); ctx.rotate(Math.sin(time) * .025);
        box(-130, -143, 260, 286, 32, green); ctx.strokeStyle = lime; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(-36, -74); ctx.lineTo(39, -74); ctx.lineTo(39, 74); ctx.lineTo(2, 47); ctx.lineTo(-36, 74); ctx.closePath(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-19, -46); ctx.lineTo(22, -46); ctx.moveTo(-19, -20); ctx.lineTo(10, -20); ctx.stroke(); ctx.restore();
        text('じぶんの手がかり', 540, 793, 86, 800, ink, 'center');
        text(scene.detail, 540, 880, 39, 550, '#52664e', 'center');
        box(160, 975, 760, 84, 42, '#e5edda'); text('12問・5択  /  登録不要', 540, 1032, 38, 700, green, 'center');
        text('わたしの「好き」から、', 540, 1169, 55, 700, ink, 'center');
        text('仕事のヒントを。', 540, 1247, 55, 700, ink, 'center');
        box(124, 1346, 832, 100, 18, green); text('手がかりを、探しに行こう。', 540, 1412, 43, 650, '#fffefa', 'center');
        text('hundred-days.pages.dev/', 540, 1545, 37, 550, ink, 'center');
        text('day-072-jibun-note/', 540, 1602, 37, 550, ink, 'center');
      }
      box(84, 1712, 912, 4, 2, '#d3dcc8'); box(84, 1712, Math.max(4, 912 * time / 30), 4, 2, '#a8bc79');
      return { jpeg: document.querySelector('canvas').toDataURL('image/jpeg', .97).split(',')[1], scene: index, textBounds: bounds, picture };
    };
  }, { scenes: SCENES, assets });
}
