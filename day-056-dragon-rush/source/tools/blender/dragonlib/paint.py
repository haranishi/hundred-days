# OWNER: dragon
"""下地の色（線形 RGB）と、部位の番号。細かい鱗は three.js 側のシェーダーが足すので、ここは大きな色の流れだけを持つ。

部位の番号は src/dragon/dragonMaterial.ts の PART と同じにしておく（シェーダーが材質の種類を分ける）。
色の式は Palette にまとめ、紅竜の色（DRAGON）はこのファイルの定数から作る。雷翼と焔角は設計図で自分の Palette を作る。
"""
from .shapes import fbm, lerp, smoothstep

PART_SKIN = 0.0
PART_MEMBRANE = 1.0
PART_HORN = 2.0
PART_CLAW = 3.0
PART_TOOTH = 4.0
PART_EYE = 5.0
PART_MOUTH = 6.0

# 背は暗い赤褐色、脇は少し明るい茶、腹は明るい板状の鱗（黄土色）
BACK = (0.050, 0.017, 0.013)
BACK_DARK = (0.020, 0.0075, 0.0065)
FLANK = (0.092, 0.035, 0.024)
BELLY = (0.36, 0.235, 0.135)
BELLY_EDGE = (0.17, 0.092, 0.055)
FEET = (0.050, 0.030, 0.022)
FEET_DIRT = (0.030, 0.024, 0.019)
MEMBRANE = (0.21, 0.042, 0.022)
MEMBRANE_EDGE = (0.060, 0.014, 0.009)
# r00c-竜: 指摘「角と歯が明るい同じ色で、作り物っぽい」 角の中ほど (0.34,0.28,0.20)→(0.25,0.20,0.14)、歯 (0.66,0.58,0.43)→(0.50,0.43,0.31)
HORN_BASE = (0.040, 0.027, 0.020)
HORN_MID = (0.25, 0.20, 0.14)
HORN_TIP = (0.055, 0.043, 0.034)
CLAW_TIP = (0.030, 0.024, 0.020)
CLAW_BASE = (0.30, 0.24, 0.16)
TOOTH = (0.50, 0.43, 0.31)
TOOTH_STAIN = (0.30, 0.20, 0.10)
TOOTH_TIP = (0.58, 0.54, 0.46)
TOOTH_ROOT = (0.20, 0.11, 0.07)
MOUTH = (0.13, 0.020, 0.013)
TONGUE = (0.30, 0.060, 0.045)
GUM = (0.20, 0.035, 0.022)
PALATE = (0.34, 0.11, 0.08)
EYE = (0.85, 0.30, 0.03)
# 虹彩：瞳のまわりは明るい金、外へ橙、縁（角膜の輪）は暗い赤褐色
IRIS_INNER = (0.95, 0.58, 0.10)
IRIS_OUTER = (0.62, 0.17, 0.02)
IRIS_RIM = (0.07, 0.018, 0.008)
PUPIL = (0.008, 0.004, 0.003)
NOSTRIL = (0.012, 0.005, 0.004)


def mix(a, b, t):
    return tuple(lerp(a[i], b[i], t) for i in range(3))


def scale(c, k):
    return tuple(x * k for x in c)


class Palette:
    """1体ぶんの色の組と、色の式（地の色・角・爪・歯・虹彩）。色の名前はこのファイルの定数と同じ（BACK・FLANK・BELLY など）。

    mottle は地のまだらの細かさ（大きなまだら・小さな斑点の、1m あたりの周波数）。
    """

    def __init__(self, mottle=(0.35, 1.3), **colors):
        self.mottle = mottle
        self.__dict__.update(colors)

    def skin_color(self, p, dorsal, belly, lower_leg=0.0, seed=0):
        """胴・首・尾・脚の地の色。dorsal は背の中央ほど 1、belly は腹の板の重み、lower_leg は脚の先ほど 1。"""
        c = mix(self.FLANK, self.BACK, smoothstep(-0.35, 0.45, dorsal))
        c = mix(c, self.BACK_DARK, smoothstep(0.55, 0.95, dorsal) * 0.75)
        # 大きなまだら（2〜3m）と小さな斑点。日の当たる面でも一色の塗装に見せない
        fb, fs = self.mottle
        big = fbm((p[0] * fb, p[1] * fb, p[2] * fb), 3, seed + 3)
        small = fbm((p[0] * fs, p[1] * fs, p[2] * fs), 2, seed + 11)
        c = scale(c, 0.78 + 0.44 * big)
        c = scale(c, 0.9 + 0.2 * smoothstep(0.55, 0.75, small))
        c = mix(c, self.FEET, smoothstep(0.2, 1.0, lower_leg) * 0.7)
        edge = mix(self.BELLY_EDGE, self.BELLY, smoothstep(0.35, 0.8, belly))
        edge = scale(edge, 0.92 + 0.16 * big)
        return mix(c, edge, smoothstep(0.08, 0.6, belly))

    def horn_color(self, t, streak=0.5, tone=1.0):
        """角・背のとげ：根元は皮膚に近い暗さ、中ほどは骨の色、先は暗い。t は根元 0 → 先 1。

        streak（0〜1）は縦の筋の濃さ（角の繊維）、tone は角ごとの明るさの揺らぎ。
        """
        if t < 0.35:
            c = mix(self.HORN_BASE, self.HORN_MID, smoothstep(0.0, 0.35, t))
        else:
            c = mix(self.HORN_MID, self.HORN_TIP, smoothstep(0.45, 1.0, t))
        return scale(c, tone * (0.72 + 0.4 * streak))

    def claw_color(self, t):
        return mix(self.CLAW_BASE, self.CLAW_TIP, smoothstep(0.0, 0.55, t))

    def tooth_color(self, t, stain=0.0):
        """歯：根元は歯茎に近い暗い色、中ほどは象牙色（stain で黄ばみ・汚れ）、先は少し明るい。t は根元 0 → 先 1。"""
        body = mix(self.TOOTH, self.TOOTH_STAIN, 0.75 * stain)
        if t < 0.5:
            return mix(self.TOOTH_ROOT, body, smoothstep(0.0, 0.5, t))
        return mix(body, self.TOOTH_TIP, 0.55 * smoothstep(0.62, 1.0, t) * (1.0 - 0.6 * stain))

    def iris_color(self, rho, streak):
        """虹彩：rho は瞳の軸からの距離（0 が中心、1 が縁）、streak（0〜1）は放射状の筋。"""
        c = mix(self.IRIS_INNER, self.IRIS_OUTER, smoothstep(0.1, 0.7, rho))
        c = scale(c, 0.75 + 0.45 * streak)
        return mix(c, self.IRIS_RIM, smoothstep(0.62, 0.92, rho))


# 紅竜の色の組。下の関数は紅竜の部品（body・head・extras・membrane）がそのまま呼ぶ
DRAGON = Palette(**{k: v for k, v in dict(globals()).items() if k.isupper() and isinstance(v, tuple) and len(v) == 3})


def skin_color(p, dorsal, belly, lower_leg=0.0, seed=0):
    """胴・首・尾・脚の地の色（紅竜）。"""
    return DRAGON.skin_color(p, dorsal, belly, lower_leg, seed)


def horn_color(t, streak=0.5, tone=1.0):
    return DRAGON.horn_color(t, streak, tone)


def claw_color(t):
    return DRAGON.claw_color(t)


def tooth_color(t, stain=0.0):
    return DRAGON.tooth_color(t, stain)


def iris_color(rho, streak):
    return DRAGON.iris_color(rho, streak)
