# 設計時の検証（参照実装と事件簿のデータ）

対象は、画面に依存しない部分（geometry・shapes・score・cases・deduction・config）。実装者へ渡す前に、設計側で成立を確かめた。

## Validation Report
- DECISION: GO（参照実装とデータ。画面・入力・進行は未実装）
- MECHANICAL_RESULTS:
  - Tests: PASS。`node --test day-071-kage-shogen/tests/` が8件成功・失敗0・約4.3秒。
  - 較正: PASS。`node day-071-kage-shogen/tools/design/run.mjs` で、5夜すべて正解が合格・開始が不合格。
- 確かめたこと：
  - 灯りの許容は各夜 ±4〜8cm。道具の許容は ±4〜11cm。±3cmは全件で合格、±12cmは全件で不合格。
  - 灯りの高さは一意。横を最適にそろえても、正解から12cm以上離れた高さでは合格しない（夜5は105〜111cmだけが合格）。
  - 夜5の邪魔な道具（山高帽・地球儀）は、壁に残すと合格しない。壁の端（x=10 / 230）へすべらせると影が壁の外へ出る。
  - 推理：再現前は2人以上、再現後は犯人だけが残る。5件の犯人は別人。夜4は踏み台を見落とすと別の人（蓮見）に見える。
- 設計の変更：試作の途中で、2次元の自由な灯り・許容付きの一致度・細い部品を捨てた。理由と数値は [research.md](../../../.kiro/specs/day-071-kage-shogen/research.md)。
- GAPS: 画面・入力・実機の指の精度・面白さは未確認。実装後に、実ブラウザと体験評価で確かめる。

## Verification Result
- STATUS: DESIGN_VALIDATED
- CLAIM_TYPE: DATA_AND_REFERENCE_GO
- EVIDENCE: `tests/cases.test.mjs` の8件、`tools/design/run.mjs` の出力（5夜）、試作の画像（壁・開始・高さのずれ・現場図）の目視。
