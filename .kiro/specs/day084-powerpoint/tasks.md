# 実装タスク案

- [x] 1.1 固定版アセットのビルドとストリーム配信、専用CSPを実装する。
  - _Boundary: Assets/Delivery_ / _Requirements: 2.2,3.1,3.2_
  - 固定ハッシュ/ライセンス、全part20MiB以下、GET/HEAD、不正パス/欠損の試験。
- [x] 2.1 変換用フレームを所有するPPTX/PPT importerを実装する。
  - _Boundary: Import/Engine_ / _Requirements: 1.1,1.2,1.3,2.1,2.4,2.5,2.6,2.7_
  - 初期化/ページ上限/変換/64MiB/取消/期限/終了とPDF描画へ接続する。
  - _Depends: 1.1_
- [x] 3.1 選択・段階/経過時間・中断・全ページ確認のUIと説明を更新する。
  - _Boundary: UI/Browser_ / _Requirements: 1.1,1.4,1.5,2.3,2.4_
  - _Depends: 2.1_
- [x] 4.1 実エンジン・2ブラウザ・私的資料のローカル確認と独立レビューを行う。
  - _Boundary: Verification_ / _Requirements: 3.3,3.4,3.5_
  - 文字抽出だけでなく画像、日本語通常/太字、背景、順序、PPTとPPTX、旧資料維持・任意PCフォント・フレーム/Worker解放を確認。
  - _Depends: 1.1,2.1,3.1_
- [ ] 5.1 公開ゲート/CI/PR/マージ/本番確認、X草案・宣伝素材・保存先メモを対応形式に合わせる。
  - _Boundary: Integration_ / _Requirements: 3.6_
  - _Depends: 4.1_

Task5.1の公開後の完了証拠は、この変更のPRに時刻・Worker version・実操作結果・成果物の更新として追記する。

- [ ] 5.2 公開エンジンの途中切れを防ぎ、同一画面での差し替えを再検証する。
  - _Boundary: Delivery/Release_ / _Requirements: 2.2,2.4,3.1,3.2,3.5,3.6_
  - 圧縮wire長をFixedLengthStreamで保証し、ASSETSからnative pipeToで順につなぐ。全必須CI・公開rawSHA・PPTX/PPT/PC書体差替を確認する。

## Implementation Notes
- Task1.1：独立APPROVED。23/23配信・relay、13/13browser、既存UI14工程、7資産/8part/84許諾ハッシュ一致。新PPTX統合・本番は後続タスク。
- 配信manifestはschemaVersion1/base/assets、登録したnameをbaseへ連結する。bodyはBrotli/gzipを保持しencodeBody:manualで返す。
- Task2.1：独立APPROVED。実APIのRED422→実PPTX/PPT・色/頁・容量/101頁/破損・準備/変換中断の3/3成功。終了時フォント解放1/1、既存13/13・23/23も成功。UI/本番は後続。
- Task3.1：独立APPROVED。UI9工程・例外/CSP/スマホengine取得0、UI18/20・体験19/20。新UI7工程と既存PDF/全画面等14工程も成功。証拠QRはopacity0で隠して差替済み。
- Task4.1：独立APPROVED。最終23/23・13/13・実engine3/3・既存UI14工程・新UI7工程・WebKit4工程。指定資料はROOTが完成画面で標準/PC書体の各29頁を確認。詳細はverification.md。
- Task5.1公開検証で、HTTP200だがWASM受信が120,503,064B/8,430,743B等へ途中切れする例を捕捉。固定rawは161,667,499B。旧Worker0/5秒待ちでも再現し、PC書体そのものが原因ではない。Task5.2へ継続。
- Task5.2ローカル：実HTTP長さRED→GET/HEAD/過不足/取消を含む配信10/10、最終25/25、engine3/3・UI7工程成功。配信pathのみstream-v2、raw SHA/SDK不変。公開再確認は修正PRへ追記。
- Task5.2実装/検証の独立レビューAPPROVED。別runtime3件で長さ/bytes/過不足/取消を確認。必須CIと公開後の連続差し替え検証は後続。
