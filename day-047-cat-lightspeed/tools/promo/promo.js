import { captionAt, END_START } from './timeline.mjs';

// 字幕とエンド画面は、渡された動画の秒 t だけで決める。ページ内で時計を進めない（URL も render 側が組み立てる）
window.__promo = {
  load(url) { document.querySelector('#game-frame').src = url; },
  // 光の猫の写真（アプリの結果画面の canvas を写したもの）をエンド画面に置き、読み込みを待つ
  async photo(src) {
    const img = document.querySelector('#end-photo');
    img.src = src;
    await img.decode();
  },
  render(t) {
    const lines = document.querySelector('#caption-lines');
    lines.replaceChildren();
    captionAt(t).forEach((line, index) => {
      if (index) lines.append(document.createElement('br'));
      lines.append(line);
    });
    document.querySelector('#caption').hidden = t >= END_START;
    const end = document.querySelector('#end');
    end.hidden = t < END_START;
    if (end.hidden) return;
    // 写真の光だけをゆっくり脈打たせる（字幕の札の位置より上だけが動く）
    const k = t - END_START;
    document.querySelector('#end-glow').style.opacity = (.55 + .45 * Math.cos(k * Math.PI * 2 / 2.4)).toFixed(3);
  },
};
