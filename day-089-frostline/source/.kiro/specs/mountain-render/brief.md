# Brief: mountain-render

## Problem
山のデータがあっても、6km四方の雪山を毎秒60コマで、雪面の起伏が読める光で描けなければ、速さも手ごたえも伝わらない。

## Current State
下調べの試作（`spikes/renderer`）で、WebGPU と WebGL2 の両方式が、地形の持ち上げ・カスケード影・空・後処理を毎秒60コマで描けることを確かめた。
試作は仮の地形を1枚の格子で描いているだけで、広さへの対応・雪の質感・木と岩は無い。

## Desired Outcome
山のどこに立っても、近くは細かく遠くは粗く、継ぎ目も飛びも無く山が見える。描いた雪面は、問い合わせの高さと一致する。
夕方の太陽・山の大きな影・近くの影・空と霞・雪と岩・木と樹氷がそろい、3つの画質の段で動く。

## Approach
地形は四分木の区画を距離で選び、境目をなめらかにつなぐ方式（CDLOD）。高さは山のデータを頂点シェーダーで読む。
影は、遠くを焼いた日当たりの地図、近くをカスケード影で受け持つ。空・霞・環境光の色は同じ空から取る。

## Scope
- **In**: 描画の初期化と方式の判定、地形、空と太陽と霞と環境光、影、雪と岩の材質の土台、木・樹氷・岩、後処理、画質の段、描画への差し込み口。
- **Out**: 滑走者・カメラの追従・雪煙・跡・音（ride-feedback）。雪の質感の作り込みと遠景（snow-look）。山のデータの生成（mountain-world）。

## Boundary Candidates
- 区画の選び方（Node で試験できる純粋な計算）
- 地形の材質とテクスチャの作成
- 空・光・影・霞
- 木と岩の描画と、移動に合わせた出し入れ
- 描画の入口（器への差し込み、ほかの系の登録）

## Out of Boundary
- カメラの動かし方（既定の確認用カメラだけ持つ。滑走中のカメラは ride-feedback が差し替える）
- 雪面の跡（差し込み口だけ用意する）

## Upstream / Downstream
- **Upstream**: mountain-world（配列と問い合わせ）、game-shell（描画を差し込む形・画質の段・検査の道具）
- **Downstream**: ride-feedback（場面・カメラ・光・地形の高さを読む口）、snow-look

## Existing Spec Touchpoints
- **Extends**: なし
- **Adjacent**: game-shell の `view` の形、mountain-world のデータの形式

## Constraints
three.js 0.187.0 の WebGPURenderer と TSL。API 名は `node_modules/three` の実物で確かめる。描画を触ったら実ブラウザのコンソールを見る。
