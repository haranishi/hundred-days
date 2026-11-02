# 外の素材の出どころ

影討ちに入れた外の素材（画像・モデル・音・フォント）の一覧。使ってよいのは CC0（作者が著作権を放棄した素材）だけで、2026-10-06 に「外の素材は使わない」から変えた。

| 素材 | 作者・配布元 | 条件 | 使い道 | ファイル | 取得日 |
|---|---|---|---|---|---|
| [Japanese Cedar Planks](https://polyhaven.com/a/japanese_cedar_planks) | Charlotte Baglioni / Rico Cilliers・Poly Haven | CC0-1.0 | 板壁・床・腰板の木目（明るさの比と法線）。手続きの板 1 枚に写真の板 1 枚の内側を当てる。柱と梁は手続きのまま | `src/art/textures/japanese_cedar_planks/` | 2026-10-06 |
| [White Plaster 02](https://polyhaven.com/a/white_plaster_02) | Rob Tuytel・Poly Haven | CC0-1.0 | 白壁と町屋の二階のむら（明るさの比を2つの縮尺で重ねる）と法線 | `src/art/textures/white_plaster_02/` | 2026-10-06 |
| [Clay Plaster](https://polyhaven.com/a/clay_plaster) | Amal Kumar・Poly Haven | CC0-1.0 | 土塀の鏝むら（明るさの比を2つの縮尺で重ねる）と法線 | `src/art/textures/clay_plaster/` | 2026-10-06 |
| [Rock Surface](https://polyhaven.com/a/rock_surface) | Amal Kumar・Poly Haven | CC0-1.0 | 切石と地面の石畳（石ごとに位置と向きを変える）・自然石（三面投影）・溝の底の質感（明るさの比と法線） | `src/art/textures/rock_surface/` | 2026-10-06 |

どれも1Kの色と法線の画像で、来歴とハッシュは各フォルダの `provenance.json` にある。ゲームが配るのは、`tools/art/texture-derive.mjs` が原本から作った派生（色は線形の輝度の白黒 JPEG・1K、法線は 512px の JPEG）で、作り方と派生のハッシュは同じ `provenance.json` の `derived` にある。原本は来歴のために置いてあり、コードが参照しないのでビルドには入らない。模様の形（板の継ぎ目・切石の目地など）は今もシェーダーで描き、写真は表面のむら（明るさの比と法線）にだけ使う。

## 足すときの手順

1. 配布元のページで、条件が CC0 かを確かめる。BlenderKit の Royalty Free はブラウザのゲームでは条件を守れないので使わない
2. 上の表に1行足す。取得元のURL、作者、使った場所、ファイルの置き場所を書く
3. 3d-assets（MCP）で落とすときは、`download_asset` の保存先を毎回指定する

条件のページ：[Poly Haven](https://polyhaven.com/license)・[ambientCG](https://docs.ambientcg.com/license/)・[TextureCan](https://www.texturecan.com/terms/)
