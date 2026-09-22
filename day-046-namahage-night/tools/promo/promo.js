import { captionAt, sceneAt, END_START } from './timeline.mjs';
// URLはrender側で組み立てて渡す。ページ内でゲームの時計を進めない。
window.__promo = {
  load(url) { document.querySelector('#game-frame').src = url; },
  render(t) {
    document.querySelector('#composition').dataset.focus = sceneAt(t)?.focus ?? 'end';
    const lines = document.querySelector('#caption-lines');
    lines.replaceChildren();
    captionAt(t).forEach((line, index) => {
      if (index) lines.append(document.createElement('br'));
      lines.append(line);
    });
    document.querySelector('#end').hidden = t < END_START;
  },
};
