# Day045 自動連射とレベルアップ 検証結果

- `node --test day-045-read-your-shots/tests/index.mjs`：90件、pass 90 / fail 0 / skip 0。
- `node --check tests/e2e/day-045.spec.mjs`：成功。E2Eは依頼に従い実行していない。
- `npm run build`：成功（45 Day）。dist/を再生成。
- ブラウザでの実操作・390×664の実表示・聴感は未検証。
- 熱は指定式を優先。1.5秒で約0.865、1.8秒で最大。1.5秒で最大という条件のみ両立しない。
- 被弾復帰中とウェーブ移行中の射撃休止は維持。アイテムの落下・取得はその間も継続。
- LV15で斉射8、LV16以降は「これ以上は伸びない」。レベル数自体は増える。
- 旧プロモの固定カット検証（回避・2倍・結果）は成功。素材とtools/promoは変更なし。
- 自動操縦のシミュレーション：seed 1 は73秒/W8/LV24、2は50秒/W4/LV11、3は16秒/W1/LV2、20260921は49秒/W3/LV8でライフ0。実プレイの評価ではない。
- Git操作、公開、外部送信なし。

変更ファイル（この記録を含む18ファイル）：
- day-045-read-your-shots/lib/game.js
- day-045-read-your-shots/lib/upgrades.js（新規）
- day-045-read-your-shots/lib/fleet.js
- day-045-read-your-shots/lib/audio.js
- day-045-read-your-shots/app.js
- day-045-read-your-shots/app.css
- day-045-read-your-shots/index.html
- day-045-read-your-shots/README.md
- day-045-read-your-shots/REQUIREMENTS.md
- day-045-read-your-shots/meta.json（descriptionのみ）
- day-045-read-your-shots/tests/upgrades.test.mjs（新規）
- day-045-read-your-shots/tests/game.test.mjs
- day-045-read-your-shots/tests/fleet.test.mjs
- day-045-read-your-shots/tests/index.mjs
- day-045-read-your-shots/tests/promo.test.mjs（固定射撃入力を空入力へ更新）
- tests/e2e/day-045.spec.mjs
- .agent-harness/contracts/day045-upgrades.md（新規）
- .agent-harness/runs/day045-upgrades.md（新規）
