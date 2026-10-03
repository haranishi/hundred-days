# OWNER: dragon
"""竜の骨格の図（点・辺・半径）。肉付け（Skin）・骨組み（アーマチュア）・重み・動きは、すべてこの1枚から作る。

座標は「遊びの向き」で書く：x が竜の左、y が上、z が前（three.js の竜の局所座標と同じ）。
Blender へは G() で (X, Y, Z) = (x, -z, y) に直す（Blender では竜が -Y を向き、左が +X、上が +Z）。
原点は胴の中心で、立ったときの足の裏は y = GROUND（遊びの側の LOCOMOTION.bodyHeight = 9.5m と同じ）。
単位は m。全長およそ60m・翼を広げて80m（docs/GAME-DESIGN.md）。
"""
import math

from mathutils import Vector

GROUND = -9.5


def G(x, y, z):
    """遊びの向き (x 左, y 上, z 前) → Blender の座標。"""
    return Vector((x, -z, y))


LEFT = Vector((1.0, 0.0, 0.0))
UP = Vector((0.0, 0.0, 1.0))
FWD = Vector((0.0, -1.0, 0.0))

# 背骨：尾の先 → 頭の付け根。(名前, 点, (横の半径, 縦の半径))。胸は厚く、腰は細く、尾は長く先細りにする
SPINE_KEYS = [
    ('tail_tip', (0.0, -4.4, -34.5), (0.10, 0.13)),
    ('tail_10', (0.0, -4.0, -31.6), (0.26, 0.33)),
    ('tail_09', (0.0, -3.4, -28.8), (0.40, 0.50)),
    ('tail_08', (0.0, -2.8, -26.0), (0.55, 0.68)),
    ('tail_07', (0.0, -2.1, -23.2), (0.72, 0.88)),
    ('tail_06', (0.0, -1.4, -20.4), (0.92, 1.10)),
    ('tail_05', (0.0, -0.7, -17.6), (1.14, 1.35)),
    ('tail_04', (0.0, -0.1, -14.8), (1.40, 1.64)),
    ('tail_03', (0.0, 0.4, -12.1), (1.72, 1.98)),
    ('tail_02', (0.0, 0.8, -9.4), (2.30, 2.55)),
    ('hips', (0.0, 1.0, -6.6), (2.85, 3.00)),
    ('waist', (0.0, 0.9, -3.1), (2.55, 2.95)),
    ('belly', (0.0, 0.9, 0.4), (3.00, 3.60)),
    ('chest', (0.0, 1.0, 3.9), (3.45, 4.20)),
    ('withers', (0.0, 1.8, 6.8), (3.10, 3.70)),
    ('neck_base', (0.0, 3.1, 9.4), (2.55, 2.95)),
    ('neck_1', (0.0, 4.8, 11.7), (2.05, 2.34)),
    ('neck_2', (0.0, 6.7, 13.7), (1.72, 1.95)),
    ('neck_3', (0.0, 8.5, 15.7), (1.54, 1.72)),
    ('neck_4', (0.0, 9.9, 17.8), (1.43, 1.58)),
    ('neck_5', (0.0, 10.8, 20.0), (1.39, 1.52)),
    ('head_joint', (0.0, 11.2, 22.2), (1.40, 1.50)),
]
SPINE = {name: p for name, p, _ in SPINE_KEYS}

# 頭の向き：付け根から前へ、鼻先を14°下げる。頭の長さ 7.6m
HEAD_PITCH_DEG = -14.0
HEAD_LENGTH = 7.0


def head_frame():
    """頭の局所の軸（遊びの向き）：原点 O、前 f、上 u、左 l。"""
    a = math.radians(HEAD_PITCH_DEG)
    o = SPINE['head_joint']
    f = (0.0, math.sin(a), math.cos(a))
    u = (0.0, math.cos(a), -math.sin(a))
    return o, f, u, (1.0, 0.0, 0.0)


def head_point(s, up, left=0.0):
    """頭の局所座標 (前 s, 上 up, 左 left) → 遊びの向きの点。"""
    o, f, u, l = head_frame()
    return tuple(o[i] + f[i] * s + u[i] * up + l[i] * left for i in range(3))


# 顎の蝶番（頭の局所：前 0.35m・下 0.95m）と顎の先
JAW_HINGE = (0.35, -1.05)
JAW_TIP = (6.8, -1.2)

# 後ろ脚（左）。関節の点と半径。太ももの付け根は腰に溶け込むよう太くする
# r00c-竜: 指摘「足が鳥のように細く、街から浮いて見える」 膝から先を2割太く、足の甲を幅 1.24→2.0m、
# 指の間隔 1.5→2.8m・指の太さ 0.13→0.27m にした（全長60mの体重を受ける、横に広い足）
HIND = {
    'hip': ((2.85, -0.9, -6.6), (2.35, 2.6)),
    'thigh_mid': ((3.2, -3.0, -5.3), (1.95, 2.1)),
    'knee': ((3.45, -5.0, -4.3), (1.32, 1.42)),
    'shin_mid': ((3.55, -6.4, -5.8), (1.1, 1.2)),
    'ankle': ((3.6, -7.7, -7.3), (0.9, 0.88)),
    'ball': ((3.7, -8.95, -5.9), (1.0, 0.55)),
}
HIND_TOES = [
    ((5.1, -9.22, -3.35), 0.26),
    ((3.75, -9.22, -2.95), 0.28),
    ((2.4, -9.22, -3.35), 0.26),
    ((3.95, -9.25, -7.95), 0.22),  # 後ろ向きの指
]

# 前脚（左）。肩甲骨は胸の中にあり、肩の関節を前後に動かして歩幅を稼ぐ
FRONT = {
    'scapula': ((2.0, 3.0, 4.2), (1.2, 1.2)),
    'shoulder': ((2.8, -1.4, 6.6), (2.05, 2.2)),
    'upperarm_mid': ((3.1, -3.3, 5.8), (1.6, 1.7)),
    'elbow': ((3.35, -5.4, 5.0), (1.2, 1.24)),
    'forearm_mid': ((3.45, -7.0, 6.2), (1.02, 1.05)),
    'wrist': ((3.5, -8.4, 7.4), (0.8, 0.76)),
    'hand': ((3.6, -8.95, 8.4), (0.9, 0.55)),
}
FRONT_TOES = [
    ((4.7, -9.24, 10.3), 0.24),
    ((3.65, -9.24, 10.75), 0.26),
    ((2.6, -9.24, 10.3), 0.24),
    ((2.75, -8.8, 8.3), 0.2),  # 内側の短い指
]

# 翼（左）。腕（上腕・前腕）と4本の指の骨。広げたときの形で骨組みを作る（膜がしわにならない）
WING = {
    'root': (2.3, 3.7, 6.2),
    'elbow': (10.8, 5.3, 2.8),
    'wrist': (20.8, 6.9, 7.3),
    'thumb': (21.9, 7.4, 9.4),
    'fingers': [
        ((30.2, 6.1, 4.6), (39.6, 4.7, -1.4)),
        ((28.6, 5.0, -1.8), (35.6, 2.8, -11.8)),
        ((24.8, 4.2, -6.6), (27.4, 2.0, -18.6)),
        ((19.0, 4.4, -5.2), (14.8, 2.6, -16.8)),
    ],
}
# 膜が胴に付く線（肩の後ろ → 脇腹 → 腰の上）
WING_BODY_LINE = [(2.1, 3.4, 5.0), (2.1, 2.9, 0.5), (2.0, 2.3, -4.0), (2.2, 1.6, -7.6)]


def mirror(p):
    return (-p[0], p[1], p[2])


def side_point(p, side):
    """左（side=+1）の点を右（-1）へ写す。"""
    return p if side > 0 else mirror(p)


SIDES = (('L', 1), ('R', -1))


def bone_table():
    """骨の一覧：(名前, 頭の点, 尾の点, 親, 曲げの向きの目安)。点は遊びの向き。

    名前と親子は実行時（src/dragon/）が名前で引くので、変えるときは両方を直す。
    """
    S = SPINE
    bones = [
        ('body', (0.0, 0.0, 0.0), (0.0, 0.0, 2.0), None),
        ('pelvis', (0.0, 0.9, 0.0), S['hips'], 'body'),
        ('spine', (0.0, 0.9, 0.0), S['chest'], 'body'),
        ('chest', S['chest'], S['withers'], 'spine'),
    ]
    tail_names = ['hips', 'tail_02', 'tail_03', 'tail_04', 'tail_05', 'tail_06', 'tail_07', 'tail_08', 'tail_09', 'tail_10', 'tail_tip']
    parent = 'pelvis'
    for i in range(10):
        name = 'tail_%02d' % (i + 1)
        bones.append((name, S[tail_names[i]], S[tail_names[i + 1]], parent))
        parent = name
    neck_names = ['withers', 'neck_base', 'neck_1', 'neck_2', 'neck_3', 'neck_4', 'neck_5', 'head_joint']
    parent = 'chest'
    for i in range(7):
        name = 'neck_%02d' % (i + 1)
        bones.append((name, S[neck_names[i]], S[neck_names[i + 1]], parent))
        parent = name
    bones.append(('head', S['head_joint'], head_point(HEAD_LENGTH, 0.0), 'neck_07'))
    bones.append(('jaw', head_point(*JAW_HINGE), head_point(*JAW_TIP), 'head'))
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
        W = WING
        wrist = sp(W['wrist'])
        k2 = sp(W['fingers'][1][0])
        d = [k2[i] - wrist[i] for i in range(3)]
        n = math.sqrt(sum(c * c for c in d))
        hand_tail = tuple(wrist[i] + d[i] / n * 1.6 for i in range(3))
        bones += [
            ('wing_arm_' + suffix, sp(W['root']), sp(W['elbow']), 'chest'),
            ('wing_fore_' + suffix, sp(W['elbow']), wrist, 'wing_arm_' + suffix),
            ('wing_hand_' + suffix, wrist, hand_tail, 'wing_fore_' + suffix),
            ('wing_thumb_' + suffix, wrist, sp(W['thumb']), 'wing_hand_' + suffix),
        ]
        for k, (knuckle, tip) in enumerate(W['fingers']):
            a = 'wing_f%da_%s' % (k + 1, suffix)
            b = 'wing_f%db_%s' % (k + 1, suffix)
            bones.append((a, wrist, sp(knuckle), 'wing_hand_' + suffix))
            bones.append((b, sp(knuckle), sp(tip), a))
    return bones


def feet():
    """足の一覧：(名前, 足首までの鎖の骨, 足の裏の骨)。歩きの IK と歩幅の測定で使う。"""
    out = []
    for suffix, _ in SIDES:
        out.append(('H' + suffix, ['thigh_' + suffix, 'shin_' + suffix, 'foot_' + suffix], 'toe_' + suffix))
        out.append(('F' + suffix, ['upperarm_' + suffix, 'forearm_' + suffix, 'hand_' + suffix], 'finger_' + suffix))
    return out
