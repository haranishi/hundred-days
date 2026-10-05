// 富士山：裾が大きく広がる円すいの独立峰。頂上は平らにへこむ火口で、上の方は雪。ふもとに森と湖。
// 山の中心は少し奥（-Z）に置き、手前（+Z）に湖と、富士山を背にした五重塔（新倉山の忠霊塔のような眺め）を置く。
// 白いうちは「大きな円すいの山」まで（羊蹄山と迷う）で、頂上の火口と雪の筋（段階3）、色塗りの雪と湖で決まる。
import { COLORS, type Kit, type Vec3, type XZ } from './kit'

const FOREST = '#3F6E47' // ふもとの森
const FOOT = '#4F6E66' // 森と山肌のあいだ
const SLOPE = '#5B6C88' // 山肌の青灰
const SNOW = '#F3F6F9'
const LAKE = '#3B7FA6'
const ROOF = '#6A6560'
const SHU = COLORS.vermilion

/** 山の中心（少し奥）と大きさ */
const MX = 0
const MZ = -0.85
const R0 = 3.8 // 裾の半径
const H = 3.2 // 高さ（斜め上から見ると低く見えるので、写真の比率より少し高く）
const RT = 0.42 // 火口の縁の半径
/** 雪の下の端（高さの割合） */
const SNOWLINE = 0.56

/** 高さ y での山の半径。上ほど急で、裾ほどなだらか（下に凹んだ稜線） */
function radiusAt(y: number): number {
  const u = 1 - y / H
  return RT + (R0 - RT) * (0.68 * u + 0.32 * u ** 3)
}

/** 山の中心から距離 d の地点の、山肌の高さ（二分法で radiusAt を逆に解く） */
function heightAt(d: number): number {
  if (d >= R0) return 0
  if (d <= RT) return H
  let lo = 0
  let hi = H
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2
    if (radiusAt(mid) > d) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/** 手前の湖（河口湖のような細長い湖） */
const LAKE_MAIN: readonly XZ[] = [
  [-1.75, 3.7],
  [-1.15, 3.35],
  [-0.2, 3.25],
  [0.9, 3.35],
  [1.9, 3.55],
  [2.6, 3.72],
  [2.8, 3.95],
  [2.3, 4.15],
  [1.3, 4.35],
  [0.2, 4.45],
  [-0.9, 4.4],
  [-1.6, 4.2],
  [-1.95, 3.95],
]

export function build(kit: Kit): void {
  kit.ground(COLORS.grass)

  // ---- 段階1：裾の広がり（森と山肌）と、湖・手前の丘（白） ----
  kit.stage(1)
  kit.order(-1)
  kit.appear('grow')
  kit.part(() => {
    band(kit, 0, FOREST)
    band(kit, 1, FOOT)
  })
  band(kit, 2, SLOPE)
  kit.appear('drop')
  kit.order(0)
  kit.water({ points: LAKE_MAIN, color: LAKE })
  kit.water({ r: 0.5, at: [3.55, 0, 1.6], color: LAKE })
  kit.mound({ r: 0.8, rx: 0.8, rz: 0.62, h: 0.45, at: [-3.3, 0, 2.3], color: '#6E9A52' })
  kit.mound({ r: 0.7, rx: 0.9, rz: 0.45, h: 0.22, at: [1.3, 0, 2.75], color: '#7BA85C' })

  // ---- 段階2：形の特徴＝丸い円すいが上へ伸びる（白） ----
  kit.stage(2)
  band(kit, 3, SLOPE)
  band(kit, 4, SNOW)
  band(kit, 5, SNOW)

  // ---- 段階3：決め手の細部（白）＝頂上の火口と、雪の筋（谷） ----
  kit.stage(3)
  summit(kit)
  snowStreaks(kit, 0)
  snowStreaks(kit, 1)
  // お鉢めぐりの小さな峰
  kit.part(() => {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.3
      const r = RT * 0.92
      kit.sphere({ r: kit.range(0.05, 0.08), squash: 0.55, at: [MX + Math.sin(a) * r, H - 0.03, MZ + Math.cos(a) * r], seg: 7, color: SNOW })
    }
  })

  // ---- 段階4：周りの景色（色つき）＝ふもとの森・五重塔と桜・湖の舟・宿・人 ----
  kit.stage(4)
  const hill = (x: number, z: number): number => Math.max(0, kit.groundAt(x, z) - 0.03)
  // 五重塔（手前の丘の上。富士山を背にした眺め）
  pagoda(kit, [-3.3, hill(-3.3, 2.3), 2.3])
  for (const [x, z] of [
    [-2.8, 2.55],
    [-3.75, 2.0],
    [-3.0, 1.85],
    [-3.85, 2.65],
    [-2.65, 2.15],
    [-3.45, 2.85],
  ] as const) {
    kit.tree({ kind: 'sakura', h: kit.range(0.4, 0.5), at: [x, hill(x, z), z], rotY: kit.range(0, 360) })
  }
  // ふもとの森（樹海）。山肌の低いところに並べる
  kit.scatter(
    {
      count: 58,
      rMin: 0.3,
      rMax: 4.85,
      gap: 0.33,
      ok: (x, z) => {
        const d = Math.hypot(x - MX, z - MZ)
        return d > 3.0 && d < 3.9 && !nearLake(x, z) && Math.hypot(x + 3.3, z - 2.3) > 0.95
      },
    },
    (_i, x, z) => {
      const d = Math.hypot(x - MX, z - MZ)
      kit.tree({
        kind: kit.chance(0.75) ? 'cone' : 'round',
        h: kit.range(0.36, 0.52),
        at: [x, Math.max(0, heightAt(d) - 0.04), z],
        color: kit.pick(['#2F5E3E', '#365F3D', '#3F6F45', '#2E5A3A']),
      })
    },
  )
  // 湖のまわりの木
  for (const [x, z] of [
    [-2.2, 3.45],
    [-2.25, 4.0],
    [3.1, 3.55],
    [2.95, 3.25],
    [0.9, 2.95],
    [1.55, 3.05],
    [3.95, 1.25],
    [4.1, 1.85],
  ] as const) {
    kit.tree({ kind: 'round', h: kit.range(0.38, 0.5), at: [x, hill(x, z), z], color: kit.pick(['#4F8A45', '#5C9A4C', '#47803F']) })
  }
  // 湖畔の宿（灰色の屋根）
  for (const [x, z, rot] of [
    [2.7, 2.75, 10],
    [3.25, 2.55, -15],
    [3.0, 3.05, 5],
    [3.65, 2.3, -30],
  ] as const) {
    kit.at({ at: [x, 0, z], rotY: rot }, () =>
      kit.part(() => {
        kit.box({ w: 0.36, h: 0.18, d: 0.26, color: '#EDE6D6' })
        kit.gableRoof({ w: 0.36, d: 0.26, h: 0.1, at: [0, 0.18, 0], overhang: 0.04, color: '#5D6168' })
      }),
    )
  }
  // 湖の小舟
  kit.boat({ kind: 'row', at: [0.2, 0.03, 3.85], rotY: 75, len: 0.4, color: '#E8E4DA' })
  kit.boat({ kind: 'row', at: [-0.9, 0.03, 3.95], rotY: 100, len: 0.36, color: '#C84A3A' })
  kit.boat({ kind: 'row', at: [1.5, 0.03, 3.95], rotY: 60, len: 0.36, color: '#8A5A3A' })
  // 人（塔の展望台と湖畔）
  for (const [x, z] of [
    [-3.0, 2.75],
    [-2.85, 2.95],
    [-3.6, 2.45],
    [2.2, 3.35],
    [2.45, 3.2],
    [-1.6, 3.4],
  ] as const) {
    kit.person({ at: [x, hill(x, z), z], rotY: kit.range(150, 230) })
  }
}

/** 帯の境目（高さの割合）。下から 0, 1, 2… の番号で呼ぶ。最後の帯（番号6）が頂上 */
const BANDS: readonly number[] = [0, 0.12, 0.26, 0.42, SNOWLINE, 0.7, 0.84, 1]

/**
 * 帯の番号ごとに、山肌をほんの少しずつ外へ出す。上の帯は継ぎ目の少し下（SKIRT_H）から始めて、
 * 下の帯の継ぎ目と上のふたを外からおおう。帯どうしの継ぎ目に、下の帯のふたの明るい色や、
 * 法線のずれが細い輪になって出ないようにするため（同じ半径で重ねるとふたの色が点線で出、外へ出す幅を途中で細めると陰の輪が出た）
 */
const STEP_OUT = 0.004
const SKIRT_H = 0.03

/** 高さ y の山肌の、実際の半径（帯の番号ぶん外へ出した値）。雪の筋はこの面に沿わせる */
function surfaceR(y: number): number {
  let k = 0
  for (let i = 1; i < BANDS.length - 1; i++) if (y >= H * (BANDS[i] ?? 1) - 1e-9) k = i
  return radiusAt(y) + k * STEP_OUT
}

/** 帯 k の底のふたと山肌の点（帯の上の端まで）。角の点は2つ置き、陰が混ざらない固い角にする */
function bandPoints(k: number, n: number): XZ[] {
  const y0 = H * (BANDS[k] ?? 0)
  const y1 = H * (BANDS[k + 1] ?? 1)
  const out = k * STEP_OUT
  const yb = k === 0 ? 0 : y0 - SKIRT_H
  const rb = radiusAt(yb) + out
  const pts: XZ[] = [[0, yb], [rb, yb]]
  for (let i = 0; i <= n; i++) {
    const y = yb + ((y1 - yb) * i) / n
    pts.push([radiusAt(y) + out, y])
  }
  return pts
}

/** 山の帯 k を回転体で作る。下と上は半径0で閉じる */
function band(kit: Kit, k: number, color: string): void {
  const y1 = H * (BANDS[k + 1] ?? 1)
  const pts = bandPoints(k, 8)
  const top = pts[pts.length - 1] as XZ
  kit.lathe({ points: [...pts, [top[0], y1], [0, y1]], seg: 44, at: [MX, 0, MZ], color })
}

/** 頂上（帯6）：いちばん上の帯と、平らにへこむ火口 */
function summit(kit: Kit): void {
  const pts: XZ[] = bandPoints(BANDS.length - 2, 6)
  pts.push([RT * 0.8, H + 0.015], [RT * 0.55, H - 0.07], [RT * 0.25, H - 0.11], [0, H - 0.11])
  kit.lathe({ points: pts, seg: 44, at: [MX, 0, MZ], color: SNOW })
}

/** 雪の筋（谷に残る雪）。half=0 は手前半分、1 は奥半分。山肌に沿って下へ細くなる舌の形を、長さと幅をばらして並べる */
function snowStreaks(kit: Kit, half: 0 | 1): void {
  kit.part(() => {
    const count = 13
    for (let k = 0; k < count; k++) {
      const a = (half * 180 + (k + 0.5) * (180 / count) - 90 + kit.range(-5, 5)) % 360
      const yTop = H * (SNOWLINE + 0.04)
      // 講評r1の再開確認：斜面へ沿わせても長い白い先がトゲに見えた → 雪線からの長さ 0.035〜0.165→0.018〜0.07、幅 0.07〜0.17→0.12〜0.22。
      // 短く幅のある雪の舌にする。乱数を引く回数は変えず、周囲の木や家の配置を保つ
      const drop = kit.range(0.05, 0.2)
      const yBot = H * (SNOWLINE - (0.018 + 0.052 * ((drop - 0.05) / 0.15) ** 1.8))
      const w = kit.range(0.12, 0.22)
      tongue(kit, a, yTop, yBot, w)
      // ところどころ、短い筋をもう1本
      if (kit.chance(0.45)) tongue(kit, a + 180 / count / 2, yTop, H * (SNOWLINE - kit.range(0.012, 0.035)), w * 0.7)
    }
  })
}

/** 雪の舌を斜面に沿わせる区切りの数・板の厚み・山肌から外へずらす量 */
const TONGUE_SEGS = 5
const TONGUE_THICK = 0.016
const TONGUE_LIFT = 0.004

/**
 * 角度 a（度）の山肌に、高さ yTop から yBot へ細くなる薄い舌を置く。
 * 講評r1：まっすぐな板1枚（厚み0.024）だったので、凹んだ斜面から浮いてトゲのように外へ突き出していた
 * → 斜面の曲がりに沿って短い板を TONGUE_SEGS 枚つなぎ、厚みを 0.024→0.016 にして半分を山肌に埋める（外へ出るのは約0.01）。
 *   幅は上の方を保ったまま先で丸くすぼめ（直線の三角→舌の形）、先の幅も 0.004→0.012 にして針のように尖らせない。
 *   色も先へ行くほど山肌の色に寄せ（先で45%）、白い先が背景から切り抜いたように立たないようにする
 */
function tongue(kit: Kit, a: number, yTop: number, yBot: number, w: number): void {
  // 先端の最終区間にも幅を残す（0.012→0.035）。近景で針のように細くならない
  const widthAt = (u: number): number => w * Math.sqrt(1 - u ** 3) + 0.035 * u
  kit.at({ at: [MX, 0, MZ], rotY: a }, () => {
    for (let i = 0; i < TONGUE_SEGS; i++) {
      const u0 = i / TONGUE_SEGS
      const u1 = (i + 1) / TONGUE_SEGS
      const y0 = yTop + (yBot - yTop) * u0
      const y1 = yTop + (yBot - yTop) * u1
      const r0 = surfaceR(y0) + TONGUE_LIFT
      const r1 = surfaceR(y1) + TONGUE_LIFT
      const len = Math.hypot(r1 - r0, y1 - y0)
      // 板の向き（+Y）を、斜面を下る向き (0, y1 - y0, r1 - r0) に合わせる
      const tilt = (Math.atan2(r1 - r0, y1 - y0) * 180) / Math.PI
      kit.frustum({
        w: widthAt(u0),
        d: TONGUE_THICK,
        topW: widthAt(u1),
        topD: TONGUE_THICK,
        h: len,
        at: [0, y0, r0],
        rot: [tilt, 0, 0],
        color: mixHex(SNOW, SLOPE, 0.45 * ((u0 + u1) / 2) ** 1.5),
      })
    }
  })
}

/** 2つの色（#RRGGBB）を t の割合で混ぜる */
function mixHex(a: string, b: string, t: number): string {
  const ch = (hex: string, i: number): number => Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
  let out = '#'
  for (let i = 0; i < 3; i++) out += Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, '0')
  return out
}

/** 湖のそばか（森の木を湖に入れない） */
function nearLake(x: number, z: number): boolean {
  if (Math.hypot(x - 3.55, z - 1.6) < 0.75) return true
  return z > 3.05 && x > -2.1 && x < 3.0
}

/** 五重塔（朱）。富士山を背にした手前の丘に建つ */
function pagoda(kit: Kit, at: Vec3): void {
  kit.part(() =>
    kit.at({ at }, () => {
      kit.box({ w: 0.42, h: 0.05, d: 0.42, color: '#A39C91' })
      let y = 0.05
      for (let i = 0; i < 5; i++) {
        const w = 0.28 - i * 0.026
        const h = 0.1
        kit.box({ w, h, d: w, at: [0, y, 0], color: SHU })
        y += h
        if (i < 4) {
          const wn = w - 0.026
          kit.curvedRoof({ w, d: w, h: 0.045, at: [0, y, 0], style: 'skirt', top: { w: wn, d: wn }, overhang: 0.075, upturn: 0.03, thick: 0.025, color: ROOF })
          y += 0.045
        } else {
          kit.curvedRoof({ w, d: w, h: 0.09, at: [0, y, 0], style: 'hogyo', overhang: 0.08, upturn: 0.03, thick: 0.025, color: ROOF })
          y += 0.09
        }
      }
      kit.cylinder({ r: 0.013, h: 0.27, at: [0, y - 0.02, 0], seg: 6, color: '#7A6A4E' })
      for (let k = 0; k < 5; k++) kit.cylinder({ r: 0.03, h: 0.012, at: [0, y + 0.04 + k * 0.034, 0], seg: 8, color: '#7A6A4E' })
    }),
  )
}
