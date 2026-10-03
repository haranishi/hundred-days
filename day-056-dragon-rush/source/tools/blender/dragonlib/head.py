# OWNER: dragon
"""頭：頭蓋と上顎・下顎・舌・喉の内張り・目・歯・角・頬と顎のとげ。

頭は Skin では丸すぎるので、断面（上半分は丸く、下半分は平らな口蓋）を前後に並べたロフトで作る。
眉の張り・頬骨・眼窩のくぼみ・鼻の穴の盛り上がりは、断面を外へ押し出す量で付ける。
口を開けると喉の内張り（上半分は頭、下半分は顎の骨に重み）が伸びて、口の奥が暗い赤で塞がる。

輪郭の表・断面の張り出し・目・歯の並び・角・色は HeadSpec（頭の設計）にまとめてあり、既定は紅竜（DRAGON）。
雷翼と焔角は、自分の設計図（tools/blender/creatures/）で HeadSpec を作って同じ組み立てを使う。
歯の形（tooth_shape）と舌（tongue_shape）は、HeadSpec に関数を持たせた怪獣だけ差し替える（r04-roster2。紅竜は持たない）。
"""
import math
import random

from mathutils import Vector

from . import paint
from .anatomy import HEAD_LENGTH, head_frame, head_point
from .shapes import Curve1D, Piece, bezier, curved_cone, ellipsoid, gauss, lerp, loft, sgnpow, smoothstep, sweep, value_noise

# 頭の輪郭（頭の局所：前 s・上 up）。上面の高さ・口の線の高さ・半分の幅
TOP = Curve1D([(-0.9, 1.25), (0.0, 1.45), (0.8, 1.62), (1.5, 1.66), (2.1, 1.58), (2.8, 1.32), (3.6, 1.08), (4.5, 0.92), (5.4, 0.80), (6.2, 0.66), (6.8, 0.42), (7.0, 0.10)])
MOUTH = Curve1D([(-0.9, -1.15), (0.35, -1.05), (1.8, -0.98), (3.5, -0.88), (5.5, -0.75), (6.7, -0.62), (7.0, -0.45)])
WIDTH = Curve1D([(-0.9, 1.40), (0.0, 1.70), (0.8, 1.95), (1.6, 1.85), (2.2, 1.68), (3.0, 1.35), (3.8, 1.12), (4.8, 0.98), (5.8, 0.88), (6.5, 0.76), (7.0, 0.30)])
JAW_DEPTH = Curve1D([(-0.55, 1.0), (0.4, 1.35), (1.5, 1.28), (3.0, 1.05), (4.5, 0.88), (5.8, 0.75), (6.6, 0.58), (6.85, 0.25)])
JAW_WIDTH = Curve1D([(-0.55, 1.35), (0.4, 1.60), (1.5, 1.55), (3.0, 1.25), (4.5, 1.0), (5.8, 0.85), (6.6, 0.65), (6.85, 0.25)])

RING = 52
EYE = (2.05, 0.66, 1.52)
SCALE_HEAD = 0.2


def _crest(x, w):
    """幅 w の尖った稜（中央で 1、両側へ直線より速く落ちる）。gauss より稜線がはっきり出る。"""
    t = max(0.0, 1.0 - abs(x) / w)
    return t * t * (1.5 - 0.5 * t)


def _features(s, th):
    """断面の角度 th（0 が上、+π/2 が左）での押し出し量（m）。眉・眼窩・頬骨・鼻・額の溝。"""
    d = 0.0
    for sign in (1.0, -1.0):
        a = th * sign
        brow = gauss(s - 2.05, 0.62)
        d += 0.5 * brow * _crest(a - 0.9, 0.42)  # 眉の張り（目の上に張り出す稜）
        d += 0.24 * gauss(s - 0.8, 1.0) * _crest(a - 0.84, 0.26) * smoothstep(2.3, 1.5, s)  # 眉から角の根元へ続く稜
        d += 0.13 * smoothstep(6.6, 5.2, s) * smoothstep(2.6, 3.4, s) * _crest(a - 0.62, 0.2)  # 鼻から眉への稜（鼻筋の両脇）
        d -= 0.24 * gauss(s - 2.05, 0.45) * gauss(a - 1.3, 0.28)  # 眼窩のくぼみ
        d += 0.26 * gauss(s - 1.0, 0.95) * _crest(a - 1.78, 0.3)  # 頬骨の弓（目の下から顎の付け根へ）
        d += 0.15 * gauss(s - 0.0, 0.6) * gauss(a - 1.6, 0.4)  # 顎の筋肉
        d += 0.16 * gauss(s - 6.4, 0.32) * _crest(a - 0.78, 0.3)  # 鼻の穴の盛り上がり
        d += 0.07 * smoothstep(6.8, 5.0, s) * smoothstep(0.5, 1.5, s) * _crest(a - 2.2, 0.16)  # 上唇の上の稜
    d -= 0.1 * gauss(s - 2.3, 0.8) * gauss(th, 0.2)  # 額の溝
    d += 0.1 * gauss(s - 0.4, 0.9) * gauss(th, 0.15)  # 頭頂の稜
    d += _rugae(s) * smoothstep(0.62, 0.15, abs(abs(th) - math.pi))  # 口蓋の横ひだ（口の中へ出る）
    return d


def _rugae(s):
    """口蓋の横ひだ（m）：口の奥から前へ、0.5m ほどの間隔で並ぶ低い山。r00c-竜: 指摘「口の中が一色の赤い板」"""
    wave = max(0.0, math.sin(2 * math.pi * s / 0.52)) ** 2
    return 0.06 * wave * smoothstep(0.6, 1.6, s) * smoothstep(6.3, 5.2, s)


def _head_weights(s):
    """頭の後ろの端は首の最後の骨と混ぜ、首を曲げても継ぎ目が割れないようにする。"""
    w = smoothstep(-0.8, 0.35, s)
    return {'head': w, 'neck_07': 1.0 - w} if w < 1.0 else {'head': 1.0}


def _head_scale(s, th):
    """頭の鱗の大きさ（m）。上面（頭頂と鼻筋）は大きな板、目のまわりは細かい粒、唇の上は小さな列、頬は中くらい。

    r00c-竜: 指摘「頭の鱗がどこも同じ大きさ」 一律 0.20〜0.25 → 上面 0.30〜0.36・目のまわり 0.1・唇 0.13・頬 0.19
    """
    a = abs(th)
    top = smoothstep(0.8, 0.2, a)
    eye = min(1.0, 1.3 * gauss(s - EYE[0], 0.75) * gauss(a - 1.2, 0.45))
    lip = smoothstep(2.05, 2.45, a) * smoothstep(-0.2, 0.8, s)
    sc = lerp(0.19, 0.36 if s < 3.3 else 0.3, top)
    sc = lerp(sc, 0.1, eye)
    sc = lerp(sc, 0.13, lip)
    return sc + 0.05 * smoothstep(0.4, -0.9, s)


def _upper_ring(s, h):
    top, mouth, w = h.top(s), h.mouth(s), h.width(s)
    c = 0.5 * (top + mouth)
    a = 0.5 * (top - mouth)
    pts = []
    for i in range(h.ring):
        th = 2 * math.pi * i / h.ring
        th_signed = th if th <= math.pi else th - 2 * math.pi
        ct, st = math.cos(th), math.sin(th)
        e = 2.0 / (h.upper_exp[0] if ct >= 0 else h.upper_exp[1])
        up = c + a * sgnpow(ct, e)
        left = w * sgnpow(st, e)
        d = h.features(s, th_signed)
        n = Vector((st, ct)).normalized()
        pts.append((up + n.y * d, left + n.x * d, th_signed))
    return pts


def _range(spec):
    """(始め, 長さ, 輪の数) → 等間隔の位置の並び。"""
    s0, span, n = spec
    return [s0 + span * k / (n - 1) for k in range(n)]


def upper_head(seed=0, h=None):
    h = h or DRAGON
    pal = h.palette
    p = Piece('head')
    rings = []
    # 細分化はかけず、断面を細かく刻む（稜線がなまらない）
    ss = _range(h.upper)
    for s in ss:
        ring = []
        for up, left, th in _upper_ring(s, h):
            q = h.point(s, up, left)
            inner = abs(abs(th) - math.pi) < 0.78
            lip = smoothstep(0.62, 0.92, abs(abs(th) - math.pi))
            dorsal = math.cos(th)
            col = pal.skin_color(q, dorsal, 0.0, 0.0, seed + 5)
            nostril = gauss(s - h.nostril[0], 0.13) * gauss(abs(th) - h.nostril[1], 0.1)
            col = paint.mix(col, pal.NOSTRIL, min(1.0, nostril * 1.6))
            if inner:
                col = paint.mix(pal.MOUTH, pal.GUM, lip)
                # ひだの山は明るい肉色、谷は暗く。奥（喉の側）ほど暗い
                fold = h.rugae(s) / 0.06
                col = paint.mix(paint.scale(col, 0.7 + 0.25 * smoothstep(0.5, 3.0, s)), pal.PALATE, 0.45 * fold)
            glow = (1.0 - lip) * 0.9 if inner else 0.0
            ring.append(p.add(q, col, h.weights(s), part=paint.PART_SKIN, glow=glow, scale=h.scale(s, th)))
        rings.append(ring)
    loft(p, rings)
    # 鼻先のふた
    tip = p.add(h.point(h.length + 0.02, 0.5 * (h.top(h.length) + h.mouth(h.length))), pal.BACK, {'head': 1.0}, scale=h.scale_head)
    last = rings[-1]
    for i in range(h.ring):
        p.faces.append((last[i], last[(i + 1) % h.ring], tip))
    return p


def _jaw_ring(s, h):
    top = h.mouth(s) - 0.02
    d = h.jaw_depth(s)
    w = h.jaw_width(s)
    c = top - 0.5 * d
    a = 0.5 * d
    pts = []
    for i in range(h.ring):
        th = 2 * math.pi * i / h.ring
        th_signed = th if th <= math.pi else th - 2 * math.pi
        ct, st = math.cos(th), math.sin(th)
        e = 2.0 / (h.jaw_exp[0] if ct >= 0 else h.jaw_exp[1])
        up = c + a * sgnpow(ct, e)
        left = w * sgnpow(st, e)
        if ct > 0:
            # 口の床のくぼみ（舌の溝）
            up -= 0.16 * (1.0 - (left / max(w, 1e-3)) ** 2) * smoothstep(0.2, 0.9, ct)
        pts.append((up, left, th_signed))
    return pts


def _jaw_scale(s, th):
    """顎の鱗の大きさ（m）：横は細かく、下（喉の板の手前）は少し大きく。"""
    return lerp(0.16, 0.24, smoothstep(1.6, 2.6, abs(th))) + 0.04 * smoothstep(0.6, -0.5, s)


def lower_jaw(total_along, seed=0, h=None):
    h = h or DRAGON
    pal = h.palette
    p = Piece('jaw')
    rings = []
    ss = _range(h.jaw)
    for s in ss:
        ring = []
        for up, left, th in _jaw_ring(s, h):
            q = h.point(s, up, left)
            floor = math.cos(th) > 0.55
            belly = smoothstep(2.0, 2.7, abs(th)) * smoothstep(-0.4, 0.6, s)
            col = pal.skin_color(q, -0.2 * math.cos(th), belly, 0.0, seed + 7)
            glow = 0.0
            if floor:
                col = paint.mix(pal.GUM, pal.MOUTH, smoothstep(0.7, 0.95, math.cos(th)))
                glow = 0.85 * smoothstep(0.7, 0.95, math.cos(th))
            ring.append(p.add(q, col, {'jaw': 1.0}, part=paint.PART_SKIN, belly=belly, glow=glow, along=total_along + s, scale=h.jaw_scale(s, th)))
        rings.append(ring)
    loft(p, rings)
    for end, sign in ((rings[0], -1), (rings[-1], 1)):
        s = ss[0] if sign < 0 else ss[-1]
        c = h.point(s + 0.02 * sign, h.mouth(s) - 0.5 * h.jaw_depth(s))
        ci = p.add(c, pal.BACK, {'jaw': 1.0}, scale=h.scale_head)
        for i in range(h.ring):
            a, b = end[i], end[(i + 1) % h.ring]
            p.faces.append((a, b, ci) if sign > 0 else (b, a, ci))
    return p


def tongue(h=None):
    h = h or DRAGON
    # r04-roster2：怪獣ごとの舌（雷翼の先の割れた細い舌・焔角の厚く丸い舌）。HeadSpec に tongue_shape があればそれで作る
    if getattr(h, 'tongue_shape', None) is not None:
        return h.tongue_shape(h)
    p = Piece('tongue')
    rings = []
    ss = _range(h.tongue)
    width = h.tongue_width
    for s in ss:
        ring = []
        base = h.mouth(s) - 0.2
        for i in range(12):
            th = 2 * math.pi * i / 12
            up = base + 0.1 * math.cos(th)
            left = width(s) * math.sin(th)
            ring.append(p.add(h.point(s, up, left), h.palette.TONGUE, {'jaw': 1.0}, glow=0.9, scale=0.1))
        rings.append(ring)
    loft(p, rings)
    return p


def throat_lining(h=None):
    """口の中の内張り。上半分は頭、下半分は顎に重みを持たせ、口を開けると伸びて喉の奥を塞ぐ。"""
    h = h or DRAGON
    p = Piece('throat')
    p.recalc = False
    rings = []
    ss = _range(h.throat)
    n = 20
    for s in ss:
        ring = []
        mouth = h.mouth(s)
        w = min(h.width(s), h.jaw_width(max(s, h.jaw[0]))) * 0.82
        for i in range(n):
            th = 2 * math.pi * i / n
            ct, st = math.cos(th), math.sin(th)
            up = mouth + (0.06 if ct > 0 else -0.14) + 0.04 * ct
            left = w * st
            wj = smoothstep(0.25, -0.25, ct)
            wts = {'head': 1.0 - wj, 'jaw': wj} if 0.0 < wj < 1.0 else ({'jaw': 1.0} if wj >= 1.0 else {'head': 1.0})
            ring.append(p.add(h.point(s, up, left), h.palette.MOUTH, wts, glow=1.0, scale=0.1))
        rings.append(ring)
    # 内側を向くように、ロフトの向きを逆にする
    for k in range(len(rings) - 1):
        a, b = rings[k], rings[k + 1]
        for i in range(n):
            j = (i + 1) % n
            p.faces.append((a[i], b[i], b[j], a[j]))
    back = p.add(h.point(ss[0] - 0.05, h.mouth(ss[0]) - 0.04), h.palette.MOUTH, {'head': 0.5, 'jaw': 0.5}, glow=1.0, scale=0.1)
    first = rings[0]
    for i in range(n):
        p.faces.append((first[i], first[(i + 1) % n], back))
    return p


def eyes(h=None):
    h = h or DRAGON
    pal = h.palette
    p = Piece('eyes')
    o, f, u, l = h.frame()
    f, u = Vector(f), Vector(u)
    for sign in (1.0, -1.0):
        s, up, left = h.eye
        c = Vector(h.point(s, up, left * sign))
        out = (Vector((sign, 0, 0)) * h.eye_facing[0] + f * h.eye_facing[1] + u * h.eye_facing[2]).normalized()
        ax = f - out * f.dot(out)
        ax.normalize()
        ay = out.cross(ax).normalized()

        def iris(q):
            # r00c-竜: 指摘「目が平らな橙の円盤」 一色 → 瞳のまわりの金・外の橙・縁の暗い輪と、放射状の筋
            th = math.acos(max(-1.0, min(1.0, q.z)))
            rho = min(1.0, th / 1.3)
            ph = math.atan2(q.y, q.x)
            streak = 0.5 + 0.3 * math.sin(ph * 11.0 + 1.7 * math.sin(ph * 3.0)) + 0.2 * (value_noise((math.cos(ph) * 2.3, math.sin(ph) * 2.3, rho * 1.5), 31) - 0.5)
            return paint.mix(pal.iris_color(rho, streak), paint.scale(pal.IRIS_RIM, 0.6), smoothstep(0.05, -0.6, q.z))

        ellipsoid(p, c, (ax, ay, out), h.eye_radii, 14, 24, iris,
                  lambda q: {'head': 1.0}, {'part': paint.PART_EYE, 'scale': 0.05})
        pc = c + out * h.pupil_out
        ellipsoid(p, pc, (ax, ay, out), h.pupil, 4, 8, lambda q: pal.PUPIL, lambda q: {'head': 1.0}, {'part': paint.PART_EYE, 'scale': 0.05})
    return p


def _lip_point(s, h, jaw=False):
    """歯の根元（唇の線の少し内側）。"""
    if jaw:
        w = h.jaw_width(s) * 0.86
        return h.mouth(s) - 0.06, w
    w = h.width(s) * 0.88
    return h.mouth(s) + 0.07, w


# 歯の長さの目安（頭の局所の前後の位置 s → m）。上顎は牙（s≈4.85）と前の歯（s≈6.35）が大きく、奥は小さい。
# 下顎は4本目あたり（s≈5.95）が大きく、上顎の歯の間に噛み合う
UPPER_TOOTH = lambda s: 0.32 + 0.78 * gauss(s - 4.85, 0.45) + 0.34 * gauss(s - 6.35, 0.3) + 0.14 * gauss(s - 3.0, 0.7)
LOWER_TOOTH = lambda s: 0.28 + 0.62 * gauss(s - 5.95, 0.35) + 0.14 * gauss(s - 3.6, 0.8)


def _tooth(p, base, down, f, lateral, L, rnd, bone, h=None):
    """1本の歯：歯茎の中の base から、down（先の向き）へ長さ L。

    歯ごとに、後ろへの傾き・外への開き・反り・太さ・黄ばみを揺らし、1割ほどは先が欠けている。
    断面は顎の線に沿って長い（横から見ると幅があり、前から見ると薄い刃）。
    """
    h = h or DRAGON
    # r04-roster2：怪獣ごとの歯の形（雷翼の細い針・焔角の太く短い杭）。設計図の HeadSpec に tooth_shape があればそれで作る
    shape = getattr(h, 'tooth_shape', None)
    if shape is not None:
        return shape(p, base, down, f, lateral, L, rnd, bone, h)
    rake = math.radians(rnd.gauss(9.0, 5.0))
    splay = math.radians(rnd.uniform(-3.0, 10.0))
    d = down * math.cos(rake) - f * math.sin(rake)
    d = (d * math.cos(splay) + lateral * math.sin(splay)).normalized()
    broken = rnd.random() < 0.1
    if broken:
        L *= rnd.uniform(0.55, 0.75)
    stain = rnd.random() ** 1.4
    radius = (h.tooth_radius[0] + h.tooth_radius[1] * L) * rnd.uniform(0.88, 1.12)
    bend = -f * (rnd.uniform(0.04, 0.16) * L)
    prof = (lambda t: (1.0 - 0.62 * t) ** 0.9) if broken else None
    root = base - d * 0.14
    curved_cone(p, root, base + d * L, radius, bend, 7, 6,
                lambda kk, i, stain=stain: h.palette.tooth_color(kk / 5, stain),
                lambda kk, q, bone=bone: {bone: 1.0}, lambda kk: {'part': paint.PART_TOOTH, 'scale': 0.05},
                flatten=(0.66, 1.0), up_hint=f, profile=prof)


def teeth(seed=0, h=None):
    """上顎と下顎の歯（左右で並びが違う）。r00c-竜: 指摘「歯がどれも同じ形・同じ大きさで等間隔」
    長さ 0.3〜0.48 の一様＋牙2本 → 位置ごとの目安×0.78〜1.15、生え替わりの小さな歯・抜けた跡・欠けた先、間隔 0.44〜0.72。
    並びの範囲と間隔・長さの目安は h.teeth（TeethRow）にある。
    """
    h = h or DRAGON
    t = h.teeth
    p = Piece('teeth')
    o, f, u, l = h.frame()
    f, u, l = Vector(f), Vector(u), Vector(l)
    for side_i, sign in enumerate((1.0, -1.0)):
        rnd = random.Random('teeth-%d-%d' % (seed, side_i))
        lateral = l * sign
        s = t.upper_start[0] + rnd.uniform(0.0, t.upper_start[1])
        while s < t.upper_end:
            L = t.upper(s) * rnd.uniform(0.78, 1.15)
            if rnd.random() < 0.15:
                L *= rnd.uniform(0.38, 0.55)  # 生え替わりの小さな歯
            if rnd.random() > 0.06:  # 1割弱は抜けた跡
                up, w = _lip_point(s, h)
                base = Vector(h.point(s, up - rnd.uniform(0.0, 0.05), w * sign))
                _tooth(p, base, -u, f, lateral, L, rnd, 'head', h)
            s += rnd.uniform(*t.upper_step)
        s = t.lower_start[0] + rnd.uniform(t.lower_start[1], t.lower_start[2])
        while s < t.lower_end:
            L = t.lower(s) * rnd.uniform(0.78, 1.15)
            if rnd.random() < 0.15:
                L *= rnd.uniform(0.4, 0.6)
            if rnd.random() > 0.06:
                up, w = _lip_point(s, h, jaw=True)
                base = Vector(h.point(s, up + rnd.uniform(0.0, 0.04), w * sign))
                _tooth(p, base, u, f, lateral, L, rnd, 'jaw', h)
            s += rnd.uniform(*t.lower_step)
    # 前歯：小さく、少しずつ向きが違う
    rnd = random.Random('teeth-front-%d' % seed)
    for left in t.front_lefts:
        base = Vector(h.point(t.front_s, h.mouth(t.front_s) + 0.06, left))
        _tooth(p, base, -u, f, l * (1.0 if left > 0 else -1.0), rnd.uniform(*t.front_length), rnd, 'head', h)
    return p


def _hv(ds, du, dl):
    o, f, u, l = head_frame()
    return Vector(f) * ds + Vector(u) * du + Vector(l) * dl


def _growth_rings(t, count, phase):
    """角の成長の輪（根元 0 → 先 1）。輪の手前で盛り上がり、輪の直後で溝に落ちる（先へ行くほど浅い）。-0.25〜0.75。"""
    x = (t * count + phase) % 1.0
    return (x ** 3 - 0.25) * (1.0 - smoothstep(0.5, 0.92, t))


def _horn(p, path, r0, sides, rnd, up_hint, bone, flatten=(1.0, 1.0), tone=1.0, palette=None):
    """1本の角：path に沿った先細りの管。成長の輪（半径の段）・縦の溝（ねじれながら先へ）・繊維の筋（色）を付ける。

    頂点の along には根元からの距離（m）を入れ、シェーダーが細い成長線を描く。palette は色（既定は紅竜の paint）。
    """
    pal = palette or paint
    n = len(path)
    cum = [0.0]
    for k in range(1, n):
        cum.append(cum[-1] + (path[k] - path[k - 1]).length)
    count = rnd.uniform(8.5, 11.5)
    phase = rnd.random()
    flutes = rnd.choice((3, 4))
    twist = rnd.uniform(1.5, 3.2) * rnd.choice((-1.0, 1.0))
    streak_seed = rnd.randrange(1 << 16)
    ts = [k / (n - 1) for k in range(n)]
    radii = [r0 * ((1 - t) ** 0.8 * 0.95 + 0.05) * (1.0 + 0.1 * _growth_rings(t, count, phase)) for t in ts]
    section = lambda k, a: 1.0 + 0.06 * math.cos(flutes * a + twist * ts[k]) * (1.0 - 0.6 * ts[k])

    def color(k, i):
        t = ts[k]
        a = 2 * math.pi * i / sides
        streak = value_noise((math.cos(a) * 1.6, math.sin(a) * 1.6, t * 5.0), streak_seed)
        groove = smoothstep(0.1, -0.2, _growth_rings(t, count, phase))
        return paint.scale(pal.horn_color(t, streak, tone), 1.0 - 0.3 * groove)

    sweep(p, path, radii, sides, color, lambda kk, q: {bone: 1.0},
          lambda kk: {'part': paint.PART_HORN, 'scale': 0.05, 'along': cum[kk]}, flatten=flatten, up_hint=up_hint, section=section)


def horns(seed=0):
    """角：頭の後ろから後ろ上へ流れ、先で少し下がる一対。その下に小さな一対、眉・鼻・頬・顎のとげ。

    r00c-竜: 指摘「角が左右対称すぎる・のっぺり」 左右で長さ（±7%）・反り・開き・輪の間隔を変え、
    成長の輪の段（半径の 4.5% の正弦 → 10% ののこぎり）・縦の溝・繊維の筋を足した。とげも左右で長さと向きを揺らす。
    """
    p = Piece('horns')
    o, f, u, l = head_frame()
    U = Vector(u)
    for side_i, sign in enumerate((1.0, -1.0)):
        rnd = random.Random('horns-%d-%d' % (seed, side_i))
        ls = 1.0 + rnd.uniform(-0.07, 0.07)
        curl = rnd.uniform(-0.3, 0.3)
        spread = rnd.uniform(-0.15, 0.15)
        tone = rnd.uniform(0.88, 1.1)
        base = Vector(head_point(-0.25, 1.0, 0.95 * sign))
        p1 = base + _hv(-2.2 * ls, 1.25 + 0.1 * curl, (0.45 + 0.5 * spread) * sign)
        p2 = base + _hv(-4.4 * ls, 1.7 + 0.25 * curl, (1.0 + spread) * sign)
        p3 = base + _hv(-6.4 * ls, 1.0 - curl, (1.35 + 1.4 * spread) * sign)
        _horn(p, bezier(base - _hv(-0.3, 0.3, 0), p1, p2, p3, 34), 0.56, 12, rnd, U, 'head', flatten=(0.85, 1.0), tone=tone)
        ls2 = 1.0 + rnd.uniform(-0.12, 0.12)
        base2 = Vector(head_point(0.35, 0.5, 1.42 * sign))
        path2 = bezier(base2, base2 + _hv(-1.2 * ls2, 0.35, 0.45 * sign), base2 + _hv(-2.4 * ls2, 0.4 + 0.2 * curl, 0.9 * sign),
                       base2 + _hv(-3.5 * ls2, -0.1 - 0.3 * curl, (1.15 + spread) * sign), 18)
        _horn(p, path2, 0.3, 9, rnd, U, 'head', tone=tone)
        jit = lambda: 1.0 + rnd.uniform(-0.15, 0.15)
        # 頬のとげ（後ろへ）
        for s, up, left, L in ((0.15, -0.35, 1.58, 1.35), (-0.3, -0.18, 1.5, 1.05), (-0.72, -0.02, 1.36, 0.8)):
            L *= jit()
            b = Vector(head_point(s, up, left * sign))
            curved_cone(p, b, b + _hv(-L, -0.08 + rnd.uniform(-0.15, 0.15), 0.42 * L * jit() * sign), 0.2 * L / 1.35 + 0.06, _hv(0, 0.12, 0), 7, 5,
                        lambda kk, i, tn=rnd.uniform(0.85, 1.1): paint.horn_color(0.2 + kk / 5, 0.5, tn), lambda kk, q: {'head': 1.0},
                        lambda kk, L=L: {'part': paint.PART_HORN, 'scale': 0.05, 'along': L * kk / 4})
        # 眉のとげ
        b = Vector(head_point(2.55, 1.36, 1.22 * sign))
        Lb = jit()
        curved_cone(p, b, b + _hv(-0.95 * Lb, 0.42 * jit(), 0.26 * sign), 0.15, _hv(0, 0.08, 0), 6, 5,
                    lambda kk, i: paint.horn_color(0.25 + kk / 5), lambda kk, q: {'head': 1.0}, lambda kk, Lb=Lb: {'part': paint.PART_HORN, 'scale': 0.05, 'along': Lb * kk / 4})
        # 顎の下のとげ（顎の骨に重み）
        for s, up, left, L in ((0.3, -1.95, 1.18, 0.85), (1.15, -1.82, 1.12, 0.6)):
            L *= jit()
            b = Vector(head_point(s, up, left * sign))
            curved_cone(p, b, b + _hv(-0.8 * L, -0.55 * L, 0.35 * L * sign), 0.13, _hv(0, -0.05, 0), 6, 5,
                        lambda kk, i: paint.horn_color(0.25 + kk / 5), lambda kk, q: {'jaw': 1.0}, lambda kk, L=L: {'part': paint.PART_HORN, 'scale': 0.05, 'along': L * kk / 4})
    # 鼻の角と頭頂の小さなとげ
    rnd = random.Random('horns-mid-%d' % seed)
    b = Vector(head_point(6.15, 0.58, 0.0))
    curved_cone(p, b, b + _hv(0.1, 0.5, 0.04), 0.13, _hv(-0.08, 0, 0), 6, 5,
                lambda kk, i: paint.horn_color(0.3 + kk / 6), lambda kk, q: {'head': 1.0}, lambda kk: {'part': paint.PART_HORN, 'scale': 0.05, 'along': 0.12 * kk})
    for s, L in ((1.3, 0.45), (0.5, 0.6), (-0.35, 0.72)):
        L *= 1.0 + rnd.uniform(-0.18, 0.18)
        b = Vector(head_point(s, TOP(s) + 0.02, 0.0))
        curved_cone(p, b - _hv(0, 0.1, 0), b + _hv(-0.55 * L, 0.9 * L, rnd.uniform(-0.06, 0.06)), 0.16 * L + 0.05, _hv(-0.06, 0, 0), 6, 5,
                    lambda kk, i: paint.horn_color(0.2 + kk / 5), lambda kk, q: {'head': 1.0}, lambda kk, L=L: {'part': paint.PART_HORN, 'scale': 0.05, 'along': L * kk / 4},
                    flatten=(0.4, 1.0), up_hint=Vector(f))
    return p


def head_pieces(total_along, seed=0, h=None):
    # 歯と角は部品ごとに自分の乱数の系列を持つ（ほかの部品を足しても並びが変わらない）
    h = h or DRAGON
    return [upper_head(seed, h), lower_jaw(total_along, seed, h), tongue(h), throat_lining(h), eyes(h), teeth(seed, h), h.horns(seed)]


class TeethRow:
    """歯の並び：上顎と下顎それぞれの始まり（位置と揺らぎ）・終わり・間隔、長さの目安（位置 → m）、前歯。"""

    def __init__(self, upper, lower, upper_start, upper_end, upper_step, lower_start, lower_end, lower_step, front_s, front_lefts, front_length):
        self.upper, self.lower = upper, lower
        self.upper_start, self.upper_end, self.upper_step = upper_start, upper_end, upper_step
        self.lower_start, self.lower_end, self.lower_step = lower_start, lower_end, lower_step
        self.front_s, self.front_lefts, self.front_length = front_s, front_lefts, front_length


class HeadSpec:
    """頭の設計：輪郭の表（前後の位置 s → 高さ・幅）、断面の刻み、張り出し・鱗の大きさ・重みの関数、目・鼻の穴・歯・角・色。

    point(s, up, left) と frame() は頭の局所 → 遊びの向き（anatomy.head_point と同じ約束）。
    upper・jaw・tongue・throat は (始め, 長さ, 輪の数)。upper_exp・jaw_exp は断面の上側・下側の丸さ（超楕円の指数）。
    """

    def __init__(self, **kw):
        self.__dict__.update(kw)


DRAGON = HeadSpec(
    top=TOP, mouth=MOUTH, width=WIDTH, jaw_depth=JAW_DEPTH, jaw_width=JAW_WIDTH, length=HEAD_LENGTH,
    point=head_point, frame=head_frame, ring=RING,
    upper=(-0.9, 7.9, 72), upper_exp=(2.6, 4.5), jaw=(-0.55, 7.4, 46), jaw_exp=(5.0, 2.2),
    tongue=(0.2, 5.0, 15), tongue_width=Curve1D([(0.2, 0.7), (2.5, 0.64), (4.2, 0.5), (5.2, 0.14)]), throat=(-0.3, 2.6, 10),
    features=_features, rugae=_rugae, weights=_head_weights, scale=_head_scale, jaw_scale=_jaw_scale, scale_head=SCALE_HEAD,
    nostril=(6.6, 0.8), eye=EYE, eye_radii=(0.46, 0.38, 0.36), eye_facing=(0.86, 0.42, 0.12), pupil=(0.055, 0.3, 0.04), pupil_out=0.33,
    teeth=TeethRow(UPPER_TOOTH, LOWER_TOOTH, (1.25, 0.2), 6.72, (0.44, 0.72), (1.55, 0.15, 0.35), 6.5, (0.46, 0.74), 6.74, (-0.3, -0.1, 0.1, 0.3), (0.2, 0.36)),
    tooth_radius=(0.1, 0.17), horns=horns, palette=paint,
)

# ほかの怪獣の頭（設計図）が使う名前
crest = _crest
horn = _horn
