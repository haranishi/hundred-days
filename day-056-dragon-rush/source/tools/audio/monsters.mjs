// OWNER: audio-tools
// 怪獣ごとの音の作り方（声・足音・着地・羽ばたき・主砲の息）。怪獣を足すときは、ここに1つ足して npm run build:audio を流すと
// public/assets/audio/sfx/<名前>/ に同じ種類の音ができる。実行時は src/config/audio.ts の MONSTER_SOUNDS が名前で引く。
// 名前は怪獣の GLB（public/assets/<名前>.glb）と同じにする。3体の役割と形は docs/CHARACTERS.md。
// 数値の意味：
//   voice.f0 は声の高さの中心（Hz）、tract は声の通り道の長さの倍率（人の大人の男性を 1 とし、長いほど共鳴が低く巨大に聞こえる）、
//   chest は胸の鳴り（30〜70Hz）の強さ、pdDepth・pdChunks は周期の倍化（叫びが割れる瞬間）の深さと塊の数、
//   mouthSwing は口の開きの動きの大きさ（1 で F1・F2 が ±40〜60%）、shriek は上の共鳴の持ち上げ（dB）、lift は叫びの山の高さの上乗せ（半音）。
//   feet.hind・feet.front は後ろ足と前足（別の作り）：f0 は打撃の高さ、weight は重さ（長さ）、decay は打撃の減り、sine は頭の短い圧の量、
//   heelToe はかかと→つま先の二度当たり、splay は指が開いて爪が別々に当たる、wrist は翼の手首で突く（雷翼の前足）、rock は岩の皮の鳴り。
//   breath.kind は主砲の種類（fire＝炎の息、lightning＝雷の息、lava＝溶岩の礫）。
//   r05-audio：feet の clawTap は爪が舗装を打つ「カチッ」の列（紅竜の印）、rustle はたたんだ翼の膜の擦れ（雷翼の印）、eq は怪獣ごとの声色（足音全体に掛ける）。
//   land の claws・wings・eq も同じ考え方（爪が食い込む・翼を広げて受ける・声色）。
//   melee は近い技の音の作り（claw＝右クリック、tail＝Q）：kind が作り方、peak が振りの山の秒数（src/config/creatures の振りかぶりの秒数。tests/audio で照らし合わせる）。

export const MONSTERS = {
  dragon: {
    label: '紅竜（全長60m・四脚と翼）',
    voice: { f0: 56, f0Spread: 0.14, tract: 1.85, growl: 0.55, rasp: 0.5, drive: 3.0, chest: 0.26, jitter: 0.2, mouthSwing: 1.15, pdDepth: 0.5, pdChunks: [2, 4], dur: [3.0, 3.9], shortDur: [1.5, 2.1] },
    feet: {
      hind: { f0: 50, weight: 1.1, decay: 0.17, sine: 0.45, crunch: 0.85, claws: 0.4, clawTap: 0.8, heelToe: true, splay: false, rumble: 1, rock: 0, eq: [['peak', 4200, 0.8, 7]] },
      front: { f0: 60, weight: 0.85, decay: 0.11, sine: 0.3, crunch: 0.75, claws: 0.7, clawTap: 1, heelToe: false, splay: true, rumble: 0.5, rock: 0, eq: [['peak', 4200, 0.8, 7]] },
    },
    wings: { area: 1, pressure: 46 },
    land: { claws: 1, wings: 1, eq: [['peak', 3800, 0.8, 5]] },
    breath: { kind: 'fire', jet: 1, crackle: 0.8, low: 0.9 },
    // 紅竜の爪と尾は r04 までの attack/ の音と同じ（乱数の系列も同じ名前から取る）
    melee: { claw: { kind: 'claw', peak: 0.198 }, tail: { kind: 'tail', peak: 0.31 } },
  },
  raiyoku: {
    label: '雷翼（全長50m・二脚と大きな翼の翼竜。雷の息が近くのビルへ跳ねる）',
    voice: { f0: 104, f0Spread: 0.12, tract: 1.3, growl: 0.3, rasp: 0.75, drive: 2.4, chest: 0.17, jitter: 0.28, mouthSwing: 1.2, pdDepth: 0.35, pdChunks: [1, 2], dur: [2.3, 3.0], shortDur: [1.1, 1.6], shriek: 2, lift: 3, barkPitch: 1.5 },
    feet: {
      hind: { f0: 78, weight: 0.6, decay: 0.08, sine: 0.2, crunch: 0.6, claws: 0.5, rustle: 0.6, heelToe: true, splay: true, rumble: 0.25, rock: 0, eq: [['lowShelf', 110, -5], ['peak', 1600, 1, 5], ['highShelf', 3000, -7]] },
      front: { f0: 110, weight: 0.45, decay: 0.05, sine: 0.12, crunch: 0.45, claws: 0.6, rustle: 1, wrist: true, rumble: 0, rock: 0, eq: [['lowShelf', 110, -5], ['peak', 1600, 1, 4], ['highShelf', 3000, -7]] },
    },
    wings: { area: 1.55, pressure: 38 },
    land: { low: 0.7, thunder: true, length: 0.9, wings: 0.8, eq: [['lowShelf', 100, -4], ['peak', 1600, 1, 4], ['highShelf', 3000, -6]] },
    breath: { kind: 'lightning' },
    melee: { claw: { kind: 'wing', peak: 0.26 }, tail: { kind: 'whip', peak: 0.24 } },
  },
  homuratsuno: {
    label: '焔角（全長55m・翼のない重い四脚。岩の皮の割れ目から溶岩が光る）',
    // r06-audio：短い声（のしかかりの踏み切りで3分に約11回）は、うなり・鼻息・短い吠えの3つの型×2＝6変化（shortTypes の並びで変化の番号に割り当てる）
    voice: { f0: 37, f0Spread: 0.12, tract: 2.5, growl: 0.8, rasp: 0.35, drive: 3.6, chest: 0.45, jitter: 0.15, mouthSwing: 0.8, pdDepth: 0.65, pdChunks: [2, 4], dur: [3.6, 4.6], shortDur: [1.8, 2.4], barkPitch: 0.7, shortTypes: ['bark', 'growl', 'snort'], shortVariants: 6 },
    feet: {
      variants: 8,
      hind: { f0: 36, weight: 1.5, decay: 0.26, sine: 0.5, crunch: 1.1, claws: 0.2, heelToe: true, splay: false, rumble: 1.5, rock: 0.8, eq: [['highShelf', 2800, -9], ['peak', 600, 0.9, 3]] },
      front: { f0: 42, weight: 1.35, decay: 0.22, sine: 0.45, crunch: 1.05, claws: 0.25, heelToe: false, splay: true, rumble: 1.2, rock: 0.8, eq: [['highShelf', 2800, -9], ['peak', 600, 0.9, 3]] },
    },
    wings: null,
    land: { low: 1.25, rock: 1, length: 1.25, eq: [['highShelf', 2500, -8], ['peak', 500, 0.9, 3]] },
    breath: { kind: 'lava' },
    melee: { claw: { kind: 'horn', peak: 0.3 }, tail: { kind: 'hammer', peak: 0.38 } },
  },
};

export const MONSTER_IDS = Object.keys(MONSTERS);
