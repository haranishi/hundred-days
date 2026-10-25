import { useEffect, useState } from 'react';
import type { ToolPanelProps } from '../../shared/contracts';
import { toConversionError } from '../../shared/errors';
import { LIMITS } from '../../shared/limits';
import { Icon } from '../../app/Icon';
import { convertPdf, inspectPdfFile } from './convert';
import { DEFAULT_PDF_OPTIONS, PDF_TOOL_LABELS, type PDFOperation, type PdfOptions } from './types';
import { parseOrder, parsePages } from './selection';
const descriptions:Record<PDFOperation,string>={
  'images-pdf':'選んだ順に、1枚ずつページへ配置します。ファイルの並び順がPDFのページ順になります。',
  'pdf-images':'PDFを1ページずつPNG/JPGにして、まとめてZIPで保存します。',
  merge:'選んだファイル順に、すべてのページを1つのPDFへまとめます。',
  extract:'必要なページだけを、新しいPDFとして保存します。',
  split:'選んだページを1ページずつのPDFに分け、ZIPへまとめます。',
  reorder:'ページを指定順、または逆順に並べ替えます。',
  rotate:'選んだページを、現在の向きから回転します。',
  text:'PDF内の文字情報を、ページ区切り付きのTXTへ抽出します。スキャン画像のOCRは対象外です。',
  optimize:'PDFの構造を最適化します。画像の画質は下げません。容量が減らない場合は元のPDFを返します。',
};
export function PdfPanel({sources,startRun,busy,operation,onOptionsChange}:ToolPanelProps&{operation:PDFOperation;onOptionsChange?:()=>void}){
  const[options,setOptions]=useState<PdfOptions>({...DEFAULT_PDF_OPTIONS,operation});
  const[pageCount,setPageCount]=useState<number|null>(null),[checking,setChecking]=useState(false),[fileError,setFileError]=useState('');
  const source=sources[0];
  useEffect(()=>{setOptions({...DEFAULT_PDF_OPTIONS,operation});},[operation]);
  useEffect(()=>{
    setPageCount(null);setFileError('');
    if(operation==='images-pdf'||sources.length!==1||!source||busy){setChecking(false);return;}
    const abort=new AbortController();setChecking(true);
    void inspectPdfFile(source,abort.signal).then(info=>{if(!abort.signal.aborted)setPageCount(info.pageCount);}).catch(error=>{if(!abort.signal.aborted)setFileError(toConversionError(error).message);}).finally(()=>{if(!abort.signal.aborted)setChecking(false);});
    return()=>abort.abort();
  },[source,sources.length,operation,busy]);
  function update(patch:Partial<PdfOptions>){setOptions(previous=>({...previous,...patch,operation}));onOptionsChange?.();}
  const usePages=['pdf-images','extract','split','rotate','text'].includes(operation);
  let invalid='';
  if(sources.length>LIMITS.pdfFiles||sources.some(item=>item.file.size>LIMITS.pdfFileBytes)||sources.reduce((n,item)=>n+item.file.size,0)>LIMITS.pdfBatchBytes)invalid='ファイルは10件、1件10MB・合計30MB以内で選んでください。';
  if(!['images-pdf','merge'].includes(operation)&&sources.length>1)invalid='この操作ではPDFを1件ずつ選んでください。';
  if(pageCount)try{if(usePages){const selected=parsePages(options.pages,pageCount);if(operation==='pdf-images'&&selected.length>LIMITS.pdfImagePages)invalid='画像化は1回20ページ以内で指定してください。';}if(operation==='reorder')parseOrder(options.order,pageCount);}catch(error){invalid=toConversionError(error).message;}
  return <section className="settings-panel pdf-panel"><div className="section-heading"><h2><span className="step">02</span>{PDF_TOOL_LABELS[operation]}</h2><span className="subtle">端末内で処理</span></div>
    <p className="field-hint">{descriptions[operation]}</p>
    {pageCount!==null&&<p className="notice">このPDFは {pageCount} ページです。</p>}
    {checking&&<p className="field-hint" role="status">PDFのページ数を確認しています…</p>}
    <fieldset className="settings-fields" disabled={busy}>
      {operation==='images-pdf'&&<><div className="field-group"><label className="field-label" htmlFor="pdf-paper">PDFの用紙</label><select id="pdf-paper" value={options.paper} onChange={event=>update({paper:event.target.value as PdfOptions['paper']})}><option value="original">元の画像に合わせる</option><option value="a4">A4に収める</option></select></div>{options.paper==='a4'&&<><div className="field-group"><label className="field-label" htmlFor="pdf-orientation">用紙の向き</label><select id="pdf-orientation" value={options.orientation} onChange={event=>update({orientation:event.target.value as PdfOptions['orientation']})}><option value="portrait">縦</option><option value="landscape">横</option></select></div><div className="field-group"><label className="field-label" htmlFor="pdf-margin">余白（pt）</label><input id="pdf-margin" type="number" min="0" max="72" value={options.margin} onChange={event=>update({margin:Number(event.target.value)})}/></div></>}</>}
      {usePages&&<div className="field-group"><label className="field-label" htmlFor="pdf-pages">対象ページ</label><input id="pdf-pages" value={options.pages} placeholder="全部なら空欄 / 例：1-3,5" onChange={event=>update({pages:event.target.value})}/><p className="field-hint">1ページ目から数えます。カンマとハイフンで指定できます。</p></div>}
      {operation==='reorder'&&<div className="field-group"><label className="field-label" htmlFor="pdf-order">新しいページ順</label><input id="pdf-order" value={options.order} placeholder="例：3,1,2（全ページを1回ずつ）" onChange={event=>update({order:event.target.value})}/><button type="button" className="text-button" onClick={()=>update({order:'reverse'})}>すべて逆順にする</button><p className="field-hint">空欄なら元の順序です。「reverse」は逆順を表します。</p></div>}
      {operation==='rotate'&&<div className="field-group"><label className="field-label" htmlFor="pdf-rotation">回転する角度</label><select id="pdf-rotation" value={options.rotation} onChange={event=>update({rotation:Number(event.target.value)as PdfOptions['rotation']})}><option value="90">時計回り90度</option><option value="180">180度</option><option value="270">反時計回り90度</option></select></div>}
      {operation==='pdf-images'&&<><div className="field-group"><label className="field-label" htmlFor="pdf-image-format">画像の形式</label><select id="pdf-image-format" value={options.imageFormat} onChange={event=>update({imageFormat:event.target.value as PdfOptions['imageFormat']})}><option value="png">PNG（くっきり）</option><option value="jpeg">JPG（写真に）</option></select></div><div className="field-group"><label className="field-label" htmlFor="pdf-scale">画像の倍率</label><select id="pdf-scale" value={options.scale} onChange={event=>update({scale:Number(event.target.value)})}><option value="1">標準（72dpi）</option><option value="1.5">少し大きく（108dpi）</option><option value="2">大きく（144dpi）</option></select></div>{options.imageFormat==='jpeg'&&<div className="field-group"><label className="field-label-row" htmlFor="pdf-quality"><span className="field-label">JPGの画質</span><strong>{Math.round(options.quality*100)}%</strong></label><input id="pdf-quality" type="range" min="10" max="100" value={Math.round(options.quality*100)} onChange={event=>update({quality:Number(event.target.value)/100})}/></div>}</>}
    </fieldset>
    {(invalid||fileError)&&<p className="error-text form-error" role="alert">{invalid||fileError}</p>}
    {['merge','extract','split','reorder','rotate'].includes(operation)&&<p className="field-hint">編集により電子署名は無効になります。フォーム・しおり等は引き継がれない場合があります。</p>}
    <button className="button convert-button" disabled={!sources.length||busy||!!invalid||!!fileError||checking} onClick={()=>startRun(context=>convertPdf(sources,{...options,operation},context))}><span>{busy?'変換しています…':PDF_TOOL_LABELS[operation]}</span><Icon name="arrow" size={20}/></button>
    <p className="conversion-caption"><Icon name="shield" size={13}/>PDFや画像をアップロードしません</p>
  </section>;
}
export const PDFPanel=PdfPanel;
