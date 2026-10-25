import { useEffect,useRef,useState } from 'react';
import type { ToolPanelProps } from '../../shared/contracts';
import { DEFAULT_DATA_OPTIONS,operationInfo,type DataOperation,type DataOptions,type TransformOutput } from './operations';
import { convertData } from './convert';
export function DataPanel({sources,startRun,busy,operation}:ToolPanelProps&{operation:DataOperation}){
  const [settings,setSettings]=useState<Omit<DataOptions,'operation'>>(DEFAULT_DATA_OPTIONS);
  const [result,setResult]=useState<TransformOutput|null>(null),[copied,setCopied]=useState(''),[stale,setStale]=useState(false);
  const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{setResult(null);setCopied('');setStale(false);},[sources,operation]);
  const info=operationInfo(operation),source=sources[0],pasted=!!source&&/charset\s*=\s*utf-8/i.test(source.file.type);
  const update=(patch:Partial<typeof settings>)=>{setSettings(previous=>({...previous,...patch}));if(result)setStale(true);};
  const structured=operation.startsWith('json-')||operation==='yaml-json';
  const generatedTable=['json-csv','csv-tsv','tsv-csv'].includes(operation);
  const onRun=()=>{const options:DataOptions={...settings,encoding:pasted?'utf-8':settings.encoding,operation};startRun(context=>convertData(sources,options,context,output=>{if(alive.current){setResult(output);setStale(false);setCopied('');}}));};
  async function copy(){if(!result)return;try{await navigator.clipboard.writeText(result.text);setCopied('結果をコピーしました');}catch{setCopied('コピーできませんでした。下の結果を選択してコピーしてください。');}}
  return <section className="settings-panel data-panel" aria-label={info.label}>
    <div className="section-heading"><h2><span className="step">02</span>変換の設定</h2><span className="subtle">テキスト・データ</span></div>
    <p className="data-description">{info.description}</p>
    <fieldset disabled={busy} className="settings-fields">
      <div className="field-group"><span className="field-label">変換先</span><div className="format-badge">{info.extension.toUpperCase()}<span>UTF-8</span></div></div>
      <div className="field-group"><label className="field-label" htmlFor="data-encoding">入力の文字コード</label><select id="data-encoding" disabled={pasted} value={pasted?'utf-8':settings.encoding} onChange={event=>update({encoding:event.target.value as 'utf-8'|'shift-jis'})}><option value="utf-8">UTF-8</option><option value="shift-jis">Shift_JIS（日本語Windows）</option></select><p className="field-hint">{pasted?'貼り付けたテキストはUTF-8として扱います。':'自動推測はせず、指定した文字コードで読み込みます。'}</p></div>
      {operation==='csv-json'&&<label className="check-row"><input type="checkbox" checked={settings.csvHeader} onChange={event=>update({csvHeader:event.target.checked})}/><span>先頭の行を見出しとして使う</span></label>}
      {generatedTable&&<label className="check-row"><input type="checkbox" checked={settings.protectFormulas} onChange={event=>update({protectFormulas:event.target.checked})}/><span>表計算で数式として実行されないよう保護する</span></label>}
    </fieldset>
    {structured&&<p className="field-hint">大きな番号は文字列として引用符で囲んでください。JSONで表せない型や循環は変換できません。</p>}
    {operation==='markdown-html'&&<p className="notice">安全化したHTMLソースを生成します。スクリプト・外部画像・埋込・フォームは省きます。</p>}
    {operation==='url-decode'&&<p className="field-hint">URLの一部分をデコードします。+は空白に置き換えません。</p>}
    <button className="button convert-button" disabled={sources.length!==1||busy} onClick={onRun}><span>{busy?'変換しています…':'変換する'}</span><span aria-hidden="true">→</span></button>
    <p className="conversion-caption">この端末内で処理します。入力{['markdown-html','html-text'].includes(operation)?'256KiB':'2MiB'}・出力5MiBまで。</p>
    {result&&<section className="data-result-preview" aria-label="変換結果のプレビュー"><div className="section-heading"><h3>変換結果</h3><button className="text-button" onClick={()=>void copy()}>結果をコピー</button></div>{stale&&<p className="notice">前回の設定で変換した結果です。再変換すると新しい設定を反映します。</p>}{result.warnings.map(warning=><p key={warning} className="field-hint">{warning}</p>)}<textarea aria-label="変換結果のソース" readOnly rows={10} value={result.text.slice(0,12000)}/>{result.text.length>12000&&<p className="field-hint">表示は先頭12,000文字です。保存とコピーは全体が対象です。</p>}<p role="status" className="field-hint">{copied}</p></section>}
  </section>;
}
export default DataPanel;
