# 契約1: 木のモデル（担当A・Codex）

共通の約束は `day-095-bonsai/lib/contract.js`（定数と `validateSkeleton`）が正本。ここは文章の説明。
座標は右手系・Y上・1単位=10cm。鉢の土の面が y=0、幹の根元が原点、正面は +Z。モデルは DOM・three.js・Math.random・Date に依存しない（Node だけで試験できる）。

## 木が持つもの
節（node）は、枝の一区間。親の終点が子の始点。局所の向きは親の世界の向きからの相対で、節の方向は局所のY軸。
曲げは節の局所の向きを回すだけで、先の枝ぜんぶが剛体のように動く。枝の長さは変わらない。
`order`: 0=幹、1=主枝、2=副枝、3以上=小枝。`chain`: 途切れない一本の枝（幹も1本）に同じ番号。枝分かれの子のうち、続きの1本だけが親と同じ chain。
太さは、パイプモデル（親の断面積＝子の断面積の和）＋切っても細くならない下限（girth）。先端は 0.018 以上。
実装の中身（配列の持ち方）は自由。下の公開の形だけ守る。

```js
createTree({ species, style, seed, day = 0 }) → Tree       // 苗。節数は 紅葉380〜700・黒松260〜520・梅300〜600。高さ 2.8〜3.6
restoreTree(json) → Tree                                   // 検証し、不正なら Error を投げる。節数・数値の上限を守らせる
tree.species, .style, .seed, .day, .moisture, .nodeCount
tree.snapshot()   → Skeleton   // 契約どおり。変更があるまで同じ物を返す。validateSkeleton が [] を返す
tree.date()       → dateOf(tree.day)
tree.clone()      → Tree       // 独立の複製。元に戻す用
tree.toJSON()     → 素のオブジェクト（SAVE_VERSION つき。JSON文字列にできる・400KB 未満）
tree.advance(days) → { ticks, born, day }   // 7日ごとに1回の成長（週の境目をまたぐたびに）。決定的。直前の FRESH を消し、新しい節に FRESH を付ける
tree.canCut(id) / tree.cut(id)   → { ok:true, removedIds, parentId } | { ok:false, reason, message }
tree.canPinch(id) / tree.pinch(id)
tree.canBend(id)  → { ok, maxAngleDeg } | { ok:false, reason, message }
tree.beginBend(id) → BendSession | { ok:false, reason, message }
  session.update(grabPoint, targetPoint) → { angleDeg, clamped }   // 世界座標。つかんだ点が目標へ向かうよう、節の始点を軸に先を回す。開始時からの絶対指定（同じ目標なら同じ結果）
  session.commit() → { ok, changed }    // 3度未満なら changed=false で元のまま。変わったら、その節から chain の終わりまでに WIRED を付ける
  session.cancel()
tree.unwire(id) → { ok }      // [P1]
tree.water(amount01)          // [P1] moisture を上げる。moisture は週ごとに下がる
```
`message` は日本語1行（例：「太い幹は切れません。枝を選びましょう」）。`reason` は英語の短い識別子。

## 振る舞い（試験で固定する）
- 切る：その節と先ぜんぶを消す。ほかの節の id と形は変わらない。親の終点に CUT が付き、`scarAge` は週ごとに増える。幹は、根元から高さ55%より上の節だけ切れる。
- 曲げる：節の長さは変わらず、つかんだ所から手前は動かない。上限は太さで決まる（小枝は大きく・幹の根元は不可）。一度曲げた節は、成長しても局所の向きを保つ。
- 芽摘み：枝先（子のない節か、その1つ手前）だけ。PINCHED を付け、パッドを小さくする。次の成長で、その先は伸びず2本に分かれる。
- 成長：週ごとに、種ごとの月の係数（冬は0）で枝先が伸びる。針金のない新しい節は、少しだけ上へ向かい、ばらつく。切り口の近くから、まれに芽が出る。節の総数が MAX_NODES に近いと、伸びる代わりに太る。
- 年1周（364日）進めても、節は増えすぎず（+90%以内）、高さは +25% 以内。冬の間は節が増えない。
- 決定的：同じ種・同じ操作の列なら、`toJSON()` が完全に一致する。複製を作って別の操作をしても、元は変わらない。
- 枝先の葉のかたまり（`pads`）：order≥1 の先端に1つずつ。`density` は、芽摘み・切ってからの週数で決まる。

## 季節・暦・当たり判定・履歴
```js
dateOf(day) → { day, year, month, dom, doy, week, season, seasonLabel, label }   // calendar.js。day=0 は10月1日。うるう年なし。label は「秋・10月1週」
nextSeasonDay(day) → 次の季節（3/1・6/1・9/1・12/1）の始まりの day
seasonLook(speciesId, doy, { moisture = 0.6 }) → { coverage, flower, bud, leafAge, fall, petal, color, color2, season }   // look.js。validateLook を満たす。連続的に変わる
pickNode(skel, ray, { pxToWorld, tolerancePx = 14, padHit = true }) → null | { index, id, t, point, viaPad, distance }   // pick.js
branchSegment(skel, index) → Int32Array     // その節から chain の終わりまで
subtreeIndices(skel, index) → Int32Array    // その節と子孫
indexOfId(skel, id) → number
branchList(skel) → [{ chain, first, tip, order }]   // キーボードで順に選ぶ並び（高さ・向きで安定）
createHistory(limit = HISTORY_LIMIT) → { record(tree), undo(currentTree), redo(currentTree), canUndo, canRedo, clear() }   // history.js。record は変更の直前に呼ぶ
```
色は sRGB の 0〜1。紅葉：1〜2月は coverage 0、3月に芽（bud が上がる）、4月に新緑へ、5〜8月は緑、9月に黄緑、10月に橙〜赤、11月中旬から coverage が下がり fall が上がる、12月に0。黒松：coverage は常に0.92以上・深い緑・5〜6月に bud（新芽）。梅：1〜3月に flower、4月に花が散り（petal）、葉、10〜11月に黄、12月に0。

## 受け入れ（担当Aが書く試験の最低線）
上の「振る舞い」の各行、`validateSkeleton` が苗・成長後・切った後・曲げた後・復元後のすべてで [] を返すこと、
復元（toJSON→restoreTree）で snapshot が一致すること、`restoreTree` が壊れた入力で投げること、seasonLook の連続性（隣の日の差が小さい）と範囲。
試験は `tests/core/*.test.mjs` に置く（置くだけで走る。入口は `tests/index.mjs` が自動で集める）。
