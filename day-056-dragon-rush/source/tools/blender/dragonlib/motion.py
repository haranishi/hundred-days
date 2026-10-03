# OWNER: dragon
"""動きのクリップ。名前は固定（実行時 src/dragon/ が名前で引く）：
idle・walk・run・takeoff・fly・glide・dive・land・breath・claw・tail・roar。

姿勢は rig.py の約束（骨ごとの回転 D を休みの姿勢の軸で書く）で組み、足は IK で地面に置く。
歩き・走りはその場で足を後ろへ流す作りにし、接地している足の甲が後ろへ動く速さから歩幅（1周で進む距離）を測る。
実行時は「速さ ÷ 歩幅」で再生の速さを決めるので、足が滑らない。

技（claw・tail・roar・breath）は、遊びの側の段階（振りかぶり・当たり・戻り）の長さに合わせて区切りを持つ（marks）。
"""
import math

from . import author
from .anatomy import FWD, G, LEFT, UP
from .author import Pose, bump, lift, qa, roll_right, slerp, ss, tail_up, turn_left
from .rig import IDENTITY, aim

FPS = author.FPS

# 足の順と、足が着く位相（遊びの側の gameplay/locomotion.ts の FEET と同じ：後ろ左 → 前左 → 後ろ右 → 前右）
FEET = [
    ('HL', 0.0, ['thigh_L', 'shin_L', 'foot_L'], 'toe_L', 1),
    ('FL', 0.25, ['upperarm_L', 'forearm_L', 'hand_L'], 'finger_L', 1),
    ('HR', 0.5, ['thigh_R', 'shin_R', 'foot_R'], 'toe_R', -1),
    ('FR', 0.75, ['upperarm_R', 'forearm_R', 'hand_R'], 'finger_R', -1),
]

# 歩き・走りの設計値（測った値は metadata に書く）。stride = 1周で進む距離、duty = 接地している割合
GAITS = {
    'walk': {'cycle': 1.6, 'stride': 15.0, 'duty': 0.62, 'lift': (1.7, 1.45), 'ahead': 0.52},
    'run': {'cycle': 1.1, 'stride': 24.0, 'duty': 0.38, 'lift': (2.7, 2.3), 'ahead': 0.52},
}

# 畳んだ脚の置き場所（親の骨の休みの姿勢の空間）：後ろ脚は腰の下の後ろ、前脚は胸の下
TUCK = {
    'H': ((3.3, -3.7, -12.6), (0.0, 0.18, -1.0), (0.0, -0.1, -1.0)),
    'F': ((2.8, -3.9, 3.3), (0.0, 0.08, -1.0), (0.0, -0.4, -0.92)),
}

CLIPS = {
    'idle': {'duration': 4.0, 'loop': True},
    'walk': {'duration': GAITS['walk']['cycle'], 'loop': True},
    'run': {'duration': GAITS['run']['cycle'], 'loop': True},
    'takeoff': {'duration': 1.4, 'loop': False, 'marks': {'crouch': [0.0, 0.32], 'leap': [0.32, 1.4]}},
    'fly': {'duration': 1.2, 'loop': True},
    'glide': {'duration': 3.0, 'loop': True},
    'dive': {'duration': 1.2, 'loop': True},
    'land': {'duration': 1.3, 'loop': False},
    'breath': {'duration': 2.2, 'loop': False, 'marks': {'charge': [0.0, 0.3], 'thrust': [0.3, 0.6], 'loop': [0.6, 2.2]}},
    'claw': {'duration': 0.8, 'loop': False, 'marks': {'windup': [0.0, 0.22], 'active': [0.22, 0.36], 'recovery': [0.36, 0.8]}},
    'tail': {'duration': 1.1, 'loop': False, 'marks': {'windup': [0.0, 0.32], 'active': [0.32, 0.58], 'recovery': [0.58, 1.1]}},
    'roar': {'duration': 1.6, 'loop': False, 'marks': {'windup': [0.0, 0.47], 'active': [0.47, 0.6], 'recovery': [0.6, 1.6]}},
}

NECK = ['neck_%02d' % i for i in range(1, 8)]
TAIL = ['tail_%02d' % i for i in range(1, 11)]


class Author(author.Author):
    """紅竜のクリップの道具：共通の道具（足・首・尾）に、翼を畳んだ姿勢と翼の動かし方を足す。畳んだ姿勢はここで一度だけ求める。"""

    def __init__(self, arm):
        super().__init__(arm, FEET, NECK, TAIL, GAITS, TUCK)
        self.fold = {}
        for suffix, side in (('L', 1), ('R', -1)):
            self._fold_wing(suffix, side)

    def _fold_wing(self, suffix, side):
        r = self.rig
        x = float(side)
        h, qh = aim(r, IDENTITY, 'wing_arm_' + suffix, G(0.25 * x, 0.12, -0.96))
        f, qf = aim(r, qh, 'wing_fore_' + suffix, G(0.0, 0.47, 0.88))
        hand, qhand = aim(r, qf, 'wing_hand_' + suffix, G(0.02 * x, -0.25, -0.97))
        self.fold['wing_arm_' + suffix] = h
        self.fold['wing_fore_' + suffix] = f
        self.fold['wing_hand_' + suffix] = hand
        dirs = [(0.03, -0.17, -0.98), (0.015, -0.23, -0.97), (0.0, -0.29, -0.955), (-0.02, -0.35, -0.935)]
        for k, d in enumerate(dirs):
            a = 'wing_f%da_%s' % (k + 1, suffix)
            b = 'wing_f%db_%s' % (k + 1, suffix)
            da, qa_ = aim(r, qhand, a, G(d[0] * x, d[1], d[2]))
            db, _ = aim(r, qa_, b, G(d[0] * x, d[1] - 0.06, d[2]))
            self.fold[a] = da
            self.fold[b] = db
        t, _ = aim(r, qhand, 'wing_thumb_' + suffix, G(0.15 * x, -0.3, 0.94))
        self.fold['wing_thumb_' + suffix] = t

    def wing(self, pose, fold=1.0, flap=0.0, sweep=0.0, pron=0.0, flex=0.0, ffold=0.0, tip=0.0, spread=0.0):
        """翼の姿勢。fold 1 で畳む・0 で広げる。flap は上げ（度）、sweep は前へ、pron は前縁を下げる、
        flex は肘を畳む、ffold は指を後ろへ畳む、tip は指の先の反り（下が正）、spread は指を開く。"""
        for suffix, side in (('L', 1), ('R', -1)):
            F = self.fold
            s = float(side)
            pose.D['wing_arm_' + suffix] = qa(FWD, s * flap) @ qa(UP, -s * sweep) @ qa(LEFT, pron) @ slerp(F['wing_arm_' + suffix], fold)
            pose.D['wing_fore_' + suffix] = qa(UP, -s * flex) @ slerp(F['wing_fore_' + suffix], fold)
            pose.D['wing_hand_' + suffix] = slerp(F['wing_hand_' + suffix], fold)
            for k in range(4):
                a = 'wing_f%da_%s' % (k + 1, suffix)
                b = 'wing_f%db_%s' % (k + 1, suffix)
                fan = (1.5 - k) * spread
                pose.D[a] = qa(UP, s * (ffold * (0.6 + 0.2 * k) - fan)) @ slerp(F[a], fold)
                pose.D[b] = qa(FWD, -s * tip * (0.5 + 0.2 * k)) @ slerp(F[b], fold)
            pose.D['wing_thumb_' + suffix] = slerp(F['wing_thumb_' + suffix], fold)


# クリップ ---------------------------------------------------------------

def clip_idle(A, t):
    p = Pose()
    ph = t / CLIPS['idle']['duration']
    w = 2 * math.pi * ph
    breath = math.sin(w * 2)
    p.offset = UP * (0.1 * breath) + LEFT * (0.18 * math.sin(w))
    p.rot('body', roll_right(0.8 * math.sin(w)))
    p.rot('chest', lift(0.9 * breath))
    p.rot('spine', lift(0.4 * breath))
    look = 9.0 * math.sin(w) + 3.0 * math.sin(3 * w + 0.7)
    A.neck_curve(p, [12, 7, 3, 0, -5, -8, -6], yaw=look)
    p.rot('head', lift(-3 + 2.0 * math.sin(w + 1.1)) @ roll_right(2.0 * math.sin(w + 0.4)))
    p.rot('jaw', qa(LEFT, 1.5 + 1.0 * max(0.0, breath)))
    A.tail_wave(p, 2.2, ph, lift_deg=2.5)
    A.wing(p, fold=1.0, flap=1.0 * breath)
    for foot, *_ in FEET:
        A.planted(p, foot)
    return A.solve(p)


def _walk_body(A, p, ph, name):
    w = 2 * math.pi * ph
    run = name == 'run'
    bob = (0.48 if run else 0.2) * math.cos(4 * math.pi * (ph - 0.08))
    p.offset = UP * (bob - (0.55 if run else 0.18)) + LEFT * ((0.12 if run else 0.26) * math.sin(w))
    p.rot('body', roll_right((1.2 if run else 1.8) * math.sin(w + 0.3)) @ turn_left(1.4 * math.sin(w)))
    if run:
        p.rot('body', lift(-2.0 * math.cos(4 * math.pi * (ph - 0.15))))
    p.rot('pelvis', turn_left(3.0 * math.sin(w + math.pi / 2)) @ roll_right(2.5 * math.sin(w)))
    p.rot('chest', turn_left(-2.5 * math.sin(w - math.pi / 2)) @ roll_right(-2.0 * math.sin(w + 0.5)))
    for suffix, touch in (('L', 0.25), ('R', 0.75)):
        p.rot('scapula_' + suffix, qa(LEFT, (7.0 if run else 5.0) * math.cos(2 * math.pi * (ph - touch - 0.1))))


def clip_walk(A, t):
    p = Pose()
    ph = t / CLIPS['walk']['duration']
    _walk_body(A, p, ph, 'walk')
    A.neck_curve(p, [8, 4, 1, 0, -3, -5, -4], yaw=2.5 * math.sin(2 * math.pi * ph))
    p.rot('neck_01', lift(1.5 * math.cos(4 * math.pi * ph)))
    p.rot('head', lift(-1.5 * math.cos(4 * math.pi * ph)))
    A.tail_wave(p, 2.6, ph, lift_deg=3.0)
    A.wing(p, fold=1.0, flap=1.2 * math.cos(4 * math.pi * ph))
    A.gait_feet(p, 'walk', ph)
    return A.solve(p)


def clip_run(A, t):
    p = Pose()
    ph = t / CLIPS['run']['duration']
    _walk_body(A, p, ph, 'run')
    A.neck_curve(p, [-6, -5, -3, 0, 3, 4, 3], yaw=1.5 * math.sin(2 * math.pi * ph))
    p.rot('neck_01', lift(3.0 * math.cos(4 * math.pi * ph + 0.6)))
    p.rot('head', lift(-2.5 * math.cos(4 * math.pi * ph + 0.6)))
    A.tail_wave(p, 1.6, ph, lift_deg=6.0)
    A.wing(p, fold=0.82, flap=6.0 + 5.0 * math.cos(4 * math.pi * ph), ffold=6.0)
    A.gait_feet(p, 'run', ph)
    return A.solve(p)


def _air_neck(A, p, ph, amp=1.0):
    A.neck_curve(p, [-10, -7, -5, -2, 3, 6, 5], yaw=1.5 * amp * math.sin(2 * math.pi * ph))


def clip_glide(A, t):
    p = Pose()
    ph = t / CLIPS['glide']['duration']
    w = 2 * math.pi * ph
    p.offset = UP * (0.25 * math.sin(w))
    _air_neck(A, p, ph)
    p.rot('head', lift(2.0 * math.sin(w + 0.5)))
    A.tail_wave(p, 1.4, ph, lift_deg=7.0)
    A.wing(p, fold=0.0, flap=7.0 + 2.2 * math.sin(w), tip=1.5 * math.sin(w - 0.6), sweep=1.5 * math.sin(w + 1.0))
    for foot, *_ in FEET:
        A.tucked(p, foot)
    return A.solve(p)


def flap_angles(ph):
    """羽ばたきの1周（位相 0 が振り上げの頂点）。上げ角・前への振り・前縁の下げ・肘と指の畳み・指先の遅れ。"""
    w = 2 * math.pi * ph
    flap = 40.0 * math.cos(w) + 2.0
    sweep = 9.0 * math.sin(w)
    pron = 9.0 * math.sin(w)
    up = bump(ph, 0.5, 1.02) + bump(ph, -0.02, 0.06)
    flex = 26.0 * up
    ffold = 24.0 * up
    tip = 12.0 * math.sin(w - 0.9)
    return flap, sweep, pron, flex, ffold, tip


def clip_fly(A, t):
    p = Pose()
    ph = t / CLIPS['fly']['duration']
    w = 2 * math.pi * ph
    flap, sweep, pron, flex, ffold, tip = flap_angles(ph)
    p.offset = UP * (0.7 * math.sin(w - 0.9))
    p.rot('body', lift(2.0 * math.sin(w - 0.9)))
    _air_neck(A, p, ph, 0.6)
    p.rot('neck_01', lift(-2.5 * math.sin(w - 0.9)))
    p.rot('head', lift(1.5 * math.sin(w - 0.4)))
    A.tail_wave(p, 1.2, ph, lift_deg=7.0, lag=0.4)
    for b in TAIL[:4]:
        p.rot(b, tail_up(1.5 * math.sin(w - 1.8)))
    A.wing(p, fold=0.0, flap=flap, sweep=sweep, pron=pron, flex=flex, ffold=ffold, tip=tip)
    for foot, *_ in FEET:
        A.tucked(p, foot)
    return A.solve(p)


def clip_dive(A, t):
    p = Pose()
    ph = t / CLIPS['dive']['duration']
    w = 2 * math.pi * ph
    A.neck_curve(p, [-14, -10, -7, -3, 2, 4, 2])
    p.rot('head', lift(-4.0))
    A.tail_wave(p, 0.8, ph, lift_deg=9.0, freq=2.0)
    flutter = math.sin(w * 6.0)
    A.wing(p, fold=0.5, flap=22.0 + 1.5 * flutter, sweep=-24.0, ffold=18.0, tip=2.5 * flutter)
    for foot, *_ in FEET:
        A.tucked(p, foot)
    return A.solve(p)


def clip_takeoff(A, t):
    p = Pose()
    crouch = ss(0.0, 0.32, t) * (1 - ss(0.32, 0.6, t))
    leap = ss(0.32, 0.62, t)
    p.offset = UP * (-1.9 * crouch + 1.6 * leap * (1 - ss(0.9, 1.4, t)))
    p.rot('body', lift(-4.0 * crouch + 7.0 * leap))
    A.neck_curve(p, [-6 * crouch + 4 * leap, -4 * crouch, -2, 0, 3 * crouch, 4, 2])
    A.tail_wave(p, 1.0, t / 1.4, lift_deg=4.0 + 4.0 * leap)
    # 1回目の振り下ろし（0.32〜0.62）、振り上げ（〜1.0）、2回目の振り下ろし（〜1.4）
    if t < 0.32:
        flap = 10 + 48 * ss(0.0, 0.3, t)
        fold = 1.0 - 0.8 * ss(0.0, 0.3, t)
    elif t < 0.62:
        flap = 58 - 98 * ss(0.32, 0.62, t)
        fold = 0.2 - 0.2 * ss(0.32, 0.5, t)
    elif t < 1.0:
        flap = -40 + 78 * ss(0.62, 1.0, t)
        fold = 0.0
    else:
        flap = 38 - 66 * ss(1.0, 1.4, t)
        fold = 0.0
    up_phase = bump(t, 0.62, 1.02)
    A.wing(p, fold=fold, flap=flap, sweep=6.0 * (1 - up_phase), flex=24.0 * up_phase, ffold=22.0 * up_phase, tip=-8.0 * up_phase)
    for foot, *_ in FEET:
        hind = foot[0] == 'H'
        start = 0.5 if hind else 0.42
        if t < start:
            A.planted(p, foot, heel=20.0 * leap)
        else:
            A.tucked(p, foot, ss(start, start + 0.55, t), from_ground=True)
    return A.solve(p)


def clip_land(A, t):
    p = Pose()
    impact = bump(t, -0.12, 0.36)
    settle = ss(0.2, 1.1, t)
    bounce = 0.35 * math.sin(math.pi * ss(0.3, 0.9, t)) * (1 - ss(0.9, 1.3, t))
    p.offset = UP * (-2.4 * impact + bounce)
    p.rot('body', lift(-3.0 * impact))
    A.neck_curve(p, [-12 * impact + 4 * settle, -6 * impact, -3 * impact, 0, 4 * impact, 5 * impact, 3 * impact])
    p.rot('head', lift(5.0 * impact))
    A.tail_wave(p, 1.2 * (1 - settle), t / 1.3, lift_profile=[(-6.0 * impact + 3.0 * settle) * (1 - 0.06 * i) for i in range(10)])
    flap = 38.0 * (1 - ss(0.0, 0.18, t)) - 16.0 * bump(t, 0.05, 0.4) + 8.0 * settle * (1 - ss(0.7, 1.3, t))
    A.wing(p, fold=ss(0.25, 1.25, t), flap=flap, sweep=10.0 * (1 - settle), ffold=10.0 * bump(t, 0.3, 1.0))
    for foot, *_ in FEET:
        A.planted(p, foot)
    return A.solve(p)


def clip_breath(A, t):
    p = Pose()
    charge = ss(0.0, 0.3, t) * (1 - ss(0.3, 0.55, t))
    thrust = ss(0.3, 0.6, t)
    loop = (t - 0.6) / 1.6 if t > 0.6 else 0.0
    sweep = math.sin(2 * math.pi * loop) * ss(0.6, 0.9, t)
    shake = math.sin(2 * math.pi * loop * 6.0) * thrust
    p.offset = UP * (0.45 * charge - 0.2 * thrust)
    p.rot('body', lift(-3.0 * charge + 2.5 * thrust))
    p.rot('chest', lift(3.0 * charge))
    lifts = [8 * charge - 6 * thrust, 6 * charge - 4 * thrust, 4 * charge - 2 * thrust, 0, -5 * charge + 3 * thrust, -6 * charge + 4 * thrust, -4 * charge + 3 * thrust]
    A.neck_curve(p, lifts, yaw=4.0 * sweep)
    p.rot('head', lift(-7.0 * thrust + 1.2 * shake) @ roll_right(1.0 * shake))
    p.rot('jaw', qa(LEFT, 8.0 * charge + 34.0 * thrust + 2.5 * shake * thrust))
    A.tail_wave(p, 1.6, t / 2.2, lift_deg=4.0 + 3.0 * thrust)
    A.wing(p, fold=1.0 - 0.45 * ss(0.0, 0.4, t), flap=12.0 * ss(0.0, 0.4, t) + 2.0 * sweep)
    for foot, *_ in FEET:
        A.planted(p, foot)
    return A.solve(p)


def clip_claw(A, t):
    p = Pose()
    wind = ss(0.0, 0.22, t) * (1 - ss(0.22, 0.34, t))
    strike = ss(0.2, 0.36, t) * (1 - ss(0.4, 0.8, t))
    p.offset = UP * (0.9 * wind - 0.5 * strike) + FWD * (-0.4 * wind + 1.2 * strike)
    p.rot('body', lift(6.0 * wind - 7.0 * strike) @ turn_left(-6.0 * wind + 9.0 * strike))
    p.rot('chest', turn_left(-5.0 * wind + 8.0 * strike) @ roll_right(-4.0 * wind + 5.0 * strike))
    A.neck_curve(p, [6 * wind - 6 * strike, 4 * wind - 4 * strike, 2 * wind, 0, -3 * wind + 3 * strike, -4 * wind + 4 * strike, -2 * wind], yaw=-6.0 * wind + 10.0 * strike)
    p.rot('jaw', qa(LEFT, 6.0 * wind + 16.0 * strike))
    A.tail_wave(p, 1.5, t / 0.8, lift_deg=3.0 + 3.0 * wind)
    A.wing(p, fold=1.0 - 0.3 * wind, flap=10.0 * wind)
    for foot, *_ in FEET:
        if foot == 'FR':
            # 右の前脚：振りかぶって前上へ上げ、当たりで内側の下へ薙ぐ
            up = 6.8 * wind + 1.4 * strike
            fwd = 3.8 * wind + 5.6 * strike
            inward = -0.8 * wind + 3.6 * strike
            A.planted(p, foot, dz=fwd, dx=-inward, lift_h=up, heel=35.0 * (wind + strike), curl=-25.0 * wind + 20.0 * strike)
        else:
            A.planted(p, foot)
    return A.solve(p)


def clip_tail(A, t):
    p = Pose()
    wind = ss(0.0, 0.32, t)
    whip = ss(0.3, 0.6, t)
    settle = ss(0.58, 1.1, t)
    # 尾の振り：左へ巻いて（正）、右へ薙ぎ（負）、戻りで少し揺れて落ち着く
    side = 1.0 * wind - 2.0 * whip + 1.0 * settle
    wobble = 0.25 * math.sin(2 * math.pi * 1.6 * (t - 0.58)) * (1 - settle) * ss(0.58, 0.7, t)
    for i, b in enumerate(TAIL):
        k = (i + 1) / 10.0
        lag = ss(0.3 + 0.02 * i, 0.62 + 0.03 * i, t) if t > 0.3 else 0.0
        s_i = 1.0 * wind - 2.0 * lag + 1.0 * settle
        amp = 13.0 * (0.4 + 0.6 * k)
        p.rot(b, turn_left(-amp * (s_i + wobble)) @ tail_up(4.5 * (1 - 0.08 * i) * (wind * (1 - settle)) + 2.0))
    p.rot('pelvis', turn_left(10.0 * side))
    p.rot('body', turn_left(-4.0 * side) @ roll_right(3.0 * side))
    p.rot('chest', turn_left(-5.0 * side))
    A.neck_curve(p, [4, 2, 0, 0, -2, -3, -2], yaw=12.0 * side)
    A.wing(p, fold=1.0 - 0.2 * bump(t, 0.2, 0.9), flap=6.0 * bump(t, 0.2, 0.9))
    for foot, *_ in FEET:
        A.planted(p, foot)
    return A.solve(p)


def clip_roar(A, t):
    p = Pose()
    rear = ss(0.0, 0.45, t) * (1 - ss(0.5, 0.75, t))
    roar = ss(0.42, 0.56, t) * (1 - ss(1.15, 1.55, t))
    tremble = math.sin(2 * math.pi * 9.0 * t) * roar
    p.offset = UP * (1.3 * rear + 0.5 * roar) + FWD * (-0.8 * rear + 0.6 * roar)
    p.rot('body', lift(9.0 * rear + 4.0 * roar))
    p.rot('chest', lift(4.0 * rear))
    lifts = [14 * rear + 6 * roar, 8 * rear + 2 * roar, 4 * rear - 2 * roar, 0, -6 * rear + 6 * roar, -8 * rear + 8 * roar, -6 * rear + 6 * roar]
    A.neck_curve(p, lifts, yaw=2.0 * tremble)
    p.rot('head', lift(14.0 * roar - 6.0 * rear + 1.2 * tremble))
    p.rot('jaw', qa(LEFT, 10.0 * rear + 46.0 * roar + 3.0 * tremble))
    A.tail_wave(p, 2.0, t / 1.6, lift_deg=5.0 + 6.0 * roar)
    A.wing(p, fold=1.0 - 0.75 * rear - 0.25 * roar - (0.0 if t < 0.6 else -0.95 * ss(1.1, 1.6, t)), flap=38.0 * rear + 28.0 * roar + 2.5 * tremble, spread=4.0 * roar)
    for foot, *_ in FEET:
        A.planted(p, foot)
    return A.solve(p)


BUILDERS = {
    'idle': clip_idle, 'walk': clip_walk, 'run': clip_run, 'takeoff': clip_takeoff, 'fly': clip_fly, 'glide': clip_glide,
    'dive': clip_dive, 'land': clip_land, 'breath': clip_breath, 'claw': clip_claw, 'tail': clip_tail, 'roar': clip_roar,
}


def author_clips(arm):
    """12のクリップを作って Action にし、歩幅を測る。戻り値はクリップごとの長さ・区切り・測った歩幅。"""
    return author.author_clips(arm, Author(arm), BUILDERS, CLIPS, GAITS)


def metadata(clips, points):
    """GLB の extras（three.js の userData.dragon）に入れる、実行時が読む値。

    points は休みの姿勢での目印（glTF の座標 = 遊びの向き：x 左・y 上・z 前）と、それが付く骨。
    実行時はこれを骨の局所へ直して、口の位置（炎の出どころ）や頭の向きを求める。
    """
    return {
        'version': 1,
        'clips': clips,
        'feet': {foot: {'toe': toe, 'chain': chain, 'touch': touch} for foot, touch, chain, toe, _ in FEET},
        'ground': -9.5,
        'points': points,
    }
