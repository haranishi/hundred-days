import { captionAt, END_START } from './timeline.mjs';

// 字幕とエンド画面は、渡された動画の秒 t だけで決める。ページ内で時計を進めない（URL も render 側が組み立てる）
window.__promo = {
  load(url) { document.querySelector('#game-frame').src = url; },
  render(t, { questions } = {}) {
    const lines = document.querySelector('#caption-lines');
    lines.replaceChildren();
    captionAt(t).forEach((line, index) => {
      if (index) lines.append(document.createElement('br'));
      lines.append(line.replaceAll('{questions}', String(questions)));
    });
    const end = document.querySelector('#end');
    end.hidden = t < END_START;
    if (end.hidden) return;
    // エンド画面の水晶玉も、アプリと同じ速さで霧を回し、光をゆらす（字幕の位置より上だけが動く）
    const k = t - END_START;
    document.querySelector('#end-mist-a').setAttribute('transform', `rotate(${(k * 360 / 38).toFixed(2)} 200 200)`);
    document.querySelector('#end-mist-b').setAttribute('transform', `rotate(${(-k * 360 / 54).toFixed(2)} 200 200)`);
    document.querySelector('#end-aura').setAttribute('opacity', (.78 + .22 * Math.cos(k * Math.PI * 2 / 3.6)).toFixed(3));
    [...document.querySelectorAll('#end-sparkles path')].forEach((path, index) => {
      const wave = .5 - .5 * Math.cos((k - index * .8) * Math.PI * 2 / 2.4);
      path.setAttribute('opacity', (.15 + .85 * wave).toFixed(3));
    });
  },
};
