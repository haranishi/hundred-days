/** 景色を見る画面：決まった視点（山のデータの views）を切り替えて、山を眺める。下の帯に、名前と前後・戻るのボタンだけを出す。 */
export function vistaLabel({ name = '', index = 0, count = 0 } = {}) { return count ? `${name}（${index + 1}／${count}）` : name; }
export function createVista({ document, onPrev, onNext, onClose }) {
  const element = document.createElement('section'); element.className = 'vista'; element.hidden = true; element.dataset.screen = 'vista';
  element.setAttribute('aria-label', '景色を見る');
  element.innerHTML = `<div class="vista-bar panel"><button data-action="vista-prev" aria-label="前の景色">前へ</button>
    <p data-vista-name role="status" aria-live="polite"></p>
    <button data-action="vista-next" aria-label="次の景色">次へ</button><span class="vista-gap" aria-hidden="true"></span><button data-action="vista-close" aria-label="景色を見るのをやめて戻る">戻る</button></div>`;
  element.querySelector('[data-action="vista-prev"]').addEventListener('click', onPrev);
  element.querySelector('[data-action="vista-next"]').addEventListener('click', onNext);
  element.querySelector('[data-action="vista-close"]').addEventListener('click', onClose);
  element.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); onPrev(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); onNext(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
  });
  let previous;
  return { element,
    update(model) { element.querySelector('[data-vista-name]').textContent = vistaLabel(model); },
    show() { if (element.hidden) previous = document.activeElement; element.hidden = false; element.querySelector('[data-action="vista-next"]').focus(); },
    hide() { if (element.hidden) return; element.hidden = true; previous?.focus?.(); } };
}
