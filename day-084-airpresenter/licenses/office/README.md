# AirPresenter の変換エンジンと権利表記

配布するのは未改変の ZetaOffice 24.2.8.0.beta1 と ZetaJS 1.2.0、Noto Sans CJK JP の通常・太字です。
エンジン全体を MIT や MPL だけで利用できるとは表示しません。各部品の許諾全文は下表から確認できます。
資料や PC から読み取ったフォントは、この公開アセットに含みません。

| 部品 | 配布元・固定ソース | 同梱する許諾・通知 |
|---|---|---|
| ZetaOffice / LibreOffice | 公式 CDN、BuildId `efaf0670b4d055f838a2849becb10f08aa06a257` | [全ライセンス](libreoffice/LICENSE.html)、[NOTICE](libreoffice/NOTICE)、[MPL](libreoffice/COPYING.MPL)、[LGPL](libreoffice/COPYING.LGPL)、[COPYING](libreoffice/COPYING) |
| ZetaJS 1.2.0 | `57360bcb0e7726ffa0e66567c8041261b959f8dd` | [MIT](zetajs/LICENSE) |
| Qt 5 / qtbase | 配布元の `5.15.2+wasm` フォーク | [GPLv3](qt/LICENSE.GPL3)、[LGPLv3](qt/LICENSE.LGPL3)、[GPLv2](qt/LICENSE.GPL2)、[例外](qt/LICENSE.GPL3-EXCEPT)、`qt/src/3rdparty/` の通知 29 件と参照許諾全文 35 件 |
| Emscripten / musl / LLVM runtime | `949ee1d40467b80e90a9fdc67155d443426fef2d` | [Emscripten](emscripten/LICENSE)、[musl](emscripten/system/lib/libc/musl/COPYRIGHT)、[libc++](emscripten/system/lib/libcxx/LICENSE.TXT)、[libc++abi](emscripten/system/lib/libcxxabi/LICENSE.TXT)、[libunwind](emscripten/system/lib/libunwind/LICENSE.TXT)、[compiler-rt](emscripten/system/lib/compiler-rt/LICENSE.TXT) |
| Noto Sans CJK JP | `f8d157532fbfaeda587e826d4cd5b21a49186f7c` | [SIL OFL 1.1](noto/LICENSE) |

## 出所とビルド資料を確認する

公開バイナリ・フォントの取得先、版、元バイトの SHA256 は `web/office-sources.json` に記録します。
公式 CDN の `zetaoffice_latest` は可変の別名なので、SHA256 が一致しない取得物はビルドで拒否します。
WASM/data は公式 Brotli を保持し、フォントは gzip にします。転送用の圧縮・分割から展開した元バイトは変更しません。
このディレクトリの原文ごとの取得 URL と SHA256 は [sources.json](sources.json) に記録しています。

固定ソースのアーカイブは以下から取得できます。

- [LibreOffice core](https://github.com/LibreOffice/core/archive/efaf0670b4d055f838a2849becb10f08aa06a257.tar.gz)
- [ZetaJS](https://github.com/allotropia/zetajs/archive/57360bcb0e7726ffa0e66567c8041261b959f8dd.tar.gz)
- [Emscripten](https://github.com/allotropia/emscripten/archive/949ee1d40467b80e90a9fdc67155d443426fef2d.tar.gz)
- [Qt5 配布元フォーク](https://github.com/allotropia/qt5/archive/3d440b7787f9b5ba15e5f8bcd7aef39b388f94fa.tar.gz)
- [qtbase 配布元フォーク](https://github.com/allotropia/qtbase/archive/a320678c85ec8029d5394bcd673d4c208af1de3a.tar.gz)
- [Noto CJK](https://github.com/notofonts/noto-cjk/archive/f8d157532fbfaeda587e826d4cd5b21a49186f7c.tar.gz)

上流の [ソース案内](zetajs/README.md)、[起動仕様](zetajs/docs/start.md)、[WASM ビルド説明](libreoffice/README.wasm.md) も原文のまま保持しています。
Qt は上流が案内するフォークの固定スナップショットです。配布バイナリを作った正確な Qt コミットは確認できておらず、同一ビルドを再現したとは主張しません。
LibreOffice の `LICENSE.html` は上流の `license.xml` 全文を無加工で保存したもので、外部部品の通知を省略していません。
