# OWNER: dragon
"""焔角（ほむらづの）の設計図：翼のない重い四脚。全長およそ55m・肩の高さ22m前後。脚は太く短く、胸が広い。

紅竜より明らかに重く見える比にする（胸の断面は紅竜の約2.8倍）。背と肩には岩の板を別の部品として重ねる（とげだらけの
甲羅にはしない。低く平たい板を瓦のように重ね、後ろの縁を少し持ち上げる。r04-roster2 で、板は腰の後ろ〜き甲だけに縮め、
薄く短くし、背骨の上に一列に並べない）。板の隙間と割れ目から溶岩が光る（頂点の属性 _EMIT が溶岩の強さ。実行時に橙から
赤へ脈打たせる）。尾は短く太く、先に岩の塊（尾の鎚）。頭は大きく前へ曲がる角が1対と鼻先の小さな角、厚い顎。
歯は太く短い杭と下顎の牙、舌は厚く丸く、顔は大きな岩の板の境目が溶岩で光る（紅竜・雷翼と頭を分ける）。
色は玄武岩のような暗い灰と、割れ目の橙。

座標は遊びの向き（x 左・y 上・z 前）、原点は胴の中心、立ったときの足の裏は y = GROUND。
"""
import math
import random
import sys

from mathutils import Vector

from dragonlib import author, creature, paint
from dragonlib.anatomy import FWD, G, LEFT, SIDES, UP, side_point
from dragonlib.author import Pose, bump, lift, qa, roll_right, ss, tail_up, turn_left
from dragonlib.body import spine_samples
from dragonlib.creature import Limb
from dragonlib.head import HeadSpec, TeethRow, crest, head_pieces, horn
from dragonlib.shapes import Curve1D, Piece, bezier, curved_cone, ellipsoid, fbm, gauss, lerp, loft, smoothstep, value_noise

ID = 'homuratsuno'
PREFIX = 'homuratsuno'
META_KEY = 'creature'
SEED = 23
OUT = 'public/assets/homuratsuno.glb'
REPORT = 'tools/blender/homuratsuno-report.json'
GROUND = -12.5
# 肉付けの輪の間隔の上限（m）。胴が太いので紅竜（3.1m）より細かく刻み、輪郭をなめらかにする
RING_STEP = 0.75

# 骨格の図 -------------------------------------------------------------
# 背骨：尾の先 → 頭の付け根。胸は広く深く、首は太く短く前へ下がり、頭を低く構える。尾は短く太い
SPINE_KEYS = [
    ('tail_tip', (0.0, -3.2, -25.2), (0.95, 0.90)),
    ('tail_06', (0.0, -2.5, -23.0), (1.30, 1.25)),
    ('tail_05', (0.0, -1.6, -20.6), (1.75, 1.70)),
    ('tail_04', (0.0, -0.6, -18.1), (2.30, 2.25)),
    ('tail_03', (0.0, 0.4, -15.5), (3.00, 2.95)),
    ('tail_02', (0.0, 1.3, -12.8), (3.90, 3.85)),
    ('hips', (0.0, 2.0, -9.8), (4.90, 4.90)),
    ('waist', (0.0, 2.1, -6.0), (5.30, 5.60)),
    ('belly', (0.0, 1.8, -1.8), (5.90, 6.20)),
    ('chest', (0.0, 2.0, 2.6), (6.20, 6.40)),
    ('withers', (0.0, 3.4, 6.4), (5.50, 5.50)),
    ('neck_base', (0.0, 3.2, 9.6), (4.50, 4.60)),
    ('neck_1', (0.0, 2.6, 11.9), (3.70, 3.80)),
    ('neck_2', (0.0, 1.8, 13.8), (3.10, 3.25)),
    ('neck_3', (0.0, 1.1, 15.3), (2.80, 2.90)),
    ('head_joint', (0.0, 0.6, 16.6), (2.70, 2.80)),
]
SPINE = {name: p for name, p, _ in SPINE_KEYS}

# 後ろ脚（左）：柱のように太く、膝は前、かかとは低い
HIND = {
    'hip': ((4.3, -1.8, -9.4), (4.00, 4.30)),
    'thigh_mid': ((4.9, -4.4, -8.2), (3.40, 3.60)),
    'knee': ((5.3, -6.9, -7.2), (2.65, 2.75)),
    'shin_mid': ((5.4, -8.7, -8.1), (2.35, 2.40)),
    'ankle': ((5.5, -10.5, -9.0), (2.05, 2.05)),
    'ball': ((5.6, -11.9, -7.8), (2.25, 1.15)),
}
HIND_TOES = [((7.3, -12.08, -5.6), 0.55), ((5.95, -12.08, -5.0), 0.58), ((4.5, -12.08, -5.4), 0.55), ((5.7, -12.1, -10.2), 0.45)]
# 前脚（左）：肩甲骨は胸の中。肘は後ろ、前腕は太い柱
FRONT = {
    'scapula': ((3.4, 3.6, 4.4), (2.4, 2.4)),
    'shoulder': ((4.6, -1.6, 5.8), (3.80, 4.10)),
    'upperarm_mid': ((5.1, -4.2, 5.0), (3.20, 3.35)),
    'elbow': ((5.5, -6.6, 4.1), (2.55, 2.65)),
    'forearm_mid': ((5.6, -8.6, 5.0), (2.30, 2.35)),
    'wrist': ((5.7, -10.5, 5.9), (2.00, 2.00)),
    'hand': ((5.8, -11.9, 7.0), (2.30, 1.15)),
}
FRONT_TOES = [((7.4, -12.08, 9.2), 0.52), ((6.0, -12.08, 9.7), 0.55), ((4.6, -12.08, 9.2), 0.52), ((4.3, -11.7, 6.4), 0.42)]

LIMBS = [
    Limb('hind', -9.6, [((2.2, 0.6, -9.6), (4.2, 4.4))] + [HIND[k] for k in ('hip', 'thigh_mid', 'knee', 'shin_mid', 'ankle', 'ball')],
         toes=[(tip, r, None if k < 3 else tuple(Vector(HIND['ankle'][0]).lerp(Vector(HIND['ball'][0]), 0.6))) for k, (tip, r) in enumerate(HIND_TOES)]),
    Limb('front', 5.4, [((2.4, 0.8, 5.2), (4.0, 4.3))] + [FRONT[k] for k in ('shoulder', 'upperarm_mid', 'elbow', 'forearm_mid', 'wrist', 'hand')],
         toes=[(tip, r, None if k < 3 else tuple(Vector(FRONT['wrist'][0]).lerp(Vector(FRONT['hand'][0]), 0.5))) for k, (tip, r) in enumerate(FRONT_TOES)]),
]

# 色 -----------------------------------------------------------------
# 玄武岩のような暗い灰（少しだけ暖かい）。腹は灰をかぶったような少し明るい灰。溶岩の橙は実行時の材質が光らせる
PALETTE = paint.Palette(
    mottle=(0.28, 1.1),
    BACK=(0.020, 0.020, 0.022), BACK_DARK=(0.011, 0.011, 0.012), FLANK=(0.034, 0.034, 0.036),
    BELLY=(0.072, 0.068, 0.064), BELLY_EDGE=(0.040, 0.038, 0.037), FEET=(0.024, 0.023, 0.023), FEET_DIRT=(0.024, 0.021, 0.019),
    MEMBRANE=(0.03, 0.03, 0.03), MEMBRANE_EDGE=(0.02, 0.02, 0.02),
    HORN_BASE=(0.020, 0.018, 0.017), HORN_MID=(0.11, 0.095, 0.080), HORN_TIP=(0.018, 0.016, 0.015),
    CLAW_BASE=(0.10, 0.09, 0.08), CLAW_TIP=(0.02, 0.018, 0.017),
    TOOTH=(0.46, 0.42, 0.34), TOOTH_STAIN=(0.30, 0.22, 0.12), TOOTH_TIP=(0.52, 0.49, 0.43), TOOTH_ROOT=(0.22, 0.10, 0.05),
    MOUTH=(0.16, 0.030, 0.010), TONGUE=(0.32, 0.075, 0.030), GUM=(0.22, 0.045, 0.018), PALATE=(0.36, 0.12, 0.05),
    IRIS_INNER=(1.0, 0.62, 0.10), IRIS_OUTER=(0.75, 0.16, 0.02), IRIS_RIM=(0.06, 0.012, 0.004), PUPIL=(0.008, 0.004, 0.003),
    NOSTRIL=(0.010, 0.006, 0.004),
)
PLATE_TOP = (0.044, 0.043, 0.044)
PLATE_SIDE = (0.026, 0.025, 0.025)

# 頭 -----------------------------------------------------------------
HEAD_PITCH = -22.0
HEAD_LENGTH = 7.2
JAW_HINGE = (0.4, -1.7)
JAW_TIP = (6.9, -1.4)
FRAME, POINT = creature.head_axes(SPINE['head_joint'], HEAD_PITCH)


def _features(s, th):
    """張り出し（m）：額の瘤・目の上の重い眉・深い眼窩・頬の板・鼻筋・鼻の穴。岩のようにごつく。"""
    d = 0.0
    for sign in (1.0, -1.0):
        a = th * sign
        d += 0.55 * gauss(s - 1.6, 0.6) * crest(a - 0.92, 0.42)
        d -= 0.3 * gauss(s - 1.9, 0.42) * gauss(a - 1.25, 0.26)
        d += 0.36 * gauss(s - 0.5, 0.9) * crest(a - 1.82, 0.34)
        d += 0.14 * smoothstep(6.8, 5.0, s) * smoothstep(2.6, 3.8, s) * crest(a - 0.62, 0.22)
        d += 0.18 * gauss(s - 6.6, 0.3) * crest(a - 0.8, 0.3)
        d += 0.08 * gauss(s - 3.6, 1.2) * crest(a - 1.45, 0.2)
    d += 0.34 * gauss(s - 0.4, 0.8) * gauss(th, 0.5)
    d += 0.1 * smoothstep(6.8, 3.0, s) * smoothstep(1.0, 2.6, s) * crest(th, 0.14)
    d += _rugae(s) * smoothstep(0.62, 0.15, abs(abs(th) - math.pi))
    return d


def _rugae(s):
    wave = max(0.0, math.sin(2 * math.pi * s / 0.62)) ** 2
    return 0.06 * wave * smoothstep(0.8, 1.8, s) * smoothstep(6.4, 5.3, s)


def _head_weights(s):
    w = smoothstep(-1.0, 0.4, s)
    return {'head': w, 'neck_05': 1.0 - w} if w < 1.0 else {'head': 1.0}


def _head_scale(s, th):
    """頭の鱗（m）。r04-roster2：指摘「鱗の網目が紅竜と同じ形に見える」 旧＝上面 0.26〜0.5m（紅竜 0.19〜0.36m）→ 岩の板の大きさ：
    上面 0.7〜1.0m・頬 0.45m・目のまわり 0.18m。板の境目は溶岩で光らせる（_head_lava）"""
    a = abs(th)
    top = smoothstep(0.8, 0.2, a)
    eye = min(1.0, 1.3 * gauss(s - 1.9, 0.7) * gauss(a - 1.25, 0.45))
    sc = lerp(0.45, 0.95, top)
    return lerp(sc, 0.18, eye) + 0.1 * smoothstep(0.4, -0.9, s)


def _jaw_scale(s, th):
    return lerp(0.4, 0.6, smoothstep(1.6, 2.6, abs(th))) + 0.08 * smoothstep(0.6, -0.5, s)


def _stub_tooth(p, base, down, f, lateral, L, rnd, bone, h):
    """焔角の歯：太く短い杭で、先は丸い（噛み砕く歯）。下顎の前の2本（s ≥ 6.1）だけは、上唇の外へ立つ太い牙。
    r04-roster2：指摘「歯が紅竜と同じ形に見える」 旧＝紅竜と同じ細い円錐（半径 0.15＋0.22×長さ）→ 半径 0.24＋0.3×長さの杭"""
    o, fr, _, _ = h.frame()
    s_ = (Vector(base) - Vector(o)).dot(Vector(fr))
    tusk = bone == 'jaw' and s_ >= 6.1
    if tusk:
        L = 1.05 * rnd.uniform(0.95, 1.08)
        rake = math.radians(-12.0 + rnd.gauss(0.0, 2.0))
        splay = math.radians(16.0 + rnd.uniform(-2.0, 3.0))
    else:
        rake = math.radians(rnd.gauss(4.0, 5.0))
        splay = math.radians(rnd.uniform(-2.0, 6.0))
    d = down * math.cos(rake) - f * math.sin(rake)
    d = (d * math.cos(splay) + lateral * math.sin(splay)).normalized()
    stain = 0.35 + 0.65 * rnd.random() ** 1.2
    radius = (h.tooth_radius[0] + h.tooth_radius[1] * L) * rnd.uniform(0.9, 1.12) * (0.55 if tusk else 1.0)
    # 先の丸い杭：太さを先の近くまで保ち、先の2割で丸く閉じる（牙だけは先へ細る）
    prof = (lambda t: (1.0 - t) ** 0.8 * 0.95 + 0.05) if tusk else (lambda t: (max(0.0, 1.0 - t ** 3.2)) ** 0.5 * 0.94 + 0.06)
    bend = -f * (0.03 * L) + (lateral * (0.08 * L) if tusk else Vector((0.0, 0.0, 0.0)))
    root = base - d * 0.18
    curved_cone(p, root, base + d * L, radius, bend, 9, 7,
                lambda kk, i, stain=stain: h.palette.tooth_color(kk / 6, stain),
                lambda kk, q, bone=bone: {bone: 1.0}, lambda kk: {'part': paint.PART_TOOTH, 'scale': 0.05},
                flatten=(0.85, 1.0), up_hint=f, profile=prof)


def _thick_tongue(h):
    """焔角の舌：厚く丸い（縦の半径 0.42m）。先は丸く、奥ほど太い。喉の溶岩の光を受ける。r04-roster2：旧＝紅竜と同じ平らな楔（厚さ 0.1m）"""
    p = Piece('tongue')
    s0, span, n = 0.3, 5.0, 16
    rings = []
    for k in range(n):
        s_ = s0 + span * k / (n - 1)
        t = k / (n - 1)
        taper = (1.0 - t ** 2.4) ** 0.5
        half_h = 0.06 + 0.4 * taper
        half_w = max(0.06, h.tongue_width(s_) * (0.35 + 0.65 * taper))
        base = h.mouth(s_) - 0.2 - half_h
        ring = []
        for i in range(14):
            th = 2 * math.pi * i / 14
            ring.append(p.add(h.point(s_, base + half_h * math.cos(th), half_w * math.sin(th)), h.palette.TONGUE, {'jaw': 1.0}, glow=0.9, scale=0.12))
        rings.append(ring)
    loft(p, rings)
    tip = p.add(h.point(s0 + span + 0.12, h.mouth(s0 + span) - 0.32), h.palette.TONGUE, {'jaw': 1.0}, glow=0.9, scale=0.12)
    for i in range(14):
        p.faces.append((rings[-1][i], rings[-1][(i + 1) % 14], tip))
    return p


def _head_lava(pieces, seed):
    """顔の岩の板の境目に溶岩を通す（_EMIT）：上顎の上面と頬、下顎の外側に、まだらに光る割れ目。目と口の中には入れない。
    r04-roster2：3体の頭を分ける（紅竜は光らない・雷翼は鼻筋の細い筋・焔角は顔の割れ目）"""
    o, f, u, _ = FRAME()
    O, F = Vector(o), Vector(f)
    eye = [Vector(POINT(HEAD.eye[0], HEAD.eye[1], HEAD.eye[2] * sgn)) for sgn in (1.0, -1.0)]
    for piece in pieces[:2]:
        emit = []
        glow = piece.attrs['glow']
        for k, v in enumerate(piece.verts):
            s_ = (v - O).dot(F)
            crack = smoothstep(0.55, 0.68, fbm((v.x * 0.42, v.y * 0.42, v.z * 0.42), 3, seed + 81))
            near_eye = max(math.exp(-((v - e).length / 1.4) ** 2) for e in eye)
            inside = smoothstep(0.3, 0.6, glow[k])
            emit.append(0.45 * crack * (1.0 - near_eye) * (1.0 - inside) * smoothstep(-0.4, 0.6, s_) * (1.0 - smoothstep(6.4, 7.1, s_)))
        piece.attrs['emit'] = emit
    return pieces


def _horns(seed):
    """角：頭の後ろの上から外・上へ張り、前へ大きく曲がって先が前を向く1対と、鼻先の小さな角。"""
    p = Piece('horns')
    o, f, u, l = FRAME()
    F, U, L = Vector(f), Vector(u), Vector(l)
    hv = lambda ds, du, dl: F * ds + U * du + L * dl
    for side_i, sign in enumerate((1.0, -1.0)):
        rnd = random.Random('homuratsuno-horns-%d-%d' % (seed, side_i))
        ls = 1.0 + rnd.uniform(-0.04, 0.04)
        base = Vector(POINT(-0.2, 2.15, 1.7 * sign))
        path = bezier(base - hv(0.2, 0.4, 0.25 * sign), base + hv(-1.3 * ls, 1.9 * ls, 1.8 * sign), base + hv(1.3 * ls, 4.0 * ls, 3.0 * sign),
                      base + hv(5.3 * ls, 3.7 * ls, 2.5 * sign), 38)
        horn(p, path, 1.32, 16, rnd, U, 'head', flatten=(0.84, 1.0), tone=rnd.uniform(0.92, 1.05), palette=PALETTE)
    rnd = random.Random('homuratsuno-horns-nose-%d' % seed)
    b = Vector(POINT(6.35, HEAD.top(6.35) - 0.1, 0.0))
    curved_cone(p, b - hv(0, 0.25, 0), b + hv(0.55, 1.35, rnd.uniform(-0.05, 0.05)), 0.42, hv(0.18, 0.0, 0.0), 9, 7,
                lambda kk, i: PALETTE.horn_color(0.25 + kk / 7), lambda kk, q: {'head': 1.0},
                lambda kk: {'part': paint.PART_HORN, 'scale': 0.05, 'along': 0.22 * kk}, flatten=(0.8, 1.0), up_hint=U)
    # 頬の後ろの小さな瘤（顎の骨の付け根）
    for sign in (1.0, -1.0):
        for s, up, left, size in ((0.1, -0.9, 2.6, 0.55), (0.9, -1.1, 2.45, 0.42)):
            bb = Vector(POINT(s, up, left * sign))
            curved_cone(p, bb, bb + hv(-0.5 * size, -0.2 * size, 0.8 * size * sign), 0.32 * size + 0.1, hv(0, 0.05, 0), 7, 5,
                        lambda kk, i: PALETTE.horn_color(0.3 + kk / 6), lambda kk, q: {'head': 1.0},
                        lambda kk: {'part': paint.PART_HORN, 'scale': 0.05, 'along': 0.1 * kk})
    return p


HEAD = HeadSpec(
    top=Curve1D([(-1.0, 2.1), (0.0, 2.55), (1.0, 2.75), (1.8, 2.62), (2.6, 2.25), (3.6, 1.86), (4.6, 1.58), (5.6, 1.36), (6.5, 1.14), (7.0, 0.86), (7.2, 0.35)]),
    mouth=Curve1D([(-1.0, -1.8), (0.4, -1.7), (2.0, -1.55), (4.0, -1.32), (5.8, -1.12), (6.8, -0.92), (7.2, -0.65)]),
    # r04-roster2：鼻先を角張った太い口にする（旧＝幅 1.1m → 0.4m と細って閉じた。新＝7.0m でも 1.45m、先 0.75m）
    width=Curve1D([(-1.0, 2.6), (0.0, 2.9), (1.0, 2.95), (1.8, 2.7), (2.6, 2.35), (3.6, 2.1), (4.6, 1.95), (5.6, 1.82), (6.5, 1.7), (7.0, 1.45), (7.2, 0.75)]),
    jaw_depth=Curve1D([(-0.6, 2.1), (0.4, 2.5), (1.6, 2.4), (3.2, 2.05), (4.6, 1.75), (5.8, 1.5), (6.7, 1.15), (7.0, 0.55)]),
    jaw_width=Curve1D([(-0.6, 2.5), (0.4, 2.7), (1.6, 2.6), (3.2, 2.25), (4.6, 2.05), (5.8, 1.85), (6.7, 1.6), (7.0, 0.9)]),
    length=HEAD_LENGTH, point=POINT, frame=FRAME, ring=60,
    upper=(-1.0, 8.2, 84), upper_exp=(2.2, 4.0), jaw=(-0.6, 7.6, 52), jaw_exp=(4.0, 2.4),
    tongue=(0.3, 5.3, 15), tongue_width=Curve1D([(0.3, 1.25), (2.6, 1.15), (4.4, 0.9), (5.6, 0.2)]), throat=(-0.4, 3.0, 10),
    features=_features, rugae=_rugae, weights=_head_weights, scale=_head_scale, jaw_scale=_jaw_scale, scale_head=0.3,
    nostril=(6.6, 0.82), eye=(1.9, 1.05, 2.3), eye_radii=(0.42, 0.34, 0.31), eye_facing=(0.9, 0.36, 0.1), pupil=(0.05, 0.27, 0.035), pupil_out=0.28,
    # 歯：太く短い杭（0.3〜0.5m）を 0.7〜1.0m おきに。下顎の前の2本は牙（_stub_tooth）
    teeth=TeethRow(lambda s: 0.3 + 0.18 * gauss(s - 5.4, 0.7), lambda s: 0.28 + 0.16 * gauss(s - 5.6, 0.7), (1.6, 0.25), 6.75, (0.7, 1.0),
                   (1.9, 0.15, 0.35), 6.6, (0.72, 1.02), 7.05, (-0.62, -0.2, 0.2, 0.62), (0.28, 0.36)),
    tooth_radius=(0.24, 0.3), tooth_shape=_stub_tooth, tongue_shape=_thick_tongue, horns=_horns, palette=PALETTE,
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
        F = {k: sp(v[0]) for k, v in FRONT.items()}
        bones += [
            ('scapula_' + suffix, F['scapula'], F['shoulder'], 'chest'),
            ('upperarm_' + suffix, F['shoulder'], F['elbow'], 'scapula_' + suffix),
            ('forearm_' + suffix, F['elbow'], F['wrist'], 'upperarm_' + suffix),
            ('hand_' + suffix, F['wrist'], F['hand'], 'forearm_' + suffix),
            ('finger_' + suffix, F['hand'], sp(FRONT_TOES[1][0]), 'hand_' + suffix),
        ]
    return bones


SPINE_BONES = ['pelvis', 'spine', 'chest'] + ['tail_%02d' % i for i in range(1, 7)] + ['neck_%02d' % i for i in range(1, 6)]


# 肉付けの色と属性 -------------------------------------------------------
def _u_of(name):
    pts = [Vector(p) for _, p, _ in SPINE_KEYS]
    seg = [(pts[k] - pts[k - 1]).length for k in range(1, len(pts))]
    names = [n for n, _, _ in SPINE_KEYS]
    return sum(seg[:names.index(name)]) / sum(seg)


NECK_U = _u_of('neck_1')
# r04-roster2：指摘「遊ぶカメラで背中が照準の下から画面の下端までふさぐ」。岩の板を置く範囲を尾の4本目〜首の2本目（約40m）から、
# 腰の後ろ〜き甲（約22m）へ縮めた（尾の付け根と首は板を載せず、岩の皮と割れ目だけ）
PLATE_U = (_u_of('tail_02'), _u_of('withers'))


def painter(pt):
    u, t = pt.u, pt.limb_t
    fade = smoothstep(0.12, 0.3, u) * (1.0 - smoothstep(0.9, 0.97, u))
    belly_s = smoothstep(-0.45, -0.75, pt.dorsal) * fade
    glow_s = smoothstep(NECK_U, 0.99, u) * smoothstep(-0.2, -0.75, pt.dorsal)
    span = 12.5 if pt.chain == 'hind' else 13.0
    lower = 1.0 if pt.chain == 'toe' else (smoothstep(0.45 * span, span, pt.limb_along) if pt.chain in ('hind', 'front') else 0.0)
    dorsal = lerp(pt.dorsal, pt.normal.y, t)
    b = belly_s * (1.0 - t)
    c = PALETTE.skin_color(pt.pos, dorsal, b, lower * t, SEED)
    sole = smoothstep(GROUND + 1.6, GROUND + 0.05, pt.pos.y)
    c = paint.mix(paint.scale(c, 1.0 - 0.45 * sole), PALETTE.FEET_DIRT, 0.3 * sole)
    # 鱗（岩の粒）の大きさ（m）：背は大きく、脇腹と首は中くらい、脚の先は細かい
    sc_s = lerp(0.3, 0.62, smoothstep(0.1, 0.45, u)) if u < 0.7 else lerp(0.62, 0.42, smoothstep(0.7, 1.0, u))
    sc_s *= lerp(0.75, 1.2, smoothstep(-0.45, 0.85, pt.dorsal))
    sc_l = 0.2 if pt.chain == 'toe' else lerp(0.42, 0.24, lower)
    # 溶岩：岩の板の下になる背と肩の皮膚は、割れ目ごと光る（板の隙間から見える）。脚の付け根の上も少し
    back = smoothstep(-0.05, 0.35, pt.dorsal) * smoothstep(PLATE_U[0] - 0.03, PLATE_U[0] + 0.03, u) * (1.0 - smoothstep(PLATE_U[1] - 0.02, PLATE_U[1] + 0.04, u))
    # 背の真ん中の線は光らせない（板の隙間が背骨に沿って一列に光ると、背びれの光る怪獣に近づく）。割れ目の光も旧の7割に
    back *= 0.7 * (1.0 - 0.85 * smoothstep(0.86, 0.97, pt.dorsal))
    shoulder = smoothstep(0.35, 0.8, pt.normal.y) * (1.0 - smoothstep(3.0, 6.0, pt.limb_along)) if pt.chain in ('front', 'hind') else 0.0
    vein = smoothstep(0.52, 0.66, fbm((pt.pos.x * 0.35, pt.pos.y * 0.35, pt.pos.z * 0.35), 2, SEED + 40))
    emit = max(back * (1.0 - t), shoulder * t) * lerp(0.55, 1.0, vein)
    # 皮膚そのものも岩のようにうねらせる（1〜3m の凹凸）。脚は関節の骨の出っ張り（膝の皿は前、かかとと肘は後ろ）
    rough = 0.34 * (fbm((pt.pos.x * 0.32, pt.pos.y * 0.32, pt.pos.z * 0.32), 3, SEED + 7) - 0.5)
    values = {'part': paint.PART_SKIN, 'belly': b, 'glow': glow_s * (1.0 - t), 'along': pt.along, 'scale': lerp(sc_s, sc_l, t), 'emit': emit}
    return c, values, rough * (1.0 - 0.5 * lower) + _joint_bump(pt) * t


def _key_along(keys, index):
    return sum((Vector(keys[k][0]) - Vector(keys[k - 1][0])).length for k in range(1, index + 1))


# (鎖, 鎖に沿った位置 m, 向き（+1 で前・-1 で後ろ）, 高さ m, 幅 m)
JOINTS = [
    ('hind', _key_along(LIMBS[0].keys, 3), 1.0, 0.7, 1.1),
    ('hind', _key_along(LIMBS[0].keys, 5), -1.0, 0.55, 0.8),
    ('front', _key_along(LIMBS[1].keys, 3), -1.0, 0.7, 1.0),
    ('front', _key_along(LIMBS[1].keys, 5), 1.0, 0.35, 0.7),
]


def _joint_bump(pt):
    if pt.chain not in ('hind', 'front'):
        return 0.0
    d = pt.pos - pt.limb_point
    d = d - pt.limb_dir * d.dot(pt.limb_dir)
    fwd = Vector((0.0, 0.0, 1.0)) - pt.limb_dir * pt.limb_dir.z
    if d.length < 1e-6 or fwd.length < 1e-6:
        return 0.0
    c_front = d.normalized().dot(fwd.normalized())
    return sum(amp * math.exp(-((pt.limb_along - al) / width) ** 2) * max(0.0, c_front * facing) ** 3
               for chain, al, facing, amp, width in JOINTS if chain == pt.chain)


# 部品 -----------------------------------------------------------------
class SpineTrack:
    """背骨を細かく刻んだ点（弧長 → 点・接線・半径）。岩の板の置き場所を引く。"""

    def __init__(self):
        self.samples, self.total = spine_samples(0.25, SPINE_KEYS)

    def at(self, along):
        i = min(range(len(self.samples)), key=lambda j: abs(self.samples[j][2] - along))
        n = len(self.samples)
        p, rad, _ = self.samples[i]
        t = (self.samples[min(n - 1, i + 1)][0] - self.samples[max(0, i - 1)][0]).normalized()
        return p, t, rad


def _slab(p, center, normal, fwd, length, width, thick, rnd, bone, along, tilt):
    """岩の板1枚：体表の点 center に、法線 normal の向きで、前 fwd に長さ length・横に width の割れた多角形。
    下の面は体表にめり込ませ、上の面はほぼ平らで縁を面取りし、後ろの縁を tilt（m）だけ持ち上げる（瓦のように重ねる）。
    縁は角ごとに刻みを入れて不揃いにし、角ごとの高さも少し揺らす（面ごとの陰影で割れた岩に見せる）。"""
    n = Vector(normal).normalized()
    f = (Vector(fwd) - n * Vector(fwd).dot(n)).normalized()
    s = n.cross(f).normalized()
    k = rnd.choice((5, 6, 6, 7))
    phase = rnd.uniform(0.0, 2 * math.pi)
    corners = []
    for i in range(k):
        a = phase + 2 * math.pi * (i + rnd.uniform(-0.2, 0.2)) / k
        corners.append((a, rnd.uniform(0.8, 1.06)))
    edge = []
    for i in range(k):
        a0, r0 = corners[i]
        a1, r1 = corners[(i + 1) % k]
        if a1 < a0:
            a1 += 2 * math.pi
        for j in range(5):
            t = j / 5.0
            a = lerp(a0, a1, t)
            r = lerp(r0, r1, t) * (1.0 if j == 0 else rnd.uniform(0.9, 1.02))
            edge.append((math.cos(a) * 0.5 * length * r, math.sin(a) * 0.5 * width * r, rnd.uniform(-0.06, 0.06)))
    wts = {bone: 1.0}
    rings = []
    # 溶岩は板の下の縁だけ（隙間の奥で光る）。上の面は暗い岩のまま
    for level, (hgt, inset, emit, col) in enumerate(((-0.5, 1.0, 1.0, PLATE_SIDE), (thick * 0.7, 1.0, 0.25, PLATE_SIDE), (thick, 0.9, 0.0, PLATE_TOP))):
        ring = []
        for cx, cy, dh in edge:
            raise_ = tilt * max(0.0, -cx / (0.5 * length)) if level > 0 else 0.0
            q = Vector(center) + f * (cx * inset) + s * (cy * inset) + n * (hgt + raise_ + (dh if level > 0 else 0.0))
            ring.append(p.add(q, paint.scale(col, rnd.uniform(0.85, 1.15)), wts, part=paint.PART_SKIN, scale=rnd.uniform(1.0, 1.6), along=along, emit=emit))
        rings.append(ring)
    top = p.add(Vector(center) + n * (thick + 0.45 * tilt), PLATE_TOP, wts, part=paint.PART_SKIN, scale=1.3, along=along, emit=0.0)
    bottom = p.add(Vector(center) - n * 0.55, PLATE_SIDE, wts, part=paint.PART_SKIN, scale=1.0, along=along, emit=1.0)
    m = len(edge)
    for a_ring, b_ring in zip(rings[:-1], rings[1:]):
        for i in range(m):
            j = (i + 1) % m
            p.faces.append((a_ring[i], a_ring[j], b_ring[j], b_ring[i]))
    for i in range(m):
        j = (i + 1) % m
        p.faces.append((rings[-1][i], rings[-1][j], top))
        p.faces.append((rings[0][j], rings[0][i], bottom))


# 板の並び（r04-roster2）：(背の中央からの角度（度）, 大きさの倍率, 置く範囲（板の範囲の中の割合）, 列の中で角度を左右に振る幅（度）)。
# 旧＝背骨の真上に大きな板を一列（角度 0）と、±42°・±74° の列（厚さ 0.7〜1.2m、後ろの縁を長さの 1/8 持ち上げ、長さ 3.4〜6.6m）で、
# 背の輪郭がこぶの列になり、隙間の溶岩が背骨に沿って一列に光った。新＝真上の列をやめ、背骨をまたいで左右へ交互に振る列にして
# 隙間を一直線にしない。板は薄く（0.35〜0.6m）・短く（2.6〜4.6m）・後ろの縁の持ち上げは 1/20。とげは足さない
PLATE_ROWS = [(0.0, 0.9, (0.0, 1.0), 16.0), (48.0, 0.75, (0.04, 0.96), 7.0), (-48.0, 0.75, (0.04, 0.96), 7.0), (78.0, 0.5, (0.12, 0.86), 5.0), (-78.0, 0.5, (0.12, 0.86), 5.0)]


def rock_plates(ctx):
    p = Piece('plates')
    p.smooth = False
    rnd = random.Random('homuratsuno-plates-%d' % ctx.seed)
    track = SpineTrack()
    total = track.total
    s0, s1 = PLATE_U[0] * total, PLATE_U[1] * total
    count = 0
    for angle, size, (f0, f1), swing in PLATE_ROWS:
        s = s0 + (s1 - s0) * f0 + rnd.uniform(0.0, 1.2)
        end = s0 + (s1 - s0) * f1
        k = 0
        while s < end:
            # 列の中で角度を左右へ交互に振り（背骨の上の列は、板が背骨を左右にまたぐ）、少し揺らす
            a = math.radians(angle + swing * (1.0 if k % 2 == 0 else -1.0) + rnd.uniform(-4.0, 4.0))
            c, t, rad = track.at(s)
            up = (Vector((0, 1, 0)) - t * t.y).normalized()
            side = t.cross(up).normalized()
            d = (up * math.cos(a) + side * math.sin(a)).normalized()
            hit, normal = ctx.surface.cast(c + d * (max(rad) + 8.0), -d)
            u = (s - s0) / (s1 - s0)
            # 肩と腰の上で大きく、両端へ小さく
            L = lerp(2.6, 4.6, math.sin(math.pi * min(1.0, max(0.0, u))) ** 0.6) * size * rnd.uniform(0.86, 1.12)
            if hit is not None:
                bone = ctx.nearest_bone(hit, SPINE_BONES)
                _slab(p, hit, normal, t, L, L * rnd.uniform(0.85, 1.05), lerp(0.35, 0.6, size) * rnd.uniform(0.85, 1.15), rnd, bone, s, 0.2 * L / 4.0)
                count += 1
            s += L * rnd.uniform(0.78, 0.9)
            k += 1
    return p, count


def tail_club():
    """尾の先の岩の塊（尾の鎚）：大小の岩をいくつか寄せ、表面をノイズで割る。割れ目に溶岩（_EMIT）。"""
    p = Piece('club')
    rnd = random.Random('homuratsuno-club')
    tip = Vector(SPINE['tail_tip'])
    axis = (tip - Vector(SPINE['tail_06'])).normalized()
    side = axis.cross(Vector((0, 1, 0))).normalized()
    up = side.cross(axis).normalized()
    lumps = [(0.4, 0.0, 0.0, (2.4, 2.1, 2.9)), (1.4, 1.1, 0.5, (1.9, 1.7, 2.1)), (1.2, -1.2, 0.3, (1.8, 1.6, 2.0)),
             (0.2, 0.2, 1.4, (1.6, 1.4, 1.7)), (2.4, 0.0, -0.4, (1.5, 1.3, 1.6)), (-0.8, 0.0, -1.1, (1.3, 1.2, 1.5))]
    for k, (along, dx, dy, radii) in enumerate(lumps):
        c = tip + axis * along + side * dx + up * dy
        start = len(p.verts)
        seed = 60 + k

        def col(q, seed=seed):
            return paint.scale(PLATE_TOP if q.z > 0 else PLATE_SIDE, 0.85 + 0.3 * value_noise((q.x * 2.1, q.y * 2.1, q.z * 2.1), seed))

        ellipsoid(p, c, (side, up, axis), radii, 16, 26, col, lambda q: {'tail_06': 1.0}, {'part': paint.PART_SKIN, 'scale': 1.1, 'along': 0.0})
        # 表面を割る（岩の塊ごとに種を変えたノイズで、中心から外へ押し引き）
        for i in range(start, len(p.verts)):
            v = p.verts[i]
            p.verts[i] = v + (v - c).normalized() * ((fbm((v.x * 0.55, v.y * 0.55, v.z * 0.55), 3, seed) - 0.5) * 0.9)
    # 割れ目の溶岩：まばらな筋
    p.attrs['emit'] = [smoothstep(0.6, 0.7, fbm((v.x * 0.8, v.y * 0.8, v.z * 0.8), 2, 71)) * 0.7 for v in p.verts]
    return p


def claws():
    p = Piece('claws')
    attrs = lambda kk: {'part': paint.PART_CLAW, 'scale': 0.05}
    for suffix, side in SIDES:
        sp = lambda q: Vector(side_point(q, side))
        for toes, ball, heel_of, bones, L in ((HIND_TOES, HIND['ball'][0], HIND['ankle'][0], ('toe_', 'foot_'), 1.1), (FRONT_TOES, FRONT['hand'][0], FRONT['wrist'][0], ('finger_', 'hand_'), 1.0)):
            b0 = sp(ball)
            heel = sp(heel_of).lerp(b0, 0.55)
            for k, (tip, r) in enumerate(toes):
                start = heel if k == 3 else b0
                t = sp(tip)
                d = t - start
                d.y = 0
                d.normalize()
                base = t - d * 0.35 + Vector((0, 0.15, 0))
                bone = bones[1] + suffix if k == 3 else bones[0] + suffix
                curved_cone(p, base, base + d * (L * (0.7 if k == 3 else 1.0)) + Vector((0, -0.35, 0)), 0.5 if k < 3 else 0.4, Vector((0, 0.2, 0)), 8, 6,
                            lambda kk, ii: PALETTE.claw_color(kk / 5), lambda kk, q, b=bone: {b: 1.0}, attrs, flatten=(1.0, 0.7))
    return p


def parts(ctx):
    plates, _ = rock_plates(ctx)
    return _head_lava(head_pieces(ctx.total, ctx.seed, HEAD), ctx.seed) + [plates, tail_club(), claws()]


# 動き -----------------------------------------------------------------
FEET = [
    ('HL', 0.0, ['thigh_L', 'shin_L', 'foot_L'], 'toe_L', 1),
    ('FL', 0.25, ['upperarm_L', 'forearm_L', 'hand_L'], 'finger_L', 1),
    ('HR', 0.5, ['thigh_R', 'shin_R', 'foot_R'], 'toe_R', -1),
    ('FR', 0.75, ['upperarm_R', 'forearm_R', 'hand_R'], 'finger_R', -1),
]
NECK = ['neck_%02d' % i for i in range(1, 6)]
TAIL = ['tail_%02d' % i for i in range(1, 7)]
# 重い歩き（かかとをあまり上げない象の歩き）と、突進の駆け足（後ろ脚2本 → 前脚2本の順に着く）
GAITS = {
    'walk': {'cycle': 2.0, 'stride': 13.0, 'duty': 0.66, 'lift': (1.5, 1.6), 'ahead': 0.52, 'heel': 18.0, 'heelSwing': 10.0, 'curl': 22.0},
    'run': {'cycle': 1.1, 'stride': 20.0, 'duty': 0.42, 'lift': (2.6, 2.8), 'ahead': 0.5, 'heel': 22.0, 'heelSwing': 12.0, 'curl': 26.0,
            'touch': {'HL': 0.0, 'HR': 0.14, 'FL': 0.5, 'FR': 0.64}},
}
# 跳んでいる間の脚：後ろ脚は腰の下へ引き寄せ、前脚は胸の下で前へ構える（着地ののしかかりに備える）
TUCK = {'H': ((5.3, -8.8, -10.2), (0.0, 0.1, -1.0), (0.0, -0.2, -1.0)), 'F': ((5.4, -8.6, 9.6), (0.0, -0.6, 0.8), (0.0, -0.3, 1.0))}

CLIPS = {
    'idle': {'duration': 4.0, 'loop': True},
    'walk': {'duration': GAITS['walk']['cycle'], 'loop': True},
    'run': {'duration': GAITS['run']['cycle'], 'loop': True},
    'jump': {'duration': 1.6, 'loop': False, 'marks': {'crouch': [0.0, 0.4], 'leap': [0.4, 0.8], 'fall': [0.8, 1.6]}},
    'land': {'duration': 1.4, 'loop': False, 'marks': {'impact': [0.0, 0.3], 'recovery': [0.3, 1.4]}},
    'breath': {'duration': 2.2, 'loop': False, 'marks': {'charge': [0.0, 0.35], 'thrust': [0.35, 0.6], 'loop': [0.6, 2.2]}},
    'claw': {'duration': 1.0, 'loop': False, 'marks': {'windup': [0.0, 0.34], 'active': [0.34, 0.5], 'recovery': [0.5, 1.0]}},
    'tail': {'duration': 1.3, 'loop': False, 'marks': {'windup': [0.0, 0.4], 'active': [0.4, 0.66], 'recovery': [0.66, 1.3]}},
    'roar': {'duration': 1.8, 'loop': False, 'marks': {'windup': [0.0, 0.5], 'active': [0.5, 0.65], 'recovery': [0.65, 1.8]}},
    'stomp': {'duration': 1.5, 'loop': False, 'marks': {'windup': [0.0, 0.58], 'active': [0.58, 0.72], 'recovery': [0.72, 1.5]}},
}


class Author(author.Author):
    """焔角の道具：共通の道具（足・首・尾）のまま。首は5本、尾は6本の骨に配る。"""

    def __init__(self, arm):
        super().__init__(arm, FEET, NECK, TAIL, GAITS, TUCK, neck_yaw=(0.1, 0.16, 0.22, 0.26, 0.26),
                         tail_amp=lambda i: 0.5 + 0.22 * i, tail_lift=lambda i: 1.0 - 0.1 * i)

    def stand(self, pose, skip=()):
        for foot, *_ in FEET:
            if foot not in skip:
                self.planted(pose, foot)


def make_author(arm):
    return Author(arm)


def clip_idle(A, t):
    """重い息：胸が大きく上下し、頭を低く構えて左右を見る。"""
    p = Pose()
    ph = t / CLIPS['idle']['duration']
    w = 2 * math.pi * ph
    breath = math.sin(w * 2)
    p.offset = UP * (0.14 * breath) + LEFT * (0.14 * math.sin(w))
    p.rot('body', roll_right(0.7 * math.sin(w)))
    p.rot('chest', lift(1.2 * breath))
    p.rot('spine', lift(0.5 * breath))
    look = 8.0 * math.sin(w) + 2.5 * math.sin(3 * w + 0.7)
    A.neck_curve(p, [2, 1, -1, -2, -2], yaw=look)
    p.rot('head', lift(-2 + 1.5 * math.sin(w + 1.1)) @ roll_right(1.5 * math.sin(w + 0.4)))
    p.rot('jaw', qa(LEFT, 1.0 + 1.2 * max(0.0, breath)))
    A.tail_wave(p, 1.6, ph, lift_deg=1.5)
    A.stand(p)
    return A.solve(p)


def _gait_body(A, p, ph, run):
    w = 2 * math.pi * ph
    if run:
        p.offset = UP * (0.6 * math.cos(4 * math.pi * (ph - 0.12)) - 0.9) + FWD * (0.3 * math.sin(w))
        p.rot('body', lift(-4.0 + 3.0 * math.sin(w - 0.8)) @ roll_right(1.0 * math.sin(w)))
    else:
        bob = 0.3 * math.cos(4 * math.pi * (ph - 0.08))
        p.offset = UP * (bob - 0.25) + LEFT * (0.4 * math.sin(w))
        p.rot('body', roll_right(2.6 * math.sin(w + 0.3)) @ turn_left(1.2 * math.sin(w)))
    p.rot('pelvis', turn_left(2.5 * math.sin(w + math.pi / 2)) @ roll_right(2.0 * math.sin(w)))
    p.rot('chest', turn_left(-2.0 * math.sin(w - math.pi / 2)) @ roll_right(-1.8 * math.sin(w + 0.5)))
    for suffix, touch in (('L', 0.25), ('R', 0.75)):
        p.rot('scapula_' + suffix, qa(LEFT, (8.0 if run else 5.0) * math.cos(2 * math.pi * (ph - touch - 0.1))))


def clip_walk(A, t):
    p = Pose()
    ph = t / CLIPS['walk']['duration']
    _gait_body(A, p, ph, False)
    A.neck_curve(p, [2, 1, -1, -2, -2], yaw=2.0 * math.sin(2 * math.pi * ph))
    p.rot('neck_01', lift(1.5 * math.cos(4 * math.pi * ph)))
    p.rot('head', lift(-1.5 * math.cos(4 * math.pi * ph)))
    A.tail_wave(p, 2.0, ph, lift_deg=1.5)
    A.gait_feet(p, 'walk', ph)
    return A.solve(p)


def clip_run(A, t):
    """突進の駆け足：頭を下げて角を前へ向け、体を前へ倒して重く跳ねる。"""
    p = Pose()
    ph = t / CLIPS['run']['duration']
    _gait_body(A, p, ph, True)
    A.neck_curve(p, [-6, -6, -4, -2, 0], yaw=1.0 * math.sin(2 * math.pi * ph))
    p.rot('neck_01', lift(3.0 * math.cos(4 * math.pi * ph + 0.6)))
    p.rot('head', lift(-8.0 - 2.0 * math.cos(4 * math.pi * ph + 0.6)))
    A.tail_wave(p, 1.2, ph, lift_deg=6.0)
    A.gait_feet(p, 'run', ph)
    return A.solve(p)


def clip_jump(A, t):
    """跳ぶ：深く屈む（〜0.4）→ 4本の脚で地面を蹴って跳ぶ（〜0.8）→ 脚を引き寄せて落ちる（のしかかりは land が受ける）。
    上下の大きな動きは遊びの側が胴の位置で付ける。ここは屈みと、蹴り出しの伸び（+1.5m）と、空中の構えだけ。"""
    p = Pose()
    crouch = ss(0.0, 0.4, t) * (1 - ss(0.4, 0.6, t))
    push = ss(0.38, 0.62, t)
    air = ss(0.62, 0.95, t)
    p.offset = UP * (-2.6 * crouch + 1.5 * push)
    p.rot('body', lift(-3.0 * crouch + 5.0 * push * (1 - air) - 4.0 * air))
    A.neck_curve(p, [2 - 4 * crouch + 4 * push, 1 - 3 * crouch, -1, -2 + 2 * air, -2 - 3 * air])
    p.rot('head', lift(-2.0 + 3.0 * push - 6.0 * air))
    A.tail_wave(p, 1.0, t / 1.6, lift_deg=1.5 + 5.0 * push)
    for foot, *_ in FEET:
        if t < 0.62:
            A.planted(p, foot, heel=26.0 * push)
        else:
            A.tucked(p, foot, ss(0.62, 1.0, t), from_ground=True)
    return A.solve(p)


def clip_land(A, t):
    """のしかかりの着地：前脚を張って落ち、胴を深く沈めて地面を押し潰し、ゆっくり起き上がる。"""
    p = Pose()
    impact = bump(t, -0.1, 0.42)
    settle = ss(0.25, 1.2, t)
    bounce = 0.35 * math.sin(math.pi * ss(0.35, 0.95, t)) * (1 - ss(0.95, 1.35, t))
    p.offset = UP * (-3.2 * impact + bounce)
    p.rot('body', lift(-5.0 * impact))
    A.neck_curve(p, [2 * settle - 8 * impact, settle - 5 * impact, -1 - 2 * impact, -2 + 4 * impact, -2 + 5 * impact])
    p.rot('head', lift(4.0 * impact))
    p.rot('jaw', qa(LEFT, 10.0 * impact))
    A.tail_wave(p, 1.4 * (1 - settle), t / 1.4, lift_profile=[(-6.0 * impact + 2.0 * settle) * (1 - 0.1 * i) for i in range(6)])
    for foot, *_ in FEET:
        spread = 1.2 * impact if foot[0] == 'F' else 0.6 * impact
        A.planted(p, foot, dx=spread, heel=-8.0 * impact)
    return A.solve(p)


def clip_breath(A, t):
    """溶岩の礫を吐く：首を反らして溜め（〜0.35）、頭を前へ突き出して口を開け、吐いている間は3回ずつ頭を前へ突いて礫を放る。"""
    p = Pose()
    charge = ss(0.0, 0.35, t) * (1 - ss(0.35, 0.55, t))
    thrust = ss(0.35, 0.6, t)
    loop = (t - 0.6) / 1.6 if t > 0.6 else 0.0
    spit = max(0.0, math.sin(2 * math.pi * loop * 3.0)) ** 3 * thrust
    p.offset = UP * (0.4 * charge) + FWD * (-0.6 * charge + 0.9 * thrust + 0.5 * spit)
    p.rot('body', lift(2.0 * charge - 2.0 * thrust))
    p.rot('chest', lift(3.0 * charge))
    A.neck_curve(p, [2 + 8 * charge - 4 * thrust, 1 + 6 * charge - 3 * thrust, -1 + 3 * charge, -2 - 3 * charge + 4 * thrust + 3 * spit, -2 - 4 * charge + 5 * thrust + 3 * spit])
    p.rot('head', lift(-2.0 + 8.0 * charge - 4.0 * thrust + 6.0 * spit))
    p.rot('jaw', qa(LEFT, 4.0 * charge + 30.0 * thrust + 8.0 * spit))
    A.tail_wave(p, 1.2, t / 2.2, lift_deg=1.5 + 3.0 * thrust)
    A.stand(p)
    return A.solve(p)


def clip_claw(A, t):
    """角の突き上げ：頭を地面すれすれまで下げて角を前へ構え（〜0.34）、首と前脚で一気に突き上げ（〜0.5）、戻す。"""
    p = Pose()
    wind = ss(0.0, 0.34, t) * (1 - ss(0.34, 0.44, t))
    strike = ss(0.3, 0.5, t) * (1 - ss(0.56, 1.0, t))
    p.offset = UP * (-1.0 * wind + 0.8 * strike) + FWD * (-0.5 * wind + 1.5 * strike)
    p.rot('body', lift(-4.0 * wind + 6.0 * strike))
    p.rot('chest', lift(-3.0 * wind + 4.0 * strike))
    A.neck_curve(p, [2 - 10 * wind + 12 * strike, 1 - 8 * wind + 10 * strike, -1 - 6 * wind + 8 * strike, -2 - 3 * wind + 4 * strike, -2 - 2 * wind + 6 * strike])
    p.rot('head', lift(-2.0 - 14.0 * wind + 24.0 * strike))
    p.rot('jaw', qa(LEFT, 6.0 * strike))
    A.tail_wave(p, 1.0, t / 1.0, lift_deg=1.5 + 4.0 * wind)
    A.stand(p)
    return A.solve(p)


def clip_tail(A, t):
    """尾の鎚を振る：体をひねって尾を左へ引き（〜0.4）、腰から大きく右へ振り抜き（先の岩の塊が遅れて回る）、戻す。"""
    p = Pose()
    wind = ss(0.0, 0.4, t)
    swing = ss(0.4, 0.66, t)
    settle = ss(0.66, 1.3, t)
    for i, b in enumerate(TAIL):
        k = (i + 1) / 6.0
        lag = ss(0.4 + 0.03 * i, 0.62 + 0.035 * i, t) if t > 0.4 else 0.0
        s_i = 1.0 * wind - 2.0 * lag + 1.0 * settle
        amp = 13.0 * (0.5 + 0.6 * k)
        p.rot(b, turn_left(-amp * s_i) @ tail_up(4.0 * wind * (1 - settle) * (1 - 0.1 * i)))
    side = 1.0 * wind - 2.0 * swing + 1.0 * settle
    p.rot('pelvis', turn_left(12.0 * side))
    p.rot('body', turn_left(-5.0 * side) @ roll_right(3.0 * side))
    p.rot('chest', turn_left(-5.0 * side))
    A.neck_curve(p, [2, 1, -1, -2, -2], yaw=10.0 * side)
    A.stand(p)
    return A.solve(p)


def clip_roar(A, t):
    """咆哮：前脚を突っ張って胸を張り、頭を上げて口を大きく開け、体を震わせる（背の溶岩が強く光る場面）。"""
    p = Pose()
    rear = ss(0.0, 0.5, t) * (1 - ss(1.1, 1.7, t))
    roar = ss(0.46, 0.6, t) * (1 - ss(1.2, 1.6, t))
    tremble = math.sin(2 * math.pi * 10.0 * t) * roar
    p.offset = UP * (1.0 * rear + 0.3 * roar) + FWD * (-0.6 * rear)
    p.rot('body', lift(5.0 * rear + 2.0 * roar))
    p.rot('chest', lift(3.0 * rear))
    A.neck_curve(p, [2 + 8 * rear, 1 + 8 * rear, -1 + 6 * rear + 4 * roar, -2 + 4 * roar, -2 + 6 * roar], yaw=1.5 * tremble)
    p.rot('head', lift(-2.0 + 12.0 * roar + 1.0 * tremble))
    p.rot('jaw', qa(LEFT, 8.0 * rear + 40.0 * roar + 3.0 * tremble))
    A.tail_wave(p, 1.6, t / 1.8, lift_deg=1.5 + 5.0 * roar)
    A.stand(p)
    return A.solve(p)


def clip_stomp(A, t):
    """地割れ：後ろ脚で立ち上がって前脚2本を高く上げ（〜0.58）、全身の重さで地面へ叩きつけ（〜0.72）、戻す。"""
    p = Pose()
    rise = ss(0.0, 0.58, t) * (1 - ss(0.56, 0.68, t))
    slam = bump(t, 0.56, 0.9)
    settle = ss(0.72, 1.5, t)
    p.offset = UP * (2.2 * rise - 1.6 * slam) + FWD * (-1.2 * rise + 1.4 * slam * (1 - settle))
    p.rot('body', lift(17.0 * rise - 4.0 * slam))
    p.rot('chest', lift(4.0 * rise))
    A.neck_curve(p, [2 + 2 * rise - 6 * slam, 1 + 2 * rise - 4 * slam, -1 - 2 * slam, -2 + 2 * rise, -2 + 4 * rise], yaw=0.0)
    p.rot('head', lift(-2.0 + 6.0 * rise - 6.0 * slam))
    p.rot('jaw', qa(LEFT, 6.0 * rise + 14.0 * slam))
    A.tail_wave(p, 1.0, t / 1.5, lift_profile=[(-4.0 * rise + 3.0 * slam) * (1 - 0.1 * i) for i in range(6)])
    A.planted(p, 'HL', heel=-6.0 * rise)
    A.planted(p, 'HR', heel=-6.0 * rise)
    for foot in ('FL', 'FR'):
        A.planted(p, foot, dz=2.2 * rise + 2.0 * slam * (1 - settle), lift_h=6.5 * rise * (1 - ss(0.56, 0.66, t)), heel=30.0 * rise, curl=-20.0 * rise)
    return A.solve(p)


BUILDERS = {
    'idle': clip_idle, 'walk': clip_walk, 'run': clip_run, 'jump': clip_jump, 'land': clip_land, 'breath': clip_breath,
    'claw': clip_claw, 'tail': clip_tail, 'roar': clip_roar, 'stomp': clip_stomp,
}


def reference_points():
    """実行時が使う目印（遊びの向きの座標）：鼻先・顎の先・口の中（上顎側と下顎側）。"""
    r = lambda q: [round(c, 4) for c in q]
    m = HEAD.mouth
    return {
        'snout': {'bone': 'head', 'pos': r(POINT(HEAD_LENGTH, 0.0))},
        'jawTip': {'bone': 'jaw', 'pos': r(POINT(*JAW_TIP))},
        'mouthUpper': {'bone': 'head', 'pos': r(POINT(6.2, m(6.2) - 0.08))},
        'mouthLower': {'bone': 'jaw', 'pos': r(POINT(6.0, m(6.0) - 0.3))},
    }


def chains():
    return {'neck': NECK, 'tail': TAIL, 'head': 'head', 'jaw': 'jaw', 'club': 'tail_06'}


def author_clips(arm):
    return creature.author_clips(sys.modules[__name__], arm)


def metadata(clips):
    return creature.metadata(sys.modules[__name__], clips)


# 形の確認の向き（Blender の座標）
PREVIEW = {
    'side': (G(115, 6, -3), G(0, 0, -3), 38),
    'front': (G(0, 6, 110), G(0, 0, 0), 45),
    'top': (G(0, 120, -3), G(0, 0, -3), 45),
    'three_quarter': (G(62, 32, 64), G(0, 1, -3), 48),
    'head': (G(20, 9, 34), G(0, -0.5, 20.5), 34),
    'head_side': (G(24, 3, 21), G(0, -0.5, 20.5), 34),
}
CLIP_VIEW = (G(80, 22, 55), G(0, -2, -2), 55)


def build(args):
    return creature.build(sys.modules[__name__], args)
