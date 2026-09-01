# XMLフィクスチャの出典

このディレクトリのXMLファイルは、国立国会図書館サーチAPIから2026-08-29に取得した未改変の生レスポンスです。国立国会図書館が提供する雑誌記事索引メタデータを含み、ライセンスは [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) です。

| ファイル | 取得クエリ（ファイル名とレスポンスから確認できる範囲） |
|---|---|
| `sru-dcndl-oshikatsu.xml` | SRU、雑誌記事索引、題名「推し活」、dcndlレコード取得 |
| `sru-first-seiseiai.xml` | SRU、雑誌記事索引、題名「生成AI」、先頭レコードによる件数確認 |
| `sru-first-zero.xml` | SRU、雑誌記事索引、0件になる検索、先頭レコードによる件数確認 |
| `opensearch-count-seiseiai-2023.xml` | OpenSearch、雑誌記事索引、題名「生成AI」、2023-01-01〜2023-12-31、件数確認 |
| `opensearch-count-zero.xml` | OpenSearch、雑誌記事索引、0件になる検索、件数確認 |
| `opensearch-records-seiseiai-2023.xml` | OpenSearch、雑誌記事索引、題名「生成AI」、2023-01-01〜2023-12-31、レコード取得 |

JSONファイルはアプリの応答形式に整形したテストデータであり、この生レスポンス一覧には含めていません。
