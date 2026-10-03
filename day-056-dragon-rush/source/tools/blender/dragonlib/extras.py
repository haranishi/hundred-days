# OWNER: dragon
"""背のとげ・爪。どれも別の部品として足し、いちばん近い骨1本に固く付ける。"""
from mathutils import Vector

from . import paint
from .anatomy import FRONT, FRONT_TOES, HIND, HIND_TOES, SIDES, WING, bone_table, side_point
from .body import spine_samples
from .shapes import Piece, curved_cone, lerp, smoothstep, sweep


def _seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-9)))
    return (a + ab * t - p).length


def nearest_bone(p, names):
    table = {name: (Vector(h), Vector(t)) for name, h, t, _ in bone_table()}
    p = Vector(p)
    return min(names, key=lambda n: _seg_dist(p, *table[n]))


SPINE_BONES = ['pelvis', 'spine', 'chest'] + ['tail_%02d' % i for i in range(1, 11)] + ['neck_%02d' % i for i in range(1, 8)]


def dorsal_spikes(rng):
    """背の中央のとげ：首の後ろから尾の先まで。肩の上で最も大きく、首と尾の先へ小さくなる。後ろへ傾ける。"""
    p = Piece('spikes')
    samples, total = spine_samples(0.25)
    up_w = Vector((0, 1, 0))
    s = 0.035 * total
    k = 0
    while s < 0.965 * total:
        i = min(range(len(samples)), key=lambda j: abs(samples[j][2] - s))
        pt, rad, _ = samples[i]
        a = samples[max(0, i - 1)][0]
        b = samples[min(len(samples) - 1, i + 1)][0]
        tan = (b - a).normalized()
        up = (up_w - tan * up_w.dot(tan)).normalized()
        u = s / total
        # 大きさ：尾の先 0.35m → 腰 1.2m → 肩 1.75m → 首の上 0.7m
        h = (lerp(0.35, 1.2, smoothstep(0.0, 0.45, u)) if u < 0.55 else lerp(1.75, 0.7, smoothstep(0.62, 0.97, u)))
        if 0.45 <= u < 0.62:
            h = lerp(1.2, 1.75, smoothstep(0.45, 0.6, u))
        h *= 0.88 + 0.24 * rng.random()
        # r00c-竜: 指摘「とげがどれも同じ形」 大きさだけの揺らぎ → 後ろへの傾き・横への傾き・色の濃さも揺らし、1割弱は先が欠けている
        rake = 0.6 * (0.8 + 0.4 * rng.random())
        side = Vector((0.0, 1.0, 0.0)).cross(tan).normalized() * (h * 0.09 * (rng.random() * 2.0 - 1.0))
        tone = 0.85 + 0.25 * rng.random()
        broken = rng.random() < 0.08
        base = pt + up * (rad[1] + 0.12)
        tip = base + up * (h * (0.72 if broken else 1.0)) - tan * (rake * h) + side
        bone = nearest_bone(base, SPINE_BONES)
        curved_cone(p, base - up * 0.3, tip, 0.34 * h + 0.08, -tan * 0.12 * h, 8, 6,
                    lambda kk, ii, tone=tone: paint.horn_color(0.18 + kk / 6.5, 0.5, tone), lambda kk, q, bone=bone: {bone: 1.0},
                    lambda kk, h=h: {'part': paint.PART_HORN, 'scale': 0.05, 'along': 1.2 * h * kk / 5}, flatten=(0.34, 1.0), up_hint=tan,
                    profile=(lambda t: (1.0 - 0.7 * t) ** 0.9) if broken else None)
        step = 1.05 + 0.55 * min(1.0, h / 1.2)
        s += step
        k += 1
    return p, k


def claws():
    p = Piece('claws')
    for suffix, side in SIDES:
        sp = lambda q: Vector(side_point(q, side))
        ball = sp(HIND['ball'][0])
        heel = sp(HIND['ankle'][0]).lerp(ball, 0.6)
        # r00c-竜: 足を大きくしたのに合わせて、爪も長く太く（後ろ脚 1.25→1.6m・太さ 0.22→0.32m）。先は地面へ食い込む向き
        for k, (tip, r) in enumerate(HIND_TOES):
            start = heel if k == 3 else ball
            t = sp(tip)
            d = (t - start)
            d.y = 0
            d.normalize()
            L = 1.05 if k == 3 else 1.6
            base = t - d * 0.2 + Vector((0, 0.08, 0))
            curved_cone(p, base, base + d * L + Vector((0, -0.46, 0)), 0.32 if k < 3 else 0.25, Vector((0, 0.2, 0)), 7, 6,
                        lambda kk, ii: paint.claw_color(kk / 5), lambda kk, q, s=suffix: {'toe_' + s: 1.0},
                        lambda kk: {'part': paint.PART_CLAW, 'scale': 0.05})
        hand = sp(FRONT['hand'][0])
        wristish = sp(FRONT['wrist'][0]).lerp(hand, 0.5)
        for k, (tip, r) in enumerate(FRONT_TOES):
            start = wristish if k == 3 else hand
            t = sp(tip)
            d = (t - start)
            d.y = 0
            d.normalize()
            L = 0.9 if k == 3 else 1.4
            base = t - d * 0.18 + Vector((0, 0.07, 0))
            bone = 'hand_' + suffix if k == 3 else 'finger_' + suffix
            curved_cone(p, base, base + d * L + Vector((0, -0.42, 0)), 0.29 if k < 3 else 0.22, Vector((0, 0.18, 0)), 7, 6,
                        lambda kk, ii: paint.claw_color(kk / 5), lambda kk, q, b=bone: {b: 1.0},
                        lambda kk: {'part': paint.PART_CLAW, 'scale': 0.05})
        # 翼の親指の爪
        thumb = sp(WING['thumb'])
        wrist = sp(WING['wrist'])
        d = (thumb - wrist).normalized()
        curved_cone(p, thumb - d * 0.2, thumb + d * 1.5 + Vector((0, -0.5, 0)), 0.24, Vector((0, 0.2, 0)), 7, 6,
                    lambda kk, ii: paint.claw_color(kk / 5), lambda kk, q, s=suffix: {'wing_thumb_' + s: 1.0},
                    lambda kk: {'part': paint.PART_CLAW, 'scale': 0.05})
        # 翼の指の先の小さな爪
        for k, (knuckle, tip) in enumerate(WING['fingers']):
            t = sp(tip)
            d = (t - sp(knuckle)).normalized()
            curved_cone(p, t - d * 0.3, t + d * 0.55, 0.09, Vector((0, -0.05, 0)), 5, 4,
                        lambda kk, ii: paint.claw_color(kk / 3), lambda kk, q, s=suffix, k=k: {'wing_f%db_%s' % (k + 1, s): 1.0},
                        lambda kk: {'part': paint.PART_CLAW, 'scale': 0.05})
    return p



def finger_tubes(seed=0):
    """翼の指の骨：手首から節（ナックル）を通って先へ細くなる管。付け根は手首の肉に埋める。"""
    p = Piece('fingers')
    radii = [(0.34, 0.26, 0.09), (0.33, 0.25, 0.085), (0.32, 0.24, 0.08), (0.32, 0.24, 0.085)]
    for suffix, side in SIDES:
        sp = lambda q: Vector(side_point(q, side))
        wrist = sp(WING['wrist'])
        u = (sp(WING['fingers'][0][0]) - wrist).normalized()
        starts = [wrist + u * 1.2, wrist + u * 1.2, wrist + u * 0.6, wrist]
        for k, (knuckle, tip) in enumerate(WING['fingers']):
            a, b = starts[k], sp(knuckle)
            t_end = sp(tip)
            la, lb = (b - a).length, (t_end - b).length
            path, rad, wts = [], [], []
            n1, n2 = max(2, int(la / 1.3)), max(2, int(lb / 1.3))
            r0, r1, r2 = radii[k]
            for i in range(n1):
                t = i / n1
                path.append(a.lerp(b, t))
                rad.append(lerp(r0, r1, t) * (1.0 + 0.18 * smoothstep(0.75, 1.0, t)))
            for i in range(n2 + 1):
                t = i / n2
                path.append(b.lerp(t_end, t))
                rad.append(lerp(r1 * 1.12, r2, t ** 0.8))
            total = la + lb
            names = ('wing_f%da_%s' % (k + 1, suffix), 'wing_f%db_%s' % (k + 1, suffix), 'wing_hand_' + suffix)

            def weight(kk, q, a=a, la=la, total=total, names=names):
                d = (q - a).length
                bb = smoothstep(la - 1.0, la + 1.0, d)
                h = smoothstep(1.4, 0.0, d)
                w = {names[0]: (1 - bb) * (1 - h), names[1]: bb * (1 - h), names[2]: h}
                return {n: v for n, v in w.items() if v > 1e-4}

            col = paint.mix(paint.BACK, paint.MEMBRANE_EDGE, 0.5)
            sweep(p, path, rad, 8, lambda kk, i, col=col: col, weight, lambda kk: {'part': paint.PART_SKIN, 'scale': 0.16},
                  flatten=(1.0, 0.85), cap_start=True, cap_end=False)
        thumb = sp(WING['thumb'])
        path = [wrist.lerp(thumb, t / 3) for t in range(4)]
        sweep(p, path, [0.4, 0.34, 0.27, 0.2], 8, lambda kk, i: paint.mix(paint.BACK, paint.MEMBRANE_EDGE, 0.5),
              lambda kk, q, s=suffix: {'wing_thumb_' + s: 1.0}, lambda kk: {'part': paint.PART_SKIN, 'scale': 0.16}, cap_end=False)
    return p
