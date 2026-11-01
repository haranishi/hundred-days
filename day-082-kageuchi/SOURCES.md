# Day082「影討ち」の同梱データ（MIT 以外）

このフォルダのうち、次の写真の質感はコードの MIT ライセンスの対象外で、CC0 1.0 です。取得元・作者・使い道・取得日の正本は [source/docs/CREDITS.md](source/docs/CREDITS.md) です。

| 素材 | 作者・配布元 | 条件 | 配るファイル（`assets/`） | 原本と来歴（`source/src/art/textures/`） |
|---|---|---|---|---|
| [Japanese Cedar Planks](https://polyhaven.com/a/japanese_cedar_planks) | Charlotte Baglioni / Rico Cilliers・Poly Haven | [CC0-1.0](https://polyhaven.com/license) | `japanese_cedar_planks_lum_1k-*.jpg`・`japanese_cedar_planks_nor_gl_512-*.jpg` | `japanese_cedar_planks/`（`provenance.json`） |
| [White Plaster 02](https://polyhaven.com/a/white_plaster_02) | Rob Tuytel・Poly Haven | [CC0-1.0](https://polyhaven.com/license) | `white_plaster_02_lum_1k-*.jpg`・`white_plaster_02_nor_gl_512-*.jpg` | `white_plaster_02/`（`provenance.json`） |
| [Clay Plaster](https://polyhaven.com/a/clay_plaster) | Amal Kumar・Poly Haven | [CC0-1.0](https://polyhaven.com/license) | `clay_plaster_lum_1k-*.jpg`・`clay_plaster_nor_gl_512-*.jpg` | `clay_plaster/`（`provenance.json`） |
| [Rock Surface](https://polyhaven.com/a/rock_surface) | Amal Kumar・Poly Haven | [CC0-1.0](https://polyhaven.com/license) | `rock_surface_lum_1k-*.jpg`・`rock_surface_nor_gl_512-*.jpg` | `rock_surface/`（`provenance.json`） |

配るのは、`source/tools/art/texture-derive.mjs` が原本から作った派生です（色は線形の輝度の白黒 JPEG・1K、法線は 512px の JPEG）。作り方と派生のハッシュは各 `provenance.json` の `derived` にあります。原本（`*_diff_1k.jpg`・`*_nor_gl_1k.jpg`）は来歴のために `source/` に置いてあり、ゲームのコードが参照しないので配信のビルドには入りません。ファイル名の `-*` は Vite が付ける内容のハッシュです。

配信するビルドに入るライブラリ（three.js・postprocessing・n8ao など）の許諾は [licenses/](licenses/README.md) にあります。
