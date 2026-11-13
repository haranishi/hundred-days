import { SOURCES } from '../content/sources';
import { ReadableText } from '../ui/ReadableText';
import { SourceLink } from '../ui/SourceLink';
import { Mascot } from '../ui/Mascot';

export function About() {
  return <main class="screen collection about-screen"><a class="text-button back-link" href="#/me"><ReadableText text="〈 記録へ" /></a><div class="page-heading"><h1><ReadableText text="このアプリについて" /></h1><Mascot size={64} /></div>
    <section class="card prose"><h2><ReadableText text="手話は言語です" /></h2><p><ReadableText text="日本手話は、音声の日本語とは別の文法を持つ言語です。手の形だけでなく、表情・視線・体の動きも意味を持ちます。" /></p></section>
    <section class="card prose"><h2><ReadableText text="学べること・学べないこと" /></h2><p><ReadableText text="指文字・数字・あいさつの入門を学べます。指文字は、名前や固有の言葉を表すときなどに使う、手話の一部です。指文字だけでは手話で会話はできません。" /></p><p><ReadableText text="日本手話と、日本語の語順などに沿って表す日本語対応手話には違いがあります。地域や世代によっても表し方は異なります。このアプリは手話の文法や会話全体を学ぶ教材ではありません。" /></p></section>
    <section class="card prose"><h2><ReadableText text="ろう者の監修は受けていません" /></h2><p><ReadableText text="手の形と動きは、公開資料を2つ以上照らし合わせて作成しています。ただし、ろう者の監修は受けていません。" /></p><p><ReadableText text="誤りに気づいた場合は、お知らせいただけると助かります。100日チャレンジのリポジトリの Issue で受け付けています（GitHub のアカウントが必要です）。" /></p><SourceLink url="https://github.com/haranishi/hundred-days/issues" title="誤りを知らせる（GitHub の Issue）" /></section>
    <section class="card prose"><h2><ReadableText text="3Dの手について" /></h2><p><ReadableText text="3Dの手は、形を確かめるための補助です。画面の手だけで、会話やあいさつの全体を伝えることはできません。" /></p><p><ReadableText text="地域の手話講座や手話サークルなど、ろう者の講師から学べる場にも、ぜひ足を運んでみてください。" /></p></section>
    <section class="card prose"><h2><ReadableText text="カメラとプライバシー" /></h2><p><ReadableText text="カメラは任意です。「カメラで確かめる」を押したときだけ使い、問題を離れると止まります。映像はこの端末の中で処理し、保存も送信もしません。" /></p><p><ReadableText text="手の読み取りには、Google の MediaPipe（Apache License 2.0）を使っています。この部品には利用状況の数値を Google へ送る機能がありますが、このアプリでは送信を止めています。2026年11月13日に、送信が起きないことを確かめました。" /></p><p><ReadableText text="読み取りは練習の目安で、手話の正しさを保証するものではありません。明るさや手の重なりで読み取れないことがあります。" /></p></section>
    <section class="card prose"><h2><ReadableText text="記録の保存" /></h2><p><ReadableText text="学習記録と設定は、この端末のブラウザにだけ保存します。別の端末には自動で引き継がれません。" /></p><p><ReadableText text="設定画面から書き出し・読み込み・全削除ができます。ブラウザのデータを消した場合も記録は消えるため、残したい記録はファイルに書き出してください。" /></p><a class="text-button" href="#/settings"><ReadableText text="設定へ" /></a></section>
    <section class="card prose"><h2><ReadableText text="オフラインとスマホへの追加" /></h2><p><ReadableText text="一度読み込み、オフライン用の保存が完了すると、カメラ以外の学習機能をオフラインでも使えます。" /></p><p><ReadableText text="スマホのブラウザのメニューや共有メニューから「ホーム画面に追加」を選ぶと、次から開きやすくなります。表示名や手順は端末によって異なります。" /></p></section>
    <section class="card prose"><h2><ReadableText text="参考にした資料" /></h2><p class="small"><ReadableText text="リンクは新しいタブで開きます。" /></p>{SOURCES.length ? <ul class="source-list">{SOURCES.map(source => <li key={source.id}><SourceLink url={source.url} title={source.title} publisher={source.publisher} /></li>)}</ul> : <p><ReadableText text="資料の一覧は準備中です。" /></p>}</section>
    <section class="card prose"><h2><ReadableText text="使った部品の許諾" /></h2><SourceLink url="./THIRD_PARTY_NOTICES.txt" title="使った部品と許諾の一覧" /></section>
    <p class="small about-credit"><ReadableText text="てことば · 100日チャレンジ Day092" /></p>
  </main>;
}
