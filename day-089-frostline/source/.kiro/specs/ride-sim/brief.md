# Brief: ride-sim

## Problem
「滑っている手ごたえ」は、切って曲がることと、板を横へ向けて削ることの違いから生まれる（調査 R1 の最優先）。
ALPINE FLOW は板の向きと進む向きが同じ物理で、この違いを出せなかった。

## Current State
物理は無い。調査 R2 に、推奨モデル・係数の出どころ・検算に使える数値目標20個がある。

## Desired Outcome
操作から決定的に滑走の状態が決まる。斜度・雪質・起伏で速度と荷重が変わり、切るターンと横滑りが別物として成立する。
ジャンプは構えて離し、着地は衝撃と向きで結果が決まる。転んだら理由が分かる。

## Approach
固定刻み 120Hz の自作モデル。接地中は「切る（板が進む向きに沿う）」と「削る（板が進む向きからずれる）」の2つの状態を持ち、
脚をばねとして荷重を解く。空中は放物線と回転。係数は1ファイルに集め、出どころを書く。

## Scope
- **In**: 接地・空中・転倒の力学、操作の意味づけ、雪質ごとの係数、着地と転倒の判定、木と岩への接触、出来事と計測値の出力。
- **Out**: 入力装置の読み取り、描画、音、姿勢のアニメーション、得点。スキーは後の仕様で足す（係数の差し替えで足せる形にする）。

## Boundary Candidates
- 接地の力学（切る・削る・荷重）
- 空中と着地・転倒の規則
- 係数と雪質の表
- 状態・出来事・計測値の出力の形

## Out of Boundary
- 地形のデータ（mountain-world の問い合わせの形だけを使う。試験では解析的な斜面を自前で用意する）
- 時間の進め方（game-shell が固定刻みで呼ぶ）

## Upstream / Downstream
- **Upstream**: mountain-world（`sampleSurface`・`curvatureAlong`・`snowAt`・`obstaclesNear` の形）
- **Downstream**: ride-feedback（姿勢・カメラ・雪煙・音）、game-shell（HUD と再開）、mountain-play（記録）

## Existing Spec Touchpoints
- **Extends**: なし
- **Adjacent**: game-shell と、操作の値の形・試験用の窓口を共有する

## Constraints
DOM も three.js も読まない純粋な計算。依存パッケージを足さない。刻みの中で物を作らない。調査 R2 の数値目標を回帰試験にする。
