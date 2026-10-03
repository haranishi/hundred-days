# OWNER: dragon
"""雷翼（らいよく）の設計図：二脚＋大きな翼の翼竜。全長およそ50m・翼を広げて95m。首と尾は細く長く、胴は紅竜より細い。

地上では後ろ脚2本で立ち、畳んだ翼の手首（手首の瘤 wing_pad と爪 wing_claw）を地面に突いて歩く。翼は長い指1本（前縁）と
細い骨の筋2本（wing_f2・wing_f3）で膜を張る。紅竜の4本指の広い翼より細長く、先が後ろへ流れる。
翼の骨（前縁）と背骨に沿って細い発光の筋を持つ（頂点の属性 _EMIT が筋の強さ、_LINE が筋の中心からの距離 m。実行時に青白く光らせる）。
尾の先は水平の刃。頭は細長い鼻先・小さく鋭い歯・後ろへ流れる角4本（長い1対と短い1対）。とさか1本の翼竜の頭にはしない。
r04-roster2：鼻先を丸く止めて鳥のくちばしから離し、歯はまばらな細い針（前ほど前へ倒れて顎の外へ出る）、舌は先の割れた細い舌、
口の中は暗い紫。地上で畳んだ翼は、指を前腕に沿わせて背の高さで後ろへ寝かせ、膜を脇腹へ寄せる（旧＝前腕との間に大きな帆）。

座標は遊びの向き（x 左・y 上・z 前）、原点は胴の中心、立ったときの足の裏は y = GROUND。休みの姿勢は翼を広げた形。
"""
import math
import random
import sys

from mathutils import Quaternion, Vector

from dragonlib import author, creature, paint
from dragonlib.anatomy import FWD, G, LEFT, SIDES, UP, side_point
from dragonlib.author import Pose, bump, lift, qa, roll_right, slerp, ss, tail_up, turn_left
from dragonlib.creature import Limb
from dragonlib.rig import aim
from dragonlib.head import HeadSpec, TeethRow, crest, head_pieces, horn
from dragonlib.membrane import WingWeb, web
from dragonlib.shapes import Curve1D, Piece, bezier, curved_cone, gauss, lerp, smoothstep, sweep

ID = 'raiyoku'
PREFIX = 'raiyoku'
META_KEY = 'creature'
SEED = 11
OUT = 'public/assets/raiyoku.glb'
REPORT = 'tools/blender/raiyoku-report.json'
GROUND = -12.0

# 骨格の図 -------------------------------------------------------------
# 背骨：尾の先 → 頭の付け根。(名前, 点, (横の半径, 縦の半径))。胸は竜骨のように縦に深く、首と尾は細い
SPINE_KEYS = [
    ('tail_tip', (0.0, 0.2, -27.0), (0.10, 0.10)),
    ('tail_10', (0.0, 0.3, -25.0), (0.17, 0.19)),
    ('tail_09', (0.0, 0.4, -22.9), (0.24, 0.27)),
    ('tail_08', (0.0, 0.48, -20.8), (0.32, 0.36)),
    ('tail_07', (0.0, 0.52, -18.7), (0.40, 0.45)),
    ('tail_06', (0.0, 0.5, -16.6), (0.50, 0.56)),
    ('tail_05', (0.0, 0.42, -14.5), (0.62, 0.70)),
    ('tail_04', (0.0, 0.28, -12.4), (0.78, 0.88)),
    ('tail_03', (0.0, 0.08, -10.3), (0.98, 1.10)),
    ('tail_02', (0.0, -0.12, -8.0), (1.28, 1.42)),
    ('hips', (0.0, -0.3, -5.6), (1.72, 1.92)),
    ('waist', (0.0, -0.1, -3.0), (1.68, 2.05)),
    ('belly', (0.0, 0.3, -0.3), (1.92, 2.42)),
    ('chest', (0.0, 1.0, 2.3), (2.20, 2.78)),
    ('withers', (0.0, 2.1, 4.4), (1.92, 2.28)),
    ('neck_base', (0.0, 3.3, 6.3), (1.48, 1.68)),
    ('neck_1', (0.0, 5.0, 7.9), (1.16, 1.30)),
    ('neck_2', (0.0, 6.9, 9.3), (0.96, 1.08)),
    ('neck_3', (0.0, 8.7, 10.8), (0.85, 0.95)),
    ('neck_4', (0.0, 10.1, 12.4), (0.79, 0.88)),
    ('neck_5', (0.0, 11.0, 14.0), (0.77, 0.85)),
    ('head_joint', (0.0, 11.3, 15.6), (0.79, 0.86)),
]
SPINE = {name: p for name, p, _ in SPINE_KEYS}

# 後ろ脚（左）：鳥のように、かかとを上げて指で立つ。膝は前、かかとは後ろ
HIND = {
    'hip': ((2.1, -1.8, -5.2), (1.50, 1.66)),
    'thigh_mid': ((2.45, -3.7, -4.3), (1.22, 1.32)),
    'knee': ((2.7, -5.7, -3.3), (0.84, 0.90)),
    'shin_mid': ((2.8, -7.6, -4.4), (0.64, 0.68)),
    'ankle': ((2.9, -9.5, -5.5), (0.50, 0.50)),
    'ball': ((3.0, -11.4, -4.6), (0.56, 0.36)),
}
HIND_TOES = [((4.25, -11.82, -2.35), 0.17), ((3.05, -11.82, -1.85), 0.18), ((1.85, -11.82, -2.35), 0.17), ((3.1, -11.86, -6.7), 0.14)]

# 翼（左）。広げた形で骨組みを作る。手首の先は手の骨（指の付け根 knuckle まで）。そこから長い指（中ほどの節まで・先まで）と
# 骨の筋2本が出る（畳むと、手の骨は前腕に沿って戻り、指と筋は1束になって脇腹に沿って後ろへ伸びる）
WING = {
    'root': (1.4, 2.8, 3.8),
    'elbow': (6.6, 3.6, 2.2),
    'wrist': (19.2, 4.8, 4.6),
    'knuckle': (25.4, 4.9, 2.9),
    'finger': ((35.8, 4.3, -3.2), (46.6, 3.0, -11.6)),
    'ribs': [((29.6, 4.3, -4.8), (31.8, 3.3, -12.6)), ((24.2, 4.4, -5.4), (20.6, 3.5, -11.4))],
}
# 手首の瘤（地面に突く所）は前腕の延長の 1.3m 先、爪はそこから前へ
_FORE = (Vector(WING['wrist']) - Vector(WING['elbow'])).normalized()
WING['pad'] = tuple(Vector(WING['wrist']) + _FORE * 1.3)
WING['claw'] = tuple(Vector(WING['pad']) + Vector((0.35, -0.3, 1.5)))
# 膜が胴に付く線（肩の後ろ → 脇腹 → 腰の上）
WING_BODY_LINE = [(1.45, 1.55, -0.5), (1.4, 0.55, -3.6), (1.35, 0.35, -5.8)]


def _wing_arm_keys():
    W = WING
    root, elbow, wrist = Vector(W['root']), Vector(W['elbow']), Vector(W['wrist'])
    return [
        ((0.9, 2.3, 4.3), (1.02, 0.92)),
        (W['root'], (0.95, 0.84)),
        (tuple(root.lerp(elbow, 0.42) + Vector((0, 0.3, 0))), (0.80, 0.68)),
        (W['elbow'], (0.60, 0.54)),
        (tuple(elbow.lerp(wrist, 0.45)), (0.54, 0.47)),
        (W['wrist'], (0.56, 0.50)),
        (W['pad'], (0.52, 0.46)),
    ]


LIMBS = [
    Limb('hind', -5.4, [((1.0, -0.6, -5.4), (1.50, 1.60))] + [HIND[k] for k in ('hip', 'thigh_mid', 'knee', 'shin_mid', 'ankle', 'ball')],
         toes=[(tip, r, None if k < 3 else tuple(Vector(HIND['ankle'][0]).lerp(Vector(HIND['ball'][0]), 0.6))) for k, (tip, r) in enumerate(HIND_TOES)]),
    Limb('wingarm', 4.4, _wing_arm_keys()),
]

# 色 -----------------------------------------------------------------
# 背は青みの暗い灰、腹は淡い灰。膜は暗い青灰で、夕日の逆光で青く透ける（透けの色は実行時の材質）
PALETTE = paint.Palette(
    mottle=(0.42, 1.6),
    BACK=(0.036, 0.046, 0.064), BACK_DARK=(0.018, 0.024, 0.034), FLANK=(0.078, 0.090, 0.110),
    BELLY=(0.30, 0.31, 0.32), BELLY_EDGE=(0.12, 0.13, 0.145), FEET=(0.020, 0.023, 0.028), FEET_DIRT=(0.020, 0.019, 0.018),
    MEMBRANE=(0.050, 0.074, 0.120), MEMBRANE_EDGE=(0.018, 0.024, 0.036),
    HORN_BASE=(0.016, 0.019, 0.025), HORN_MID=(0.15, 0.16, 0.175), HORN_TIP=(0.026, 0.030, 0.038),
    CLAW_BASE=(0.20, 0.205, 0.21), CLAW_TIP=(0.018, 0.019, 0.022),
    TOOTH=(0.56, 0.56, 0.53), TOOTH_STAIN=(0.34, 0.33, 0.29), TOOTH_TIP=(0.66, 0.67, 0.66), TOOTH_ROOT=(0.18, 0.10, 0.09),
    # r04-roster2：口の中を紅竜の赤から、青白く光る喉に合う暗い紫に（3体で口の中の色を分ける）
    MOUTH=(0.030, 0.026, 0.060), TONGUE=(0.12, 0.075, 0.19), GUM=(0.075, 0.045, 0.11), PALATE=(0.13, 0.09, 0.2),
    IRIS_INNER=(0.78, 0.92, 1.0), IRIS_OUTER=(0.10, 0.34, 0.80), IRIS_RIM=(0.008, 0.02, 0.045), PUPIL=(0.004, 0.004, 0.006),
    NOSTRIL=(0.005, 0.006, 0.008),
)

# 頭 -----------------------------------------------------------------
HEAD_PITCH = -18.0
HEAD_LENGTH = 5.6
JAW_HINGE = (0.22, -0.8)
JAW_TIP = (5.34, -0.72)
FRAME, POINT = creature.head_axes(SPINE['head_joint'], HEAD_PITCH)


def _features(s, th):
    """断面の張り出し（m）：目の上の眉の稜・眼窩・頬の稜・鼻筋の中央の細い稜・鼻先の両脇の稜・鼻の穴。紅竜より控えめで、細く鋭い。"""
    d = 0.0
    for sign in (1.0, -1.0):
        a = th * sign
        d += 0.36 * gauss(s - 1.05, 0.46) * crest(a - 0.95, 0.4)
        d += 0.16 * gauss(s - 0.35, 0.7) * crest(a - 0.86, 0.26) * smoothstep(1.4, 0.8, s)
        d -= 0.16 * gauss(s - 1.12, 0.32) * gauss(a - 1.32, 0.24)
        d += 0.16 * gauss(s - 0.45, 0.7) * crest(a - 1.78, 0.28)
        d += 0.06 * smoothstep(5.35, 4.0, s) * smoothstep(1.5, 2.5, s) * crest(a - 0.58, 0.16)
        d += 0.08 * gauss(s - 5.1, 0.22) * crest(a - 0.72, 0.24)
    d += 0.08 * smoothstep(5.2, 2.8, s) * smoothstep(0.2, 1.2, s) * crest(th, 0.1)
    d += _rugae(s) * smoothstep(0.62, 0.15, abs(abs(th) - math.pi))
    return d


def _rugae(s):
    wave = max(0.0, math.sin(2 * math.pi * s / 0.4)) ** 2
    return 0.06 * wave * smoothstep(0.45, 1.2, s) * smoothstep(5.1, 4.2, s)


def _head_weights(s):
    w = smoothstep(-0.7, 0.3, s)
    return {'head': w, 'neck_07': 1.0 - w} if w < 1.0 else {'head': 1.0}


def _head_scale(s, th):
    """頭の鱗（m）。r04-roster2：紅竜（上面 0.30〜0.36・頬 0.19）と同じ大きさに見えたので、顔は細かい粒（上面 0.10〜0.15・
    目のまわり 0.06）にして、首の付け根へ向かって背の大きさ（0.2）へ戻す。細い筋の光と合わせて、滑らかな皮に見せる"""
    a = abs(th)
    top = smoothstep(0.8, 0.2, a)
    eye = min(1.0, 1.3 * gauss(s - 1.1, 0.55) * gauss(a - 1.2, 0.45))
    sc = lerp(0.1, 0.15, top)
    return lerp(sc, 0.06, eye) + 0.1 * smoothstep(0.3, -0.7, s)


def _jaw_scale(s, th):
    return lerp(0.08, 0.13, smoothstep(1.6, 2.6, abs(th))) + 0.08 * smoothstep(0.5, -0.4, s)


def _needle_tooth(p, base, down, f, lateral, L, rnd, bone, h):
    """雷翼の歯：細い針。前ほど前へ倒して外へ開き（口を閉じても顎の外へ出て、上下が交互に噛み合う）、奥ほど短く立てる。
    r04-roster2：指摘「歯は同じ円錐が等間隔に並ぶ櫛」 旧＝紅竜と同じ太さの円錐・間隔 0.28〜0.4m → 細い針・間隔 0.36〜0.64m・長さの揺れを大きく"""
    o, fr, _, _ = h.frame()
    s_ = (Vector(base) - Vector(o)).dot(Vector(fr))
    front = smoothstep(3.6, 5.45, s_)
    rake = math.radians(-(6.0 + 42.0 * front) + rnd.gauss(0.0, 5.0))
    splay = math.radians(10.0 + 20.0 * front + rnd.uniform(-5.0, 6.0))
    d = down * math.cos(rake) - f * math.sin(rake)
    d = (d * math.cos(splay) + lateral * math.sin(splay)).normalized()
    stain = rnd.random() ** 1.6
    radius = (h.tooth_radius[0] + h.tooth_radius[1] * L) * rnd.uniform(0.85, 1.15)
    # 先は少し下（歯の根元の向き）へ曲げて、前へ倒した針が鉤になるようにする
    bend = down * (0.1 * L * front) - f * (0.04 * L)
    root = base - d * 0.1
    curved_cone(p, root, base + d * L, radius, bend, 6, 6,
                lambda kk, i, stain=stain: h.palette.tooth_color(kk / 5, stain),
                lambda kk, q, bone=bone: {bone: 1.0}, lambda kk: {'part': paint.PART_TOOTH, 'scale': 0.05},
                flatten=(0.9, 1.0), up_hint=f)


def _forked_tongue(h):
    """雷翼の舌：細く長く、先の3割が2本に割れる。r04-roster2：旧＝紅竜と同じ平らな楔"""
    p = Piece('tongue')
    col = h.palette.TONGUE
    wt = lambda kk, q: {'jaw': 1.0}
    attrs = lambda kk: {'glow': 0.9, 'scale': 0.08}
    mid = lambda s_, left=0.0: Vector(h.point(s_, h.mouth(s_) - 0.2, left))
    body = [mid(0.3 + 3.0 * k / 11) for k in range(12)]
    sweep(p, body, [lerp(0.2, 0.11, k / 11) for k in range(12)], 10, lambda kk, i: col, wt, attrs, flatten=(1.0, 0.45))
    for sign in (1.0, -1.0):
        tine = [mid(3.3 + 1.3 * k / 7, sign * (0.03 + 0.2 * (k / 7) ** 1.3)) for k in range(8)]
        sweep(p, tine, [lerp(0.08, 0.018, k / 7) for k in range(8)], 8, lambda kk, i: col, wt, attrs, flatten=(1.0, 0.6))
    return p


def _horns(seed):
    """角：頭の後ろから後ろへ流れる長い1対と、目の後ろから流れる短い1対（計4本）。どれも細く、先は少し上へ反る。"""
    p = Piece('horns')
    o, f, u, l = FRAME()
    F, U, L = Vector(f), Vector(u), Vector(l)
    hv = lambda ds, du, dl: F * ds + U * du + L * dl
    for side_i, sign in enumerate((1.0, -1.0)):
        rnd = random.Random('raiyoku-horns-%d-%d' % (seed, side_i))
        ls = 1.0 + rnd.uniform(-0.05, 0.05)
        base = Vector(POINT(-0.26, 0.86, 0.5 * sign))
        path = bezier(base - hv(-0.25, 0.25, 0.0), base + hv(-1.9 * ls, 0.5, 0.28 * sign), base + hv(-3.9 * ls, 0.72, 0.52 * sign),
                      base + hv(-5.8 * ls, 1.25, 0.66 * sign), 30)
        horn(p, path, 0.36, 10, rnd, U, 'head', flatten=(0.78, 1.0), tone=rnd.uniform(0.9, 1.05), palette=PALETTE)
        base2 = Vector(POINT(0.48, 0.2, 1.02 * sign))
        path2 = bezier(base2, base2 + hv(-1.1, 0.1, 0.3 * sign), base2 + hv(-2.3, 0.14, 0.52 * sign), base2 + hv(-3.4, 0.38, 0.62 * sign), 18)
        horn(p, path2, 0.22, 8, rnd, U, 'head', tone=rnd.uniform(0.9, 1.05), palette=PALETTE)
        # 頬の後ろのとげ（顎の付け根から後ろ外へ）と、眉の上の小さなとげ
        for s_, up, left, ln in ((0.05, -0.5, 1.12, 1.2), (-0.4, -0.3, 1.02, 0.85)):
            b = Vector(POINT(s_, up, left * sign))
            curved_cone(p, b, b + hv(-ln, -0.05, 0.45 * ln * sign), 0.13 * ln + 0.05, hv(0, 0.08, 0), 7, 5,
                        lambda kk, i: PALETTE.horn_color(0.25 + kk / 5), lambda kk, q: {'head': 1.0},
                        lambda kk, ln=ln: {'part': paint.PART_HORN, 'scale': 0.05, 'along': ln * kk / 4})
        b = Vector(POINT(1.25, 1.12, 0.68 * sign))
        curved_cone(p, b, b + hv(-0.7, 0.3, 0.22 * sign), 0.1, hv(0, 0.05, 0), 6, 5,
                    lambda kk, i: PALETTE.horn_color(0.25 + kk / 5), lambda kk, q: {'head': 1.0},
                    lambda kk: {'part': paint.PART_HORN, 'scale': 0.05, 'along': 0.18 * kk})
    return p


# r04-roster2：指摘「頭が鳥のくちばしに寄っている」。旧＝上面と幅が鼻先へ向かって一本調子に細り、先が尖った点（幅 0.12m）で
# 閉じていた。新＝鼻の穴の上で少し盛り上げ（4.6m）、鼻先は幅 0.18〜0.46m で丸く止め、顎の先も厚くする。歯は顎の外へ出る
HEAD = HeadSpec(
    top=Curve1D([(-0.612, 0.95), (0.0, 1.08), (0.7, 1.18), (1.312, 1.12), (2.012, 0.94), (2.712, 0.76), (3.4, 0.62), (4.05, 0.56), (4.6, 0.59), (5.05, 0.56), (5.38, 0.46), (5.55, 0.32), (5.6, 0.16)]),
    mouth=Curve1D([(-0.612, -0.85), (0.263, -0.8), (1.575, -0.7), (3.062, -0.56), (4.375, -0.47), (5.25, -0.4), (5.6, -0.3)]),
    width=Curve1D([(-0.612, 1.02), (0.175, 1.22), (0.787, 1.32), (1.4, 1.18), (2.012, 0.96), (2.625, 0.76), (3.325, 0.62), (4.2, 0.54), (4.9, 0.52), (5.3, 0.46), (5.52, 0.32), (5.6, 0.18)]),
    jaw_depth=Curve1D([(-0.35, 0.74), (0.35, 0.94), (1.312, 0.87), (2.625, 0.72), (3.938, 0.58), (4.9, 0.5), (5.294, 0.4), (5.469, 0.2)]),
    jaw_width=Curve1D([(-0.35, 0.98), (0.35, 1.16), (1.312, 1.08), (2.275, 0.82), (3.15, 0.6), (4.2, 0.5), (4.9, 0.47), (5.294, 0.38), (5.469, 0.2)]),
    length=HEAD_LENGTH, point=POINT, frame=FRAME, ring=56,
    upper=(-0.62, 6.22, 76), upper_exp=(2.4, 4.0), jaw=(-0.35, 5.82, 48), jaw_exp=(4.4, 2.2),
    tongue=(0.18, 4.0, 14), tongue_width=Curve1D([(0.175, 0.5), (2.012, 0.44), (3.413, 0.32), (4.2, 0.08)]), throat=(-0.26, 2.0, 9),
    features=_features, rugae=_rugae, weights=_head_weights, scale=_head_scale, jaw_scale=_jaw_scale, scale_head=0.15,
    nostril=(5.15, 0.78), eye=(1.12, 0.46, 1.0), eye_radii=(0.36, 0.3, 0.3), eye_facing=(0.8, 0.52, 0.12), pupil=(0.035, 0.24, 0.03), pupil_out=0.28,
    # 歯の長さ（m）：前の2〜3本が長い針（0.9m 前後）で、奥へ行くほど短く、位置ごとに長短を交ぜる（sin の項）
    teeth=TeethRow(lambda s: 0.14 + 0.78 * gauss(s - 5.0, 0.3) + 0.34 * gauss(s - 4.3, 0.22) + 0.2 * gauss(s - 3.2, 0.3) + 0.1 * (0.5 + 0.5 * math.sin(11.0 * s)),
                   lambda s: 0.12 + 0.7 * gauss(s - 5.15, 0.26) + 0.3 * gauss(s - 3.8, 0.25) + 0.1 * (0.5 + 0.5 * math.sin(13.0 * s + 1.0)),
                   (1.2, 0.2), 5.3, (0.36, 0.64), (1.35, 0.1, 0.3), 5.2, (0.38, 0.66), 5.45, (-0.2, -0.07, 0.07, 0.2), (0.5, 0.75)),
    tooth_radius=(0.03, 0.05), tooth_shape=_needle_tooth, tongue_shape=_forked_tongue, horns=_horns, palette=PALETTE,
)


# 骨組み ---------------------------------------------------------------
def bone_table():
    bones = creature.spine_bones(SPINE_KEYS, HEAD, JAW_HINGE, JAW_TIP)
    for suffix, side in SIDES:
        sp = lambda p: side_point(p, side)
        H = {k: sp(v[0]) for k, v in HIND.items()}
        bones += [
            ('thigh_' + suffix, H['hip'], H['knee'], 'pelvis'),
            ('shin_' + suffix, H['knee'], H['ankle'], 'thigh_' + suffix),
            ('foot_' + suffix, H['ankle'], H['ball'], 'shin_' + suffix),
            ('toe_' + suffix, H['ball'], sp(HIND_TOES[1][0]), 'foot_' + suffix),
        ]
        W = {k: sp(v) for k, v in WING.items() if k not in ('finger', 'ribs')}
        mid, tip = sp(WING['finger'][0]), sp(WING['finger'][1])
        bones += [
            ('wing_arm_' + suffix, W['root'], W['elbow'], 'chest'),
            ('wing_fore_' + suffix, W['elbow'], W['wrist'], 'wing_arm_' + suffix),
            ('wing_pad_' + suffix, W['wrist'], W['pad'], 'wing_fore_' + suffix),
            ('wing_claw_' + suffix, W['pad'], W['claw'], 'wing_pad_' + suffix),
            ('wing_hand_' + suffix, W['wrist'], W['knuckle'], 'wing_fore_' + suffix),
            ('wing_f1a_' + suffix, W['knuckle'], mid, 'wing_hand_' + suffix),
            ('wing_f1b_' + suffix, mid, tip, 'wing_f1a_' + suffix),
        ]
        for k, (knuckle, rib_tip) in enumerate(WING['ribs']):
            a, b = 'wing_f%da_%s' % (k + 2, suffix), 'wing_f%db_%s' % (k + 2, suffix)
            bones += [(a, W['knuckle'], sp(knuckle), 'wing_hand_' + suffix), (b, sp(knuckle), sp(rib_tip), a)]
        # 膜の胴の側の骨（r04-roster2）：翼の付け根から腰まで、膜が胴に付く線に沿う。膜の胴の重みはこの骨が持ち、飛ぶ間は胴と
        # 同じに動き、畳むとこの線を軸に回って、胴の重みの分の膜を脇腹へ寄せる（旧＝胴の骨の重みの分だけ、膜の中ほどが
        # 広げた位置に取り残され、畳んだ翼が横へ四角く張り出した）
        bones.append(('wing_web_' + suffix, W['root'], sp(WING_BODY_LINE[-1]), 'spine'))
    return bones


# 自動の重みで肉付けを動かさない骨（指・爪・顎は部品が自分の重みで付く）
NO_DEFORM = ('jaw',) + tuple('%s_%s' % (b, s) for s in 'LR' for b in ('wing_hand', 'wing_f1a', 'wing_f1b', 'wing_f2a', 'wing_f2b', 'wing_f3a', 'wing_f3b', 'wing_claw', 'wing_web'))


# 肉付けの色と属性 -------------------------------------------------------
def _u_of(name):
    pts = [Vector(p) for _, p, _ in SPINE_KEYS]
    seg = [(pts[k] - pts[k - 1]).length for k in range(1, len(pts))]
    names = [n for n, _, _ in SPINE_KEYS]
    return sum(seg[:names.index(name)]) / sum(seg)


NECK_U = _u_of('neck_2')
FWD_G = Vector((0.0, 0.0, 1.0))
UP_G = Vector((0.0, 1.0, 0.0))
LINE_REACH = 0.62  # 筋の強さ（_EMIT）を持たせる、筋の中心からの角度の範囲（cos の下限の目安）


def _lead_stripe(radial, axis, radius):
    """管（翼の腕・指）の前縁の筋：前縁の向きからの角度が小さいほど強く、_LINE は前縁の線からの周に沿った距離（m）。"""
    lead = FWD_G - axis * FWD_G.dot(axis)
    if lead.length < 1e-6 or radial.length < 1e-6:
        return 0.0, 0.0
    lead.normalize()
    r = radial.normalized()
    c = r.dot(lead)
    b = r.dot(axis.cross(lead).normalized())
    return smoothstep(0.15, LINE_REACH, c), radius * math.atan2(b, c)


def painter(pt):
    u, t = pt.u, pt.limb_t
    fade = smoothstep(0.08, 0.3, u) * (1.0 - smoothstep(0.93, 0.985, u))
    belly_s = smoothstep(-0.42, -0.74, pt.dorsal) * fade
    glow_s = smoothstep(NECK_U, 0.99, u) * smoothstep(-0.2, -0.75, pt.dorsal)
    lower = 1.0 if pt.chain == 'toe' else (smoothstep(5.5, 12.0, pt.limb_along) if pt.chain == 'hind' else 0.0)
    dorsal = lerp(pt.dorsal, pt.normal.y, t)
    b = belly_s * (1.0 - t)
    c = PALETTE.skin_color(pt.pos, dorsal, b, lower * t, SEED)
    if pt.chain == 'wingarm':
        c = paint.mix(c, PALETTE.MEMBRANE_EDGE, 0.3 * t)
    sole = smoothstep(GROUND + 1.3, GROUND + 0.05, pt.pos.y)
    c = paint.mix(paint.scale(c, 1.0 - 0.45 * sole), PALETTE.FEET_DIRT, 0.3 * sole)
    # 鱗の大きさ（m）：背の中央は大きく、脇腹と首は細かく、尾の先・脚の先はさらに細かい
    sc_s = lerp(0.16, 0.36, smoothstep(0.05, 0.45, u)) if u < 0.62 else lerp(0.36, 0.2, smoothstep(0.62, 1.0, u))
    sc_s *= lerp(0.72, 1.25, smoothstep(-0.45, 0.85, pt.dorsal))
    sc_l = 0.1 if pt.chain == 'toe' else (lerp(0.24, 0.12, lower) if pt.chain == 'hind' else 0.18)
    # 発光の筋：背の中央（首の付け根から尾の先まで。_LINE は左右の位置 x）と、翼の腕の前縁
    spine_emit = smoothstep(0.55, 0.85, pt.dorsal) * smoothstep(0.015, 0.05, u) * (1.0 - smoothstep(0.93, 0.975, u)) * (1.0 - t)
    emit, line = spine_emit, pt.pos.x
    if pt.chain == 'wingarm' and t > 0.5:
        d = pt.pos - pt.limb_point
        radial = d - pt.limb_dir * d.dot(pt.limb_dir)
        m, line = _lead_stripe(radial, pt.limb_dir, 0.5 * (pt.limb_radius[0] + pt.limb_radius[1]))
        emit = m * smoothstep(0.5, 0.9, t)
    ridge = 0.13 * math.exp(-((1.0 - pt.dorsal) / 0.06) ** 2) * smoothstep(0.06, 0.2, u) * (1.0 - smoothstep(0.9, 0.97, u)) if pt.dorsal > 0.7 else 0.0
    values = {'part': paint.PART_SKIN, 'belly': b, 'glow': glow_s * (1.0 - t), 'along': pt.along, 'scale': lerp(sc_s, sc_l, t), 'emit': emit, 'line': line}
    return c, values, ridge * (1.0 - t)


# 部品 -----------------------------------------------------------------
def _path_frames(path):
    n = len(path)
    return [(path[min(n - 1, k + 1)] - path[max(0, k - 1)]).normalized() for k in range(n)]


def _wing_bones(suffix):
    return {
        'finger': ['wing_hand_' + suffix, 'wing_f1a_' + suffix, 'wing_f1b_' + suffix],
        'ribs': [['wing_f2a_' + suffix, 'wing_f2b_' + suffix], ['wing_f3a_' + suffix, 'wing_f3b_' + suffix]],
    }


def _tube(p, points, radii, bones, blend, emit_scale, col, first_bone=None):
    """翼の指・骨の筋の管：折れ線を細かく刻み、骨の継ぎ目で重みを混ぜ、前縁に発光の筋を持たせる。"""
    path, rad = [], []
    for i in range(len(points) - 1):
        a, b = Vector(points[i]), Vector(points[i + 1])
        n = max(2, int((b - a).length / 1.1))
        for k in range(n):
            path.append(a.lerp(b, k / n))
            rad.append(lerp(radii[i], radii[i + 1], k / n))
    path.append(Vector(points[-1]))
    rad.append(radii[-1])
    weight, _ = creature.weights_along(points, bones, blend)
    cum = [0.0]
    for k in range(1, len(path)):
        cum.append(cum[-1] + (path[k] - path[k - 1]).length)
    tangents = _path_frames(path)

    def wfn(k, q):
        w = weight(cum[k])
        if first_bone and cum[k] < 1.2:
            h = smoothstep(1.2, 0.0, cum[k])
            w = {n: v * (1 - h) for n, v in w.items()}
            w[first_bone] = w.get(first_bone, 0.0) + h
        return w

    def vattrs(k, q, c):
        m, line = _lead_stripe(q - c, tangents[k], rad[k])
        return {'emit': m * emit_scale, 'line': line}

    sweep(p, path, rad, 10, lambda k, i: col, wfn, lambda k: {'part': paint.PART_SKIN, 'scale': 0.1, 'along': cum[k]},
          flatten=(1.0, 0.8), up_hint=Vector((0, 1, 0)), cap_start=True, cap_end=True, vertex_attrs=vattrs)


def wing_tubes():
    p = Piece('wing_bones')
    col = paint.mix(PALETTE.BACK, PALETTE.MEMBRANE_EDGE, 0.5)
    for suffix, side in SIDES:
        sp = lambda q: Vector(side_point(q, side))
        B = _wing_bones(suffix)
        pts = [sp(WING['wrist']), sp(WING['knuckle']), sp(WING['finger'][0]), sp(WING['finger'][1])]
        _tube(p, pts, [0.46, 0.4, 0.26, 0.07], B['finger'], 0.9, 1.0, col, first_bone='wing_fore_' + suffix)
        for k, (knuckle, tip) in enumerate(WING['ribs']):
            _tube(p, [sp(WING['knuckle']), sp(knuckle), sp(tip)], [0.24, 0.17, 0.05], B['ribs'][k], 0.8, 0.7, col, first_bone='wing_hand_' + suffix)
    return p


def _web_body_weights(suffix):
    """膜が胴に付く線に沿った重み：膜の胴の側の骨（wing_web）1本。飛ぶ間は胴の骨と同じに動く（旧＝胸・背・腰を位置で混ぜた。
    飛ぶクリップでは胸・背・腰は動かないので、飛ぶ姿は同じ）。"""
    return lambda v: {'wing_web_' + suffix: 1.0}


# 翼を畳んだとき、膜の胴の側の骨を、付け根と腰を結ぶ線のまわりに回す角度（度。左の翼で正＝膜を下へ）
WEB_FOLD_DEG = 130.0
WEB_FOLD_FROM = 0.55


def wing_membrane(seed):
    p = Piece('membrane', material=1)
    p.recalc = False
    for suffix, side in SIDES:
        sp = lambda q: Vector(side_point(q, side))
        B = _wing_bones(suffix)
        spec = WingWeb(
            [sp(WING['root']), sp(WING['elbow']), sp(WING['wrist']), sp(WING['knuckle'])],
            [[sp(WING['finger'][0]), sp(WING['finger'][1])]] + [[sp(k), sp(t)] for k, t in WING['ribs']],
            [B['finger'][1:]] + B['ribs'],
            [sp(b) for b in WING_BODY_LINE],
            ('wing_arm_' + suffix, 'wing_fore_' + suffix, 'wing_hand_' + suffix), 'wing_hand_' + suffix, _web_body_weights(suffix),
            nu=38, nv=14, nu_body=22, nv_lead=5, scallop=0.16, body_scallop=0.12, lead_reach=1.3, palette=PALETTE,
        )
        web(p, side, suffix, spec, seed)
    return p


def claws():
    p = Piece('claws')
    attrs = lambda kk: {'part': paint.PART_CLAW, 'scale': 0.05}
    for suffix, side in SIDES:
        sp = lambda q: Vector(side_point(q, side))
        ball = sp(HIND['ball'][0])
        heel = sp(HIND['ankle'][0]).lerp(ball, 0.6)
        for k, (tip, r) in enumerate(HIND_TOES):
            start = heel if k == 3 else ball
            t = sp(tip)
            d = t - start
            d.y = 0
            d.normalize()
            L = 0.75 if k == 3 else 1.05
            base = t - d * 0.12 + Vector((0, 0.05, 0))
            curved_cone(p, base, base + d * L + Vector((0, -0.3, 0)), 0.19 if k < 3 else 0.15, Vector((0, 0.14, 0)), 7, 6,
                        lambda kk, ii: PALETTE.claw_color(kk / 5), lambda kk, q, s=suffix: {'toe_' + s: 1.0}, attrs)
        # 手首の爪：瘤の前に2本（歩くときに地面へ掛かる）
        pad = sp(WING['pad'])
        fwd = (sp(WING['claw']) - pad).normalized()
        for off in (-0.28, 0.28):
            base = pad + Vector((off * side, -0.15, 0.2))
            curved_cone(p, base, base + fwd * 1.25 + Vector((0, -0.25, 0)), 0.2, Vector((0, 0.16, 0)), 7, 6,
                        lambda kk, ii: PALETTE.claw_color(kk / 5), lambda kk, q, s=suffix: {'wing_claw_' + s: 1.0}, attrs)
        # 長い指の先の小さな爪
        t = sp(WING['finger'][1])
        d = (t - sp(WING['finger'][0])).normalized()
        curved_cone(p, t - d * 0.2, t + d * 0.6, 0.07, Vector((0, -0.04, 0)), 5, 4,
                    lambda kk, ii: PALETTE.claw_color(kk / 3), lambda kk, q, s=suffix: {'wing_f1b_' + s: 1.0}, attrs)
    return p


def tail_blade():
    """尾の先の水平の刃：細い葉の形。縁に沿って発光の筋を持つ（_LINE は縁からの距離）。"""
    p = Piece('tail_blade')
    base = Vector(SPINE['tail_10'])
    tip_dir = (Vector(SPINE['tail_tip']) - base).normalized()
    length = 5.0
    rings = []
    n, sides = 18, 16
    for k in range(n):
        s = k / (n - 1)
        c = base + tip_dir * (length * s)
        w = 0.25 + 1.05 * math.sin(math.pi * min(1.0, s / 0.82) * 0.5) ** 0.8 * (1.0 - smoothstep(0.55, 1.0, s)) + 0.02
        w = w * (1.0 - smoothstep(0.93, 1.0, s)) + 0.02
        th = lerp(0.2, 0.05, s)
        wt = {'tail_09': 1.0 - smoothstep(0.0, 0.3, s), 'tail_10': smoothstep(0.0, 0.3, s)}
        wt = {kk: v for kk, v in wt.items() if v > 1e-4}
        ring = []
        for i in range(sides):
            a = 2 * math.pi * i / sides
            ca, sa = math.cos(a), math.sin(a)
            # 断面はレンズ形：左右の縁は薄く尖る
            x = w * ca
            y = th * sa * (1.0 - 0.6 * abs(ca) ** 3)
            q = c + Vector((x, y, 0.0))
            rim = abs(ca)
            col = paint.mix(PALETTE.BACK, PALETTE.HORN_MID, 0.25 * rim)
            ring.append(p.add(q, col, wt, part=paint.PART_HORN, scale=0.05, along=length * s, emit=smoothstep(0.55, 0.9, rim), line=w * (1.0 - rim)))
        rings.append(ring)
    for k in range(n - 1):
        a, b = rings[k], rings[k + 1]
        for i in range(sides):
            j = (i + 1) % sides
            p.faces.append((a[i], a[j], b[j], b[i]))
    tip = p.add(base + tip_dir * (length + 0.25), PALETTE.BACK, {'tail_10': 1.0}, part=paint.PART_HORN, scale=0.05, emit=1.0)
    for i in range(sides):
        p.faces.append((rings[-1][i], rings[-1][(i + 1) % sides], tip))
    start = p.add(base - tip_dir * 0.2, PALETTE.BACK, {'tail_09': 1.0}, part=paint.PART_HORN, scale=0.05)
    for i in range(sides):
        p.faces.append((rings[0][(i + 1) % sides], rings[0][i], start))
    return p


def _head_stripe(piece):
    """頭の上面の中央（鼻筋）にも背骨の発光の筋を延ばす：_LINE は左右の位置 x、_EMIT は上面の中央ほど強い。"""
    o, f, u, _ = FRAME()
    O, F, U = Vector(o), Vector(f), Vector(u)
    emit, line = [], []
    for v in piece.verts:
        d = v - O
        s_, up = d.dot(F), d.dot(U)
        top = up / max(0.05, HEAD.top(s_))
        emit.append(smoothstep(0.62, 0.92, top) * smoothstep(-0.4, 0.6, s_) * (1.0 - smoothstep(3.8, 4.7, s_)))
        line.append(v.x)
    piece.attrs['emit'] = emit
    piece.attrs['line'] = line
    return piece


def parts(ctx):
    pieces = head_pieces(ctx.total, ctx.seed, HEAD)
    _head_stripe(pieces[0])
    return pieces + [wing_tubes(), wing_membrane(ctx.seed), claws(), tail_blade()]


# 動き -----------------------------------------------------------------
# 足の順と着く位相（紅竜と同じ：後ろ左 → 前左 → 後ろ右 → 前右）。前脚は翼の腕（上腕・前腕・手首の瘤）で、爪が指の骨
FEET = [
    ('HL', 0.0, ['thigh_L', 'shin_L', 'foot_L'], 'toe_L', 1),
    ('FL', 0.25, ['wing_arm_L', 'wing_fore_L', 'wing_pad_L'], 'wing_claw_L', 1),
    ('HR', 0.5, ['thigh_R', 'shin_R', 'foot_R'], 'toe_R', -1),
    ('FR', 0.75, ['wing_arm_R', 'wing_fore_R', 'wing_pad_R'], 'wing_claw_R', -1),
]
NECK = ['neck_%02d' % i for i in range(1, 8)]
TAIL = ['tail_%02d' % i for i in range(1, 11)]
# 地上は遅い（CHARACTERS.md）。歩きは紅竜の 9.4m/s に対して約 6m/s。走りは前後の脚をそろえて跳ねる（両の手首 → 両の脚）
GAITS = {
    'walk': {'cycle': 1.8, 'stride': 11.0, 'duty': 0.64, 'lift': (1.3, 1.9), 'ahead': 0.52, 'heel': 26.0},
    'run': {'cycle': 1.2, 'stride': 17.0, 'duty': 0.42, 'lift': (2.2, 2.8), 'ahead': 0.5, 'heel': 30.0,
            'touch': {'HL': 0.0, 'HR': 0.08, 'FL': 0.5, 'FR': 0.58}},
}
# 立ったときの手首の瘤（地面に突く所）：肩の前の外。瘤は真下、爪は前の下へ
STANCE_WRIST = (5.6, GROUND + 0.5, 8.8)
STANCE = {
    foot: (G(STANCE_WRIST[0] * side, STANCE_WRIST[1], STANCE_WRIST[2]), G(0.05 * side, -1.0, 0.12).normalized(), G(0.12 * side, -0.3, 1.0).normalized())
    for foot, side in (('FL', 1), ('FR', -1))
}
# 飛ぶときの脚：尾の付け根の下へ後ろ向きに流す（鳥と同じ）。前脚（翼）は畳まない
TUCK = {'H': ((2.4, -2.4, -13.2), (0.0, 0.25, -1.0), (0.0, 0.1, -1.0)), 'F': ((5.0, 0.0, 6.0), (0.0, -1.0, 0.0), (0.0, 0.0, 1.0))}
STAND_PITCH = 8.0

CLIPS = {
    'idle': {'duration': 4.0, 'loop': True},
    'walk': {'duration': GAITS['walk']['cycle'], 'loop': True},
    'run': {'duration': GAITS['run']['cycle'], 'loop': True},
    'takeoff': {'duration': 1.4, 'loop': False, 'marks': {'crouch': [0.0, 0.3], 'leap': [0.3, 1.4]}},
    'fly': {'duration': 1.0, 'loop': True},
    'glide': {'duration': 3.0, 'loop': True},
    'dive': {'duration': 1.2, 'loop': True},
    'land': {'duration': 1.3, 'loop': False},
    'breath': {'duration': 2.2, 'loop': False, 'marks': {'charge': [0.0, 0.3], 'thrust': [0.3, 0.6], 'loop': [0.6, 2.2]}},
    'claw': {'duration': 0.9, 'loop': False, 'marks': {'windup': [0.0, 0.3], 'active': [0.3, 0.45], 'recovery': [0.45, 0.9]}},
    'tail': {'duration': 1.0, 'loop': False, 'marks': {'windup': [0.0, 0.3], 'active': [0.3, 0.52], 'recovery': [0.52, 1.0]}},
    'roar': {'duration': 1.8, 'loop': False, 'marks': {'windup': [0.0, 0.5], 'active': [0.5, 0.65], 'recovery': [0.65, 1.8]}},
}

FINGERS = ('wing_hand', 'wing_f1a', 'wing_f1b', 'wing_f2a', 'wing_f2b', 'wing_f3a', 'wing_f3b')


class Author(author.Author):
    """雷翼の道具：共通の道具に、翼を畳んだ形（立ったときの腕の IK の上で、指を前腕に沿って肘の上まで上げ、先を背の高さで後ろへ
    寝かせる。膜の胴の側の骨 wing_web は、膜が胴に付く線を軸に脇腹へ回す）と翼の動かし方を足す。"""

    def __init__(self, arm):
        super().__init__(arm, FEET, NECK, TAIL, GAITS, TUCK, stance=STANCE)
        self.fold = {}
        self._fold_wings()

    def _fold_wings(self):
        r = self.rig
        pose = Pose()
        pose.rot('body', lift(STAND_PITCH))
        for foot, *_ in FEET:
            self.planted(pose, foot)
        self.solve(pose)
        W = r.fk(pose.D, pose.offset)
        for suffix, side in SIDES:
            x = float(side)
            for b in ('wing_arm_', 'wing_fore_', 'wing_pad_', 'wing_claw_'):
                self.fold[b + suffix] = pose.D[b + suffix]
            qf = W['wing_fore_' + suffix][0]
            elbow = r.apply(W, 'wing_fore_' + suffix, r.head['wing_fore_' + suffix])
            wrist = r.apply(W, 'wing_fore_' + suffix, r.tail['wing_fore_' + suffix])
            back = (elbow - wrist).normalized()
            d_hand = (back + UP * 0.25 + LEFT * (0.1 * x)).normalized()
            hand, qh = aim(r, qf, 'wing_hand_' + suffix, d_hand)
            self.fold['wing_hand_' + suffix] = hand
            # r04-roster2：指摘「地上で畳んだ翼が1枚の大きな暗い帆に見える」。旧＝指と骨の筋を指の付け根（前腕の中ほど）から
            # 脇腹に沿って後ろ上へ伸ばし、前腕との間の膜が地面まで垂れる三角の帆になっていた（先は腰の上に刃のように立つ）。
            # 新＝指と骨の筋の付け根側の骨は前腕に沿って肘の上まで上げ（前腕との間の膜は細い V に畳まれる）、先の側の骨は
            # 背の高さで脇腹に沿って後ろへ寝かせる。3本は前腕から外へ少しずつずらして重ねない
            FOLD_A = {'wing_f1a': (0.2, 0.1), 'wing_f2a': (0.13, 0.2), 'wing_f3a': (0.07, 0.3)}
            FOLD_B = {'wing_f1b': (0.05, -0.06), 'wing_f2b': (0.02, -0.1), 'wing_f3b': (0.0, -0.13)}
            for a_name, b_name in (('wing_f1a', 'wing_f1b'), ('wing_f2a', 'wing_f2b'), ('wing_f3a', 'wing_f3b')):
                out_a, rear_a = FOLD_A[a_name]
                out_b, down_b = FOLD_B[b_name]
                da, qa_ = aim(r, qh, a_name + '_' + suffix, (back + UP * 0.1 + LEFT * (out_a * x) - FWD * rear_a).normalized())
                db, _ = aim(r, qa_, b_name + '_' + suffix, (-FWD + UP * down_b + LEFT * (out_b * x)).normalized())
                self.fold[a_name + '_' + suffix] = da
                self.fold[b_name + '_' + suffix] = db
            # 膜の胴の側の骨：付け根と腰を結ぶ線（骨の向き）のまわりに回す
            self.fold['wing_web_' + suffix] = Quaternion(r.rest_dir('wing_web_' + suffix), math.radians(WEB_FOLD_DEG * x))

    def wing(self, pose, fold=1.0, flap=0.0, sweep=0.0, pron=0.0, flex=0.0, ffold=0.0, tip=0.0, spread=0.0, sides='LR'):
        """翼の姿勢。fold 1 で畳む（地上の形）・0 で広げる。flap は上げ（度）、sweep は前へ、pron は前縁を下げる、flex は肘を畳む、
        ffold は指と骨の筋を後ろへ畳む、tip は長い指の先の反り（下が正）、spread は骨の筋を開く。sides で片側だけ動かせる。"""
        for suffix, side in SIDES:
            if suffix not in sides:
                continue
            F = self.fold
            s = float(side)
            pose.D['wing_arm_' + suffix] = qa(FWD, s * flap) @ qa(UP, -s * sweep) @ qa(LEFT, pron) @ slerp(F['wing_arm_' + suffix], fold)
            pose.D['wing_fore_' + suffix] = qa(UP, -s * flex) @ slerp(F['wing_fore_' + suffix], fold)
            pose.D['wing_pad_' + suffix] = slerp(F['wing_pad_' + suffix], fold)
            # 膜の胴の側は、ほとんど畳みきってから回す（翼を半ば広げる打ち据え・咆哮・飛び立ちの途中では、膜を広げたままにする）
            pose.D['wing_web_' + suffix] = slerp(F['wing_web_' + suffix], ss(WEB_FOLD_FROM, 1.0, fold))
            pose.D['wing_claw_' + suffix] = slerp(F['wing_claw_' + suffix], fold)
            pose.D['wing_hand_' + suffix] = qa(UP, s * 0.35 * ffold) @ slerp(F['wing_hand_' + suffix], fold)
            pose.D['wing_f1a_' + suffix] = qa(UP, s * 0.5 * ffold) @ slerp(F['wing_f1a_' + suffix], fold)
            pose.D['wing_f1b_' + suffix] = qa(FWD, -s * tip) @ slerp(F['wing_f1b_' + suffix], fold)
            for k, rib in enumerate(('wing_f2', 'wing_f3')):
                pose.D[rib + 'a_' + suffix] = qa(UP, s * ((0.7 + 0.2 * k) * ffold - (1.0 - k) * spread)) @ slerp(F[rib + 'a_' + suffix], fold)
                pose.D[rib + 'b_' + suffix] = qa(FWD, -s * tip * (0.6 - 0.2 * k)) @ slerp(F[rib + 'b_' + suffix], fold)

    def stand(self, pose, weight=None, skip=()):
        for foot, *_ in FEET:
            if foot not in skip:
                self.planted(pose, foot, weight=weight if foot[0] == 'F' else None)

    def airborne(self, pose, tuck=1.0):
        for foot, *_ in FEET:
            if foot[0] == 'F':
                self.free(pose, foot)
            else:
                self.tucked(pose, foot, tuck)


def make_author(arm):
    return Author(arm)


def _front(A, p, weight):
    """前脚（翼の手首）：weight で IK を効かせる。0 なら翼の形のまま（地面から離す）。"""
    for foot in ('FL', 'FR'):
        if weight >= 1.0:
            A.planted(p, foot)
        elif weight > 1e-3:
            A.planted(p, foot, weight=weight)
        else:
            A.free(p, foot)


def clip_idle(A, t):
    p = Pose()
    ph = t / CLIPS['idle']['duration']
    w = 2 * math.pi * ph
    breath = math.sin(w * 2)
    p.offset = UP * (0.08 * breath) + LEFT * (0.12 * math.sin(w))
    p.rot('body', lift(STAND_PITCH + 0.6 * breath) @ roll_right(0.6 * math.sin(w)))
    p.rot('chest', lift(0.8 * breath))
    look = 10.0 * math.sin(w) + 3.0 * math.sin(3 * w + 0.7)
    A.neck_curve(p, [-6, -4, 1, 4, 3, -3, -8], yaw=look)
    p.rot('head', lift(-6 + 2.0 * math.sin(w + 1.1)) @ roll_right(2.0 * math.sin(w + 0.4)))
    p.rot('jaw', qa(LEFT, 1.2 + 0.8 * max(0.0, breath)))
    A.tail_wave(p, 2.0, ph, lift_deg=2.0)
    A.wing(p, fold=1.0, ffold=1.5 * breath)
    A.stand(p)
    return A.solve(p)


def _gait_body(A, p, ph, run):
    w = 2 * math.pi * ph
    if run:
        # 跳ねる走り：手首が着く（位相 0.5）と前が沈み、脚が着く（0）と後ろが沈む
        p.offset = UP * (0.55 * math.cos(4 * math.pi * (ph - 0.1)) - 0.7) + FWD * (0.4 * math.sin(w))
        p.rot('body', lift(STAND_PITCH - 3.0 + 4.5 * math.sin(w - 0.6)))
    else:
        bob = 0.24 * math.cos(4 * math.pi * (ph - 0.08))
        p.offset = UP * (bob - 0.22) + LEFT * (0.32 * math.sin(w))
        p.rot('body', lift(STAND_PITCH - 1.0) @ roll_right(2.2 * math.sin(w + 0.3)) @ turn_left(1.6 * math.sin(w)))
    p.rot('pelvis', turn_left(3.5 * math.sin(w + math.pi / 2)) @ roll_right((1.0 if run else 2.5) * math.sin(w)))
    p.rot('chest', turn_left(-3.0 * math.sin(w - math.pi / 2)) @ roll_right(-2.5 * math.sin(w + 0.5)))


def clip_walk(A, t):
    p = Pose()
    ph = t / CLIPS['walk']['duration']
    _gait_body(A, p, ph, False)
    A.neck_curve(p, [-6, -4, 0, 3, 2, -2, -6], yaw=3.0 * math.sin(2 * math.pi * ph))
    p.rot('neck_01', lift(2.0 * math.cos(4 * math.pi * ph)))
    p.rot('head', lift(-6 - 2.0 * math.cos(4 * math.pi * ph)))
    A.tail_wave(p, 2.6, ph, lift_deg=2.5)
    A.wing(p, fold=1.0, ffold=2.0 * math.cos(4 * math.pi * ph))
    A.gait_feet(p, 'walk', ph)
    return A.solve(p)


def clip_run(A, t):
    p = Pose()
    ph = t / CLIPS['run']['duration']
    _gait_body(A, p, ph, True)
    A.neck_curve(p, [-12, -9, -4, 0, 3, 3, 1], yaw=1.5 * math.sin(2 * math.pi * ph))
    p.rot('neck_01', lift(4.0 * math.cos(2 * math.pi * ph + 0.4)))
    p.rot('head', lift(-4.0 - 3.0 * math.cos(2 * math.pi * ph + 0.4)))
    A.tail_wave(p, 1.4, ph, lift_deg=5.0)
    A.wing(p, fold=1.0, ffold=4.0 * math.cos(2 * math.pi * ph), flap=3.0 * math.sin(2 * math.pi * ph))
    A.gait_feet(p, 'run', ph)
    return A.solve(p)


def flap_angles(ph):
    """羽ばたきの1周（位相 0 が振り上げの頂点）。紅竜より深く速い。"""
    w = 2 * math.pi * ph
    flap = 46.0 * math.cos(w) + 4.0
    sweep = 8.0 * math.sin(w)
    pron = 10.0 * math.sin(w)
    up = bump(ph, 0.5, 1.02) + bump(ph, -0.02, 0.06)
    return flap, sweep, pron, 22.0 * up, 26.0 * up, 14.0 * math.sin(w - 0.9)


AIR_NECK = [-13, -12, -9, -5, 1, 6, 9]


def clip_fly(A, t):
    p = Pose()
    ph = t / CLIPS['fly']['duration']
    w = 2 * math.pi * ph
    flap, sweep, pron, flex, ffold, tip = flap_angles(ph)
    p.offset = UP * (0.8 * math.sin(w - 0.9))
    p.rot('body', lift(-2.0 + 2.0 * math.sin(w - 0.9)))
    A.neck_curve(p, AIR_NECK, yaw=1.0 * math.sin(w))
    p.rot('neck_01', lift(-2.5 * math.sin(w - 0.9)))
    p.rot('head', lift(-2.0 + 1.5 * math.sin(w - 0.4)))
    A.tail_wave(p, 1.0, ph, lift_deg=4.0, lag=0.4)
    for b in TAIL[:4]:
        p.rot(b, tail_up(1.5 * math.sin(w - 1.8)))
    A.wing(p, fold=0.0, flap=flap, sweep=sweep, pron=pron, flex=flex, ffold=ffold, tip=tip)
    A.airborne(p)
    return A.solve(p)


def clip_glide(A, t):
    p = Pose()
    ph = t / CLIPS['glide']['duration']
    w = 2 * math.pi * ph
    p.offset = UP * (0.25 * math.sin(w))
    p.rot('body', lift(-1.0 + 0.8 * math.sin(w)))
    A.neck_curve(p, AIR_NECK, yaw=1.5 * math.sin(w))
    p.rot('head', lift(-2.0 + 2.0 * math.sin(w + 0.5)))
    A.tail_wave(p, 1.2, ph, lift_deg=4.0)
    A.wing(p, fold=0.0, flap=6.0 + 2.0 * math.sin(w), tip=2.0 * math.sin(w - 0.6), sweep=-3.0 + 1.5 * math.sin(w + 1.0), pron=2.0)
    A.airborne(p)
    return A.solve(p)


def clip_dive(A, t):
    """急降下：翼を後ろへ引き、肘と指を畳んだ隼の形。首はまっすぐ前へ。"""
    p = Pose()
    ph = t / CLIPS['dive']['duration']
    flutter = math.sin(2 * math.pi * ph * 6.0)
    p.rot('body', lift(-3.0))
    A.neck_curve(p, [-15, -14, -11, -7, -3, 1, 3])
    p.rot('head', lift(-5.0))
    A.tail_wave(p, 0.6, ph, lift_deg=6.0, freq=2.0)
    A.wing(p, fold=0.0, flap=-6.0 + 1.5 * flutter, sweep=-52.0, flex=58.0, ffold=48.0, tip=2.0 * flutter, pron=6.0)
    A.airborne(p)
    return A.solve(p)


def clip_takeoff(A, t):
    """飛び立ち：屈む（〜0.3）→ 両の手首と脚で地面を突き放す（〜0.62）→ 翼を広げて打ち下ろす。"""
    p = Pose()
    crouch = ss(0.0, 0.3, t) * (1 - ss(0.3, 0.52, t))
    leap = ss(0.3, 0.62, t)
    # 翼を振り下ろす前に跳び上がって、翼の先が地面を打たないようにする（その場で見ても、遊びの側が胴を持ち上げても同じ形）
    p.offset = UP * (-1.8 * crouch + 5.5 * leap + 3.0 * ss(0.62, 1.2, t)) + FWD * (1.2 * leap)
    p.rot('body', lift(STAND_PITCH * (1 - leap) - 5.0 * crouch + 6.0 * bump(t, 0.3, 0.9) - 1.0 * leap))
    A.neck_curve(p, [-6 - 8 * leap + 5 * crouch, -4 - 7 * leap, 1 - 8 * leap, 4 - 8 * leap, 3 - 1 * leap, -3 + 8 * leap, -8 + 16 * leap])
    p.rot('head', lift(-6.0 + 4.0 * leap))
    A.tail_wave(p, 1.0, t / 1.4, lift_deg=2.0 + 4.0 * leap)
    fold = 1.0 - ss(0.22, 0.58, t)
    # 1回目の打ち下ろしは浅く（地面が近い）、2回目で深く
    if t < 0.45:
        flap = 44.0 * ss(0.2, 0.45, t)
    elif t < 0.72:
        flap = 44.0 - 60.0 * ss(0.45, 0.72, t)
    elif t < 1.02:
        flap = -16.0 + 62.0 * ss(0.72, 1.02, t)
    else:
        flap = 46.0 - 72.0 * ss(1.02, 1.4, t)
    up = bump(t, 0.72, 1.04)
    A.wing(p, fold=fold, flap=flap, flex=22.0 * up, ffold=24.0 * up, tip=-6.0 * up)
    _front(A, p, 1.0 - ss(0.4, 0.6, t))
    for foot in ('HL', 'HR'):
        if t < 0.55:
            A.planted(p, foot, heel=24.0 * leap)
        else:
            A.tucked(p, foot, ss(0.55, 1.15, t), from_ground=True)
    return A.solve(p)


def clip_land(A, t):
    """着地：翼を立てて減速し、脚で受け、少し遅れて手首を突き、翼を畳む。"""
    p = Pose()
    impact = bump(t, -0.12, 0.36)
    settle = ss(0.2, 1.1, t)
    bounce = 0.3 * math.sin(math.pi * ss(0.3, 0.9, t)) * (1 - ss(0.9, 1.3, t))
    p.offset = UP * (-2.0 * impact + bounce)
    p.rot('body', lift(STAND_PITCH * settle + 10.0 * (1 - ss(0.0, 0.3, t)) - 3.0 * impact))
    A.neck_curve(p, [-6 * settle - 10 * impact, -4 * settle - 5 * impact, settle - 2 * impact, 4 * settle, 3 * settle + 4 * impact, -3 * settle + 5 * impact, -8 * settle + 4 * impact])
    p.rot('head', lift(-6.0 * settle + 4.0 * impact))
    A.tail_wave(p, 1.2 * (1 - settle), t / 1.3, lift_profile=[(-5.0 * impact + 3.0 * settle) * (1 - 0.06 * i) for i in range(10)])
    flap = 42.0 * (1 - ss(0.0, 0.2, t)) - 14.0 * bump(t, 0.05, 0.42) + 6.0 * settle * (1 - ss(0.7, 1.3, t))
    A.wing(p, fold=ss(0.22, 1.2, t), flap=flap, sweep=12.0 * (1 - settle), ffold=10.0 * bump(t, 0.3, 1.0))
    _front(A, p, ss(0.18, 0.5, t))
    A.planted(p, 'HL')
    A.planted(p, 'HR')
    return A.solve(p)


def clip_breath(A, t):
    """雷の息：首を引いて溜め（〜0.3）、頭を前へ突き出して口を大きく開け（〜0.6）、放っている間は小刻みに震える。"""
    p = Pose()
    charge = ss(0.0, 0.3, t) * (1 - ss(0.3, 0.55, t))
    thrust = ss(0.3, 0.6, t)
    loop = (t - 0.6) / 1.6 if t > 0.6 else 0.0
    crackle = (0.6 * math.sin(2 * math.pi * loop * 11.0) + 0.4 * math.sin(2 * math.pi * loop * 17.0 + 1.0)) * thrust
    sweep = math.sin(2 * math.pi * loop) * ss(0.6, 0.9, t)
    p.offset = UP * (0.4 * charge - 0.2 * thrust) + FWD * (-0.5 * charge + 0.8 * thrust)
    p.rot('body', lift(STAND_PITCH + 2.0 * charge - 3.0 * thrust))
    lifts = [-6 + 10 * charge - 10 * thrust, -4 + 8 * charge - 8 * thrust, 1 + 4 * charge - 5 * thrust, 4, 3 - 4 * charge + 3 * thrust,
             -3 - 6 * charge + 6 * thrust, -8 - 4 * charge + 8 * thrust]
    A.neck_curve(p, lifts, yaw=5.0 * sweep)
    p.rot('head', lift(-6.0 + 6.0 * charge - 8.0 * thrust + 1.5 * crackle) @ roll_right(1.2 * crackle))
    p.rot('jaw', qa(LEFT, 6.0 * charge + 38.0 * thrust + 3.0 * crackle))
    A.tail_wave(p, 1.6, t / 2.2, lift_deg=2.0 + 4.0 * thrust)
    A.wing(p, fold=1.0, ffold=-10.0 * ss(0.0, 0.4, t) + 2.0 * crackle, spread=6.0 * thrust)
    A.stand(p)
    return A.solve(p)


def clip_claw(A, t):
    """翼の打ち据え：右の翼を半ば広げて高く振り上げ（〜0.3）、前の地面へ叩きつけ（〜0.45）、畳んで戻す。"""
    p = Pose()
    wind = ss(0.0, 0.3, t) * (1 - ss(0.3, 0.4, t))
    strike = ss(0.28, 0.45, t) * (1 - ss(0.5, 0.9, t))
    p.offset = UP * (0.6 * wind - 0.6 * strike) + FWD * (-0.4 * wind + 1.2 * strike)
    p.rot('body', lift(STAND_PITCH + 4.0 * wind - 6.0 * strike) @ turn_left(-5.0 * wind + 8.0 * strike) @ roll_right(-4.0 * wind + 5.0 * strike))
    A.neck_curve(p, [-6 + 4 * wind - 5 * strike, -4 + 3 * wind - 3 * strike, 1, 4, 3, -3, -8], yaw=-8.0 * wind + 12.0 * strike)
    p.rot('jaw', qa(LEFT, 6.0 * wind + 14.0 * strike))
    A.tail_wave(p, 1.5, t / 0.9, lift_deg=2.0 + 3.0 * wind)
    A.wing(p, fold=1.0, sides='L')
    A.wing(p, fold=1.0 - 0.6 * wind - 0.35 * strike, flap=60.0 * wind - 20.0 * strike, sweep=-10.0 * wind + 25.0 * strike, pron=-10.0 * wind + 15.0 * strike, sides='R')
    A.planted(p, 'HL')
    A.planted(p, 'HR')
    A.planted(p, 'FL')
    hold = 1.0 - ss(0.0, 0.16, t) + ss(0.38, 0.46, t) * (1 - ss(0.62, 0.9, t)) + ss(0.62, 0.9, t)
    if hold > 1e-3:
        A.planted(p, 'FR', dz=5.0 * strike, dx=-1.5 * strike, weight=min(1.0, hold))
    else:
        A.free(p, 'FR')
    return A.solve(p)


def clip_tail(A, t):
    """尾の鞭：左へ巻いて（〜0.3）、付け根から先へ波を送って右へ振り抜き（先が遅れて鋭く返る）、揺れて落ち着く。"""
    p = Pose()
    wind = ss(0.0, 0.3, t)
    settle = ss(0.55, 1.0, t)
    whip = ss(0.3, 0.52, t)
    for i, b in enumerate(TAIL):
        k = (i + 1) / 10.0
        lag = ss(0.3 + 0.022 * i, 0.46 + 0.03 * i, t) if t > 0.3 else 0.0
        s_i = 1.0 * wind - 2.1 * lag + 1.1 * settle
        crack = 0.35 * math.sin(2 * math.pi * 2.2 * (t - 0.5)) * (1 - settle) * ss(0.5, 0.6, t) * k
        amp = 11.0 * (0.35 + 0.8 * k)
        p.rot(b, turn_left(-amp * (s_i + crack)) @ tail_up(3.5 * (1 - 0.08 * i) * wind * (1 - settle) + 1.5))
    side = 1.0 * wind - 2.0 * whip + 1.0 * settle
    p.rot('pelvis', turn_left(9.0 * side))
    p.rot('body', lift(STAND_PITCH) @ turn_left(-4.0 * side) @ roll_right(3.0 * side))
    p.rot('chest', turn_left(-4.0 * side))
    A.neck_curve(p, [-6, -4, 1, 4, 3, -3, -8], yaw=12.0 * side)
    A.wing(p, fold=1.0, ffold=4.0 * bump(t, 0.2, 0.8))
    A.stand(p)
    return A.solve(p)


def clip_roar(A, t):
    """咆哮：後ろ脚で立ち上がり、翼を半ば広げて見せ、頭を上げて口を大きく開ける。戻りで手首を地面に下ろす。"""
    p = Pose()
    rear = ss(0.0, 0.5, t) * (1 - ss(1.1, 1.7, t))
    roar = ss(0.46, 0.6, t) * (1 - ss(1.2, 1.6, t))
    tremble = math.sin(2 * math.pi * 9.0 * t) * roar
    p.offset = UP * (1.8 * rear) + FWD * (-1.0 * rear)
    p.rot('body', lift(STAND_PITCH + 16.0 * rear))
    lifts = [-6 + 6 * rear, -4 + 4 * rear, 1 + 2 * rear - 3 * roar, 4 - 2 * rear, 3 + 4 * roar, -3 + 6 * roar, -8 + 8 * roar]
    A.neck_curve(p, lifts, yaw=2.0 * tremble)
    p.rot('head', lift(-6.0 + 14.0 * roar + 1.2 * tremble))
    p.rot('jaw', qa(LEFT, 8.0 * rear + 46.0 * roar + 3.0 * tremble))
    A.tail_wave(p, 2.0, t / 1.8, lift_deg=2.0 + 6.0 * roar)
    A.wing(p, fold=1.0 - 0.7 * rear, flap=36.0 * rear + 2.5 * tremble, spread=5.0 * roar, sweep=6.0 * rear)
    _front(A, p, 1.0 - ss(0.1, 0.4, t) + ss(1.25, 1.75, t))
    A.planted(p, 'HL')
    A.planted(p, 'HR')
    return A.solve(p)


BUILDERS = {
    'idle': clip_idle, 'walk': clip_walk, 'run': clip_run, 'takeoff': clip_takeoff, 'fly': clip_fly, 'glide': clip_glide,
    'dive': clip_dive, 'land': clip_land, 'breath': clip_breath, 'claw': clip_claw, 'tail': clip_tail, 'roar': clip_roar,
}


def reference_points():
    """実行時が使う目印（遊びの向きの座標）：鼻先・顎の先・口の中（上顎側と下顎側）。"""
    r = lambda q: [round(c, 4) for c in q]
    m = HEAD.mouth
    return {
        'snout': {'bone': 'head', 'pos': r(POINT(HEAD_LENGTH, 0.0))},
        'jawTip': {'bone': 'jaw', 'pos': r(POINT(*JAW_TIP))},
        'mouthUpper': {'bone': 'head', 'pos': r(POINT(4.9, m(4.9) - 0.05))},
        'mouthLower': {'bone': 'jaw', 'pos': r(POINT(4.72, m(4.72) - 0.18))},
    }


def chains():
    return {
        'neck': NECK, 'tail': TAIL, 'head': 'head', 'jaw': 'jaw',
        'wingTips': ['wing_f%db_%s' % (k, s) for k in (1, 2, 3) for s in 'LR'],
    }


def author_clips(arm):
    return creature.author_clips(sys.modules[__name__], arm)


def metadata(clips):
    return creature.metadata(sys.modules[__name__], clips)


# 形の確認の向き（Blender の座標）
PREVIEW = {
    'side': (G(110, 6, -3), G(0, 2, -3), 38),
    'front': (G(0, 8, 115), G(0, 3, 0), 50),
    'top': (G(0, 125, -3), G(0, 0, -3), 50),
    'three_quarter': (G(62, 30, 70), G(0, 3, -3), 48),
    'head': (G(11, 13.5, 26), G(0, 10.4, 18.2), 30),
    'head_side': (G(14, 10.8, 18.5), G(0, 10.4, 18.2), 30),
}
CLIP_VIEW = (G(75, 20, 50), G(0, 2, -3), 55)


def build(args):
    return creature.build(sys.modules[__name__], args)
