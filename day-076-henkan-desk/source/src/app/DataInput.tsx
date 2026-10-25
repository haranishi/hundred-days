import { useRef } from 'react';
import type { SourceFile } from '../shared/contracts';
import type { DataOperation } from '../features/data/operations';
import { Icon } from './Icon';
import { formatBytes } from './FileInput';
const samples: Record<DataOperation,string> = {
  'csv-json':'name,score\n佐藤,85\n鈴木,92', 'json-csv':'[{"name":"佐藤","score":85},{"name":"鈴木","score":92}]',
  'csv-tsv':'name,score\n佐藤,85\n鈴木,92', 'tsv-csv':'name\tscore\n佐藤\t85\n鈴木\t92',
  'json-pretty':'{"name":"へんかんデスク","tools":["PDF","画像","データ"]}', 'json-minify':'{\n  "name": "へんかんデスク",\n  "ready": true\n}',
  'json-yaml':'{"name":"へんかんデスク","ready":true}', 'yaml-json':'name: へんかんデスク\nready: true\ntools:\n  - PDF\n  - 画像',
  'markdown-html':'# こんにちは\n\n**かんたん変換**で、作業をスムーズに。\n\n- 画像\n- PDF', 'html-text':'<h1>こんにちは</h1><p>文章を<strong>取り出します</strong>。</p>',
  'base64-encode':'こんにちは、世界！', 'base64-decode':'44GT44KT44Gr44Gh44Gv', 'url-encode':'検索する言葉 & 画像', 'url-decode':'%E3%81%93%E3%82%93%E3%81%AB%E3%81%A1%E3%81%AF',
};
export function DataInput({operation,text,sources,busy,onText,onSelect,onClear}:{operation:DataOperation;text:string;sources:readonly SourceFile[];busy:boolean;onText:(text:string)=>void;onSelect:(files:File[])=>void;onClear:()=>void}){
  const input=useRef<HTMLInputElement>(null);const size=text?new Blob([text]).size:sources[0]?.file.size??0;
  return <section className="source-section data-input"><div className="section-heading"><h2><span className="step">01</span>テキストを入力</h2><button className="clear-button" disabled={busy} onClick={()=>onText(samples[operation])}>サンプルを試す</button></div>
    <textarea aria-label="変換するテキスト" value={text} spellCheck={false} disabled={busy} onChange={event=>onText(event.target.value)} placeholder="ここにテキストを貼り付けてください"/>
    <div className="text-input-footer"><span>{formatBytes(size)} / 2MiB</span><button className="clear-button" disabled={busy} onClick={onClear}>クリア</button></div>
    <div className="input-separator"><span>またはファイルから</span></div>
    <button className="button data-file-button" disabled={busy} onClick={()=>input.current?.click()}><Icon name="upload" size={16}/>ファイルを選ぶ</button>
    <input ref={input} className="visually-hidden" type="file" aria-label="データファイルを選択" accept=".txt,.csv,.tsv,.json,.yaml,.yml,.md,.markdown,.html,.htm" disabled={busy} tabIndex={-1} onChange={event=>{onSelect([...event.target.files??[]]);event.target.value='';}}/>
    {!text&&sources[0]&&<div className="data-file-selected"><Icon name="file" size={17}/><strong>{sources[0].file.name}</strong><small>{formatBytes(sources[0].file.size)}</small></div>}
    {size>2*1024*1024&&<p className="error-text" role="alert">入力は2MiB以内にしてください。</p>}
    <p className="local-note"><Icon name="shield" size={15}/>入力した内容は、この端末の中だけで処理します。</p>
  </section>;
}
