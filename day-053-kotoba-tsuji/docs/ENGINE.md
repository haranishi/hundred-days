# ENGINE — 盤の生成と対局の状態（実装者向けの契約）

DOMを触らない純粋なロジック。すべて `lib/` の ES モジュール（`export`）。Node 24 の `node --test` で単体テストする。
UI（`app.js` 等）はここに書いた関数と形だけを使う。形を変えるときはこの文書を先に直す。

## lib/rng.js
- `mulberry32(seed:uint32) → () => number[0,1)`、`hashSeed(str) → uint32`（xmur3 か FNV-1a）、`shuffle(arr, rand) → 新しい配列`
- `randomSeed() → string`：base36 で6〜8字（`crypto.getRandomValues` があれば使う）。**生成器の中では使わない**

## lib/kana.js
- `ALLOWED`：盤に置ける字の Set。清音46（あ〜ん・を含む。ゐゑは含まない）＋濁音20（が〜ご・ざ〜ぞ・だ〜ど・ば〜ぼ）＋半濁音5（ぱ〜ぽ）。ゔ・ー・小さい字は含まない
- `normalizeAnswer(str) → string|null`：カタカナ→ひらがな、小さい字→大きい字（ぁぃぅぇぉっゃゅょゎ→あいうえおつやゆよわ）。ALLOWED 外の字（ー・漢字・記号）が残れば null
- `toggleDakuten(ch)`：か↔が、は↔ば、ぱ→ば。付けられない字は null。`toggleHandakuten(ch)`：は↔ぱ、ば→ぱ。ほかは null
- `BOARD_COLUMNS`：五十音盤の列を**右から順に**。`[['あ','い','う','え','お'],['か',…],…,['や',null,'ゆ',null,'よ'],['ら',…],['わ',null,'を',null,'ん']]`
- `kanjiNumeral(n)`：1→一、10→十、12→十二、20→二十（1〜99）
- `class RomajiBuffer`：`feed(key) → string[]`（確定した字を正規化済みで返す）・`flush()`・`clear()`・`pending`。
  対応：母音、k/s/t/n/h/m/y/r/w/g/z/d/b/p＋母音、shi/si・chi/ti・tsu/tu・fu/hu・ji/zi、拗音（kya/sha/cha/ja/jya/zya/nya/hya/mya/rya/gya/bya/pya/dya/tya/cya 系→2字「きや」など）、wo→を、nn・n'→ん、n＋子音→ん、促音（kk/ss/tt/pp/cch/tch→つ）、x/l＋小さい字→大きい字、fa/fi/fe/fo→ふあ等、「-」は捨てる

## lib/levels.js
`LEVELS`（id 1〜3）の各要素：`{id, key, name, reading, words, crossings, blanks, maxW, maxH, tiers, tierWeights, minLen, maxLen, maxTwoLetter, parSec}`
初期値：手習い `{words:5, crossings:4, blanks:1, 7×7, tiers:[1], len 2〜5, maxTwoLetter:1, parSec:30}`／一人前 `{8, 9, blanks:7, 9×9, [1,2], 2〜6, 2, parSec:150}`（体験評価 v2-r1 で 5→7・120→150）／免許皆伝 `{12, 15, blanks:15, 11×11, [1,2,3], 2〜7, 3, parSec:360}`。
**v2**：`blanks`＝埋める字の数（空いた辻の数）。難しさの約束はこの数字。`blanks ≦ crossings` を保つ。parSec は v2 で縮めた仮の値（体験評価で見直す）。
tierWeights の初期値：一人前 `{1:2, 2:1}`、免許皆伝 `{1:1, 2:2, 3:2}`。

## lib/generator.js
`generatePuzzle({ level, seed, words, maxAttempts = 400 }) → Puzzle`（level は id か LEVELS の要素、seed は文字列、words は `data/words.js` の WORDS）

```
Puzzle = { version:2, level, seed, width, height, crossings, crossingsExact:boolean,
           blanks: {x,y}[]            // v2：埋める空きのマス（行優先で並べる）
           blanksAtCrossingsOnly:boolean // 辻が足りず辻以外で補った盤だけ false
           grid: string[][]  // 答えの字。空きマスは ''
           numbers: number[][] // 0=番号なし
           words: Word[] }   // number 昇順、同じ番号は横→縦
Word = { id, dir:'across'|'down', x, y, length, answer /*正規化済み*/, reading /*元の読み*/, kanji, clue, tier, number, label /*'横の三'*/ }
```

守ること（テストで全部確かめる）
1. **決定的**：同じ (level, seed, words) なら deepEqual。Math.random・Date・経過時間を使わない。打ち切りは試行回数だけ（果たし状で同じ盤を出すため）
2. 語数はちょうど `words`。同じ答えを2度使わない。長さは minLen〜maxLen、2字の言葉は maxTwoLetter 以下
3. 盤（外接矩形）は maxW×maxH 以内。出力は外接矩形に切り詰める
4. **意図しない言葉ができない**：横に2字以上続く並びはすべて置いた横の言葉と一致し、縦も同じ。言葉の前後のマスは空き
5. 交わりは縦と横の直交だけ。全体が1つにつながる
6. 辻（縦横2語が共有するマス）の数がちょうど `crossings`。どうしても届かない seed だけ、差が最小の案を `crossingsExact:false` で返す
7. 番号は行優先で走査し、横か縦の言葉の始まりに振る
8. **（v2）空きの数はちょうど `level.blanks`**。空きは辻から選ぶ。辻が足りない盤（まれ）だけ、辻以外のマスで補い `blanksAtCrossingsOnly:false`
9. **（v2）空きも決定的**。乱数は盤の組み立てと別の系列（例：`mulberry32(hashSeed(seed + ':blanks'))`）にし、盤の組み方（語・位置）は v1 と同じ seed で同じにする
10. **（v2）blanks < 辻の数のときは、どの言葉にも空きでないマスを最低1つ残す**（全部空きの言葉を作らない）。そのうえで、語ごとの空きの数の最大が小さくなるように選ぶ。満たせない盤（まれ）だけ、この制約を外す。blanks ＝ 辻の数（免許皆伝）は辻をすべて空ける

進め方の目安：試行ごとに `mulberry32(hashSeed(seed) ^ 試行番号の攪拌)` → 候補を tier 重み付きで並べ替え → 4〜6字の言葉を横に置く → 既存の字と交わる置き場所を全列挙し、「残りの語数で必要な辻の数」に合わせて交わりの多い／少ない置き場所を選ぶ → N語置けて辻が一致したら返す。

## lib/game.js
`new Game(puzzle, { autoCheck = true })`。状態：`entries`（'' か字）・`locked`（解けた言葉と助太刀のマス）・`revealed`・`wrong`（吟味の印。字を変えたら消す）・`cursor {x,y}`・`dir`・`solved:Set<wordId>`・`hintsLetters`・`checks`・`gaveUp`・`elapsedMs`（UI が `tick(ms)` で進める）

操作は**イベントの配列を返す**（UI は音と演出をイベントで決める）：`{type:'input'|'erase'|'move'|'wordSolved'|'wordWrong'|'check'|'reveal'|'complete'|'noop', ...}`
- `select(x,y)`：同じマスなら縦横を入れ替える（両方あるときだけ）。字のないマスは noop
- `selectWord(id)`・`toggleDir()`・`move(dx,dy)`（矢印）・`nextWord(±1)`（解けていない言葉を優先）
- `input(kana)`：いまのマスが locked なら語の中の次の空きへ寄せてから書く → 語の中で次の locked でないマスへ進む（語末なら留まる）。書いたマスを含む言葉が埋まったら、autoCheck 有りなら正解で `wordSolved`（locked にする）・不正解で `wordWrong`（同じ埋め方では1回だけ）。いまの言葉が解けた／埋まったら、次の解けていない言葉の最初の空きへ移る。全部そろえば `complete`
- `erase()`：いまのマスに消せる字があれば消す。無ければ語の中の1つ前の消せるマスへ戻って消す（v1 の規則。v2 は下の「実装で決めたこと」の erase の行が正）
- `dakuten()`／`handakuten()`：直前に書いたマス（いまの言葉の中で locked でないとき）、無ければいまのマスの字に付ける。付けられなければ `noop`。付けた後に言葉の判定をやり直す
- `check()`：埋まっていて間違っているマスに印 → `{type:'check', wrong:n, empty:m}`
- `revealLetter()`・`revealWord()`：答えを入れて locked＋revealed。**もともと正しくなかったマスの数**だけ hintsLetters を増やす
- `giveUp()`：全部を明かし `{type:'complete', gaveUp:true}`
- `isComplete()`・`progress() → {solved,total}`・`currentWord()`・`wordsAt(x,y)`・`serialize()`／`Game.restore(puzzle, data)`

### v2：空き（blanks）だけを埋める対局
- **空きでないマス（given）は、始めから entries に答えが入り locked**。hintsLetters に数えない。given は保存せず、puzzle.blanks から毎回求める。`isGiven(x,y)` を足す
- **空きの無い言葉**は solved に入れない（藍にしない）。progress の total にも数えない。移動（`nextWord`・書いた後の自動移動・Enter/Tab）の行き先にしない
- 始まりのカーソルは最初の空き（行優先）。向きは横（その空きを通る横の言葉が無ければ縦）
- 書いた後：言葉が埋まったら判定（従来どおり）。そのあと、次の確定していない空き（行優先で後ろ、無ければ先頭から）へ移る。**1字で縦横2語が同時に解けたら**、`wordSolved` を2つ出したうえで `{type:'crossSolved', ids:[a,b]}` を1つ足す（UI は台詞を1つにまとめる）
- `select(x,y)`：空きのマスは従来どおり（同じマスをもう一度押すと縦横を入れ替える）。空きでないマスは、そのマスの言葉を選び（いまの向きを優先）、その言葉に確定していない空きがあれば最初の空きへカーソルを移す。無ければカーソルはそのマスに置き、問を読めるようにする
- `input` が空きでないマスで起きたとき：従来の打ち抜け（同じ字なら書かずに進む／違えば語の中の後ろの空きへ書く）。語の中に書ける空きが無ければ、盤の次の空きへ移って書く。**空きでないマスの字は、どの操作でも変わらない**（erase・dakuten・handakuten・check・reveal を含む）
- **（v2-r3）移動の行き先は「字の入っていない空き」を優先する**。書いた後の自動移動・`nextWord`（Enter/Tab）・空きでないマスの `select` のどれも、まず字の入っていない空きへ動く（書いた後は行優先で後ろ、無ければ先頭から）。字の入っていない空きが盤に1つも無いとき（全部埋まって違う字が残る）だけ、locked でない空きへ動く。空きでないマスの `select` で、その言葉に字の入っていない空きが無ければ、カーソルはそのマスに留まり、そこでの入力は盤の次の字の入っていない空きへ書く（体験評価 v2-r2：選択が自分の字の入った辻へ戻り、上書き・消去が起きたため）
- **`move(dx,dy)`（矢印）は空きでないマスを飛ばし、その向きの同じ行（列）で次の空きへ動く。その向きに空きが無ければ noop**（体験評価 v2-r1：書いてある字に乗って打つと、離れた空きに字が入って戸惑うため）
- `revealLetter()`：いまのマスが空きでなければ、いまの言葉の最初の確定していない空き（無ければ盤の次の空き）を明かす。`revealWord()`：いまの言葉の空きを全部明かす
- `progress() → { solved, total, blanks, left }`：total＝空きを含む言葉の数、blanks＝空きの数、**left＝字の入っていない空きの数（autoCheck の有無によらない。書くたびに1減り、消すと1増える）**。正誤は left ではなく、解けた言葉（藍）と判定の台詞で伝える（2026-09-30 設計判断：正しい字を書いても減らないと、入力が効いていないように見えるため）
- `serialize()` は v2 の形。v1 の保存（空きの無い盤）や、盤・空きと食い違う保存は restore で捨て、新しい対局を返す

## lib/rank.js
`computeRank({ levelId, seconds, hintsLetters, gaveUp }) → { key, label, line }`。比 = seconds / parSec。
**v2**：助太刀の許容は埋める字 b（`level.blanks`）に対する割合で決める。横綱（hints 0 かつ 比≦1）→ 大関（hints≦floor(b×0.1) かつ 比≦1.5）→ 関脇（hints≦floor(b×0.25) かつ 比≦2.5）→ 小結（hints≦floor(b×0.5)）→ 前頭。手習い（b=1）は1字でも教われば前頭。gaveUp は `munen`（無念・位なし）。line は docs/COPY.md の文。

## lib/storage.js
キーは `kotoba-tsuji.settings.v1`・`kotoba-tsuji.records.v2`・`kotoba-tsuji.current.v2`（**v2 で records と current を数え直す**。v1 の2つは読み込み時に消してよい。settings は v1 のまま引き継ぐ）。すべて try/catch で、読めなければ既定値。テスト用に storage を差し込める（`createStore(storage = globalThis.localStorage)`）。
- settings 既定：`{ sound:true, autoCheck:true, motion:'auto' /*'auto'|'reduce'*/, seenCoach:false }`
- records：`{ levels:{1:{solved,bestSec,bestRank},…}, total }`。`recordResult({levelId, seconds, rankKey, gaveUp})` は降参を solved に数えず、最速と最高位は降参以外で更新。戻り値に `{ newBest:boolean }`
- current：`{ level, seed, game: serialize() の中身 }`。`resetRecords()` は records だけ消す

## lib/share.js
- 果たし状は URL の hash：`#c-<level>-<seed>` か `#c-<level>-<seed>-<秒>`（seed は `[0-9a-z]{4,12}`、秒は1〜86399）。hash は claude.ai の Artifact でも届く書式に限る（英数字と - だけ）
- `challengeHash({level, seed, seconds})`・`parseChallenge(hash) → {level, seed, seconds|null} | null`（不正は null）
- `formatDuration(sec)` → 「3分12秒」、`resultShareText(…)`・`appShareText()`（文は COPY.md）、`xIntentUrl(text,url)`・`lineIntentUrl(url)`
- **v2**：`resultShareText({ levelId, seconds, blanks, gaveUp })`（辻の数ではなく埋める字の数を書く）

## （v2-r3）最近出た言葉を避ける
- 同じ端末で最近出た答えを覚える：storage に `kotoba-tsuji.recent.v1`（答えの文字列の配列・新しい順・最大60件）。`getRecent()`・`pushRecent(answers)`（重複は前へ詰め直す）
- 新しい局の seed は、候補の seed をいくつか（既定8つ）作り、それぞれの盤の答えと recent の重なりが最も少ない seed を選ぶ。`pickFreshSeed({ level, words, seeds, recent }) → seed`（純粋関数。同じ引数なら同じ結果。同点は先の候補）
- 盤そのものは seed だけで決まる（果たし状は従来どおり同じ盤）。recent は「どの seed を選ぶか」にだけ効く。果たし状から受けて立つ局は、渡された seed をそのまま使う
- recent へ積むのは、局を始めた時点の盤の答え（解いたかどうかによらない）

## 調整の記録
（tools/sim-levels.mjs の結果をここに1行ずつ残す：日付・単語帳の件数・腕前ごとの辻の一致率・平均生成時間）
- 2026-09-30 fixture 396件（n=300・初版＝詰めて置く貪欲だけ）：手習い 100.0%・0.1ms／一人前 17.3%・30.3ms／免許皆伝 0.0%・48.1ms。盤が最初の言葉の幅のまま縦に細長く伸び、2語に交わる置き場所（輪）がほぼ生まれなかった
- 2026-09-30 fixture 396件（n=500・先読み＋辻が足りない間は外へ広げ、そろったら詰める）：手習い 100.0%・0.1ms／一人前 100.0%・0.3ms／免許皆伝 100.0%・0.9ms（平均試行 1.03／1.20／1.79、最大 4.2ms）
- 2026-09-30 fixture を減らした単語帳（n=300）：60%の238件で 100.0%・100.0%・100.0%（免許皆伝 1.9ms・6.5試行）、t1 を230件に絞った319件で 100.0%・100.0%・100.0%（免許皆伝 1.0ms）。crossings は初期値のまま下げていない
- 2026-09-30 real 680件（n=500・問が答えを言い合う組を外した後）：手習い 100.0%・0.1ms／一人前 100.0%・0.6ms／免許皆伝 100.0%・1.5ms（平均試行 1.03／1.09／1.35、最大 8.1ms）。外す前は300盤のうち 12／18／21盤に、問が別の言葉の答えを言う組があった。外した後は0盤
- 2026-09-30 real 680件（n=500）：手習い 100.0%・0.1ms／一人前 100.0%・0.4ms／免許皆伝 100.0%・1.1ms（初期値の辻 4・9・15 のまま）
- 2026-09-30 v2 real 679件（n=500・埋める字 1・5・15）：手習い 辻100.0%・空き一致100.0%・すべて辻100.0%・全部空きの言葉0.0%・0.1ms／一人前 辻100.0%・空き一致100.0%・すべて辻100.0%・全部空きの言葉0.0%・0.5ms／免許皆伝 辻100.0%・空き一致100.0%・すべて辻100.0%・全部空きの言葉10.6%・1.1ms（免許皆伝は辻をすべて空けるので、字がすべて辻の言葉は全部空きになる）
- 2026-09-30 v2-r1 後 real 679件（n=500・一人前を埋める字 5→7・parSec 120→150、問3件の直し後）：手習い（1字） 空き一致100.0%・すべて辻100.0%・全部空きの言葉0.0%・0.1ms／一人前（7字） 辻100.0%・空き一致100.0%・すべて辻100.0%・全部空きの言葉0.0%（制約10を外した盤 0）・0.4ms／免許皆伝（15字） 空き一致100.0%・すべて辻100.0%・全部空きの言葉10.6%・0.9ms。単体テストの別の500 seed でも一人前の全部空きの言葉は0盤
- 2026-09-30 v2-r3 recent（real 679件・問3件の直し後・一人前・1局ごとに候補8つ）：5通り×20局（800問）で、それより前の局に出た答えとの重なりが 使わない186 → 使う107、直近60件との重なりが 139 → 26。候補を16にすると 98・5。単体テストの20局（fresh.test.mjs）は160問中 33 → 19

## 実装で決めたこと（エンジン担当の報告より・2026-09-30）
- Word.id は向き＋番号（'a3'＝横の三、'd4'＝縦の四）。Puzzle.level は腕前の id（数）
- 足した口：`generatePuzzle` の任意引数 `stats`、`buildPuzzle`、`cluesClash(a, b)`、`getLevel`、`RANKS`・`MUNEN`・`rankOrder`・`rankOf`、storage の `KEYS`・`DEFAULT_SETTINGS`、`Game#isLetter(x,y)`、`Game.restore(puzzle, data, {autoCheck})`
- `createStore()` の口：getSettings・saveSettings(patch)・getRecords・recordResult・resetRecords・getCurrent・saveCurrent・clearCurrent・canPersist。recordResult は `{ newBest, newBestSec, newBestRank, records }` を返す。records.total は降参を含めた終えた対局の数
- 濁点の「直前に書いたマス」は、語末を書いて次の言葉へ自動で移った直後も有効（選択・矢印・消す・助太刀で切れる）。語末の「ひ→び」を直せるようにするため
- 入力の進み方（体験評価 r1 の打ち抜けの直し）：書いたら語の中の次のマスへ進み、locked でも飛ばさない（飛ばすと、固まった字まで打つ人の字が1マスずれる）。locked のマスで打った字がそのマスの字と同じなら書かずに進み、違えば語の中で後ろにある最初の locked でないマスに書く（無ければ noop）
- 打ち抜け：1字書いて言葉が埋まった・解けたとき、それが語の最後のマスならすぐ次の問へ移る。途中なら後ろのマスへ「打ち抜け中」として進み、同じ字なら書かずに進み、語の終わりを過ぎたら次の解けていない問の最初の空きへ移る。違う字が来たら次の解けていない問へ移ってから書く。選択・矢印・消す・問の切り替え・助太刀・降参で終わる。濁点で解けても打ち抜け中は移らない。埋まっている言葉を書き直して、まだ解けていないときは語の中を進む
- 同じ盤の中で問が互いの答えを言わない：言葉を選ぶとき、問 c に置き済みの言葉の書き方 k が入る組、置き済みの言葉の問に候補の k が入る組は使わない。読み r は3字以上のときだけ同じように見る（2字は偶然入りやすい）
- autoCheck 無し：途中では solved にせずイベントも出さない。全部そろったとき complete と一緒に solved にする（全マスを助太刀で明かした言葉だけは途中でも solved）
- `move(dx,dy)` は空きマスを飛ばして、その向きの次の字のマスへ
- `resultShareText({ levelId, seconds, crossings, gaveUp })`。`parseChallenge` は先頭の # が無くても読み、先頭0の数は null
- `formatDuration`：60→「1分0秒」、3600以上→「1時間2分3秒」
- `serialize()` は盤を行ごとの文字列（空きは '.'）で持つ。盤と食い違う保存は restore で捨てて新しい対局を返す
- イベントの形：input `{x,y,kana,mark?}`／erase `{x,y}`／move `{x,y,dir,wordId,skip?}`（skip は書かずに1マス進んだとき）／wordSolved `{id}`／wordWrong `{id}`／check `{wrong,empty}`／reveal `{cells,hints}`／complete `{gaveUp}`／noop `{reason}`

- （画面担当・2026-09-30）storage の current に任意の `duel: { theirs }`（秒の付いた果たし状から受けて立った局の、差出人の秒。1〜86399）を足した。`saveCurrent({ level, seed, game, duel })` で保存し、`getCurrent()` は正しい値のときだけ `duel` を返す（無いときはキーごと返さない）。結果画面の決着と「返し状を送る」に使う。単体テストは tests/unit/duel.test.mjs

### v2（エンジン担当・2026-09-30）
- 足した口：`Game#isBlank(x,y)`・`Game#blanksOf(wordId) → {x,y}[]`、`hintAllowance(levelId) → {ozeki, sekiwake, komusubi}`（rank.js）、`LEGACY_KEYS`（storage.js）、`selectBlanks({ grid, cover, words, want, rand })`、`buildPuzzle` の任意引数 `blanks`（切り詰めた後の座標。テスト用）
- 空きの選び方：辻から b 個の組み合わせを全部試し、「全部空きの言葉の数」→「語ごとの空きの最大」が最小の案から乱数で等しい確からしさで1つ選ぶ。2万通りを超えるときだけ、順を変えた貪欲を48回試す。辻が足りない盤は辻をすべて空け、残りを辻以外のマスから同じ規則で選ぶ
- `crossSolved` は自分で書いた字（input・dakuten・handakuten）で2語が同時に解けたときだけ出す。助太刀で解けたときと autoCheck 無しでは出さない。順は input → wordSolved ×2 → crossSolved → move か complete
- 書いた後・助太刀の後は、次の確定していない空きへ移る。向きは、移った先にいまの向きの言葉があれば保つ。確定していない空きがいまのマスだけなら移らない（move も出さない）
- `progress().left` は字の入っていない空きの数（2026-09-30 に設計判断で変更。当初は「locked でない空き」で、両方の言葉に別の空きが残る辻では正しい字を書いても減らなかった）
- `erase()` は、いまのマス → 直前に書いた空き、の順に消す（書くとすぐ次の空きへ移るので、直後の「消す」で書いた字へ戻れるようにした）。**v2-r3 で「語の中の1つ前へ遡って消す」を外した**（体験評価 v2-r2 の①-1：自分の別の字が消えたため）
- 空きでないマスの `select` をもう一度押すと、縦横の両方があるときだけ向きを入れ替えてから、その言葉の最初の確定していない空きへ移る。片方だけで空きも無ければ noop('same')
- v1 の「打ち抜け中」の状態（through）は無くした。空きでないマスで同じ字を打てば書かずに1マス進み（move の skip:true）、語の終わりを過ぎたら盤の次の確定していない空きへ移る
- `revealWord()` は空きの無い言葉では noop('noBlank')。complete と giveUp で solved に入れるのは空きのある言葉だけ
- `serialize()`（v2）は `{ v:2, autoCheck, board, blanks, entries, locked, revealed, wrong, cursor, dir, solved, hintsLetters, checks, gaveUp, done, elapsedMs, reported, lastInput }`。entries 等は空きだけを puzzle.blanks の順に並べた文字列（字が無ければ '.'、印は '0'/'1'）。board は盤の指紋、blanks は空きの座標で、どちらかが違う保存は捨てる
- blanks を持たない盤（v1 の形）を Game に渡すと、字のマスをすべて空きとして扱う
- `resultShareText` は `crossings` を読まない（blanks が無ければ腕前の blanks）。`appShareText()` も COPY.md の v2 行に変えた。storage は v1 の records・current を `createStore()` のときに消す
