# Day 006: 構造化データ、いま出るやつだけ

ページの種類と情報を入れると、`<script type="application/ld+json">` のタグごと貼れる形でJSON-LD（構造化データ）が出るツールです。

ふつうのJSON-LDジェネレーターと違うのは、**2026年8月時点でGoogleがまだサポートしているタイプだけを出す**ことです。廃止されたタイプを選ぶと、生成せずに廃止された日と理由を表示します。

公開URL: `https://hundred-days.pages.dev/day-006-schema-jsonld/`

## 作れるもの

| 種類 | schema.orgのタイプ | Googleが求める必須プロパティ |
|---|---|---|
| 店舗・事業所 | `LocalBusiness`（＋業種別サブタイプ） | `name` と `address` の**2つだけ** |
| 記事・お知らせ | `Article` / `NewsArticle` / `BlogPosting` | **1つもない** |
| パンくず | `BreadcrumbList` | `itemListElement`（各項目の `position`・`name`・`item`） |

「店舗の必須は2つだけ」「記事に必須はない」はどちらも意外に知られていないので、画面にも書いています。推奨プロパティは空欄にすればJSONに出ません。

## 作れないもの（意図的に止めています）

- **よくある質問（`FAQPage`）** — FAQのリッチリザルトは**2026年5月7日にGoogle検索から廃止**されました。2026年6月にリッチリザルトテストとSearch Consoleのレポートから、2026年8月にはSearch Console APIからも削除されます。つまり貼っても検索結果の見た目は変わりません
- **手順・使い方（`HowTo`）** — 2023年8月にモバイルでの表示が終わってデスクトップ限定になり、その1か月後の**2023年9月13日にデスクトップからも表示されなくなりました**。スキーマ自体は書けますが検索結果への効果はなく、現在の対応タイプ一覧にも載っていません

どちらも選べるようにはしてあります。選ぶと、JSONの代わりに廃止の説明が出ます。ページの中身としてQ&Aや手順を整えること自体には意味がありますが、それは構造化データの仕事ではないという整理です。

## 使い方

1. ページの種類を選びます。
2. 必須欄を埋めると、その時点でもうJSON-LDが出ます（推奨欄は埋めるほど情報が増えます）。
3. 「コピー」を押して、自分のページの `<head>` の中に貼ります。
4. 貼ったら[リッチリザルトテスト](https://search.google.com/test/rich-results)か[Schema Markup Validator](https://validator.schema.org/)で確かめてください。

## 営業時間の書き方について

`openingHoursSpecification` には、間違えやすい決まりがあります。このアプリはGoogleの仕様どおりに出力します。

- 24時間営業は `opens: "00:00"` / `closes: "23:59"`
- 定休日は `opens: "00:00"` / `closes: "00:00"`
- 開店・閉店が同じ曜日はまとめて1件にし、`dayOfWeek` を配列にします（月〜金が同じなら1件）

## 星評価（`aggregateRating`・`review`）を出さない理由

Googleの案内では、これらは第三者のレビューを集めているサイト向けのプロパティです。自分のサイトに自分で星の数を書くための項目ではないので、このアプリでは生成しません。

## プライバシー

**入力はどこにも送信されません。** 店名や住所を入れてもらいますが、JSONの組み立てはすべてこの画面の中だけで行われ、外部通信・保存（localStorage・Cookie）はありません。ページを離れると入力は消えます。

## 制約と注意

- **Googleの公式ツールではありません。** 仕様の確認日は2026年8月13日です。構造化データの仕様は変わるので、最新の情報は[Google検索セントラル](https://developers.google.com/search/docs/appearance/structured-data/search-gallery)で確認してください
- 生成したJSON-LDが必ずリッチリザルトとして表示されることを保証するものではありません（構造化データは表示の条件のひとつであって、表示を約束するものではありません）
- 外部ライブラリ、外部通信、アカウント、課金、データの永続化は使用していません

## 出典

- [Local business (LocalBusiness)](https://developers.google.com/search/docs/appearance/structured-data/local-business)
- [Article](https://developers.google.com/search/docs/appearance/structured-data/article)
- [Breadcrumb](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb)
- [FAQPage（廃止告知）](https://developers.google.com/search/docs/appearance/structured-data/faqpage)
- [Changes to HowTo and FAQ rich results（2023年8月）](https://developers.google.com/search/blog/2023/08/howto-faq-changes)
- [Structured data markup that Google Search supports（現行の対応タイプ一覧）](https://developers.google.com/search/docs/appearance/structured-data/search-gallery)

`actualMinutes` は、要件確認を始めてから実装とセルフ検収を終えるまでに実際に作業した分数です。
