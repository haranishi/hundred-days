// OWNER: config
// 怪獣の標本（?specimen=、src/harness/specimenRunner.ts）の構図の数値。r02-roster ではランナーの中に置いていたのを、r03-roster で移した。
// street・closeup・overview は既存の撮影と同じ目印の構図。profile は遊歩道で横顔（動きの連番・3体を並べる lineup・札の影絵）。
import type { CreatureId } from './creatures';

export const SPECIMEN_LAYOUT = {
  street: { headingDeg: -38, airAltitude: 46 },
  // 寄り：頭の局所の座標の +x 左・+z 前。紅竜（頭の長さ 7m）の値を、怪獣の頭の長さの比で伸び縮みさせる
  closeup: { headingDeg: -95, fromHeadLocal: [14, 1.2, 8] as const, lookForward: 3.6, refHeadLength: 7, airAltitude: 46 },
  // 地上のクリップの overview：東西の大通りの真上（両側の高層に遮られない）から、夕日を背に交差点を見下ろす
  overviewGround: { camera: [-165, 105, 0] as const, look: [0, 8, 0] as const, fov: 45, exposure: 1.0, headingDeg: -38 },
  // 遊歩道に北向き（yaw 180°。左の脇腹が西＝夕日とカメラの側）。桟橋のいちばん広い隙間の中ほどに置き、湾の上から撮る。
  // lineup は南から 焔角・紅竜・雷翼 の順に間隔 spacing で並べる
  profile: { headingDeg: 180, back: 118, up: 9, lookUp: 12, fov: 40, exposure: 1.05, airAltitude: 30 },
  // コマ撮りの横顔：近くから標本について動く（足の運びと膜・尾を読む）。遊歩道の並木が足を隠すので、街の小物は隠す
  filmProfile: { back: 72, up: 5, lookUp: 8, fov: 38 },
  lineup: { order: ['homuratsuno', 'kurenai', 'raiyoku'] as CreatureId[], spacing: 62, back: 215, up: 10, lookUp: 15, fov: 30 },
} as const;
