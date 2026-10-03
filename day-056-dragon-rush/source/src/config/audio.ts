// OWNER: config
// 音の鳴らし方の数値：混ぜ方（dB）・空間（距離と残響）・同時に鳴る数と優先度・BGM の段階の決め方・音の表。
// 音そのもの（合成の作り方）は tools/audio/ にあり、`npm run build:audio` で public/assets/audio/ に作り直す。ここは実行時の調整だけ。
// 単位：dB（0 で素材のまま）、秒、m。
import { publicBase } from '../core/publicBase';

export const AUDIO_FILES = {
  /** public/ からの道のり（竜の GLB と同じく相対） */
  base: `${publicBase}assets/audio/`,
  manifest: `${publicBase}assets/audio/manifest.json`,
};

/** 混ぜ方。最終の大きさの階層：咆哮・近い崩落 ＞ 着地・爪 ＞ 足音・炎 ＞ BGM ＞ 細かい破片・UI */
export const MIX = {
  /** r00d：効果音 0→-4dB（1棟の崩落だけで制限器が 5dB 下げていた。重なりの余裕を空ける） */
  musicDb: -3,
  sfxDb: -4,
  uiDb: -3,
  /** 全体の制限器（AudioWorklet）。上限は -1.4dBFS（r00d：-1.2 では10棟の崩落が重なったとき標本の間の山が -0.9dBTP になった）、先読み 4ms */
  limiter: { ceilingDb: -1.4, lookaheadMs: 4, releaseMs: 160 },
  /** 残響（近・中・遠の畳み込み）から効果音の系統へ戻す量 */
  reverbReturnDb: -2,
  /** 一時停止・撮影モード：BGM をこもらせて下げ、効果音は止める */
  pause: { musicLowpassHz: 850, musicDb: -7, rampSeconds: 0.2 },
  /** r02-audio：指摘「ブレスの持続が曲より 1.1LU 小さく埋もれる」 ブレスを吐いている間は BGM を 2.5dB 引き続ける（入り 0.15 秒・戻り 0.8 秒） */
  breathHold: { depthDb: -2.5, attack: 0.15, release: 0.8 },
  /** 音量のつまみ（0〜1）を dB に直すときの曲線の下限（0 で完全に消す） */
  volumeFloorDb: -50,
};

/** BGM を引く（ダッキング）。depth は下げ幅（dB）、attack・hold・release は秒。重なったら深い方を採る */
export const DUCK = {
  roar: { depthDb: -8, attack: 0.04, hold: 1.6, release: 1.8 },
  rageDive: { depthDb: -9, attack: 0.03, hold: 1.2, release: 2.2 },
  landHeavy: { depthDb: -5, attack: 0.02, hold: 0.5, release: 1.2 },
  collapseNear: { depthDb: -3.5, attack: 0.03, hold: 0.8, release: 1.4 },
};

/** 大きな崩落の体積（m³）。曲の全帯域の引きと低い帯の引きは、近くてこれより大きい崩落だけで掛ける */
export const HEAVY_COLLAPSE_VOLUME = 20000;

/**
 * r05-audio：曲の低い帯を空ける。指摘「暴と頂で 50〜63Hz が 400Hz と同じ大きさで、崩落の 43% が乗る 60Hz 未満と重なる」
 * 重い音の間だけ、全帯域の引き（DUCK）とは別に、曲の 40〜100Hz を山形（63Hz・Q 0.7）で depthDb 下げる。重なったら長い方に合わせる。
 * r06-audio：指摘「近い崩落のたびに 2.6 秒掛かり、3分の 52〜82% で低音が下がったまま、21〜26 回引いては戻る」
 *   掛けるのは本当に重い瞬間だけにした：とても大きな近い崩落（collapseMinVolume より大きい）・咆哮・地割れ・怒りの急降下の着地。
 *   ふつうの重い着地（急降下・のしかかり）では掛けない。保持を短く（崩落 2.6→1.2 秒）、戻りを長く（1.5→3.0 秒）して、引いては戻る揺れを目立たなくした。
 *   崩落の大きさは、はじめ全帯域の引きと同じ 20000m³ にしたが、自動プレイの3分で引き始めが 13・12・21 回（紅竜・雷翼・焔角）と目安の 10 回を越えた
 *   （焔角は大きい近い崩落が 3分に 30 棟あり、3〜8 秒おきに来るので、保持と戻りを延ばしても1つにつながらない）。記録の体積で試して 55000m³ にした
 */
export const LOW_DUCK = {
  freqHz: 63,
  q: 0.7,
  depthDb: -5.5,
  collapseMinVolume: 55000,
  kinds: {
    collapse: { attack: 0.03, hold: 1.2, release: 3 },
    rageDive: { attack: 0.02, hold: 1.2, release: 3 },
    roar: { attack: 0.05, hold: 2.4, release: 3 },
    fissure: { attack: 0.03, hold: 2.4, release: 3 },
  },
};

/** 空間：聞く位置・距離の減衰・空気の吸収・音速の遅れ・残響の送り。 */
export const SPACE = {
  /** 聞く位置＝カメラから竜の方へ lean の割合だけ寄せた点（竜の音が遠くならず、街の音は位置で鳴る） */
  listenerLean: 0.6,
  /** 距離の減衰：refDistance までは 0dB、その先は距離が倍で -6dB×rolloff。minDb で止める */
  refDistance: 45,
  rolloff: 1,
  minDb: -42,
  /** 空気の吸収：遠いほど高域を落とす（遮断 = nearHz / (1 + 距離 / halfDistance)^0.9） */
  nearHz: 18000,
  halfDistance: 260,
  /** 音速（m/s）。遠い音（delayFrom より遠い）だけ、距離÷音速だけ遅らせる。竜自身の音は遅らせない */
  speedOfSound: 340,
  delayFrom: 150,
  /** 残響：距離で近・中・遠の畳み込みへの送りを渡していく。境目（m）と送る量（dB） */
  reverbSplits: [140, 420],
  sendDb: { near: -13, mid: -9, far: -5 },
  /** 遠いほど直接音より残響の割合が増える（直接音は距離の2乗、残響は距離の1乗で弱まる）。持ち上げは wetMaxDb まで */
  wetPerDoubling: 3,
  /** r00d：上限なしでは 400m より先で遠い残響が直接音の減りを打ち消し、409m と 932m の崩落が同じ大きさになった */
  wetMaxDb: 6,
  /** 左右の定位の最大と、近い大きな音ほど広がって定位が中央へ寄る距離 */
  panWidth: 0.85,
  panNear: 55,
};

/**
 * 同時に鳴る数の上限と優先度（大きいほど大事）。上限を超えたら、30ms で絞って止める声を選ぶ（src/audio/voiceAllocator.ts）。
 * r05-audio：選び方を「鳴り始めの重み」から「今の大きさ」にした（最も古い余韻を先に譲る）。跳ねる雷と落雷（arc）は攻撃の枠から分けた
 * （落雷の輪は 0.35 秒に8本落ち、攻撃の枠 4 では半分が落ちていた）。
 */
export const VOICES = {
  /** r05-audio：40→56（雷翼の3分で 40 に届いた。崩落の枠を広げた分も見込む。声1つは数個の節で軽い） */
  max: 56,
  stealFadeSeconds: 0.03,
  /** 同じ種類の音をこの秒数の内に重ねて鳴らさない（近い場所なら1つにまとめ、少し大きくする） */
  mergeSeconds: 0.045,
  mergeDistance: 25,
  categories: {
    roar: { max: 1, priority: 100 },
    land: { max: 2, priority: 90 },
    /**
     * r05-audio：崩落 6→18。指摘「紅竜の3分で崩落の音 72 回のうち 23 回（32%）が上限で落ちた」 余韻を譲る決め方にしても、
     * 大技の衝撃で 9〜12 棟が同じ瞬間に崩れ、その前の2秒に崩れた 8 棟もまだ頭のうちなので、6 では遠い側の半分が落ちた。
     * 重なりは stackGain で抑える（18 棟が同時でも和は1棟の +7dB、遠い棟は距離と重なりでさらに小さい）
     */
    collapse: { max: 18, priority: 80 },
    /** r05-audio：遠い崩落は近い崩落の枠から分けた（指摘「雷翼の遠い崩落2回は2回とも上限で落ち、遠い崩落の音は3体とも一度も鳴らなかった」） */
    collapseFar: { max: 2, priority: 78 },
    breath: { max: 3, priority: 75 },
    attack: { max: 4, priority: 70 },
    arc: { max: 8, priority: 60 },
    step: { max: 4, priority: 62 },
    tilt: { max: 5, priority: 50 },
    flap: { max: 3, priority: 55 },
    peel: { max: 5, priority: 42 },
    crack: { max: 6, priority: 36 },
    fire: { max: 4, priority: 30 },
    glass: { max: 6, priority: 26 },
    ui: { max: 4, priority: 95 },
  },
  /** 同じ種類が重なるほど1つずつを下げる（n 個目は 1/√(1 + k×(n-1)) 倍）。10棟が同時に崩れても割れないように */
  stackK: 0.6,
} as const;

export type VoiceCategory = keyof typeof VOICES.categories;

/**
 * BGM の段階（0 静・1 暴・2 頂）を、怒りと連鎖から決める。上がるのは次の小節の頭、下がるのは holdBars 小節続いてから。
 * r02-audio：指摘「遊んだ3分の55%が頂で、盛り上がりの差が聞こえにくい」 頂を「ご褒美」に戻した：
 *   頂の条件 連鎖 18→30・10秒の崩落 6→10、怒りの満タンだけでは頂に上げない（暴まで）。頂に maxPeakSeconds 居たら暴へ戻し、
 *   peakCooldownSeconds の間は条件だけでは頂に戻さない（大技を出せばすぐ頂）。
 */
export const INTENSITY = {
  rampage: { combo: 5, rage: 40, collapses: 2, rageFull: true },
  peak: { combo: 30, rageFull: false, collapses: 10 },
  /** 大技の後はこの秒数だけ頂に保つ */
  releaseHoldSeconds: 12,
  /** 崩落を数える窓（秒） */
  collapseWindow: 10,
  holdBars: 2,
  /** 頂に居続けてよい秒数と、戻した後に条件だけでは頂へ上げない秒数 */
  maxPeakSeconds: 30,
  peakCooldownSeconds: 20,
  /**
   * r05-audio：指摘「頂から1小節だけ暴へ落ちて戻る揺れ（雷翼で2回）」 頂から暴へ下りたら、大技が来てもこの小節数は頂へ戻さない。
   * その間に大技を出したら、ご褒美（releaseHoldSeconds）は戻せるようになってから数える
   */
  peakLockBars: 4,
};

export type IntensityRules = {
  rampage: { combo: number; rage: number; collapses: number; rageFull: boolean };
  peak: { combo: number; rageFull: boolean; collapses: number };
  releaseHoldSeconds: number;
  maxPeakSeconds: number;
  peakCooldownSeconds: number;
};

/**
 * r05-audio：頂の条件を怪獣ごとに持つ（名前は MONSTER_SOUNDS と同じ）。指摘「頂の条件は紅竜に合わせてあり、雷翼では3分の半分が頂」。
 * 3体とも、自動プレイの3分で頂の居場所が 20〜35% に入るように決めた（前の版の自動プレイの状態の記録で、段階の決め方だけを流して詰めた）。
 *   紅竜：頂は大技の直後だけ（3分で3回）。大技の後の保持 12→15 秒（12 秒では 21% で下の端だった）
 *   雷翼：雷が跳ねて連鎖が伸びやすく（3分で最大 99）、落雷の輪の後は 10 秒に 17 棟も崩れ、大技も3分で4回出る。
 *         連鎖 30→60・10秒の崩落 10→20・大技の後の保持 12→7 秒（43〜52% → 30% 前後）
 *   焔角：連鎖 30→60（3分の最大は 54 なので、頂は大技と崩落の山だけ）。39% → 30% 前後
 * r06-audio：指摘「焔角の頂は本体（ドミノの入った版）では 39.9%。大技1回で 16.9〜20 秒続き、大技が4回出た」 焔角の大技の後の保持 12→8 秒。
 *   保持 8 秒だけでは自動プレイで 34.0〜34.4%（目安の上の端）。残りの頂は、ドミノの崩落の山（10秒に10棟）と、ドミノで伸びるようになった連鎖
 *   （3分の最大 54→86。r05 は「連鎖では頂に上げない」つもりで 60 にした）が続けていた。崩落の条件 10→12 棟、連鎖 60→90（3分の最大より上）、
 *   続けて頂に居る上限 26→16 秒（状態の記録で段階の決め方を流すと 34.7→29.2%。.captures/r06-audio/sim/peak.sim.ts）
 */
export const INTENSITY_BY_MONSTER: Record<string, IntensityRules> = {
  dragon: { rampage: INTENSITY.rampage, peak: INTENSITY.peak, releaseHoldSeconds: 15, maxPeakSeconds: INTENSITY.maxPeakSeconds, peakCooldownSeconds: INTENSITY.peakCooldownSeconds },
  raiyoku: { rampage: INTENSITY.rampage, peak: { combo: 60, rageFull: false, collapses: 20 }, releaseHoldSeconds: 7, maxPeakSeconds: 24, peakCooldownSeconds: 24 },
  homuratsuno: { rampage: INTENSITY.rampage, peak: { combo: 90, rageFull: false, collapses: 12 }, releaseHoldSeconds: 8, maxPeakSeconds: 16, peakCooldownSeconds: 22 },
};

/** 怪獣の名前から頂の条件（表に無い怪獣は紅竜の条件）。 */
export function intensityRules(monster: string): IntensityRules {
  return INTENSITY_BY_MONSTER[monster] ?? INTENSITY_BY_MONSTER.dragon;
}

/**
 * r05-audio：曲の終わりを遊びの終わりに合わせる。指摘「ヒットストップで遊びの時計が曲より3分で 3.3〜7.7 秒遅れ、終わりの和音が時間切れより先に鳴り終わる」
 * 曲の側だけで合わせる（遊びの数字は変えない）。橋渡しの 63 小節目（A の和音・終わりの直前の溜め）を、必要な数だけ繰り返してから 64 小節目へ進む。
 * 小節の頭で決めるので、拍と小節の並びは崩れない（段階の切り替えも小節の頭のまま）。
 *   決め方：繰り返しの小節を並べる時刻（1.5 秒前）に、残りのゲーム内時間を「最近の遊びの時計の速さ」で実時間に直し、
 *   いま 64 小節目へ進んだときの最後の大太鼓（71 小節の頭）との差を拍に丸める。1小節以上あれば 63 小節目をもう1回、
 *   1小節に満たなければ 63 小節目の終わりの拍を端数だけ繰り返して 64 小節目へ進む（その後の小節の頭は端数だけ後ろへずれる）。
 *   時間切れ（session.end）を受けた時点で最後の大太鼓が cutThresholdSeconds より先なら、71 小節目へ跳んで大太鼓を時間切れに合わせる。
 */
export const MUSIC_END = {
  /** 繰り返す小節（1 から数える）と、最後の大太鼓の小節 */
  spliceBar: 63,
  finalBar: 71,
  /** 繰り返せる小節の数の上限（20 秒） */
  maxExtraBars: 8,
  /**
   * 大太鼓を時間切れの見込みより少し後ろに狙う秒数。見込みより遅れた分は時間切れで跳んで直せるが、早すぎた分は直せないため
   * （r05-audio の自動プレイの紅竜：後半にヒットストップが増え、狙いどおりでも大太鼓が 0.39 秒早かった）
   */
  aimLateSeconds: 0.2,
  cutThresholdSeconds: 0.4,
  /** 遊びの時計の速さ（ゲーム内の秒 ÷ 実時間の秒）を測る窓 */
  rateWindowSeconds: 40,
  /**
   * つなぎ目（足す小節へ入る所・端数の拍・跳ぶ所）の重ね合わせの長さ。
   * r06-audio：重ねる窓をつなぎ目の前に置く（新しい区間はつなぎ目で 1 になる）。前後に半分ずつ置くと、新しい小節の頭の太鼓が半分の大きさで入り、
   * 前の区間が次の小節の頭を 10ms だけ鳴らしていた
   */
  crossfadeSeconds: 0.02,
};

/**
 * r06-audio：時間切れの結果の音（src/audio/musicEnd.ts の resultCue）。曲が最後の大太鼓を鳴らせるなら、大太鼓を抜いた銅鑼だけをその時刻に鳴らす。
 * 大太鼓が maxWaitSeconds より先、または maxLateSeconds より前に過ぎていたら、曲と合わせずに銅鑼と大太鼓2打をすぐ鳴らす。
 * 曲は時間切れを受けて大太鼓が 0.4 秒（MUSIC_END.cutThresholdSeconds）より先なら跳ぶので、待つのは最大 0.4 秒。
 */
export const RESULT_CUE = {
  maxWaitSeconds: 0.5,
  maxLateSeconds: 0.5,
};

export type SpaceKind = 'self' | 'world' | 'ui';

export interface SoundDef {
  /** 目録（manifest.json）の音の名前。怪獣の音は MONSTER_SOUNDS から引く */
  bank: string;
  category: VoiceCategory;
  gainDb: number;
  /** 高さの散らし（±半音）と音量の散らし（±dB） */
  pitch: number;
  jitterDb: number;
  space: SpaceKind;
  /** 大きな音源（崩落など）は近くの基準距離を広げる倍率。r00d：崩落 2.2→1.6（基準 99m では 43m と 176m の崩落が同じ大きさに聞こえた） */
  size?: number;
}

export type MonsterSoundId =
  | 'roar'
  | 'roarShort'
  | 'stepFront'
  | 'stepHind'
  | 'flap'
  | 'land'
  | 'landHeavy'
  | 'breathStart'
  | 'breathLoop'
  | 'breathStop'
  | 'breathHit'
  | 'arc'
  | 'chargeLoop'
  | 'shove'
  | 'fissure'
  | 'clawSwing'
  | 'clawHit'
  | 'tailSwing'
  | 'tailHit';

/**
 * どの怪獣にもある音（咆哮・足音・着地・近い技）。怪獣の技の音（息・跳ねる雷・突進など）は、持っている怪獣だけが表に書く。
 * r05-audio：指摘「翼の打ち据え・角の突き上げ・尾の鞭・尾の鎚が紅竜の爪と尾と同じ音」 近い技（右クリックと Q の振りと当たり）を attack/ の共用から怪獣ごとに移した
 */
export const COMMON_MONSTER_SOUNDS = ['roar', 'roarShort', 'stepFront', 'stepHind', 'land', 'landHeavy', 'clawSwing', 'clawHit', 'tailSwing', 'tailHit'] as const satisfies readonly MonsterSoundId[];

const common = (id: string): Record<(typeof COMMON_MONSTER_SOUNDS)[number], string> =>
  Object.fromEntries(COMMON_MONSTER_SOUNDS.map((k) => [k, `${id}/${k}`])) as Record<(typeof COMMON_MONSTER_SOUNDS)[number], string>;

/**
 * 怪獣ごとの音の名前（名前は怪獣の GLB と同じ）。怪獣を増やすときは tools/audio/monsters.mjs に作り方を足して build:audio を流し、ここに1つ足す。
 * 遊びの側は monster の名前だけを持ち、音の側がこの表から引く。表に無い音は鳴らさない（記録には missing と残る）。
 * r02-audio：足音を前足と後ろ足の別の音にし（旧 step）、雷翼と焔角を足した。2体の技の音の遊びへの組み込みは次の周。
 */
export const MONSTER_SOUNDS: Record<string, Partial<Record<MonsterSoundId, string>>> = {
  /** 紅竜：炎の息・羽ばたき */
  dragon: { ...common('dragon'), flap: 'dragon/flap', breathStart: 'dragon/breathStart', breathLoop: 'dragon/breathLoop', breathStop: 'dragon/breathStop' },
  /** 雷翼：雷の息（出始め・持続・終わり）・跳ねる雷・大きな翼の羽ばたき。前足の音は翼の手首で地面を突く音 */
  raiyoku: { ...common('raiyoku'), flap: 'raiyoku/flap', breathStart: 'raiyoku/breathStart', breathLoop: 'raiyoku/breathLoop', breathStop: 'raiyoku/breathStop', arc: 'raiyoku/arc' },
  /** 焔角：溶岩の礫（吐く・着弾）・突進の地響き（繰り返し）・押し倒す音・地割れ。羽ばたきは無い */
  homuratsuno: { ...common('homuratsuno'), breathStart: 'homuratsuno/breathStart', breathHit: 'homuratsuno/breathHit', chargeLoop: 'homuratsuno/chargeLoop', shove: 'homuratsuno/shove', fissure: 'homuratsuno/fissure' },
};

export const DEFAULT_MONSTER = 'dragon';

/**
 * 音の表：出来事から鳴らす音の定義。bank が '@' で始まるものは怪獣の音（MONSTER_SOUNDS のキー）。
 * gainDb は「素材の瞬時の最大（目録の momentaryMax）＋ gainDb ＋ 効果音の系統（MIX.sfxDb）」が出口での目標になるよう決めた。
 * 目標（近くで、LUFS）：咆哮 -12・崩落と重い着地 -13・爪と尾の当たり -14〜-15・足音 -19・炎 -18〜-19・ガラスと細かい破片 -21（BGM は -16〜-18）。
 */
export const SOUNDS = {
  roar: { bank: '@roar', category: 'roar', gainDb: 3, pitch: 0.6, jitterDb: 0.8, space: 'self' },
  roarShort: { bank: '@roarShort', category: 'roar', gainDb: 2, pitch: 0.8, jitterDb: 1, space: 'self' },
  // r02-audio：指摘「よく鳴る短い音の高さの散らしが三角分布の ±0.9 半音で、外れの平均が 0.3 半音」 一様分布の ±1.5 半音（足音・羽ばたき・振り・出始め・着火）
  // 足音の素材は r02-audio で後ろ足 +2dB・前足 +1.3dB 大きくなった（瞬時の最大）ので、出口の大きさが前とほぼ同じになるよう合わせた（旧 step：後ろ 2・前 0）
  stepFront: { bank: '@stepFront', category: 'step', gainDb: 0, pitch: 1.5, jitterDb: 1.5, space: 'self' },
  stepHind: { bank: '@stepHind', category: 'step', gainDb: 0.5, pitch: 1.5, jitterDb: 1.5, space: 'self' },
  flap: { bank: '@flap', category: 'flap', gainDb: -1, pitch: 1.5, jitterDb: 1.5, space: 'self' },
  land: { bank: '@land', category: 'land', gainDb: 1, pitch: 0.7, jitterDb: 1, space: 'self' },
  landHeavy: { bank: '@landHeavy', category: 'land', gainDb: 4.5, pitch: 0.6, jitterDb: 0.8, space: 'self' },
  breathStart: { bank: '@breathStart', category: 'breath', gainDb: 1, pitch: 1.5, jitterDb: 1, space: 'self' },
  breathLoop: { bank: '@breathLoop', category: 'breath', gainDb: 1, pitch: 0.4, jitterDb: 0.5, space: 'self' },
  breathStop: { bank: '@breathStop', category: 'breath', gainDb: 0, pitch: 0.6, jitterDb: 1, space: 'self' },
  /** 怪獣の技の音（r02-audio で作った）：溶岩の着弾・跳ねる雷・押し倒す音・地割れ。r03-roster で出来事（lava.impact・lightning.hop・charge.shove・fissure.start）から鳴らす */
  breathHit: { bank: '@breathHit', category: 'collapse', gainDb: -1, pitch: 1, jitterDb: 1.5, space: 'world', size: 1.3 },
  arc: { bank: '@arc', category: 'arc', gainDb: 0, pitch: 1.5, jitterDb: 1.5, space: 'world', size: 1.3 },
  shove: { bank: '@shove', category: 'collapse', gainDb: -1, pitch: 1, jitterDb: 1, space: 'world', size: 1.6 },
  fissure: { bank: '@fissure', category: 'land', gainDb: 0, pitch: 0.8, jitterDb: 1, space: 'self' },
  // r05-audio：近い技は怪獣ごとの音（紅竜＝爪と尾、雷翼＝翼の打ち据えと尾の鞭、焔角＝角の突き上げと尾の鎚）。紅竜の音は r04 までと同じ
  clawSwing: { bank: '@clawSwing', category: 'attack', gainDb: -1, pitch: 1.5, jitterDb: 1.5, space: 'self' },
  // r02-audio：当たりの胴を雑音の打撃に替えて素材が約 1.5dB 小さくなった（塊の山で仕上げの制限器が止まる）分を戻す 2.5→4・3.5→5
  clawHit: { bank: '@clawHit', category: 'attack', gainDb: 4, pitch: 1, jitterDb: 1.5, space: 'world' },
  tailSwing: { bank: '@tailSwing', category: 'attack', gainDb: -1, pitch: 1.5, jitterDb: 1.5, space: 'self' },
  tailHit: { bank: '@tailHit', category: 'attack', gainDb: 5, pitch: 0.8, jitterDb: 1.5, space: 'world' },
  diveWind: { bank: 'attack/diveWind', category: 'flap', gainDb: -2, pitch: 0.5, jitterDb: 1, space: 'self' },
  crack: { bank: 'building/crack', category: 'crack', gainDb: 1, pitch: 1, jitterDb: 2, space: 'world', size: 1.2 },
  peel: { bank: 'building/peel', category: 'peel', gainDb: -1, pitch: 1, jitterDb: 2, space: 'world', size: 1.4 },
  tilt: { bank: 'building/tilt', category: 'tilt', gainDb: 0, pitch: 0.8, jitterDb: 1.5, space: 'world', size: 1.5 },
  // r02-audio：崩落の素材は中域が厚くなった分、瞬時の最大が 0.5dB 下がった（頭の山で仕上げの制限器が止まる）ので -1.5→-1dB
  collapseNear: { bank: 'building/collapseNear', category: 'collapse', gainDb: -1, pitch: 1, jitterDb: 1.5, space: 'world', size: 1.6 },
  collapseFar: { bank: 'building/collapseFar', category: 'collapseFar', gainDb: 0, pitch: 1, jitterDb: 1.5, space: 'world', size: 1.6 },
  glass: { bank: 'building/glass', category: 'glass', gainDb: -2, pitch: 1.2, jitterDb: 2, space: 'world' },
  fireIgnite: { bank: 'fire/ignite', category: 'fire', gainDb: -1, pitch: 1.5, jitterDb: 2, space: 'world', size: 1.3 },
  fireSpread: { bank: 'fire/spread', category: 'fire', gainDb: -2, pitch: 1.5, jitterDb: 2, space: 'world', size: 1.3 },
  uiClick: { bank: 'ui/click', category: 'ui', gainDb: -2, pitch: 0.3, jitterDb: 0.5, space: 'ui' },
  uiStart: { bank: 'ui/start', category: 'ui', gainDb: 0, pitch: 0, jitterDb: 0, space: 'ui' },
  uiPause: { bank: 'ui/pause', category: 'ui', gainDb: -2, pitch: 0, jitterDb: 0, space: 'ui' },
  uiResume: { bank: 'ui/resume', category: 'ui', gainDb: -2, pitch: 0, jitterDb: 0, space: 'ui' },
  uiResult: { bank: 'ui/result', category: 'ui', gainDb: 0, pitch: 0, jitterDb: 0, space: 'ui' },
  /** r06-audio：曲の最後の大太鼓に重ねる、大太鼓を抜いた銅鑼だけの結果の音（D に合わせた銅鑼） */
  uiResultGong: { bank: 'ui/resultGong', category: 'ui', gainDb: 0, pitch: 0, jitterDb: 0, space: 'ui' },
  uiRage: { bank: 'ui/rage', category: 'ui', gainDb: -1, pitch: 0, jitterDb: 0, space: 'ui' },
  uiCombo: { bank: 'ui/combo', category: 'ui', gainDb: -4, pitch: 0, jitterDb: 0.5, space: 'ui' },
} satisfies Record<string, SoundDef>;

export type SoundId = keyof typeof SOUNDS;

/** 鳴り続ける音（ブレス・燃える街・風）の数値。 */
export const LOOPS = {
  breath: { db: 1, fadeIn: 0.12, fadeOut: 0.25 },
  /** r03-roster：焔角の突進の地響き（突進の間だけ。素材の瞬時の最大 -16 LUFS を、足音と同じくらいの -19 前後で出す） */
  charge: { db: -1, fadeIn: 0.15, fadeOut: 0.4 },
  /**
   * 燃える街の下地：燃えている建物の強さ×近さの和で大きさを決める（fullAt でいっぱい）。
   * r02-audio：指摘「1棟で曲の 14.7LU 下、全部燃えても約 8LU 下」 燃えている棟の数で最大 boostDb 持ち上げる（boostAt 棟でいっぱい）
   */
  fire: { nearBank: 'fire/bedNear', farBank: 'fire/bedFar', nearDb: -6, farDb: -4, fullAt: 3, nearRange: 220, smooth: 0.6, boostDb: 6, boostAt: 8 },
  /** 空の風：飛ぶ速さ（m/s）で大きさを決める。r02-audio：指摘「全速で曲の約12〜14LU 下」 -8→0dB */
  wind: { bank: 'air/wind', db: 0, fromSpeed: 8, fullSpeed: 60, diveBoostDb: 4, smooth: 0.35 },
};

/**
 * r05-audio：焔角の声。指摘「焔角の咆哮が遊びで1回も鳴らない（E が地割れで、地割れの出来事に声が付かない）」
 * 地割れの溜め（rage.release の kind が fissure）で咆哮を鳴らして曲を引き、のしかかりの踏み切り（dragon.jump）で短い咆哮を鳴らす。
 * 跳ぶのは3分で15回ほど（10〜12秒ごと）なので、踏み切りの声は少し小さく、曲も引かず、直前の咆哮から cooldown 秒は鳴らさない。
 */
export const ROAR_CUES = {
  jump: { gainDb: -2, cooldownSeconds: 6 },
  /** 踏み切りの足の音（後ろ足で地面を蹴る）。声を鳴らさない踏み切りでも、これは必ず鳴る */
  pushOffDb: 3,
};

/** 連鎖の節目（この数に届いたら、りんを鳴らす） */
export const COMBO_MILESTONES = [10, 25, 50, 100];
