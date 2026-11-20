import { DEVICES, GOAL_LABEL, countChars, exportFileName } from './contract.js';
import { buildStandaloneHtml } from './export-html.js';
import { canExportPng, exportPng } from './png-export.js';
import { button, controlId, element, radioChoices } from './ui-look.js';

// 長いリンクの知らせを出す字数。調べて決めた値ではなく、普通のページ（約2200字）では出さないための目安。
const LONG_LINK = 3000;

export function shareLinks(url, goal, score) {
  const text = 'UXレシピで「' + GOAL_LABEL[goal] + '」のページを組み立てました（UX診断 ' + score + '点）';
  const x = new URL('https://x.com/intent/post');
  x.searchParams.set('text', text);
  x.searchParams.set('url', url);
  const line = new URL('https://social-plugins.line.me/lineit/share');
  line.searchParams.set('url', url);
  return { url, text, xUrl: x.href, lineUrl: line.href, tooLong: countChars(url) > LONG_LINK };
}

export function dialogFrame(dialog, title) {
  const heading = element('h2', 'cs-title', title);
  heading.id = controlId('dialog');
  const bar = element('header', 'cs-dialog-head');
  const close = button('閉じる', () => dialog.close(), 'cs-btn cs-close');
  const body = element('div', 'cs-dialog-body');
  bar.append(heading, close);
  dialog.classList.add('cs-dialog');
  dialog.setAttribute('aria-labelledby', heading.id);
  dialog.replaceChildren(bar, body);
  let opener;
  function restoreFocus() {
    if (dialog.open) return;
    const active = document.activeElement;
    if (opener?.isConnected && (active === document.body || dialog.contains(active))) {
      opener.focus({ preventScroll: true });
    }
    opener = null;
  }
  dialog.addEventListener('close', restoreFocus);
  return {
    body, close,
    show(first) {
      if (!dialog.open) {
        opener = document.activeElement;
        dialog.showModal();
      }
      first?.focus({ preventScroll: true });
    },
    destroy() {
      if (dialog.open) { dialog.close(); restoreFocus(); }
      dialog.removeEventListener('close', restoreFocus);
      dialog.replaceChildren();
    },
  };
}

export async function copyText(text, dialog) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // モーダルの外はフォーカスできないため、コピー用の欄も同じダイアログに置く。
    if (!dialog.open) return false;
    const previous = document.activeElement;
    const buffer = element('textarea', 'cs-copy-buffer');
    buffer.readOnly = true;
    buffer.value = text;
    buffer.tabIndex = -1;
    buffer.setAttribute('aria-label', 'コピーする内容');
    dialog.append(buffer);
    try {
      buffer.focus({ preventScroll: true });
      buffer.select();
      return document.execCommand('copy') === true;
    } catch {
      return false;
    } finally {
      buffer.remove();
      previous?.focus({ preventScroll: true });
    }
  }
}

function downloadBlob(blob, filename, dialog) {
  const href = URL.createObjectURL(blob);
  const link = element('a');
  try {
    link.href = href;
    link.download = filename;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.hidden = true;
    dialog.append(link);
    link.click();
  } finally {
    link.remove();
    // ダウンロード側が参照を受け取ってから解放する。
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }
}

function externalLink(label) {
  const link = element('a', 'cs-btn', label);
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

export function mountShare(dialog, ctx) {
  const frame = dialogFrame(dialog, '共有・書き出し');
  const tablist = element('div', 'cs-tabs');
  tablist.setAttribute('role', 'tablist');
  tablist.setAttribute('aria-label', '共有・書き出し');
  const keys = ['link', 'export'];
  const pages = {};
  const tabs = {};
  let activeTab = 'link';
  let revision = 0;
  let links;
  let lastState;
  let width = DEVICES[0].width;

  for (const [i, key] of keys.entries()) {
    const tab = button(['リンク', '書き出し'][i], () => activate(key), 'cs-tab');
    const page = element('section', 'cs-tab-page');
    tab.id = controlId('tab');
    page.id = tab.id + '-page';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', page.id);
    page.setAttribute('role', 'tabpanel');
    page.setAttribute('aria-labelledby', tab.id);
    tab.addEventListener('keydown', (event) => {
      const next = { ArrowRight: keys[1 - i], ArrowLeft: keys[1 - i], Home: keys[0], End: keys[1] }[event.key];
      if (!next) return;
      event.preventDefault();
      tabs[next].focus();
      activate(next);
    });
    tabs[key] = tab;
    pages[key] = page;
    tablist.append(tab);
  }
  frame.body.append(tablist, pages.link, pages.export);

  async function copy(text) {
    const ok = await copyText(text, dialog);
    ctx.toast(ok ? 'コピーしました' : 'コピーできませんでした。', { kind: ok ? 'info' : 'error' });
  }
  const url = element('input', 'cs-input cs-url');
  url.type = 'text';
  url.readOnly = true;
  url.id = controlId('url');
  const caption = element('label', 'cs-label', '共有リンク');
  caption.htmlFor = url.id;
  const status = element('p', 'cs-help');
  status.setAttribute('role', 'status');
  const longNote = element('p', 'cs-notice', 'リンクが長めです。貼り付け先で全文が入らないときは、HTMLで渡せます。');
  const copyLink = button('リンクをコピー', () => { if (links) void copy(links.url); }, 'cs-btn cs-primary');
  const x = externalLink('Xで投稿');
  const line = externalLink('LINEで送る');
  const destinations = element('div', 'cs-actions');
  destinations.append(copyLink, x, line);
  let native;
  if (typeof globalThis.navigator?.share === 'function') {
    native = button('端末の共有を開く', async () => {
      if (!links) return;
      try {
        await navigator.share({ text: links.text, url: links.url });
      } catch (error) {
        if (error?.name !== 'AbortError') ctx.toast('端末の共有を開けませんでした。', { kind: 'error' });
      }
    });
    destinations.append(native);
  }
  const linkField = element('div', 'cs-field');
  linkField.append(caption, url, status);
  pages.link.append(linkField, destinations, longNote,
    element('p', 'cs-help', 'InstagramやYouTubeには、コピーしたリンクを貼り付けてください。'),
    element('p', 'cs-notice', 'ページの内容はリンクの中にあり、このアプリのサーバーには送られません。受け取った人と共有先のサービスには内容が見えます。'));

  function setLinks(next) {
    links = next;
    url.value = next?.url ?? '';
    copyLink.disabled = !next;
    if (native) native.disabled = !next;
    for (const [node, href] of [[x, next?.xUrl], [line, next?.lineUrl]]) {
      if (href) node.href = href;
      else node.removeAttribute('href');
      node.setAttribute('aria-disabled', String(!href));
    }
    longNote.hidden = !next?.tooLong;
  }

  async function refreshLinks(state, ticket) {
    setLinks(null);
    if (!state) { status.textContent = '共有したいページを開いてください。'; return; }
    status.textContent = 'リンクを作っています…';
    try {
      const score = ctx.diagnose().score;
      const link = await ctx.viewUrl();
      if (ticket !== revision || !dialog.open) return;
      if (!link) throw new Error();
      setLinks(shareLinks(link, state.goal, score));
      status.textContent = '';
    } catch (error) {
      // 長すぎるときは、減らす手がかりつきの理由（codec.js の RangeError）をそのまま出す。
      const reason = error instanceof RangeError && error.message ? `${error.message} ` : 'リンクを作れませんでした。';
      if (ticket === revision && dialog.open) status.textContent = `${reason}書き出しからHTMLを保存できます。`;
    }
  }

  const htmlActions = element('div', 'cs-actions');
  const htmlDownload = button('HTMLをダウンロード', () => {
    const state = ctx.getState();
    try {
      const blob = new Blob([buildStandaloneHtml(state)], { type: 'text/html;charset=utf-8' });
      downloadBlob(blob, exportFileName(state.goal, 'html'), dialog);
    } catch {
      ctx.toast('HTMLを保存できませんでした。', { kind: 'error' });
    }
  }, 'cs-btn cs-primary');
  const htmlCopy = button('HTMLをコピー', () => { void copy(buildStandaloneHtml(ctx.getState())); });
  htmlActions.append(htmlDownload, htmlCopy);
  const pngArea = element('div', 'cs-png');
  const widths = radioChoices('画像の幅', DEVICES.map((device) => ({
    value: device.width, label: device.label + '幅',
  })), (value) => { width = value; });
  const pngSave = button('画像で保存(PNG)', async () => {
    const state = ctx.getState();
    const ticket = revision;
    pngSave.disabled = true;
    try {
      const blob = await exportPng(state, { width, scale: 2 });
      if (ticket !== revision || !dialog.open) return;
      if (!blob) throw new Error();
      downloadBlob(blob, exportFileName(state.goal, 'png'), dialog);
    } catch {
      if (ticket === revision && dialog.open) ctx.toast('画像を保存できませんでした。HTMLで保存できます。', { kind: 'error' });
    } finally {
      if (ticket === revision) pngSave.disabled = false;
    }
  });
  pngArea.append(widths.root, element('p', 'cs-help', '選んだ幅の2倍の解像度で保存します。'), pngSave);
  const note = element('p', 'cs-notice', '書き出したページは制作の叩き台です。公開する前に、見本の文章・ボタンの行き先・フォームの送信先を見直してください。');
  pages.export.append(htmlActions, note);

  function refresh() {
    const state = ctx.getState();
    const ticket = ++revision;
    if (activeTab === 'link') {
      void refreshLinks(state, ticket);
      return;
    }
    htmlDownload.disabled = htmlCopy.disabled = !state;
    pngArea.remove();
    if (state) void canExportPng().then((ok) => {
      if (!ok || ticket !== revision || !dialog.open) return;
      pngSave.disabled = false;
      pages.export.insertBefore(pngArea, note);
    });
  }
  function activate(key) {
    activeTab = key;
    for (const name of keys) {
      const selected = name === key;
      tabs[name].setAttribute('aria-selected', String(selected));
      tabs[name].tabIndex = selected ? 0 : -1;
      pages[name].hidden = !selected;
    }
    refresh();
  }
  const off = ctx.subscribe(({ state }) => {
    if (lastState === state) return;
    lastState = state;
    if (dialog.open) refresh();
  });
  return {
    open(tab = 'link') {
      const key = keys.includes(tab) ? tab : 'link';
      width = (DEVICES.find((device) => device.key === ctx.getDevice()) ?? DEVICES[0]).width;
      widths.update(width);
      frame.show(tabs[key]);
      activate(key);
    },
    destroy() { revision++; off(); frame.destroy(); },
  };
}
