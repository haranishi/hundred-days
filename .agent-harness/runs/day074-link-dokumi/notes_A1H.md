# A1H 進捗

- 既存仕様・独立レビュー・契約・住所テストを確認。修正前377件中4件失敗。
- lists.js: amazonaws.comを利用者公開先へ移し、凍結・認証語と短いASCII語の境界照合を追加。
- url-input.js: 省略形を含む制御文字の拒否とpunycode後253字の上限を追加。
- lexical.js: PRIVATE区画を共有先として返し、既知の提供者がなければsuffixを提供者名に使用。
- brands.js: 出典付き公式表、未確認表、PRIVATE免除禁止、suffix除外、資格JPの登録名除外、複合語境界一致を実装。
- 既存address-domains/lexical/brands/regressionsの期待値をPSLの境界・追加メタデータ・一次資料状態へ更新。AWS基盤名自身はブランド兆候にも免除にも使わない。
- address-review.test.mjsを追加しaddress.index.mjsへ登録（188件）。135ホスト、PSL共有先、複合語9種×3位置、制御文字、ホスト長、出典、34型を回帰検証。
- 検証入力を実データに照合して修正：tokyo.jp配下はfirst/secondを比較、smbc-cardは既存の共通語重複排除を維持。PSL未収録はweebly.com/weeblysite.com/canva.siteの3件。
- legit-domains.json: 指示の106件に対して実物は96件だったため、今回一次資料で確認した正規ホスト10件（Outlook/OneDrive/Gmail/Bing/MSN/Xbox/Skype/楽天）を追加。期待件数を緩めず241件を実データで検証する。
- 最終受領書を作成。住所575件/全体1101件とも全件成功、241ホスト誤検知0。3入力の増点と平均0.0356ms/回をオフライン確認。34型の「所見ゼロ3件」の契約の食い違いと未確認rakuten.ne.jpを報告。
