# 配信に含める第三者のコード・素材

`assets/` のビルドには、次の第三者のコードと素材が入っています。ビルドで著作権表示のコメントが落ちるため、許諾の全文をこのフォルダに同梱しています（本文は改変していません）。

| 対象 | 著作者・出典 | 許諾 |
|---|---|---|
| three.js 0.186.1（本体と addons の EffectComposer・RenderPass・OutputPass・UnrealBloomPass・OrbitControls・SunLight など） | three.js authors | [MIT](three-LICENSE.txt) |
| postprocessing 6.39.5 | Raoul van Rüschen | [Zlib](postprocessing-LICENSE.md) |
| postprocessing に含まれる SMAA の GLSL と検索画像 | Jorge Jimenez ら | [MIT と補足](SMAA.txt) |
| n8ao 2.0.1 | N8python | [CC0](n8ao-LICENSE.txt)（package.json は ISC と記すが、配布の LICENSE は CC0） |
| n8ao に含まれるブルーノイズ | Christoph Peters（Calinou/free-blue-noise-textures 経由） | [CC0 声明](BlueNoise.txt) |
| 色調の ACES 近似（`source/src/art/render/grade.ts` の行列と当てはめ式） | Stephen Hill の当てはめ、BakingLab | [MIT](BakingLab.txt) |

## 写真の質感（CC0）

板壁・白壁・土塀・石と石畳の表面のむらに、Poly Haven の CC0 の写真の質感4点を使っています。一覧と来歴は [../SOURCES.md](../SOURCES.md) にあります。

## 音と文字

音（足音・拍子木・鉦・環境音など）は Web Audio でその場で合成しており、録音の素材は入っていません。文字は端末にある明朝体を使い、フォントのファイルは配っていません。
