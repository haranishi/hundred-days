// 案内役の一言。短冊が0.2秒で降りてきて約2.5秒で消える。重なったら新しいほうに置き換える
import { h, mark } from './dom.js';
import { phrased } from './wrap.js';

// 対局中は見出し帯の中央の枠（2行まで）に出す。収まらない長い台詞は、少し待ってから1行ずつ送って続きを見せる
export function createAnnai(home = document.body) {
  const text = h('span', { class: 'annai-text' });
  const box = h('span', { class: 'annai-box' }, text);
  const el = h('div', { class: 'annai', role: 'status', 'aria-live': 'polite', 'data-state': 'off' },
    mark({ size: 22, color: 'var(--shu)', solid: true }), box);
  let rollTimer = 0;
  home.append(el);
  let timer = 0;
  let held = false;

  function say(msg, { hold = false, ms = 2500 } = {}) {
    clearTimeout(timer);
    clearTimeout(rollTimer);
    text.style.transition = 'none';
    text.style.transform = '';
    text.replaceChildren(phrased(msg));
    el.dataset.state = 'off';
    void el.offsetWidth; // 降りてくる動きを最初からやり直す
    el.dataset.state = 'on';
    held = hold;
    const over = text.offsetHeight - box.clientHeight;
    if (over > 1) {
      rollTimer = setTimeout(() => {
        text.style.transition = document.documentElement.dataset.motion === 'reduce' ? 'none' : 'transform 0.35s ease';
        text.style.transform = `translateY(${-over}px)`;
      }, 1200);
    }
    if (!hold) timer = setTimeout(hide, over > 1 ? ms + 1300 : ms);
  }

  function hide() {
    clearTimeout(timer);
    clearTimeout(rollTimer);
    held = false;
    if (el.dataset.state !== 'on') return;
    el.dataset.state = 'out';
    timer = setTimeout(() => {
      el.dataset.state = 'off';
    }, 220);
  }

  // 対局中は盤の上に置く（null で元の場所へ戻す）
  function attach(container) {
    (container ?? home).append(el);
    el.classList.toggle('is-local', Boolean(container));
  }

  return {
    el,
    say,
    hide,
    attach,
    get held() {
      return held && el.dataset.state === 'on';
    },
  };
}
