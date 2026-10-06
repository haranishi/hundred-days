# Day059 権利と規約の確認

確認日：2026-10-06。別担当（Web検索つき）が一次情報を調べ、メインループが主な出典を自分で開いて照合した。
法律の専門家には確認していない。下の判断は公開資料に基づくもので、法的な適否を保証するものではない。

## 結論

公開を止める問題は見つからなかった。ただし個人情報保護法の扱いは解釈の余地があるため、配るデータを減らして対応した（下の4）。

## 項目ごと

1. **Nobel Prize API の利用条件**（[本文](https://www.nobelprize.org/about/terms-of-use-for-api-nobelprize-org-and-data-nobelprize-org/)。別担当の環境では403で開けず、メインループがブラウザと同じ形で取得して全文を読んだ）
   - 「The Services are free to use according to the Creative Commons Zero (CC0) license.」→ 同梱・再配布は可
   - 「should not deliberately alter or censor the data, or deliberately mislead」→ 名前・年・分野・受賞理由の値は変えない。年齢はアプリの計算だと画面に書く
   - 「must not use the Services in order to discredit persons」→ 評価の言葉を使わない。注記は公式データの事実だけ
   - 「Consider using a local cache instead of performing many API calls.」→ 全件は同梱、今年の分は端末に30分〜24時間保存
   - 「may not use Nobel Prize Outreach's name, logos, or other trademarks in their titles or logos … However, you are encouraged to cite the Services as the data source」→ 題名・見出し・OG画像に「ノーベル」を入れない（E2Eで検査）。出典として名前を書く
2. **商標「ノーベル」**：説明の文・出典・X投稿で賞の名前を話題として書くのは、提供元を示す使い方（商標的使用）ではない（特許庁の商標法26条1項6号の解説）。日本での登録の詳細は J-PlatPat で引けず未確認。題名とロゴに使わない方針なので判断は変わらない。メダルの絵・公式ロゴ・公式風の装飾は使わない
3. **写真**：公式の写真は許可が要る（Copyright information）。使わない。公式ページへは通常のリンクだけ（「You are allowed to link to complete html pages on nobelprize.org.」）
4. **個人情報**：公開済みの情報も個人情報保護法の対象になりうる、公開情報を集めたデータベースの公開は第三者提供に当たりうる、という個人情報保護委員会の説明がある。受賞は公の場の事実で、提供元自身が再利用のために公開しているが、**同梱分から生年月日と没年月日を外し、発表日の年齢だけを配る**形にした。今年の分は閲覧者のブラウザが公式APIから直接受け取り、端末内で年齢を数える。テスト用の実応答4本（4人分）には生年月日が残る（年齢の計算を試すのに要るため）。誤りの連絡先として GitHub の Issue を画面に出した
5. **Wikidata**：構造化データは CC0（Wikidata:Licensing）。User-Agent に連絡先URLを入れ、50件ずつ直列で取得。maxlag は検索サービスの遅れで止まるため付けず、429/503 は Retry-After に従う。名前は通常の文字で出典に書き、ロゴは使わない
6. **経済学賞**：正式名称は The Sveriges Riksbank Prize in Economic Sciences in Memory of Alfred Nobel。画面に「アルフレッド・ノーベル記念スウェーデン国立銀行経済学賞。スウェーデン国立銀行が1968年に設け、スウェーデン王立科学アカデミーが選ぶ」と書いた。「1901年から」は経済学賞に当てはまらないので、経済学賞で絞ったときは「1969年から」にした
7. **発表の日時**：公式の予定（平和賞以外は「at the earliest」）を日本時間に直し、「以降の予定」と書く。時刻を過ぎただけでは発表済みにせず、データに入るまで「データ待ち」
8. **X投稿**：「ノーベル賞」は賞の名前として文中で使う。「公式」「公認」「提携」は書かない。「26歳で受賞した人はいない」は対象（1901年からの受賞、発表日の満年齢）を添える。月日不明の20人は39〜83歳で、24〜31歳の判定には影響しないことを確かめた
9. **動画**：字幕の書体は Zen Kaku Gothic New（SIL OFL 1.1。動画への焼き込みに追加の許可は要らない）。BGMはコードで合成した音だけで、録音やサンプルは使わない
