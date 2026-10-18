export const FPS = 30;
export const DURATION = 30;
export const SCENES = [
  { start: 0, end: 3.2, label: '球打ち × 陣取り', title: ['返すだけじゃ、', '勝てない。'], detail: '一打で、コートの色が変わる。' },
  { start: 3.2, end: 8, label: '01  返す → 塗る', title: ['返す。', '着地を塗る。'], detail: '落ちた1マスが、自分の陣地に。' },
  { start: 8, end: 14.8, label: '02  挟んで反転', title: ['挟めば、', 'まとめて反転。'], detail: '縦・横・斜め。相手の列を取り返す。' },
  { start: 14.8, end: 21.4, label: '03  狙いを変える', title: ['中央は奥へ。', '端なら左右へ。'], detail: 'ラケットの、当てる位置で打ち分ける。' },
  { start: 21.4, end: 25.8, label: '04  60秒の決着', title: ['60秒後、', '陣地で決着。'], detail: '最後にマスが多い方の勝ち。' },
  { start: 25.8, end: 30, label: 'FLIP COURT', title: ['フリップコート'], detail: '60秒の陣取りラリー' },
];

// The only game image is the untouched browser screenshot supplied by the recorder.
export async function installStage(page) {
  await page.setContent('<!doctype html><html lang="ja"><meta charset="utf-8"><body style="margin:0;background:#f6f1e7"><canvas width="1080" height="1920"></canvas></body></html>');
  await page.evaluate(scenes => {
    const canvas = document.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const font = 'system-ui, -apple-system, BlinkMacSystemFont, "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif';
    const paper = '#f6f1e7', ink = '#183d34', green = '#184e42', warm = '#efa866', mint = '#84c3ad';
    const textBounds = [];
    const box = (x, y, w, h, r, color) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = color; ctx.fill(); };
    const text = (value, x, y, size, weight = 700, color = ink, align = 'left') => {
      ctx.font = `${weight} ${size}px ${font}`; ctx.textBaseline = 'alphabetic'; ctx.textAlign = align; ctx.fillStyle = color;
      const metrics = ctx.measureText(value), width = metrics.width;
      const left = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
      const bounds = { value, left, right: left + width, top: y - metrics.actualBoundingBoxAscent, bottom: y + metrics.actualBoundingBoxDescent };
      textBounds.push(bounds);
      if (bounds.left < 70 || bounds.right > 1010 || bounds.top < 90 || bounds.bottom > 1810) throw new Error(`Caption outside safe area: ${value}`);
      ctx.fillText(value, x, y);
    };
    const mark = (owner, x, y, r = 11) => {
      ctx.beginPath();
      if (owner === 1) ctx.arc(x, y, r, 0, Math.PI * 2);
      else { ctx.moveTo(x, y-r-2); ctx.lineTo(x+r+2, y); ctx.lineTo(x, y+r+2); ctx.lineTo(x-r-2, y); ctx.closePath(); }
      ctx.fillStyle = owner === 1 ? warm : mint; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.stroke();
    };
    const image = new Image();
    window.drawPromo = async (time, screenshot) => {
      textBounds.length = 0;
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = `data:image/jpeg;base64,${screenshot}`; });
      const index = Math.max(0, scenes.findIndex(scene => time >= scene.start && time < scene.end));
      const scene = scenes[index], local = time - scene.start, ending = index === 5;
      const settle = index === 0 ? 0 : 12 * Math.exp(-local * 9);
      ctx.fillStyle = paper; ctx.fillRect(0, 0, 1080, 1920);
      // Moving geometric accents; captions are already present on the first frame.
      ctx.save(); ctx.translate(945, 166); ctx.rotate(-.12 + Math.sin(time * .8) * .035);
      [[-26,-26,green],[7,-26,warm],[-26,7,warm],[7,7,green]].forEach(([x,y,color]) => box(x,y,27,27,4,color)); ctx.restore();
      text('DAY 070 / 100', 84, 142, 24, 750);
      ctx.fillStyle = '#c6cfbd'; ctx.fillRect(84, 170, 790, 2);
      text(scene.label, 84, 214, 26, 700, '#547362');
      if (!ending) {
        scene.title.forEach((line, i) => text(line, 80, 302 + i * 91 + settle, 78, 850));
        text(scene.detail, 84, 442, 36, 600);
      } else {
        text('フリップコート', 78, 316 + settle, 83, 850);
        text(scene.detail, 84, 389, 39, 700);
        text('返す → 塗る → 挟んで反転', 84, 453, 30, 650, '#547362');
      }
      const width = ending ? 780 : 888;
      const x = (1080 - width) / 2, y = ending ? 504 : 481;
      const height = width * image.height / image.width;
      const drift = Math.sin(time * 1.4) * (ending ? 3 : 1.5);
      ctx.save(); ctx.shadowColor = '#183d341a'; ctx.shadowBlur = 26; ctx.shadowOffsetY = 13;
      box(x - 10, y + drift - 10, width + 20, height + 20, 26, paper); ctx.restore();
      ctx.drawImage(image, x, y + drift, width, height);
      if (ending) {
        box(188, 1654, 704, 68, 34, green);
        text('1人でCPU戦  /  スマホ・PC', 540, 1700, 32, 700, '#fff8e7', 'center');
        text('次の一打で、塗り替えよう。', 540, 1784, 38, 800, ink, 'center');
      } else if (index === 4) {
        text('※ 試合の途中を編集しています。', 540, 1786, 32, 600, '#547362', 'center');
      } else if (index === 2) {
        text('実線は着地。破線は反転したマス。', 540, 1786, 34, 600, ink, 'center');
      } else {
        mark(1, 291, 1774); text('自分', 314, 1786, 34, 650);
        mark(2, 496, 1774); text('CPU', 521, 1786, 34, 650);
        text('実ゲーム映像', 788, 1786, 24, 550, '#547362', 'center');
      }
      // A continuous progress line avoids fading the whole frame to black.
      box(84, 1830, 912, 4, 2, '#d4dacb');
      box(84, 1830, Math.max(8, 912 * time / 30), 4, 2, warm);
      return { jpeg: canvas.toDataURL('image/jpeg', .97).split(',')[1], index, textBounds: [...textBounds] };
    };
  }, SCENES);
}
