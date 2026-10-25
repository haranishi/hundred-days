import { useState } from 'react';
import { Icon } from './Icon';
export function ShareApp() {
  const [message, setMessage] = useState('');
  const url = import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin;
  const text = '画像・PDF・Office・データの変換をひとつに。へんかんデスク';
  async function copy() { try { await navigator.clipboard.writeText(url); setMessage('リンクをコピーしました'); } catch { setMessage('アドレスバーのURLをコピーしてください'); } }
  async function share() { try { if (navigator.share && (!navigator.canShare || navigator.canShare({ title: 'へんかんデスク', text, url }))) await navigator.share({ title: 'へんかんデスク', text, url }); else await copy(); } catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) await copy(); } }
  return <details className="share-menu"><summary><Icon name="share" size={16}/><span>共有</span></summary><div className="share-popover">
    <button onClick={copy}>リンクをコピー</button>
    <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer">Xで紹介</a>
    <a href={`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer">LINEで紹介</a>
    <button onClick={share}>端末の共有メニュー</button><p role="status">{message}</p>
  </div></details>;
}
