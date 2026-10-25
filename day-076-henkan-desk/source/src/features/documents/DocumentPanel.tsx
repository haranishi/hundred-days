import { useEffect,useState } from 'react';
import type { ToolPanelProps } from '../../shared/contracts';
import { LIMITS } from '../../shared/limits';
import { convertDocument } from './convertDocument';
export type OfficeKind='docx'|'xlsx'|'pptx';
const labels={docx:{name:'Word',code:'WORD',contents:'本文・表・画像',warning:'フォントや改ページが元のWordと変わる場合があります。'},xlsx:{name:'Excel',code:'EXCEL',contents:'シートの印刷内容',warning:'Excelの印刷範囲・用紙サイズ・改ページに従います。非表示シートは含めません。'},pptx:{name:'PowerPoint',code:'POWERPOINT',contents:'スライドの本文・画像',warning:'フォントや配置が元のPowerPointと変わる場合があります。非表示スライドは含めません。'}};
export function DocumentPanel({sources,startRun,busy,kind='docx'}:ToolPanelProps&{kind?:OfficeKind}){
  const [consent,setConsent]=useState(false),[available,setAvailable]=useState<boolean|null>(null),info=labels[kind];
  const refresh=async()=>{setAvailable(null);try{const response=await fetch('/api/v1/capabilities',{cache:'no-store'});const data=await response.json() as {wordPdf?:string};setAvailable(response.ok&&data.wordPdf==='available');}catch{setAvailable(false);}};
  useEffect(()=>{void refresh();},[]);useEffect(()=>{setConsent(false);},[sources,kind]);
  const source=sources[0],valid=sources.length===1&&!!source&&source.file.name.toLowerCase().endsWith(`.${kind}`)&&source.file.size<=LIMITS.docxFileBytes;
  return <section className="settings-panel document-panel" aria-label={`${info.name}をPDFに変換`}>
    <div className="section-heading"><span className="eyebrow">{info.code} TO PDF</span><h2>{info.name}を、提出できるPDFに。</h2></div>
    <p className="muted">{kind.toUpperCase()}を1件、10MiBまで。{info.contents}をまとめて変換します。</p>
    <div className="field"><span className="field-label">変換先</span><div className="format-badge">PDF <span>ポータブル文書形式</span></div></div>
    <div className="notice"><strong>文書は変換サーバーで処理します</strong><p>送信した文書と作業データは変換後に削除します。履歴として保存しません。</p><p>{info.warning} 外部リンクの画像は事前に文書へ埋め込んでください。</p></div>
    {available===false&&<div className="notice warning" role="status"><strong>いまは文書変換を利用できません</strong><p>時間をおいて再試行してください。画像変換は利用できます。</p><button type="button" className="button secondary" onClick={()=>void refresh()}>もう一度確認</button></div>}
    {sources.length>1&&<p className="field-error" role="alert">Office文書は1件ずつ選んでください。</p>}
    {source&&!source.file.name.toLowerCase().endsWith(`.${kind}`)&&<p className="field-error" role="alert">{kind.toUpperCase()}形式を選んでください。古い形式とマクロ形式は対象外です。</p>}
    {source&&source.file.size>LIMITS.docxFileBytes&&<p className="field-error" role="alert">10MiB以下の文書を選んでください。</p>}
    <label className="check-row"><input type="checkbox" checked={consent} disabled={busy} onChange={event=>setConsent(event.target.checked)}/><span>文書を変換サーバーへ送ることに同意します</span></label>
    <button type="button" className="button primary convert-button" disabled={!valid||!consent||busy||available!==true} onClick={()=>{if(source)startRun(context=>convertDocument(source,consent,context));}}>{busy?'送信・変換しています…':'PDFに変換する'}</button>
    <p className="microcopy">保存したPDFは、提出前に内容を確認してください。</p>
  </section>;
}
export default DocumentPanel;
