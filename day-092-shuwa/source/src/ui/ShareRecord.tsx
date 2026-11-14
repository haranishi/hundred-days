import { ReadableText } from './ReadableText';
import { useState } from 'preact/hooks';
import { shareLinks, shareUrl } from '../app/share';
import { Button } from './Button';
export function ShareRecord({ text }: { text: string }) {
  const [message, setMessage] = useState('');
  const url = shareUrl(document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href, location.href);
  const links = shareLinks(text, url);
  const nativeShare = async () => {
    try { await navigator.share({ title: 'てことば', text, url }); }
    catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) setMessage('共有できませんでした。リンクをコピーしてお使いください。'); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(`${text}\n${url}`); setMessage('記録の文とリンクをコピーしました'); }
    catch { setMessage('コピーできませんでした。下のリンクを選択してコピーしてください。'); }
  };
  return <div class="share-record">
    <p class="share-record__text"><ReadableText text={text} /></p>
    <div class="share-record__actions">
      {typeof navigator.share === 'function' && <Button secondary onClick={() => void nativeShare()}><ReadableText text="端末で共有" /></Button>}
      <a class="button button--secondary" href={links.x} target="_blank" rel="noopener noreferrer"><ReadableText text="Xで共有" /></a>
      <a class="button button--secondary" href={links.line} target="_blank" rel="noopener noreferrer"><ReadableText text="LINEで共有" /></a>
      <Button secondary onClick={() => void copy()}><ReadableText text="リンクのコピー" /></Button>
    </div>
    <p role="status"><ReadableText text={message} /></p>
    {message.startsWith('コピーでき') && <input class="copy-url" aria-label="共有するリンク" readOnly value={url} onFocus={event => event.currentTarget.select()} />}
    <p class="small"><ReadableText text="InstagramとYouTubeはWebから直接投稿できない仕組みなので、共有かコピーしたリンクから貼ってください" /></p>
  </div>;
}
