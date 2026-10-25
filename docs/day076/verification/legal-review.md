# Day076 公開前の規約・法律・権利確認

確認日：2026-10-25。対象は画像/PDF/データ24ツールの端末内処理版。
100日チャレンジのAGENTS・README・LICENSE・公開契約と、実物の依存許諾を確認した。

## 公開条件と判断

- 公開先は既存Cloudflare Pages。無料枠・登録不要を維持し、変換用APIや保存領域を作らない。
- 入力・結果・ファイル名はHTTP/解析/共有URLへ渡さない。選択データの履歴保存を実装しない。
- Office3形式の変換はサーバーを必要とするため、静的公開版の操作一覧から除外する。
- 元のローカル版にはOfficeを残す。公開対応と誤表示せず、無料枠/個人情報の方針も変更しない。

## 配信・ソース管理サービス

[Cloudflare利用条件](https://www.cloudflare.com/terms/)と[GitHub Acceptable Use](https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies)を確認した。
配信するのは自作コード・許諾済み資材だけで、利用者ファイルのホスティング/共有機能は作らない。
不正な保護解除、権利侵害、第三者の私的情報の公開を用途として提供せず、新たな有料契約も行わない。

## 著作権・利用者の権利

[著作権法](https://laws.e-gov.go.jp/law/345AC0000000048)と[文化庁の解説](https://www.bunka.go.jp/seisaku/chosakuken/kaizokuban/handbook/pdf/93952901_01.pdf)を参照した。
複製・翻案・公衆送信は別の権利であり、私的複製の例外を結果の一般公開まで拡張しない。
変換する権利のあるファイルを使い、公開/再配布時は元の利用条件を確認すると表示する。
外部サイトの取得・DRM回避・暗号解除を提供しない。入力の著作権を運営者へ譲渡させない。
画面・ロゴは本作用の自作。検証fixtureは自作で、利用者の原本を公開しない。

## 個人情報と通信

[PPCのクラウドFAQ Q7-53](https://www.ppc.go.jp/all_faq_index/faq1-q7-53/)は、事業者が個人データを実際に扱うかで判断を分けている。
端末内処理を『個人情報が存在しない』『すべての通信がない』と説明しない。
[Cloudflareの方針](https://www.cloudflare.com/privacypolicy/)では配信アクセス情報の処理があるため、入力と配信を別に説明する。
本アプリのページに解析/広告タグを置かない。一覧ページのGA4とは範囲を区別する。
リンク共有はアプリURLのみ。問い合わせIssueは公開であり、個人情報や原本を添付しないと案内する。

## 利用条件と免責

[消費者庁の消費者契約法第8条解説](https://www.caa.go.jp/policies/policy/consumer_system/consumer_contract_act/annotations/assets/consumer_system_cms203_230915_13.pdf)を確認した。
全部免責・『無料なので賠償上限0円』・故意/重過失まで含む免責を作らない。
今回は損害賠償の上限を新設せず、原本保持・結果確認・処理と保存の限界を説明する。
『法令に基づいて負う責任を免除するものではない』と明示し、利用条件は画面から常時開ける。

## OSSとフォント

| 素材/実装 | 公開時の対応 |
|---|---|
| 本体 | 既存リポジトリのMIT、著作権haranishiを維持 |
| React/PDF-lib/fflate/Papa Parse/Marked等 | MIT/ISC/0BSD等の許諾全文をlicensesへ保持 |
| PDF.js/jSquash/wasm-feature-detect | Apache2.0本文を同梱、変更箇所と日付を告知 |
| DOMPurify | dual licenseのApache2.0側を採用し、元の許諾を保持 |
| PDF.js付随のCMap/Foxit/ICC/WASM | 各資材の別許諾を保持し、一括でApache2.0にしない |
| Liberation Sans | 旧GPL版を配布せず、公式未改変2.1.5/OFL1.1の4書体へ置換 |

[Apache2.0 §4](https://www.apache.org/licenses/LICENSE-2.0)、[DOMPurify](https://github.com/cure53/DOMPurify/blob/main/LICENSE)、[Liberation公式2.1.5](https://github.com/liberationfonts/liberation-fonts/releases/tag/2.1.5)を確認した。
OFLの許諾・作者・Reserved Font Names・固定版・SHA256はsource/vendor/liberation-fontsへ保存。
PDF.jsの版固定補正は再生成可能にし、生成JSにも変更告知を保持する。
許諾一覧はDayのlicenses/index.htmlから実物へリンクする。結果ファイルへアプリのMITを強制しない。

## Officeを公開するときの追加条件

同意チェックだけで、文書に記載された他人の個人データの取扱いまで正当化できると扱わない。
送信先・目的・保持/削除・ログ・再委託・事故対応を実構成へ合わせ、無料枠と運用を確認する。
国外委託等は[PPC Q12-1](https://www.ppc.go.jp/all_faq_index/faq1-q12-1/)も踏まえて整理する。
今回はOfficeを公開せず、この未決条件を静的版へ持ち込まない。

## 公開判断の範囲

24ツールの機能自体を停止すべき根拠は、今回調べた一次資料と実装の範囲では見つからなかった。
配布許諾、説明と通信の一致、実CSPでの描画、公開ゲートを確認してからPRを作る。
個別ファイルの権利や全法域の法的適合性を保証する確認ではない。
