import { ReadableText } from './ReadableText';
import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';

/*
 * 窓を閉じたら、開くきっかけになったボタンへフォーカスを戻す（WAI-ARIA の dialog の作法）。
 * Safari はボタンをクリックしてもフォーカスを移さないので、document.activeElement だけでは戻す先が body になる。
 * そこで、直前に押されたボタン・リンクを捕捉段階のクリックで覚えておき、フォーカスが無い時はそれを使う。
 */
let lastPressed: HTMLElement | null = null;
if (typeof document !== 'undefined') {
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('button, a[href], [role="button"]') : null;
    if (target && !target.closest('dialog')) lastPressed = target;
  }, true);
}

function openerElement(): HTMLElement | null {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body && !active.closest('dialog')) return active;
  return lastPressed?.isConnected ? lastPressed : null;
}

export function Sheet({ title, onClose, children }: { title: string; onClose(): void; children: ComponentChildren }) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current!;
    const previous = openerElement();
    dialog.showModal();
    return () => {
      dialog.close();
      // WebKit finishes its native dialog focus handling after close().
      requestAnimationFrame(() => {
        if (previous?.isConnected && !document.querySelector('dialog[open]')) previous.focus({ preventScroll: true });
      });
    };
  }, []);
  return <dialog ref={ref} class="sheet" aria-label={title} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div class="sheet__body"><div class="sheet__handle" /><h2><ReadableText text={title} /></h2>{children}</div>
  </dialog>;
}
