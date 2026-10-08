import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { evaluateInput, EXAMPLES, FIELDS, type ManualInput } from '../domain/manual'
import { CATEGORY_LABELS, type Category } from '../domain/types'
import { Editor } from './Editor'
import { browserStorage, readPlan, writePlan, type SavedPlan } from './storage'
import { copyText, download, encodeShare, imageOf, memoOf, yen } from './sharing'
import './app.css'

const Diagram = lazy(() => import('./Diagram').then(m => ({ default: m.Diagram })))
const symbols = { ok: '✓', warn: '!', error: '×' }
export function App() {
  const [initial] = useState(() => readPlan(browserStorage(), window.location.hash))
  const [plan, setPlan] = useState<SavedPlan>(initial.plan)
  const [category, setCategory] = useState<Category>('case')
  const [exploded, setExploded] = useState(false)
  const [notice, setNotice] = useState(initial.notice)
  const [storageFailed, setStorageFailed] = useState(false)
  const [undoCount, setUndoCount] = useState(0)
  const history = useRef<SavedPlan[]>([])
  const lastEdit = useRef({ key: '', at: 0 })
  const dialog = useRef<HTMLDialogElement>(null)
  const [shareNotice, setShareNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [imageAvailable, setImageAvailable] = useState(false)
  const shareSession = useRef(0)
  const result = useMemo(() => evaluateInput(plan.values), [plan.values])
  const memo = useMemo(() => memoOf(plan.values), [plan.values])
  const shareUrl = useMemo(() => { try { return encodeShare(plan.values) } catch { return '' } }, [plan.values])
  const errorCount = result.issues.filter(i => i.severity === 'error').length
  const warningCount = result.issues.filter(i => i.severity === 'warn').length
  const invalidCount = Object.keys(result.errors).length
  const invalid = invalidCount > 0 || result.missing.length > 0
  const resultTitle = invalid ? '入力を確認してください' : errorCount ? `${errorCount}項目に組合せの問題` : '入力上の組合せを確認しました'

  useEffect(() => {
    if (initial.imported) window.history.replaceState(null, '', window.location.pathname + window.location.search)
  }, [initial.imported])
  useEffect(() => { setStorageFailed(!writePlan(browserStorage(), plan)) }, [plan])

  const change = (next: SavedPlan, key = '') => {
    const now = Date.now()
    if (!key || key !== lastEdit.current.key || now - lastEdit.current.at > 1200) {
      history.current = [...history.current.slice(-29), plan]
      setUndoCount(history.current.length)
    }
    lastEdit.current = { key, at: now }
    setPlan(next); setNotice('')
  }
  const undo = () => {
    const previous = history.current.pop()
    if (previous) { setPlan(previous); setUndoCount(history.current.length); lastEdit.current = { key: '', at: 0 }; setNotice('ひとつ前の入力に戻しました。') }
  }
  const loadExample = (values: ManualInput) => {
    change({ version: 1, values: { ...values }, color: 'white' }); setCategory('case'); setExploded(false)
    setNotice('架空の作例を読み込みました。「元に戻す」で前の入力へ戻れます。')
  }
  const editCategory = (target: Category) => { setCategory(target); requestAnimationFrame(() => { const editor = document.querySelector('.manual-editor'); editor?.scrollIntoView({ behavior: 'smooth', block: 'start' }); (editor?.querySelector('select') as HTMLSelectElement | null)?.focus({ preventScroll: true }) }) }
  const openShare = () => { setImageAvailable(!!document.querySelector('[data-testid="manual-diagram"][data-ready="true"] canvas')); setShareNotice(''); shareSession.current++; setBusy(false); dialog.current?.showModal() }
  const share = async (action: 'link' | 'memo' | 'image' | 'native') => {
    if (busy) return
    setBusy(true); setShareNotice('')
    const session = shareSession.current
    const current = () => session === shareSession.current && !!dialog.current?.open
    try {
      if (action === 'native') {
        await navigator.share({ title: 'くみまえ', text: '入力寸法から確認したPC構成です。', url: shareUrl })
      } else if (action === 'image') {
        const blob = await imageOf(plan.values, document.querySelector('[data-testid="manual-diagram"] canvas'))
        if (current()) { download(blob, 'kumimae.png'); setShareNotice('画像を保存しました。') }
      } else {
        const copied = await copyText(action === 'link' ? shareUrl : memo)
        if (current()) setShareNotice(copied ? (action === 'link' ? '仕様リンクをコピーしました。価格は含みません。' : '構成メモをコピーしました。入力価格も含みます。') : 'コピーできませんでした。下のリンク・メモを選択してコピーしてください。')
      }
    } catch (e) {
      if (current() && !(e instanceof DOMException && e.name === 'AbortError')) setShareNotice('共有できませんでした。下のリンク・メモを選択してコピーできます。')
    } finally { if (current()) setBusy(false) }
  }

  return <>
    <header className="manual-header">
      <a href="../" className="manual-home" aria-label="100DAYSの一覧へ">← <span>100DAYS</span></a>
      <a className="manual-brand" href="./">くみまえ <span>DAY 061</span></a>
      <button type="button" className="manual-subtle" aria-label="このアプリを共有する" onClick={() => (document.getElementById('share-dialog') as HTMLDialogElement)?.showModal()}>アプリ共有</button>
    </header>
    <main className="manual-main">
      <div className="manual-intro"><p className="manual-eyebrow">PC BUILD / DIMENSION CHECK</p><h1>組む前に、<br className="manual-mobile-break" />サイズを確かめる。</h1><p>候補の部品の寸法・規格を入力して、3Dと数字で組合せを確認。</p><a className="manual-start" href="#edit-spec">寸法を入力する <span>↓</span></a></div>
      <div className="manual-workbench">
        <section className="manual-visual" aria-labelledby="diagram-title">
          <div className="manual-section-head"><h2 id="diagram-title">構成のプレビュー</h2><span className="manual-pill">寸法の模式図</span></div>
          <Suspense fallback={<div className="manual-loading" role="status">3Dを準備しています… 入力は先に始められます。</div>}><Diagram resolved={result.resolved} selected={category} color={plan.color} exploded={exploded} /></Suspense>
          <div className="manual-view-tools"><label><input type="checkbox" checked={exploded} onChange={e => setExploded(e.target.checked)} />分解して見る</label><label>模型の色<select aria-label="模型の色" value={plan.color} onChange={e => change({ ...plan, color: e.target.value as SavedPlan['color'] })}><option value="white">白</option><option value="black">黒</option></select></label></div>
          <p className="manual-caption">選択中：{CATEGORY_LABELS[category]}。箱と一般的な位置で示す模式図です。実製品の外観や正確な取付位置は再現しません。</p>
          <div className="manual-summary" aria-label="構成の要約">
            <div><span>入力価格の小計</span><strong>{result.cost.entered ? yen(result.cost.total) : '価格未入力'}</strong><small>{result.cost.entered}/8 入力済み</small></div>
            <div><span>消費電力の概算</span><strong>{result.power ? `${result.power.complete ? '' : '≥ '}${result.power.estimatedMaxW} W` : '入力待ち'}</strong><small>{result.power?.complete ? '入力値＋補助機器の目安' : '必要な値が未入力'}</small></div>
          </div>
          <a className="manual-results-link" href="#results">{invalid ? '未入力・入力エラーを確認' : errorCount ? `要修正 ${errorCount}件を確認` : `確認結果と注意 ${warningCount}件を見る`} <span>↓</span></a>
        </section>
        <div className="manual-input-side">
          <section className="manual-examples" aria-labelledby="example-title"><h2 id="example-title">まずは架空の作例で試す</h2><p>初期値は実製品の仕様ではありません。購入候補の値に置き換えてください。</p><div>{EXAMPLES.map(example => <button type="button" key={example.id} onClick={() => loadExample(example.values)} title={example.description}>{example.title}</button>)}</div></section>
          <div className="manual-edit-heading" id="edit-spec"><span>寸法は mm、電力は W で入力</span><button type="button" onClick={undo} disabled={!undoCount}>↶ 元に戻す</button></div>
          {notice && <p className="manual-notice" role="status">{notice}</p>}
          {storageFailed && <p className="manual-warning" role="status">このブラウザに保存できません。画面を閉じる前に構成メモをコピーしてください。</p>}
          <Editor values={plan.values} onChange={(key, value) => change({ ...plan, values: { ...plan.values, [key]: value } }, key)} category={category} onCategoryChange={setCategory} errors={result.errors} />
          <p className="manual-save-note">{storageFailed ? '現在の入力はこの画面でのみ保持されます。' : '入力はこのブラウザに自動保存します。外部へ送信しません。'}</p>
          <section className="manual-results" id="results" aria-labelledby="results-title" data-testid="manual-results">
            <p className="manual-eyebrow">CHECK YOUR BUILD</p><h2 id="results-title">{resultTitle}</h2>
            {invalid && <div className="manual-warning"><p>{result.resolved ? '不正な入力は価格の集計に反映されません。値を確認してください。' : '必要な仕様が揃うまで、組合せを判定できません。'}</p><ul>{[...new Set([...result.missing, ...Object.keys(result.errors)])].map(key => <li key={key}><button type="button" onClick={() => { const f = FIELDS.find(f => f.key === key); if (f) setCategory(f.category); requestAnimationFrame(() => document.querySelector('.manual-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' })) }}>{FIELDS.find(f => f.key === key)?.label ?? key}：{result.errors[key] || '未入力'}</button></li>)}</ul></div>}
            <ul className="manual-checks">{result.issues.map((issue, index) => <li key={`${issue.rule}-${index}`} data-severity={issue.severity}><span className="manual-symbol" aria-hidden="true">{symbols[issue.severity]}</span><div><h3>{issue.title}<span>{issue.severity === 'error' ? '要修正' : issue.severity === 'warn' ? '要確認' : '入力上OK'}</span></h3><p>{issue.message}</p>{issue.severity !== 'ok' && issue.categories.length > 0 && <button type="button" className="manual-edit-result" onClick={() => editCategory(issue.categories[0]!)}>{CATEGORY_LABELS[issue.categories[0]!]}の入力へ戻る ↑</button>}</div></li>)}</ul>
            {result.power && <details className="manual-method"><summary>電力の計算方法と内訳</summary><p>CPU・GPUの入力電力に、基板50W、メモリ1枚5W、SSD8W、ファン1基3Wを加えた概算です。実測値ではありません。</p><ul>{result.power.items.map(item => <li key={item.key}>{item.label}：{item.watts === null ? '未入力' : `${item.watts} W`}</li>)}</ul><p>{result.power.complete ? `容量の目安は概算×1.25を50W単位で切り上げた ${result.power.recommendedW} W。` : 'CPU・GPUの電力が未入力なので、表示は分かる分だけの下限です。容量が足りるとは判定できません。'}</p><p>瞬間的な負荷、電源の品質、ケーブルやメーカー指定の条件も確認してください。</p></details>}
            <p className="manual-limit">対象は通常配置のケース・空冷CPUクーラー・GPU1枚・SSD1枚です。水冷、特殊配置、BIOS、配線・金具、冷却性能は別途確認してください。組立てや動作を保証する判定ではありません。</p>
          </section>
          <section className="manual-export"><div><h2>構成を持ち帰る</h2><p>仕様リンク、入力価格つきメモ、模式図の画像。</p></div><button className="manual-primary" type="button" onClick={openShare}>構成を共有・保存</button></section>
        </div>
      </div>
    </main>
    <footer className="manual-footer"><a href="./legal/data-and-rights.html">データと利用条件</a><a href="./legal/THIRD_PARTY_NOTICES.txt">第三者ライセンス</a><a href="../privacy.html">プライバシー</a><a href="https://github.com/haranishi/hundred-days/issues" target="_blank" rel="noreferrer">不具合の報告</a></footer>
    <dialog ref={dialog} className="manual-share-dialog" aria-labelledby="manual-share-title" onClose={() => { shareSession.current++; setBusy(false) }}>
      <div className="manual-dialog-head"><h2 id="manual-share-title">この構成を共有・保存</h2><button type="button" onClick={() => dialog.current?.close()} aria-label="共有を閉じる">閉じる</button></div>
      <p>仕様リンクには寸法・規格・部品名が入ります。メモと画像には入力価格も含みます。</p>
      <div className="manual-share-actions">
        {typeof navigator.share === 'function' && <button type="button" disabled={busy || !shareUrl} onClick={() => void share('native')}>端末で共有</button>}
        <a href={`https://x.com/intent/post?text=${encodeURIComponent('くみまえでPC構成を確認しました')}&url=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener noreferrer">Xで共有</a>
        <a href={`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener noreferrer">LINEで共有</a>
        <button type="button" disabled={busy || !shareUrl} onClick={() => void share('link')}>仕様リンクをコピー</button>
        <button type="button" disabled={busy} onClick={() => void share('memo')}>構成メモをコピー</button>
        <button type="button" disabled={busy || !imageAvailable} onClick={() => void share('image')}>3D画像を保存</button>
      </div>
      {!imageAvailable && <p>3Dを表示できていないため、画像を保存できません。仕様リンクと構成メモは利用できます。</p>}
      <p className="manual-share-feedback" role="status">{busy ? '処理しています…' : shareNotice}</p>
      <label className="manual-copy-field">仕様リンク<input readOnly value={shareUrl} onFocus={e => e.target.select()} /></label>
      <label className="manual-copy-field">構成メモ（Obsidianなどへ貼り付け）<textarea readOnly value={memo} rows={8} onFocus={e => e.target.select()} /></label>
      <p>Instagram・YouTubeへ直接投稿する機能はありません。保存画像やコピーした内容をお使いください。</p>
    </dialog>
  </>
}
