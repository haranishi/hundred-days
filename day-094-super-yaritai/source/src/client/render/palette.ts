/**
 * 色の出どころ（ここだけ）。照明・床・壁・コードで組む部品・HUDの色はすべてここから取る（docs/02 ⑤・docs/04）。
 * 画面と音の担当の画面（screens）も同じ6色を使う。値を変えるときは docs/02 と一緒に直す。
 */
export const PALETTE = {
  // docs/02 ⑤ の基本の6色
  cream: '#FFF8EC',
  ink: '#2B2B3A',
  red: '#E8423F',
  /** 小さな白い文字を載せる赤（#E8423F に白は 3.97:1 で AA に届かないため。#C2302D に白は 5.3:1） */
  redDark: '#C2302D',
  blue: '#2F7DE1',
  yellow: '#FFC93C',
  green: '#3BAA5C',
  white: '#FFFFFF',

  // 店の中
  floorA: '#FFFFFF',
  floorB: '#CFEFE1',
  floorGrout: '#E3EEE8',
  outside: '#F3E6CF',
  wood: '#D9A86C',
  woodDark: '#A9773F',
  metal: '#B8C2CC',
  metalDark: '#6E7A86',
  conveyor: '#3A3F4A',
  booth: '#F7E7C9',
  lightTube: '#FFFDF4',
  glass: '#CFE8FF',
  /** Kenney の壁は濃い灰色なので、明るい店に見えるよう掛け算で持ち上げる（1より大きい値で明るくなる） */
  wallBoost: [2.5, 2.4, 2.2] as const,
  toiletPaper: '#FBFBF7',
  toiletBand: '#7FB7E8',
  pinBand: '#E8423F',
  bell: '#F2C14E',
  bellBase: '#4A4F5C',

  // 光（白い蛍光灯に少しだけ暖色を混ぜる）
  sky: '#FFFFFF',
  ground: '#E9E2D2',
  sun: '#FFF6E8',
  fog: '#FFF8EC',

  // プレイヤー（色＋形＋番号で区別する）
  players: ['#E8423F', '#2F7DE1', '#FFC93C', '#3BAA5C'] as const,
  playerShapes: ['●', '▲', '■', '◆'] as const,

  // HUD
  hudPanel: 'rgba(255, 248, 236, 0.92)',
  hudShadow: 'rgba(43, 43, 58, 0.18)',
  stamp: '#E8423F',

  // 商品の塗り分け（round3 D1）。白く塗り替えた商品に掛ける色（掛け算なので、明るい色ほど元の陰影が残る）
  snackYellow: '#FFD23F',
  snackPink: '#FF8CC6',
  drinkClear: '#DDF1FF',
  drinkBlue: '#86BFF4',
  pastelMint: '#BDF0D8',
  pastelLavender: '#D8CCF8',
  pastelPink: '#FBCFE0',
  pastelLemon: '#FFF0A0',
  pastelSky: '#C4E4FB',

  // 通路の色（round3 D1）：棚の背板（淡い）と、上の帯・値札のレール・端の札（濃い）。商品の主役の色と合わせる
  aisleSnackPanel: '#FFB8D9',
  aisleSnackBand: '#FF6FB0',
  aisleDrinkPanel: '#AFD5FF',
  aisleCannedPanel: '#FFB4A8',
  aisleDailyPanel: '#B4E8CF',
  aisleDailyBand: '#3FB98A',
  aisleBreakfastPanel: '#FFD3A1',
  aisleBreakfastBand: '#F29A3A',
  aisleVegPanel: '#C6E9AE',

  // 壁ぎわのケース（round3 D2）：棚板・ガラスの照り・中の品の色・扉の上の売り場の名前の地
  caseShelf: '#FFFFFF',
  caseGlint: '#FFFFFF',
  caseHeaderDrinks: '#1F9BD1',
  goodsSky: '#CFE8FF',
  goodsTeal: '#7EC8E3',
  goodsMint: '#9BE0A8',
  goodsOrange: '#FFB15C',
  goodsPink: '#F7B2D2',
  goodsChoco: '#8C5A3C',
  goodsCream: '#FFF6D6',

  // 店の外（round3 D3）：歩道のタイル（2色の敷石と目地）・縁石・入口マット・のぼり旗
  sidewalkA: '#E6DFD2',
  sidewalkB: '#D8CFBF',
  sidewalkGrout: '#C7BDAC',
  curb: '#C9CED6',
  mat: '#2F7DE1',
  matEdge: '#1F5FB0',
  planter: '#A9773F',
  shrub: '#3BAA5C',
  shrubDark: '#2E8C4A',

  // こぼれた飲み物（round3 D4）
  spillWater: '#9FD2F4',
  spillMilk: '#FFFDF6',
  spillPink: '#F7B2D2',
  spillRed: '#D9342F',

  // 壁の飾り（round4 H1・H2）：腰板・看板の帯の地・秋の飾り（ポスターの橙と紅葉）
  wallWainscot: '#E9D2AE',
  bandCream: '#FFFDF6',
  autumnOrange: '#F08A24',
  autumnLeaf: '#D9542B',
  clockFace: '#FFFFFF',
  /** 横と奥の壁の上面の縞（日よけの赤を薄くした色。正面の南の壁だけ UI と同じ濃い赤にする） */
  awningSoft: '#F6B8B2',

  // レジ（round4 H3）：番号札の地（休止中は灰）、レジ袋
  laneOff: '#9AA3AE',
  bagWhite: '#F4F7FA',
} as const;

/** CSS の変数として流し込む（HUD はこれだけを読む） */
export function paletteCssVars(): string {
  return [
    `--sy-cream:${PALETTE.cream}`,
    `--sy-ink:${PALETTE.ink}`,
    `--sy-red:${PALETTE.red}`,
    `--sy-red-dark:${PALETTE.redDark}`,
    `--sy-blue:${PALETTE.blue}`,
    `--sy-yellow:${PALETTE.yellow}`,
    `--sy-green:${PALETTE.green}`,
    `--sy-white:${PALETTE.white}`,
    `--sy-panel:${PALETTE.hudPanel}`,
    `--sy-shadow:${PALETTE.hudShadow}`,
    `--sy-stamp:${PALETTE.stamp}`,
    ...PALETTE.players.map((c, i) => `--sy-p${i}:${c}`),
  ].join(';');
}

/** コードで組む部品の色の名前（store.ts の tint）→ 色 */
export function tintColor(tint: string | undefined): string {
  switch (tint) {
    case 'red':
      return PALETTE.red;
    case 'blue':
      return PALETTE.blue;
    case 'yellow':
      return PALETTE.yellow;
    case 'green':
      return PALETTE.green;
    case 'wood':
      return PALETTE.wood;
    case 'booth':
      return PALETTE.booth;
    case 'conveyor':
      return PALETTE.conveyor;
    case 'white':
      return PALETTE.white;
    default:
      return PALETTE.metal;
  }
}
