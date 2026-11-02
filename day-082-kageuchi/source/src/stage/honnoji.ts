// OWNER: contract（ステージ設計。値を直すときは「// rNN-担当: 理由 旧値→新値」の札を残す）
// 本能寺の変（天正十年六月二日 未明）。地図と通り道の考え方は docs/STAGE-HONNOJI.md。
// 座標は X＝東、Z＝南（m）。角度は度で 0＝東、90＝南、180＝西、270＝北。
import type { StageDef } from './types';

const FIRE: [number, number, number] = [1.0, 0.55, 0.22];
const LANTERN: [number, number, number] = [1.0, 0.7, 0.4];
const SHOJI: [number, number, number] = [1.0, 0.78, 0.5];

export const HONNOJI: StageDef = {
  meta: {
    id: 'honnoji',
    title: '本能寺の変',
    era: '天正十年（1582）',
    dateText: '天正十年六月二日　未明',
    place: '京・本能寺',
    playable: true,
    rule: { name: '闇と灯り', text: '篝火や提灯の光の中では、遠くから見つかる。闇に紛れれば、すぐそばまで近づける。' },
    objective: '織田信長を討て',
    mission: {
      player: '明智光秀',
      target: '織田信長',
      destination: '奥の庭',
      goal: '本能寺に忍び込み、織田信長を討ち取れ。',
      steps: [
        ['本能寺へ潜入', '表門・西の裏門・水抜き穴から、入る道を選ぶ。'],
        ['境内を突破', '竹林の板戸か中門から奥の庭へ。Eで消灯・補充・偵察もできる。'],
        ['護衛をかいくぐる', '見張りの向きを読み、迂回・小石・Eの背後制圧を選ぶ。正面攻撃は F（音が出る）。'],
        ['背後に近づいて E', '「E 討ち取る」が出たら、Eキーを押す。'],
      ],
      clearCondition: '信長を討ち取ればクリア。脱出は不要。',
      completion: '織田信長を討ち取った',
    },
    tagline: '敵は本能寺にあり',
    briefing: [
      '織田信長は、わずかな供回りだけを連れて本能寺に泊まっている。',
      '夜が明ければ、一万三千の明智勢が寺を囲む。だが光秀は、自らの手で討つと決めた。',
    ],
    scoutReport: [
      '表門　篝火が明るく、番兵が二人。正面からは難しい。',
      '西の裏門　提灯持ちを抜け、竹林の板戸を E で開く。奥には見張りがいる。',
      '北東の塀　足元に水抜きの穴がある。しゃがめば通れる。',
      '信長は奥の庭にいる。そばに森蘭丸が控える。',
    ],
  },

  bounds: { x0: -44, z0: -36, x1: 44, z1: 40 },
  baseAmbient: 0.12,
  surfaceDefault: 'dirt',
  surfaces: [
    { kind: 'gravel', rect: { x0: -36, z0: -12, x1: 36, z1: 30 } }, // 外の境内は白砂（鳴る）
    { kind: 'moss', rect: { x0: -36, z0: -32, x1: 36, z1: -12 } }, // 奥の庭は苔（静か）
    { kind: 'dirt', rect: { x0: 21, z0: -32, x1: 36, z1: -12 } }, // 蔵のまわりは土
    { kind: 'gravel', rect: { x0: -10, z0: -22.5, x1: 12, z1: -20 } }, // 書院の前の白砂の帯
    { kind: 'stone', rect: { x0: -1.4, z0: 10, x1: 1.4, z1: 30.4 } }, // 表門→本堂の石畳
    { kind: 'stone', rect: { x0: -1.2, z0: -12, x1: 1.2, z1: -6 } }, // 本堂の裏→中門
    { kind: 'stone', rect: { x0: -1.0, z0: -22.5, x1: 1.0, z1: -12 } }, // 中門→書院
  ],

  walls: [
    // 寺の外周の土塀。表門・裏門の切れ目と、北東の水抜き穴がある
    { id: 'S1', kind: 'dobei', a: { x: -36, z: 30 }, b: { x: -2.2, z: 30 }, thickness: 0.8, height: 2.6 },
    { id: 'S2', kind: 'dobei', a: { x: 2.2, z: 30 }, b: { x: 36, z: 30 }, thickness: 0.8, height: 2.6 },
    { id: 'W1', kind: 'dobei', a: { x: -36, z: -32 }, b: { x: -36, z: 8.2 }, thickness: 0.8, height: 2.6 },
    { id: 'W2', kind: 'dobei', a: { x: -36, z: 11.0 }, b: { x: -36, z: 30 }, thickness: 0.8, height: 2.6 },
    { id: 'N1', kind: 'dobei', a: { x: -36, z: -32 }, b: { x: 36, z: -32 }, thickness: 0.8, height: 2.6 },
    { id: 'E1', kind: 'dobei', a: { x: 36, z: -32 }, b: { x: 36, z: -27.8 }, thickness: 0.8, height: 2.6 },
    { id: 'E2', kind: 'dobei', a: { x: 36, z: -27.8 }, b: { x: 36, z: -26.4 }, thickness: 0.8, height: 2.6, crawl: true },
    { id: 'E3', kind: 'dobei', a: { x: 36, z: -26.4 }, b: { x: 36, z: 30 }, thickness: 0.8, height: 2.6 },
    // 外の境内と奥の庭を分ける板塀。中門の切れ目と、西の竹林側の切れ目（x<-30）がある
    { id: 'F1', kind: 'itabei', a: { x: -30, z: -12 }, b: { x: -1.6, z: -12 }, thickness: 0.25, height: 2.2 },
    { id: 'F2', kind: 'itabei', a: { x: 1.6, z: -12 }, b: { x: 36, z: -12 }, thickness: 0.25, height: 2.2 },
    // r07: 境内の仕切り板。灯りの間に視線を切れる場所を作る。
    { id: 'cover-west', kind: 'itabei', a: { x: -18.5, z: 6 }, b: { x: -18.5, z: 9 }, thickness: 0.16, height: 1.8 },
    { id: 'cover-east', kind: 'itabei', a: { x: 16.5, z: -1 }, b: { x: 16.5, z: 2 }, thickness: 0.16, height: 1.8 },
    // ステージの外周（京の町屋の並び）
    { id: 'TN', kind: 'town', a: { x: -44, z: -36 }, b: { x: 44, z: -36 }, thickness: 1.0, height: 5.5 },
    { id: 'TE', kind: 'town', a: { x: 44, z: -36 }, b: { x: 44, z: 40 }, thickness: 1.0, height: 5.5 },
    { id: 'TS', kind: 'town', a: { x: 44, z: 40 }, b: { x: -44, z: 40 }, thickness: 1.0, height: 5.5 },
    { id: 'TW', kind: 'town', a: { x: -44, z: 40 }, b: { x: -44, z: -36 }, thickness: 1.0, height: 5.5 },
  ],

  gates: [
    { id: 'omote', name: '表門', kind: 'large', center: { x: 0, z: 30 }, width: 4.4, facingDeg: 90 },
    { id: 'ura', name: '裏門', kind: 'small', center: { x: -36, z: 9.6 }, width: 2.8, facingDeg: 180 },
    { id: 'chumon', name: '中門', kind: 'small', center: { x: 0, z: -12 }, width: 3.2, facingDeg: 90 },
  ],

  // r07: 消灯・侵入路開放・補充・偵察を別の場所に置き、寄り道が作戦に効く。
  interactions: [
    { id: 'bamboo-door', kind: 'barrier', name: '竹林の板戸を開く', pos: { x: -33, z: -10.9 }, duration: 1.4,
      wall: { id: 'bamboo-door-wall', kind: 'itabei', a: { x: -35.8, z: -12 }, b: { x: -30.1, z: -12 }, thickness: 0.12, height: 1.9 } },
    { id: 'lamp-west', kind: 'lamp', name: '裏門の灯籠を消す', pos: { x: -30.6, z: 12.4 }, duration: 0.8, lightId: 'sl-ura' },
    { id: 'lamp-center-w', kind: 'lamp', name: '中門の灯籠を消す', pos: { x: -2.8, z: -10.4 }, duration: 0.8, lightId: 'sl-c1' },
    { id: 'lamp-center-e', kind: 'lamp', name: '中門の灯籠を消す', pos: { x: 2.8, z: -10.4 }, duration: 0.8, lightId: 'sl-c2' },
    { id: 'supply-bell', kind: 'supply', name: '鐘楼脇の小石を補充', pos: { x: -26, z: 19 }, duration: 0.8 },
    { id: 'supply-store', kind: 'supply', name: '蔵脇の小石を補充', pos: { x: 32, z: -20.5 }, duration: 0.8 },
    { id: 'scout-note', kind: 'intel', name: '境内の偵察書を読む', pos: { x: -15, z: 8 }, duration: 0.9 },
  ],

  buildings: [
    { id: 'hondo', kind: 'hondo', name: '本堂', footprint: { x0: -11, z0: -6, x1: 11, z1: 9 }, eaveHeight: 5.2, ridgeHeight: 12.5, ridgeAxis: 'x', facing: 's' },
    { id: 'shoin', kind: 'shoin', name: '書院', footprint: { x0: -10, z0: -31, x1: 12, z1: -22.5 }, eaveHeight: 4.0, ridgeHeight: 8.0, ridgeAxis: 'x', facing: 's' },
    { id: 'kuri', kind: 'kuri', name: '庫裏', footprint: { x0: 18, z0: 2, x1: 31, z1: 14 }, eaveHeight: 4.2, ridgeHeight: 9.0, ridgeAxis: 'z', facing: 'w' },
    { id: 'kura', kind: 'kura', name: '蔵', footprint: { x0: 24, z0: -29, x1: 30, z1: -21 }, eaveHeight: 5.0, ridgeHeight: 7.0, ridgeAxis: 'z', facing: 'w' },
    { id: 'shoro', kind: 'shoro', name: '鐘楼', footprint: { x0: -25, z0: 17, x1: -21, z1: 21 }, eaveHeight: 5.0, ridgeHeight: 7.6, ridgeAxis: 'x', facing: 's', open: true },
  ],

  props: [
    { id: 'br-g1', kind: 'brazier', pos: { x: -3.6, z: 27.2 }, radius: 0.5 },
    { id: 'br-g2', kind: 'brazier', pos: { x: 3.6, z: 27.2 }, radius: 0.5 },
    { id: 'br-h1', kind: 'brazier', pos: { x: -5.5, z: 11.2 }, radius: 0.5 },
    { id: 'br-h2', kind: 'brazier', pos: { x: 5.5, z: 11.2 }, radius: 0.5 },
    { id: 'sl-c1', kind: 'stoneLantern', pos: { x: -2.8, z: -10.4 }, radius: 0.45 },
    { id: 'sl-c2', kind: 'stoneLantern', pos: { x: 2.8, z: -10.4 }, radius: 0.45 },
    { id: 'sl-ura', kind: 'stoneLantern', pos: { x: -30.6, z: 12.4 }, radius: 0.45 },
    { id: 'sl-pond', kind: 'stoneLantern', pos: { x: -3.4, z: -20.6 }, radius: 0.45 },
    { id: 'p1', kind: 'pine', pos: { x: -12.5, z: 22.5 }, radius: 0.45, scale: 1.1 },
    { id: 'p2', kind: 'pine', pos: { x: 12.5, z: 22.5 }, radius: 0.45, scale: 1.0, rotDeg: 140 },
    { id: 'p3', kind: 'pine', pos: { x: -29, z: 25 }, radius: 0.45, scale: 1.25, rotDeg: 60 },
    { id: 'p4', kind: 'pine', pos: { x: 29, z: 25.5 }, radius: 0.45, scale: 1.2, rotDeg: 250 },
    { id: 'p5', kind: 'pine', pos: { x: -17, z: -17.5 }, radius: 0.45, scale: 0.9, rotDeg: 20 },
    { id: 'p6', kind: 'pine', pos: { x: 17.5, z: -19.5 }, radius: 0.45, scale: 0.85, rotDeg: 200 },
    { id: 'p7', kind: 'pine', pos: { x: -20, z: -2 }, radius: 0.45, scale: 1.3, rotDeg: 300 },
    { id: 'p8', kind: 'pine', pos: { x: 21.5, z: -3 }, radius: 0.45, scale: 1.15, rotDeg: 100 },
    { id: 'rk1', kind: 'rock', pos: { x: -10.3, z: -17.4 }, radius: 0.6, scale: 1.2 },
    { id: 'rk2', kind: 'rock', pos: { x: -9.6, z: -20.6 }, radius: 0.5 },
    { id: 'rk3', kind: 'rock', pos: { x: -2.7, z: -16.9 }, radius: 0.4, scale: 0.8 },
    { id: 'an-nb', kind: 'andon', pos: { x: 2.5, z: -19.6 }, radius: 0.3 },
  ],

  lights: [
    { id: 'br-g1', kind: 'brazier', pos: { x: -3.6, z: 27.2 }, height: 1.3, radius: 8, intensity: 1.0, color: FIRE },
    { id: 'br-g2', kind: 'brazier', pos: { x: 3.6, z: 27.2 }, height: 1.3, radius: 8, intensity: 1.0, color: FIRE },
    { id: 'br-h1', kind: 'brazier', pos: { x: -5.5, z: 11.2 }, height: 1.3, radius: 7, intensity: 0.9, color: FIRE },
    { id: 'br-h2', kind: 'brazier', pos: { x: 5.5, z: 11.2 }, height: 1.3, radius: 7, intensity: 0.9, color: FIRE },
    { id: 'sl-c1', kind: 'stoneLantern', pos: { x: -2.8, z: -10.4 }, height: 1.1, radius: 4, intensity: 0.55, color: LANTERN },
    { id: 'sl-c2', kind: 'stoneLantern', pos: { x: 2.8, z: -10.4 }, height: 1.1, radius: 4, intensity: 0.55, color: LANTERN },
    { id: 'sl-ura', kind: 'stoneLantern', pos: { x: -30.6, z: 12.4 }, height: 1.1, radius: 4, intensity: 0.5, color: LANTERN },
    { id: 'sl-pond', kind: 'stoneLantern', pos: { x: -3.4, z: -20.6 }, height: 1.1, radius: 3.5, intensity: 0.5, color: LANTERN },
    { id: 'sj1', kind: 'shoji', pos: { x: -6, z: -22.0 }, height: 1.2, radius: 3.6, intensity: 0.4, color: SHOJI },
    { id: 'sj2', kind: 'shoji', pos: { x: 1, z: -22.0 }, height: 1.2, radius: 3.6, intensity: 0.4, color: SHOJI },
    { id: 'sj3', kind: 'shoji', pos: { x: 8, z: -22.0 }, height: 1.2, radius: 3.6, intensity: 0.4, color: SHOJI },
    { id: 'win-kuri', kind: 'window', pos: { x: 17.4, z: 8 }, height: 1.4, radius: 3.5, intensity: 0.45, color: [1.0, 0.72, 0.45] },
    { id: 'an-nb', kind: 'andon', pos: { x: 2.5, z: -19.6 }, height: 0.7, radius: 3.2, intensity: 0.6, color: [1.0, 0.75, 0.45] },
  ],

  hides: [
    { id: 'b1', kind: 'bush', center: { x: -17, z: 24.5 }, radius: 1.5 },
    { id: 'b2', kind: 'bush', center: { x: 17, z: 25 }, radius: 1.5 },
    { id: 'b3', kind: 'bush', center: { x: -6.4, z: 19.6 }, radius: 1.2 },
    { id: 'b4', kind: 'bush', center: { x: 6.4, z: 19.6 }, radius: 1.2 },
    { id: 'b5', kind: 'bush', center: { x: -28, z: -3.5 }, radius: 1.4 },
    { id: 'b6', kind: 'bush', center: { x: 26, z: -5.5 }, radius: 1.3 },
    { id: 'b7', kind: 'bush', center: { x: -20, z: -21.5 }, radius: 1.4 },
    { id: 'b8', kind: 'bush', center: { x: 14.5, z: -21.0 }, radius: 1.3 },
    { id: 'b9', kind: 'bush', center: { x: -13.6, z: -26.6 }, radius: 1.3 },
    { id: 'b10', kind: 'bush', center: { x: 33, z: -18.5 }, radius: 1.3 },
    { id: 'b11', kind: 'bush', center: { x: 11, z: -19.4 }, radius: 1.0 },
  ],

  // 重なるときは ambient の小さい方を使う
  darkZones: [
    { id: 'dz-bamboo', name: '竹林', rect: { x0: -36, z0: -31.6, x1: -28.5, z1: -5 }, ambient: 0.04 },
    { id: 'dz-hondo', name: '本堂の軒下', rect: { x0: -12.8, z0: -7.8, x1: 12.8, z1: 10.6 }, ambient: 0.07 },
    { id: 'dz-kura', name: '蔵の陰', rect: { x0: 30, z0: -31.6, x1: 35.6, z1: -20 }, ambient: 0.06 },
    { id: 'dz-street-s', name: '南の通り', rect: { x0: -44, z0: 30.4, x1: 44, z1: 40 }, ambient: 0.09 },
    { id: 'dz-lane-e', name: '東の小路', rect: { x0: 36.4, z0: -36, x1: 44, z1: 30.4 }, ambient: 0.08 },
    { id: 'dz-lane-w', name: '西の小路', rect: { x0: -44, z0: -36, x1: -36.4, z1: 30.4 }, ambient: 0.08 },
    { id: 'dz-lane-n', name: '北の路地', rect: { x0: -36.4, z0: -36, x1: 36.4, z1: -32.4 }, ambient: 0.06 },
  ],

  ponds: [{ id: 'pond', center: { x: -6.5, z: -18.6 }, rx: 3.4, rz: 2.2 }],

  // 竹林の中には x≈-33 に沿って獣道を空けておく（描画側で竹を立てない帯）
  bamboo: [{ id: 'bb1', rect: { x0: -36, z0: -31.6, x1: -28.8, z1: -5.5 }, density: 1.2 }],

  guards: [
    {
      id: 'omote-l', name: '表門の番兵（左）', kind: 'ashigaru', role: 'guard', weapon: 'spear',
      start: { x: -1.5, z: 28.2 }, facingDeg: 90,
      lookAround: [{ yawDeg: 90, hold: 3.2 }, { yawDeg: 130, hold: 2.2 }, { yawDeg: 90, hold: 2.0 }, { yawDeg: 65, hold: 1.6 }],
    },
    {
      id: 'omote-r', name: '表門の番兵（右）', kind: 'ashigaru', role: 'guard', weapon: 'spear',
      start: { x: 1.5, z: 28.2 }, facingDeg: 90,
      lookAround: [{ yawDeg: 90, hold: 2.4 }, { yawDeg: 50, hold: 3.0 }, { yawDeg: 90, hold: 2.2 }, { yawDeg: 115, hold: 1.8 }],
    },
    {
      id: 'hondo-patrol', name: '本堂まわりの提灯持ち', kind: 'ashigaru', role: 'guard', weapon: 'spear', lantern: true,
      start: { x: -14.5, z: 13 }, facingDeg: 0, routeMode: 'loop', speed: 1.25,
      route: [
        { pos: { x: -14.5, z: 13 }, wait: 1.5, looks: [90] },
        { pos: { x: 14.5, z: 13 }, wait: 1.5, looks: [90] },
        { pos: { x: 14.5, z: -9.5 }, wait: 2, looks: [270, 0] },
        { pos: { x: -14.5, z: -9.5 }, wait: 2, looks: [270, 180] },
      ],
    },
    {
      id: 'ura-patrol', name: '裏門の提灯持ち', kind: 'ashigaru', role: 'guard', weapon: 'spear', lantern: true,
      start: { x: -32.5, z: 1.5 }, facingDeg: 90, routeMode: 'pingpong', speed: 1.2,
      // r03-fix-play: 体験の採点 5 位「白砂の上を歩くので背後を取る余地がない」。折り返しで、歩いてきた向き（外）のまま長めに止まって先を見る。
      //   しゃがんで背後を追えば、この間に当て身の間合いへ届く（門を過ぎて 4m 遅れて追い始めても届く。tests/patrol.test.ts）。
      //   旧 wait 2.5・looks [270, 0]／[90, 0]（先を見るのは 1.25 秒）→ 新 wait 5・先を見る 3.3 秒、残りで内（東）を見る
      route: [
        { pos: { x: -32.5, z: 1.5 }, wait: 5, looks: [270, 270, 0] },
        { pos: { x: -32.5, z: 19 }, wait: 5, looks: [90, 90, 0] },
      ],
    },
    {
      id: 'east-patrol', name: '東の見回り', kind: 'ashigaru', role: 'guard', weapon: 'spear',
      start: { x: 31.5, z: 25 }, facingDeg: 270, routeMode: 'pingpong', speed: 1.3,
      route: [
        { pos: { x: 31.5, z: 25 }, wait: 2, looks: [90, 180] },
        { pos: { x: 33, z: 16 }, wait: 0 },
        { pos: { x: 33, z: -8 }, wait: 2, looks: [270, 180] },
        { pos: { x: 21, z: -9.5 }, wait: 2.5, looks: [180, 90, 270] },
      ],
    },
    {
      id: 'shoro-doze', name: '鐘楼の居眠り番', kind: 'ashigaru', role: 'guard', weapon: 'spear', dozing: true, seated: true,
      start: { x: -23, z: 19 }, facingDeg: 0,
      lookAround: [{ yawDeg: 0, hold: 3 }, { yawDeg: 90, hold: 2.5 }, { yawDeg: 300, hold: 2.5 }],
    },
    {
      id: 'chumon', name: '中門の番兵', kind: 'samurai', role: 'guard', weapon: 'katana',
      start: { x: 0, z: -13.4 }, facingDeg: 90,
      lookAround: [{ yawDeg: 90, hold: 3.0 }, { yawDeg: 50, hold: 2.2 }, { yawDeg: 90, hold: 1.5 }, { yawDeg: 130, hold: 2.2 }],
    },
    {
      id: 'garden-patrol', name: '奥庭の提灯持ち', kind: 'ashigaru', role: 'guard', weapon: 'spear', lantern: true,
      start: { x: -25, z: -15.8 }, facingDeg: 0, routeMode: 'loop', speed: 1.2,
      // r03-fix-play: 体験の採点 4 位「片道約 44m の見回りで、竹林や板塀の切れ目で 26〜30 秒待たされる」。
      //   旧：池の南の通り道を西の端 (-25) と東の端 (21) で往復（pingpong）。西へ戻る 38 秒の間、西の切れ目からは入れなかった。
      //   新：池の南は東へだけ歩く。東の半分は今までどおり往復し、戻りは池の東の端で中門→書院の石畳を北へ上がり、書院の前を西へ戻る（loop）。
      //   西の切れ目で待つ長さ：最長 43→14 秒・平均 11.7→1.3 秒。蔵の陰は最長 6 秒のまま（tests/patrol.test.ts）
      route: [
        { pos: { x: -25, z: -15.8 }, wait: 2, looks: [270, 180] },
        { pos: { x: -11, z: -15 }, wait: 0 },
        { pos: { x: -0.8, z: -15.3 }, wait: 0 },
        { pos: { x: 8, z: -15 }, wait: 0 },
        { pos: { x: 21, z: -16 }, wait: 2, looks: [0, 270] },
        { pos: { x: 8, z: -15 }, wait: 0 },
        { pos: { x: -0.8, z: -15.3 }, wait: 0 },
        { pos: { x: -0.8, z: -21.9 }, wait: 0 },
        { pos: { x: -10.6, z: -21.9 }, wait: 0 },
      ],
    },
    {
      id: 'bamboo-sentry', name: '竹林の見張り', kind: 'ashigaru', role: 'guard', weapon: 'spear',
      start: { x: -29.1, z: -14.3 }, facingDeg: 270,
      lookAround: [{ yawDeg: 270, hold: 9 }, { yawDeg: 0, hold: 3 }, { yawDeg: 90, hold: 2 }, { yawDeg: 180, hold: 2 }],
    },
    {
      id: 'ranmaru', name: '森蘭丸', kind: 'ranmaru', role: 'guard', weapon: 'katana', sightMul: 1.15, fillMul: 0.85,
      start: { x: 6.4, z: -17.2 }, facingDeg: 150,
      lookAround: [{ yawDeg: 150, hold: 3.4 }, { yawDeg: 335, hold: 2.6 }, { yawDeg: 200, hold: 2.6 }, { yawDeg: 250, hold: 1.8 }],
    },
    {
      id: 'nobunaga', name: '織田信長', kind: 'nobunaga', role: 'target', weapon: 'none', seated: true, sightMul: 0.9,
      start: { x: 1.6, z: -18.8 }, facingDeg: 180,
      lookAround: [{ yawDeg: 180, hold: 5.0 }, { yawDeg: 215, hold: 2.4 }, { yawDeg: 180, hold: 3.0 }, { yawDeg: 145, hold: 2.4 }],
    },
  ],

  player: { start: { x: -14, z: 37.5 }, facingDeg: 270, stones: 5 },

  decor: {
    // 明智勢は西（丹波）から入り、寺を囲む。南と西の町の向こうに篝火の列と旗を置く
    armyCamps: [
      { x0: -70, z0: 46, x1: 40, z1: 78 },
      { x0: -88, z0: -30, x1: -52, z1: 44 },
    ],
    banners: [
      { x: -32, z: 47 }, { x: -20, z: 47.5 }, { x: -8, z: 46.8 }, { x: 6, z: 47.4 }, { x: 18, z: 47 },
      { x: -53, z: 22 }, { x: -53.5, z: 6 }, { x: -52.8, z: -10 },
    ],
    // 東山の稜線が立つ方角の幅（度）。0＝東。ほかの方角は低い山並み
    mountainsDeg: [-70, 70],
  },
};
