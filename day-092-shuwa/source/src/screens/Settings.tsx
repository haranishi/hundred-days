import { ReadableText } from '../ui/ReadableText';
import { clearSession } from '../store/session';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Progress } from '../store/schema';
import { exportFilename, exportProgress, importProgress } from '../store/transfer';
import { flushProgress, lastResult, localToday, progress, resetLocalProgress, systemReducedMotion, updateProgress, updateSettings } from '../app/state';
import { navigate } from '../app/router';
import { Button } from '../ui/Button';
import { Sheet } from '../ui/Sheet';

export function Settings() {
  const settings = progress.value.settings;
  const [pending, setPending] = useState<Progress | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const selection = useRef(0);
  useEffect(() => () => { selection.current++; }, []);
  const download = () => {
    let url: string | undefined;
    try {
      url = URL.createObjectURL(new Blob([exportProgress(progress.value)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = exportFilename(localToday());
      document.body.append(link); link.click(); link.remove();
      setMessage('記録のファイルを書き出しました。保存先を確認してください。');
    } catch { setMessage('書き出しができませんでした。もう一度お試しください。'); }
    finally { if (url) { const exportedUrl = url; setTimeout(() => URL.revokeObjectURL(exportedUrl), 1000); } }
  };
  const read = async (file: File) => {
    const ticket = ++selection.current;
    setBusy(true); setPending(null); setMessage('記録の形式を確認しています。');
    try {
      if (file.size > 5 * 1024 * 1024) { setMessage('ファイルが大きすぎます。5MB以下の記録を選んでください。'); return; }
      const result = importProgress(await file.text());
      if (ticket !== selection.current) return;
      if (result.ok) { setPending(result.progress); setMessage(''); }
      else setMessage(result.reason);
    } catch { if (ticket === selection.current) setMessage('ファイルを読み取れませんでした。もう一度選んでください。'); }
    finally { if (ticket === selection.current) setBusy(false); }
  };
  const replace = (next: Progress) => { clearSession(); updateProgress(() => next); flushProgress(); lastResult.value = null; };
  return <main class="screen collection settings-screen"><a class="text-button back-link" href="#/me"><ReadableText text="〈 記録へ" /></a><h1><ReadableText text="設定" /></h1>
    <section class="card settings-fields" aria-label="学び方の設定">
      <label class="setting-row" for="dominant"><span><ReadableText text="利き手" /></span><select id="dominant" value={settings.dominant} onChange={event => updateSettings({ dominant: event.currentTarget.value as 'right' | 'left' })}><option value="right">右手</option><option value="left">左手</option></select></label>
      <label class="setting-row" for="daily-goal"><span><ReadableText text="1日の目標" /></span><select id="daily-goal" value={settings.dailyGoal} onChange={event => updateSettings({ dailyGoal: Number(event.currentTarget.value) as 10 | 20 | 30 | 50 })}>{[10, 20, 30, 50].map(goal => <option value={goal}>{goal}経験値</option>)}</select></label>
      {([{ key: 'sound', title: '効果音' }, { key: 'vibration', title: '振動' }] as const).map(field => <label class="setting-row" key={field.key}><span>{field.title}</span><input type="checkbox" role="switch" checked={settings[field.key]} onChange={event => updateSettings({ [field.key]: event.currentTarget.checked })} /></label>)}
      <label class="setting-row"><span><ReadableText text="カメラで形を確かめる" /></span><input type="checkbox" role="switch" aria-describedby="camera-description" checked={settings.camera} onChange={event => updateSettings({ camera: event.currentTarget.checked })} /></label>
      <p id="camera-description" class="small"><ReadableText text="「やってみよう」の問題で、ボタンを押したときだけカメラを使います" /></p>
      <label class="setting-row" for="reduce-motion"><span><ReadableText text="動きを減らす" /></span><select id="reduce-motion" value={settings.reduceMotion ? 'reduce' : 'system'} onChange={event => updateSettings({ reduceMotion: event.currentTarget.value === 'reduce' })}><option value="system">端末の設定に従う</option><option value="reduce">常に減らす</option></select></label>
      <p class="small"><ReadableText text={`端末の設定：${systemReducedMotion.value ? '動きを減らす' : '通常の動き'}。音や振動が使えない端末でも学習できます。`} /></p>
      <p class="small"><ReadableText text="カメラは任意です。映像はこの端末の中で処理し、保存も送信もしません。" /><a class="text-button" href="#/about"><ReadableText text="詳しく見る" /></a></p>
    </section>
    <section class="card prose option-stack"><h2><ReadableText text="記録の引き継ぎ" /></h2><p><ReadableText text="この端末のブラウザに保存した記録を、ファイルに書き出して引き継げます。" /></p><Button secondary onClick={download}><ReadableText text="記録を書き出す" /></Button><Button secondary disabled={busy} onClick={() => fileInput.current?.click()}><ReadableText text="記録を読み込む" /></Button><input ref={fileInput} hidden type="file" accept=".json,application/json" aria-label="記録を読み込むファイル" disabled={busy} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void read(file); }} /><p class="small"><ReadableText text="読み込む前に形式を確認します。置き換えるまでは、いまの記録が残ります。" /></p></section>
    <p role="status" aria-live="polite" class={message ? 'notice-box' : ''}><ReadableText text={message} /></p>
    <section class="card prose option-stack"><h2><ReadableText text="記録を消す" /></h2><p><ReadableText text="学習記録と設定をすべて消して、最初から始めます。元には戻せません。必要な記録は先に書き出してください。" /></p><Button secondary class="danger-button" onClick={() => setDeleting(true)}><ReadableText text="すべて消す" /></Button></section>
    {pending && <Sheet title="いまの記録を置き換えます" onClose={() => setPending(null)}><p><ReadableText text="選んだファイルの記録と設定に置き換えます。いまの記録は元に戻せません。" /></p><div class="option-stack"><Button secondary onClick={() => setPending(null)}><ReadableText text="やめる" /></Button><Button onClick={() => { replace(pending); setPending(null); setMessage('記録を読み込みました。'); if (!pending.settings.onboarded) navigate('#/'); }}><ReadableText text="置き換える" /></Button></div></Sheet>}
    {deleting && <Sheet title="すべての記録を消しますか？" onClose={() => setDeleting(false)}><p><ReadableText text="このブラウザの学習記録と設定を消します。書き出したファイルは消えません。" /></p><div class="option-stack"><Button onClick={() => setDeleting(false)}><ReadableText text="やめる" /></Button><button type="button" class="text-button danger-button" onClick={() => { resetLocalProgress(); setDeleting(false); navigate('#/welcome'); }}><ReadableText text="消して最初から" /></button></div></Sheet>}
  </main>;
}
