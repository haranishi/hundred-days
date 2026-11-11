# Brief: mountain-world

## Problem
滑走の手ごたえも実写に近い画も、山の形で決まる。物理と描画が別々に地形を持つと、板が雪面から浮く・沈む。

## Current State
山のデータは無い。下調べの試作（`spikes/renderer`）は、雑音を重ねただけの仮の地形を使っている。

## Desired Outcome
種から同じ山を何度でも作り直せる。物理・描画・地図が、同じ高さ・雪質・木の位置を、同じ問い合わせで読める。
作った山は、画像と統計の報告で、ゲームを動かさずに形を確かめられる。

## Approach
Node の生成スクリプトが、火山の基本形・地形の特徴・浸食・積雪を順に重ねて高さと雪質の地図を作る。
実行時は、その配列を3次Bスプラインで補間して読む。木と岩は種から決定的に並べ、保存しない。

## Scope
- **In**: 生成スクリプト、高さ・法線・曲率・雪質・木と岩・出発地点・太陽の影の問い合わせ、確認用の画像と統計。
- **Out**: 描画（GPU への転送と見た目）、物理、地図の画面、複数の山、実在の標高データ。

## Boundary Candidates
- 補間の式（生成と実行時で共有する純粋関数）
- 生成の各段（形・浸食・積雪・木と出発地点・影の焼き込み）
- 実行時の問い合わせと、木・岩の決定的な配置

## Out of Boundary
- 高さテクスチャや法線テクスチャの作成（mountain-render が配列から作る）
- 雪質から摩擦などの係数への変換（ride-sim が持つ）

## Upstream / Downstream
- **Upstream**: なし
- **Downstream**: ride-sim（問い合わせの形）、mountain-render（配列と木の配置）、ride-feedback（雪質と区域）、mountain-play（出発地点と区域）

## Existing Spec Touchpoints
- **Extends**: なし
- **Adjacent**: ride-sim・mountain-render と、問い合わせの形を共有する

## Constraints
依存パッケージを足さない（PNG の書き出しも自作）。生成は決定的で、全体で5分以内。調査 R3・R4 と `steering/tech.md` に従う。
