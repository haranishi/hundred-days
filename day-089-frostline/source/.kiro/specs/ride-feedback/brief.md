# Brief: ride-feedback

## Problem
物理が正しくても、姿勢・カメラ・雪煙・跡・音が物理に合っていなければ、手ごたえは伝わらない。
調査 R1 は、切るターンと横滑りの違いが「姿勢・跡・音で一致すること」を最優先に挙げている。

## Current State
滑走の状態と出来事は ride-sim が出す。それを見せる側は無い。

## Desired Outcome
滑走者が板に乗って傾き、しゃがみ、飛び、転ぶ。カメラは進む先を見せ、速さと衝撃を伝える。
雪煙の量と向き、雪面に残る跡、音が、切る・削る・飛ぶ・着地の違いを同時に伝える。

## Approach
滑走の状態から、手続きで姿勢を作る（録った動きの素材を使わない）。足は必ず板に付け、脚は IK で解く。
カメラ・姿勢・音量は、すべてばねか平滑化を通して連続に保つ。雪煙は生まれた時刻と初速だけを GPU へ渡して動かす。
音は WebAudio の雑音と正弦波から合成する。

## Scope
- **In**: 滑走者の形と姿勢、板、三人称と一人称のカメラ、雪煙、雪面の跡（帯の方式）、合成音、それらの画質の段。
- **Out**: 物理、地形や空の描画、HUD、雪面を実際にへこませる跡（snow-look）、技（グラブ・縦回転）の姿勢、滑走者の作り込んだ造形。

## Boundary Candidates
- 姿勢の計算（純粋な計算。Node で試験する）と、形への反映
- カメラの追従
- 雪煙と跡
- 音（状態から音の値を決める純粋な計算と、WebAudio の薄い層）

## Out of Boundary
- 転倒の理由の表示（game-shell）。雪質そのものの見た目（mountain-render・snow-look）

## Upstream / Downstream
- **Upstream**: ride-sim（状態・出来事・計測値）、mountain-render（系の登録・カメラの差し替え・地形の高さ）、game-shell（設定・画質の段）
- **Downstream**: snow-look（跡の変形・滑走者の作り込み）、mountain-play

## Existing Spec Touchpoints
- **Extends**: なし
- **Adjacent**: mountain-render の差し込み口、game-shell の `audio` の形

## Constraints
素材ファイルを使わない（形・音とも手続きで作る）。実在ブランドの意匠を付けない。見た目の値は必ず連続にする。
