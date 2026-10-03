# OWNER: dragon
"""動きのクリップを組み立てる共通の道具（紅竜・雷翼・焔角で使い回す）。

姿勢は rig.py の約束（骨ごとの回転 D を休みの姿勢の軸で書く）で組み、足は IK で地面に置く。
歩き・走りはその場で足を後ろへ流す作りにし、接地している足の甲が後ろへ動く速さから歩幅（1周で進む距離）を測る。
実行時は「速さ ÷ 歩幅」で再生の速さを決めるので、足が滑らない。

怪獣ごとの違い（足の並び・首と尾の骨・歩き方・畳んだ脚の置き場所）は Author に渡す。クリップの中身は各設計図が書く。
"""
import math

import bpy
from mathutils import Quaternion, Vector

from .anatomy import FWD, G, LEFT, UP
from .rig import IDENTITY, Rig, solve_leg

FPS = 30


def qa(axis, deg):
    return Quaternion(axis, math.radians(deg))


def lift(deg):
    """前を向いた骨の先を上げる（首・頭）。"""
    return qa(LEFT, -deg)


def tail_up(deg):
    """後ろを向いた骨（尾）の先を上げる。"""
    return qa(LEFT, deg)


def turn_left(deg):
    """前を向いた骨を左へ振る。後ろを向いた尾に使うと先は右へ動く。"""
    return qa(UP, deg)


def roll_right(deg):
    return qa(FWD, deg)


def ss(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def bump(x, a, b):
    """区間 [a, b] で 0 → 1 → 0 と山を描く（両端はなめらか）。"""
    if x <= a or x >= b:
        return 0.0
    return math.sin(math.pi * (x - a) / (b - a)) ** 2


def slerp(q, t):
    return IDENTITY.slerp(q, max(0.0, min(1.0, t)))


class Pose:
    def __init__(self):
        self.D = {}
        self.offset = Vector((0, 0, 0))
        self.feet = {}

    def rot(self, bone, q):
        self.D[bone] = q @ self.D.get(bone, IDENTITY)

    def chain(self, bones, qs):
        for b, q in zip(bones, qs):
            self.rot(b, q)


def _tail_amp(i):
    return 0.35 + 0.13 * i


def _tail_lift(i):
    return 1.0 - 0.07 * i


class Author:
    """クリップを組み立てる道具。

    feet：(足の名前, 着く位相, [上の骨, 下の骨, 甲の骨], 指の骨, 左右 +1/-1) の並び。名前の頭の文字 H は後ろ脚、F は前脚
    tuck：{'H' と 'F': (足の甲の点, 甲の向き, 指の向き)}。畳んだ脚の置き場所（親の骨の休みの姿勢の空間。x は左の足の値）
    stance：{足の名前: (足の甲の点, 甲の向き, 指の向き)}（アーマチュアの空間）。休みの姿勢が立った形でない足（翼の手首を前脚に
      兼ねる怪獣など）の、地面に置いたときの基準。渡さない足は休みの姿勢の足の甲の位置と向きを使う
    tail_amp・tail_lift：尾の波の振れ幅と持ち上げの、骨ごとの割合（付け根 0 から数える）
    """

    def __init__(self, arm, feet, neck, tail, gaits, tuck, neck_yaw=(0.06, 0.1, 0.14, 0.16, 0.18, 0.18, 0.18), tail_amp=_tail_amp, tail_lift=_tail_lift, stance=None):
        self.arm = arm
        self.rig = Rig(arm)
        self.feet = feet
        self.neck = neck
        self.tail = tail
        self.gaits = gaits
        self.tuck = tuck
        self.neck_yaw = neck_yaw
        self.tail_amp = tail_amp
        self.tail_lift = tail_lift
        self.stance = stance or {}

    # 足 ----------------------------------------------------------------
    def planted(self, pose, foot, dz=0.0, dx=0.0, heel=0.0, lift_h=0.0, curl=0.0, weight=None):
        """足を地面（休みの姿勢の足の甲の位置からずらした所）に置く。weight を渡すと IK をその割合だけ効かせる（翼の腕を畳みながら着く、など）。"""
        pose.feet[foot] = ('world', dz, dx, heel, lift_h, curl) if weight is None else ('world', dz, dx, heel, lift_h, curl, weight)

    def tucked(self, pose, foot, amount=1.0, from_ground=False):
        """脚を畳む。amount 0 → 1 で、休みの足の位置（from_ground なら地面に置いた位置）から畳んだ位置へ。"""
        pose.feet[foot] = ('tuck', amount, from_ground)

    def free(self, pose, foot):
        """IK を掛けない（翼の腕を前脚に兼ねる怪獣の、飛んでいる間の前脚など）。"""
        pose.feet[foot] = ('free',)

    def gait_feet(self, pose, name, phase, amount=1.0):
        g = self.gaits[name]
        travel = g['stride'] * g['duty']
        ahead = travel * g['ahead']
        behind = travel - ahead
        touches = g.get('touch', {})
        heel_amp, heel_swing, curl_amp = g.get('heel', 32.0), g.get('heelSwing', 18.0), g.get('curl', 42.0)
        for foot, touch, _, _, _ in self.feet:
            q = (phase - touches.get(foot, touch)) % 1.0
            front = foot[0] == 'F'
            if q < g['duty']:
                s = q / g['duty']
                z = ahead - travel * s
                h = 0.0
                heel = heel_amp * ss(0.5, 1.0, s)
                curl = 0.0
            else:
                s = (q - g['duty']) / (1 - g['duty'])
                e = s - math.sin(2 * math.pi * s) / (2 * math.pi)
                z = -behind + travel * e
                h = g['lift'][1 if front else 0] * math.sin(math.pi * s) ** 0.9
                heel = heel_amp * (1 - ss(0.0, 0.55, s)) + heel_swing * bump(s, 0.2, 0.85)
                curl = curl_amp * bump(s, 0.05, 0.9)
            pose.feet[foot] = ('world', z * amount, 0.0, heel * amount, h * amount, curl * amount)

    def solve(self, pose):
        r = self.rig
        W = r.fk(pose.D, pose.offset)
        for foot, _, chain, toe, side in self.feet:
            spec = pose.feet.get(foot, ('world', 0.0, 0.0, 0.0, 0.0, 0.0))
            if spec[0] == 'free':
                continue
            parent = r.parent[chain[0]]
            meta_rest = r.rest_dir(chain[2])
            toe_rest = r.rest_dir(toe)
            ball_rest = r.head[toe]
            if foot in self.stance:
                ball_rest, meta_rest, toe_rest = self.stance[foot]
            weight = 1.0
            if spec[0] == 'world':
                _, dz, dx, heel, lift_h, curl = spec[:6]
                if len(spec) > 6:
                    weight = spec[6]
                ball = ball_rest + FWD * dz + LEFT * (dx * side) + UP * lift_h
                meta = qa(LEFT, heel) @ meta_rest
                toe_dir = qa(LEFT, curl) @ toe_rest
            else:
                amount, from_ground = spec[1], spec[2]
                qp, _ = W[parent]
                tb, tm, tt = self.tuck[foot[0]]
                t_ball = G(tb[0] * side, tb[1], tb[2])
                t_meta = G(*tm)
                t_toe = G(*tt)
                tuck_ball = r.apply(W, parent, t_ball)
                if from_ground:
                    rest_ball, meta0, toe0 = ball_rest, meta_rest, toe_rest
                else:
                    rest_ball, meta0, toe0 = r.apply(W, parent, ball_rest), qp @ meta_rest, qp @ toe_rest
                ball = rest_ball.lerp(tuck_ball, amount)
                meta = meta0.lerp(qp @ t_meta.normalized(), amount).normalized()
                toe_dir = toe0.lerp(qp @ t_toe.normalized(), amount).normalized()
            if weight >= 1.0:
                solve_leg(r, pose.D, W, chain, toe, ball, meta, toe_dir)
                continue
            before = {b: pose.D.get(b, IDENTITY) for b in list(chain) + [toe]}
            solve_leg(r, pose.D, W, chain, toe, ball, meta, toe_dir)
            for b, q0 in before.items():
                pose.D[b] = q0.slerp(pose.D[b], max(0.0, weight))
        return pose

    # 共通の部品 --------------------------------------------------------
    def neck_curve(self, pose, lifts, yaw=0.0, yaw_profile=None):
        for b, l, y in zip(self.neck, lifts, self.neck_yaw if yaw_profile is None else yaw_profile):
            pose.rot(b, turn_left(yaw * y) @ lift(l))

    def tail_wave(self, pose, amp, phase, lift_deg=0.0, freq=1.0, lag=0.55, lift_profile=None):
        for i, b in enumerate(self.tail):
            a = amp * self.tail_amp(i)
            lp = lift_profile[i] if lift_profile else lift_deg * self.tail_lift(i)
            pose.rot(b, turn_left(-a * math.sin(2 * math.pi * freq * phase - lag * i)) @ tail_up(lp))


def keyframe(arm, rig, pose, frame, prev):
    rig.to_pose(pose.D, pose.offset)
    for pb in arm.pose.bones:
        q = pb.rotation_quaternion.copy()
        last = prev.get(pb.name)
        if last is not None and last.dot(q) < 0:
            q.negate()
            pb.rotation_quaternion = q
        prev[pb.name] = q
        pb.keyframe_insert('rotation_quaternion', frame=frame, group=pb.name)
    arm.pose.bones['body'].keyframe_insert('location', frame=frame, group='body')


def measure_stride(arm, feet, frames, touches=None):
    """歩き・走りの接地している足の甲が、体に対して後ろへ動く速さ（m/s）を測り、1周で進む距離にする。

    touches は足ごとの着く位相の上書き（歩き方ごとに足の順が違う怪獣の走りなど）。
    """
    scene = bpy.context.scene
    cycle = frames / FPS
    touches = touches or {}
    track = {foot: [] for foot, *_ in feet}
    # 最後のコマは最初のコマと同じ（輪にするため）なので測らない。時刻は足が着いた瞬間からの秒に直し、周の継ぎ目で途切れないようにする
    for f in range(frames):
        scene.frame_set(f)
        for foot, touch, _, toe, _ in feet:
            h = arm.pose.bones[toe].head
            t_rel = ((f / frames - touches.get(foot, touch)) % 1.0) * cycle
            track[foot].append((t_rel, h.z, -h.y))
    speeds = []
    slide = 0.0
    for foot, pts in track.items():
        low = min(p[1] for p in pts)
        stance = [p for p in pts if p[1] < low + 0.02]
        n = len(stance)
        if n < 3:
            continue
        mt = sum(p[0] for p in stance) / n
        mz = sum(p[2] for p in stance) / n
        cov = sum((p[0] - mt) * (p[2] - mz) for p in stance)
        var = sum((p[0] - mt) ** 2 for p in stance)
        v = -cov / var
        speeds.append(v)
        resid = max(abs((p[2] - mz) + v * (p[0] - mt)) for p in stance)
        slide = max(slide, resid)
    speed = sum(speeds) / len(speeds)
    return {'stride': round(speed * cycle, 3), 'cycle': round(cycle, 4), 'stanceSpeedAtClip': round(speed, 3), 'maxSlide': round(slide, 4)}


def author_clips(arm, author, builders, clips, gaits):
    """クリップを作って Action にし、歩き・走りの歩幅を測る。戻り値はクリップごとの長さ・区切り・測った歩幅。

    builders：{名前: builder(author, t) → Pose}、clips：{名前: {'duration', 'loop', 'marks'}}（builders の順に作る）。
    """
    arm.animation_data_create()
    info = {}
    for name, builder in builders.items():
        spec = clips[name]
        frames = int(round(spec['duration'] * FPS))
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        arm.animation_data.action = act
        prev = {}
        for f in range(frames + 1):
            t = f / FPS
            if spec['loop'] and f == frames:
                t = 0.0
            keyframe(arm, author.rig, builder(author, t), f, prev)
        entry = {'duration': round(frames / FPS, 4), 'loop': spec['loop']}
        if 'marks' in spec:
            entry['marks'] = spec['marks']
        if name in gaits:
            entry.update(measure_stride(arm, author.feet, frames, gaits[name].get('touch')))
        info[name] = entry
    arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.rotation_quaternion = IDENTITY
        pb.location = Vector((0, 0, 0))
    return info
