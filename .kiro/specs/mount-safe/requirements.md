# 同一公開物のルート・サブパス配信

ユーザーの2026-10-30依頼を承認済み要件とする。同じdistを / と /100days/ で配信できるよう、サイト内参照を文書相対にする。/api/day-NNN/ はルートのまま。Day064・076はmount:falseで対象外とし、一覧から元ホストへ飛ばす。vendor/toolsは変更しない。canonical等はHD_CANONICAL_BASE（既定https://rairakku.com/100days）、対象外Dayは元ホストを使う。sitemap、自己完結404、tools noindexを生成し、動的なルート参照検査でビルドを失敗させる。

既存機能・見た目・GA4は維持する。依存追加・ネットワーク・他の作業フォルダへのアクセス・commit/push/PRは行わない。ブラウザ検証は親が実行する。
