// タイトル。店先の藍の暖簾が左右に分かれて上へ払われ、看板の題字が現れる
// （定式幕の縞は歌舞伎座の登録商標なので使わない。暖簾の印「丸に辻」はオリジナル）
import { h, fuda, mark } from './dom.js';
import { TEXT } from './copy.js';

// 共有欄は全アプリ共通の部品（shared/share.js）が index.html の #share に据え付ける。
// タイトルにいる間だけ口上の列の末尾へ移して見せ、ほかの画面へ移るときは body へ戻して隠す
// （部品は読み込み時に1回しか据え付けないので、画面を作り直すたびに作ることはできない）
let shareHost = null;
function takeShareHost() {
  shareHost ??= document.getElementById('share');
  return shareHost;
}

export function mountTitle(app, { opening = false } = {}) {
  const el = h('section', { class: 'screen screen-title', 'data-screen': 'title', tabindex: '-1' });
  const host = takeShareHost();
  // 看板の中心を口上と主ボタンの軸にそろえる。脇の「江戸のクロスワード」の札は看板の左肩に少し重ねる（v2-r3）
  const sign = h('div', { class: 'title-sign' },
    h('div', { class: 'kanban-wrap' },
      h('div', { class: 'kanban' },
        h('h1', { class: 'title-main' }, TEXT.title.main),
        mark({ size: 30, color: 'var(--shu)', solid: true })),
      h('p', { class: 'title-sub' }, TEXT.title.sub)));
  // 口上は「、」「。」の後で折り返す（句の途中で切らない）
  const kojo = TEXT.title.kojo.replace(/([、。])/g, '$1\n').split('\n').filter(Boolean).map((part) => h('span', {}, part));
  const actions = h('div', { class: 'title-actions' },
    fuda(TEXT.title.start, { primary: true, size: 'lg', act: 'start', onclick: () => app.go('select') }),
    app.hasCurrent() ? fuda(TEXT.title.resume, { act: 'resume', onclick: () => app.resume() }) : null,
    h('div', { class: 'btn-row' },
      fuda(TEXT.title.banzuke, { size: 'sm', act: 'banzuke', onclick: () => app.go('banzuke') }),
      fuda(TEXT.title.howto, { size: 'sm', act: 'howto', onclick: () => app.go('howto') }),
      fuda(TEXT.title.settings, { size: 'sm', act: 'settings', onclick: () => app.go('settings') })));
  el.append(h('div', { class: 'col title-col' },
    sign,
    h('p', { class: 'kojo' }, kojo),
    h('p', { class: 'kojo-small' }, TEXT.title.small),
    actions,
    host));
  if (host) host.hidden = false;

  const noren = opening && !app.reduced() ? createNoren(app) : null;
  if (noren) el.append(noren.el);
  return {
    el,
    show() {
      noren?.play();
    },
    destroy() {
      noren?.finish();
      if (host) {
        host.hidden = true;
        document.body.append(host);
      }
    },
  };
}

function createNoren(app) {
  const panel = (side) => h('div', { class: `noren-panel is-${side}` },
    h('div', { class: 'noren-mark' }, mark({ size: 128, color: 'var(--washi)' })),
    h('p', { class: 'noren-name' }, side === 'left' ? 'こと' : 'ば辻'));
  const left = panel('left');
  const right = panel('right');
  const pole = h('div', { class: 'noren-pole' });
  const el = h('div', { class: 'noren', 'aria-hidden': 'true', 'data-noren': '' }, pole, left, right);
  let anims = [];
  let done = false;

  // 押せば即座に開き切る。押した操作はそのまま下のボタンにも届く（入力を止めない）
  const onPress = () => {
    app.audio.unlock();
    app.audio.hyoshigi();
    finish();
  };
  const off = () => {
    document.removeEventListener('pointerdown', onPress, true);
    document.removeEventListener('keydown', onPress, true);
  };

  function finish() {
    if (done) return;
    done = true;
    off();
    for (const a of anims) {
      try {
        a.finish();
      } catch {
        /* もう終わっている */
      }
    }
    el.remove();
  }

  function play() {
    document.addEventListener('pointerdown', onPress, true);
    document.addEventListener('keydown', onPress, true);
    if (typeof left.animate !== 'function') return finish();
    const opts = { duration: 1100, delay: 250, easing: 'cubic-bezier(.5,.05,.7,.25)', fill: 'forwards' };
    // s=-1 が左の布。下の端が外へ振れながら、上へ払われる（布が少し揺れる）
    const kf = (s) => [
      { transform: 'translate(0, 0) rotate(0deg) skewY(0deg)' },
      { transform: `translate(${s * 5}%, -1%) rotate(${-s * 3}deg) skewY(${s * 2}deg)`, offset: 0.25 },
      { transform: `translate(${s * 30}%, -34%) rotate(${-s * 9}deg) skewY(${-s * 1.5}deg)`, offset: 0.6 },
      { transform: `translate(${s * 64}%, -118%) rotate(${-s * 14}deg) skewY(0deg)` },
    ];
    anims = [
      left.animate(kf(-1), opts),
      right.animate(kf(1), opts),
      pole.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-240%)', opacity: 0 }], { ...opts, delay: 620, duration: 700 }),
    ];
    Promise.all(anims.map((a) => a.finished)).then(finish, () => {});
  }

  return { el, play, finish };
}
