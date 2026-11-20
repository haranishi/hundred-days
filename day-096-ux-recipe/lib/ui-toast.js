export function mountToast(root) {
  const entries = new Map();
  function remove(item) {
    entries.get(item)?.stop();
    entries.delete(item);
    item.remove();
  }

  function toast(message, { kind = 'info', actionLabel, onAction } = {}) {
    const item = document.createElement('div');
    item.className = 'app-toast';
    item.dataset.kind = kind;
    const text = document.createElement('span');
    text.textContent = message;
    item.append(text);
    if (kind === 'error') item.setAttribute('role', 'alert');
    const delay = onAction || kind === 'error' ? 10000 : 5500;
    let timer;
    const stop = () => clearTimeout(timer);
    function restart() {
      stop();
      if (!item.matches(':hover, :focus-within')) timer = setTimeout(() => remove(item), delay);
    }
    if (actionLabel && typeof onAction === 'function') {
      const origin = document.activeElement;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'app-toast-action';
      button.textContent = actionLabel;
      button.addEventListener('click', () => {
        const hadFocus = item.contains(document.activeElement);
        remove(item);
        onAction();
        if (hadFocus && origin?.isConnected && !origin.disabled && origin.getClientRects().length) origin.focus({ preventScroll: true });
      });
      item.append(button);
    }
    item.addEventListener('focusin', stop);
    item.addEventListener('focusout', () => queueMicrotask(() => { if (item.isConnected) restart(); }));
    item.addEventListener('pointerenter', stop);
    item.addEventListener('pointerleave', restart);
    entries.set(item, { stop });
    root.append(item);
    if (entries.size > 3) {
      const oldest = [...entries.keys()].find(node => !node.contains(document.activeElement));
      if (oldest) remove(oldest);
    }
    restart();
  }
  return { toast, destroy() { for (const item of entries.keys()) remove(item); } };
}
