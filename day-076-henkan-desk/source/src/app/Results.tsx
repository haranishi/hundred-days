import { useEffect, useRef, useState } from 'react';
import type { Artifact, SourceFile } from '../shared/contracts';
import type { ResultRow } from './useConversion';
import { Icon } from './Icon';
import { formatBytes } from './FileInput';
import { saveArtifact, safeFilename } from './download';
function ResultPreview({ artifact }: { artifact: Artifact }) {
  const [url, setURL] = useState('');
  useEffect(() => { const next = URL.createObjectURL(artifact.blob); setURL(next); return () => URL.revokeObjectURL(next); }, [artifact.blob]);
  return artifact.mime.startsWith('image/') ? <img className="result-thumbnail" src={url || undefined} alt="変換後の画像"/> : <span className="pdf-thumbnail"><Icon name="file" size={26}/><b>{safeFilename(artifact.filename, artifact.mime).split('.').pop()?.toUpperCase()}</b></span>;
}
export function Results({ sources, rows, busy, onCancel, stale }: { sources: readonly SourceFile[]; rows: Record<string, ResultRow>; busy: boolean; onCancel: () => void; stale: boolean }) {
  const [saveMessage, setSaveMessage] = useState('');
  const heading=useRef<HTMLHeadingElement>(null),failed=Object.values(rows).filter(row=>row.state==='failed').length;
  useEffect(()=>{setSaveMessage('');},[rows,sources]);
  useEffect(()=>{if(!busy&&failed)heading.current?.scrollIntoView({block:'center',behavior:'smooth'});},[busy,failed]);
  const active = sources.some(source => rows[source.id]?.state !== 'ready' && rows[source.id]);
  if (!active) return null;
  const done = sources.filter(source => ['succeeded', 'failed', 'cancelled'].includes(rows[source.id]?.state)).length;
  const consumed = new Set(Object.values(rows).flatMap(row => row.artifact?.inputIds ?? []));
  const labels: Record<string, string> = { queued: '待機中', validating: '確認中', converting: '変換中', succeeded: '完了', failed: '変換できませんでした', cancelled: '取り消しました' };
  return <section className="results-section" aria-labelledby="result-heading"><div className="section-heading"><h2 id="result-heading" ref={heading}><span className="step">03</span>変換したファイル</h2><div className="result-actions"><span className="subtle" role="status" aria-live="polite">{done} / {sources.length}件</span>{busy && <button className="text-button" onClick={onCancel}>取り消す</button>}</div></div>
    {stale && <p className="notice">表示中の結果は前回の設定です。「変換する」で新しい設定を反映できます。</p>}
    <ul className="result-list">{sources.map(source => { const row = rows[source.id]; if (!row || row.state === 'ready' || consumed.has(source.id) && !row.artifact) return null; const inputSize = row.artifact?.inputBytes ?? source.file.size; return <li key={source.id} className={`result-row ${row.state}`}>
      {row.artifact ? <ResultPreview artifact={row.artifact}/> : <span className={`state-icon ${['queued','validating','converting'].includes(row.state) ? 'spinning' : ''}`}><Icon name={row.state === 'failed' ? 'info' : row.state === 'cancelled' ? 'close' : 'arrows'}/></span>}
      <div className="result-description"><strong>{row.artifact?.filename ?? source.file.name}</strong><div className="result-meta">{row.artifact ? <><span>{safeFilename(row.artifact.filename,row.artifact.mime).split('.').pop()?.toUpperCase()}</span>{row.artifact.width && <span>{row.artifact.width} × {row.artifact.height} px</span>}<span>{formatBytes(row.artifact.size)}</span><span className={row.artifact.size <= inputSize ? 'size-down' : ''}>{row.artifact.size === inputSize ? 'サイズ変化なし' : `${row.artifact.size < inputSize ? '−' : '+'}${Math.abs((row.artifact.size / Math.max(1, inputSize) - 1) * 100).toFixed(0)}%`}</span></> : <span>{labels[row.state]}</span>}</div>{row.error && <p className="error-text" role="alert">{row.error.message}</p>}</div>
      {row.artifact && <button className="button button-save" onClick={() => setSaveMessage(saveArtifact(row.artifact!) === 'started' ? '保存先を確認してください。もう一度保存することもできます。' : '保存を開始できませんでした。もう一度お試しください。')}><Icon name="download" size={17}/>保存</button>}
    </li>; })}</ul><p className="save-message" role="status">{saveMessage}</p>
  </section>;
}
