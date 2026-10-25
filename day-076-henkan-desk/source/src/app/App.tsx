import { lazy, Suspense, useEffect, useState } from 'react';
import type { SourceFile, ToolId } from '../shared/contracts';
import { ImagePanel } from '../features/images/ImagePanel';
import { DocumentPanel } from '../features/documents/DocumentPanel';
import { useConversion } from './useConversion';
import { FileInput } from './FileInput';
import { DataInput } from './DataInput';
import { ShareApp } from './ShareApp';
import { APP_BASE, CLIENT_ONLY } from './runtime';
import { Results } from './Results';
import { Icon } from './Icon';
import { releaseDownloadURLs } from './download';
import { CATEGORIES, TOOLS, type Category } from './tools';
const PdfPanel=lazy(()=>import('../features/pdf/PdfPanel').then(module=>({default:module.PdfPanel})));
const DataPanel=lazy(()=>import('../features/data/DataPanel').then(module=>({default:module.DataPanel})));
export function App() {
  const [toolId,setToolId]=useState('images'),[sources,setSources]=useState<SourceFile[]>([]),[pastedText,setPastedText]=useState('');
  const tool=TOOLS.find(item=>item.id===toolId)??TOOLS[0]!;
  const category=tool.category,categoryTools=TOOLS.filter(item=>item.category===category);
  const conversion=useConversion(sources);const[settingsVersion,setSettingsVersion]=useState(0),[runVersion,setRunVersion]=useState(0);
  useEffect(()=>()=>releaseDownloadURLs(),[]);
  function reset(){conversion.clear();setSources([]);setPastedText('');setSettingsVersion(0);setRunVersion(0);}
  function select(files:File[]){conversion.clear();setPastedText('');setSettingsVersion(0);setRunVersion(0);setSources(files.map(file=>({id:crypto.randomUUID(),file})));}
  function chooseTool(next:string){if(next!==toolId){reset();setToolId(next);}}
  function chooseCategory(next:Category){const first=TOOLS.find(item=>item.category===next);if(first)chooseTool(first.id);}
  function paste(text:string){conversion.clear();setPastedText(text);setSettingsVersion(0);setRunVersion(0);setSources(text?[{id:crypto.randomUUID(),file:new File([text],'input.txt',{type:'text/plain;charset=utf-8'})}]:[]);}
  function move(id:string,direction:number){conversion.clear();setSources(previous=>{const next=[...previous],index=next.findIndex(item=>item.id===id),target=index+direction;if(index>=0&&target>=0&&target<next.length)[next[index],next[target]]=[next[target]!,next[index]!];return next;});}
  const props={sources,busy:conversion.busy,startRun:(operation:Parameters<typeof conversion.startRun>[0])=>{setRunVersion(settingsVersion);conversion.startRun(operation);}};
  const inputMode:ToolId=category==='documents'?'word-pdf':tool.category==='pdf'&&tool.operation==='images-pdf'?'images':category;
  return <><header className="site-header"><a className="brand" href={APP_BASE} aria-label="へんかんデスク ホーム"><span className="brand-symbol"><Icon name="arrows" size={24}/></span><span>へんかん<span className="brand-light">デスク</span></span></a><div className="header-actions"><span className="header-note">{TOOLS.length}のツールを、ひとつの場所に。</span>{!CLIENT_ONLY&&<ShareApp/>}</div></header>
    <main className="page"><section className="hero"><div><div className="eyebrow"><span/> YOUR EVERYDAY CONVERTER</div><h1>ファイルに、<br className="mobile-break"/><em>ちょうどいいかたちを。</em></h1><p>{CLIENT_ONLY?'画像も、PDFも、データも。':'画像も、PDFも、Officeも、データも。'}<br className="mobile-only"/>必要なかたちに整えて、すぐ保存。</p></div><div className="hero-stamp" aria-hidden="true"><span>CSV</span><Icon name="arrows" size={24}/><span>JSON</span><span className="stamp-webp">PDF</span><span className="stamp-ratio">{TOOLS.length} tools</span></div></section>
      <section className="workspace" aria-label="ファイル変換"><div className="workspace-top"><div className="tool-tabs" role="tablist" aria-label="変換するファイルの種類">{CATEGORIES.map((item,index)=><button key={item.id} id={`${item.id}-tab`} role="tab" aria-label={item.aria} aria-selected={category===item.id} aria-controls="converter-panel" tabIndex={category===item.id?0:-1} className={category===item.id?'active':''} onClick={()=>chooseCategory(item.id)} onKeyDown={event=>{let next=index;if(event.key==='ArrowRight')next=(index+1)%CATEGORIES.length;else if(event.key==='ArrowLeft')next=(index+CATEGORIES.length-1)%CATEGORIES.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=CATEGORIES.length-1;else return;event.preventDefault();chooseCategory(CATEGORIES[next]!.id);(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role=tab]')[next])?.focus();}}><Icon name={item.icon} size={18}/>{item.label}<small>{TOOLS.filter(t=>t.category===item.id).length}</small></button>)}</div><span className={`processing-badge ${category==='documents'?'server-badge':''}`}><span/>{category==='documents'?'同意後にサーバーで処理':'この端末で処理'}</span></div>
        {categoryTools.length>1&&<div className="tool-catalog"><div><label htmlFor="tool-choice">やりたいことを選ぶ</label><select id="tool-choice" aria-label="変換ツール" disabled={conversion.busy} value={tool.id} onChange={event=>chooseTool(event.target.value)}>{categoryTools.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></div><p>{tool.description}</p></div>}
        <div className="workbench" id="converter-panel" role="tabpanel" aria-labelledby={`${category}-tab`}>
          {tool.category==='data'?<DataInput operation={tool.operation} text={pastedText} sources={sources} busy={conversion.busy} onText={paste} onSelect={select} onClear={reset}/>:<FileInput mode={inputMode} sources={sources} busy={conversion.busy} accept={tool.accept} multiple={tool.multiple} help={tool.help} onSelect={select} onRemove={id=>{conversion.clear();setSources(previous=>previous.filter(source=>source.id!==id));}} onMove={tool.ordered?move:undefined} onClear={reset}/>}
          <div className="settings-section" onChangeCapture={category==='data'?()=>setSettingsVersion(value=>value+1):undefined}><Suspense fallback={<div className="tool-loading" role="status"><Icon name="arrows"/>変換ツールを読み込んでいます…</div>}>{tool.category==='images'?<ImagePanel key={tool.id} {...props} onOptionsChange={()=>setSettingsVersion(value=>value+1)}/>:tool.category==='documents'?<DocumentPanel key={tool.id} {...props} kind={tool.kind}/>:tool.category==='pdf'?<PdfPanel key={tool.id} {...props} operation={tool.operation} onOptionsChange={()=>setSettingsVersion(value=>value+1)}/>:<DataPanel key={tool.id} {...props} operation={tool.operation}/>}</Suspense></div>
        </div>
        <Results sources={sources} rows={conversion.rows} busy={conversion.busy} onCancel={conversion.cancel} stale={settingsVersion!==runVersion}/>
      </section>
      <section className="benefits" aria-label="このツールについて"><div><span className="benefit-icon"><Icon name="shield"/></span><p><strong>画像・PDF・データは端末内で</strong><span>ファイルをアップロードせずに変換します。</span></p></div><div><span className="benefit-icon"><Icon name="arrows"/></span><p><strong>よく使う変換を、まとめて</strong><span>提出も、ページ整理も、データの受け渡しも。</span></p></div><div><span className="benefit-icon"><Icon name="bolt"/></span><p><strong>アカウントも、インストールも不要</strong><span>開いて選ぶだけ。原本はそのまま残ります。</span></p></div></section>
      <details className="privacy" id="privacy"><summary><Icon name="info" size={16}/>対応形式と、ファイルの扱いについて</summary><div><p>画像はJPG・PNG・静止WebP。PDFの作成・画像化・結合・分割・抽出・並べ替え・回転・文字抽出・構造最適化、テキストやデータの変換も、この端末内で処理します。アニメーションやHEIC・SVG、OCRには対応していません。</p>{!CLIENT_ONLY&&<p>Word（DOCX）・Excel（XLSX）・PowerPoint（PPTX）は、同意後に隔離サーバーでPDFへ変換し、一時ファイルを処理後に削除します。元のファイルと見比べてご確認ください。</p>}<p>変換履歴は保存しません。共有するのはアプリのURLだけです。</p>{CLIENT_ONLY&&<p>ページと変換機能の読み込みは配信サービスへ通信します。選んだファイルや貼り付けた内容は送信しません。</p>}</div></details>
    </main><footer className="site-footer"><a className="footer-brand" href={APP_BASE}>へんかんデスク</a><span>小さな変換で、作業をスムーズに。</span><span>{CLIENT_ONLY?'IMAGE / PDF / DATA':'IMAGE / PDF / OFFICE / DATA'}</span>{CLIENT_ONLY&&<nav className="legal-links" aria-label="利用案内"><a href={`${APP_BASE}legal.html`}>利用規約・プライバシー</a><a href={`${APP_BASE}licenses/`}>ライセンス</a><a href="../">100日チャレンジ</a></nav>}</footer></>;
}
