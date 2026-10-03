# OWNER: dragon
"""翼の膜：指の骨の間と、最後の指から脇腹・腰までと、腕の前の小さな膜を、Coons の面で張る（web）。
紅竜（4本の指・membrane）と雷翼（長い指1本と骨の筋2本）が同じ作りを使う。形と骨は WingWeb で渡す。

後ろの縁は指の先の間で手首の側へ弧を描いて引っ込め（スカラップ）、膜は指の間で少し上へふくらませる。
重みは指の骨（付け根側・先側）に持たせ、指と指の間は両側の骨を位置で混ぜる。腕の近くは上腕・前腕、脇腹は胴の骨。
"""
import math

from mathutils import Vector

from . import paint
from .anatomy import SIDES, WING, WING_BODY_LINE, side_point
from .shapes import Piece, fbm, smoothstep


class Polyline:
    def __init__(self, pts):
        self.pts = [Vector(p) for p in pts]
        self.cum = [0.0]
        for i in range(1, len(self.pts)):
            self.cum.append(self.cum[-1] + (self.pts[i] - self.pts[i - 1]).length)

    @property
    def length(self):
        return self.cum[-1]

    def at(self, u):
        s = max(0.0, min(1.0, u)) * self.length
        i = 0
        while i + 1 < len(self.cum) - 1 and self.cum[i + 1] < s:
            i += 1
        seg = self.cum[i + 1] - self.cum[i]
        t = 0.0 if seg <= 0 else (s - self.cum[i]) / seg
        return self.pts[i].lerp(self.pts[i + 1], t)

    def knot(self, i):
        return self.cum[i] / self.length


def _mix(ws, ks):
    out = {}
    for w, k in zip(ws, ks):
        if k <= 0:
            continue
        for name, v in w.items():
            out[name] = out.get(name, 0.0) + v * k
    return out


def _normalize(w):
    w = {k: max(0.0, v) for k, v in w.items()}
    s = sum(w.values())
    return {k: v / s for k, v in w.items() if v / s > 1e-4} if s > 0 else w


def _coons(c0, c1, d0, d1, u, v):
    p00, p10, p01, p11 = c0(0.0), c0(1.0), c1(0.0), c1(1.0)
    return (c0(u) * (1 - v) + c1(u) * v + d0(v) * (1 - u) + d1(v) * u
            - (p00 * ((1 - u) * (1 - v)) + p10 * (u * (1 - v)) + p01 * ((1 - u) * v) + p11 * (u * v)))


def _coons_w(c0, c1, d0, d1, u, v):
    parts = [c0(u), c1(u), d0(v), d1(v), c0(0.0), c0(1.0), c1(0.0), c1(1.0)]
    ks = [1 - v, v, 1 - u, u, -(1 - u) * (1 - v), -u * (1 - v), -(1 - u) * v, -u * v]
    out = {}
    for w, k in zip(parts, ks):
        for name, val in w.items():
            out[name] = out.get(name, 0.0) + val * k
    return _normalize(out)


class WingWeb:
    """片側の翼の膜の形と骨（紅竜・雷翼で共通）。点はどれも遊びの向き。

    arm：付け根・肘・…・指の付け根（膜の角。紅竜は手首、雷翼は手の骨の先）の点の並び、arm_bones：その区間ごとの骨
    fingers：膜の角から先の指の点の並び（前縁の指から後ろの指の順。各指は角の次の点から先まで）と、その区間ごとの骨（finger_bones）
    hand_bone：膜の角の骨（指の付け根はこの骨にも重みを混ぜる）
    body_line：膜が胴に付く線（付け根の後ろから腰へ）、body_weights(v)：その線に沿った胴の骨の重み（v は 0 → 1）
    nu・nv：指の間の膜の刻み（指に沿って・指の間）、nu_body：最後の指と脇腹の間の膜の腕に沿った刻み、nv_lead：腕の前の膜の刻み
    scallop・body_scallop：後ろの縁を手首の側へ引っ込める深さ（先の間の距離に対する割合）、lead_reach：腕の前の膜の張り出し（m）
    """

    def __init__(self, arm, fingers, finger_bones, body_line, arm_bones, hand_bone, body_weights,
                 nu=28, nv=11, nu_body=18, nv_lead=4, scallop=0.2, body_scallop=0.1, lead_reach=1.6, palette=paint):
        self.arm = arm
        self.fingers, self.finger_bones = fingers, finger_bones
        self.body_line, self.body_weights = body_line, body_weights
        self.arm_bones, self.hand_bone = arm_bones, hand_bone
        self.nu, self.nv, self.nu_body, self.nv_lead = nu, nv, nu_body, nv_lead
        self.scallop, self.body_scallop, self.lead_reach = scallop, body_scallop, lead_reach
        self.palette = palette


def _dragon_body_weights(v):
    # 肩の後ろ → 胸 → 背 → 腰
    a = smoothstep(0.0, 0.45, v)
    c = smoothstep(0.55, 1.0, v)
    return _normalize({'chest': 1 - a, 'spine': a * (1 - c), 'pelvis': c})


def membrane(seed=0):
    """紅竜の翼の膜（4本の指）。"""
    p = Piece('membrane', material=1)
    p.recalc = False
    for suffix, side in SIDES:
        sp = lambda q: Vector(side_point(q, side))
        spec = WingWeb(
            [sp(WING['root']), sp(WING['elbow']), sp(WING['wrist'])],
            [[sp(k), sp(t)] for k, t in WING['fingers']],
            [['wing_f%da_%s' % (k + 1, suffix), 'wing_f%db_%s' % (k + 1, suffix)] for k in range(len(WING['fingers']))],
            [sp(b) for b in WING_BODY_LINE],
            ('wing_arm_' + suffix, 'wing_fore_' + suffix), 'wing_hand_' + suffix, _dragon_body_weights,
        )
        web(p, side, suffix, spec, seed)
    return p


def web(p, side, suffix, spec, seed):
    """片側の翼の膜を Piece p に足す：指の間の膜・最後の指と脇腹の間の膜・腕の前の小さな膜を、Coons の面で張る。"""
    NU_F, NV_F = spec.nu, spec.nv
    NU_P, NV_P = spec.nu_body, NU_F
    pal = spec.palette
    R, E, W = spec.arm[0], spec.arm[1], spec.arm[-1]
    fingers = [Polyline([W] + list(pts)) for pts in spec.fingers]
    last = len(fingers) - 1
    arm = Polyline(list(spec.arm))
    body = Polyline([R] + list(spec.body_line))
    tips = [f.at(1.0) for f in fingers]
    wing_up = (tips[0] - W).cross(tips[last] - W).normalized()
    if wing_up.y < 0:
        wing_up = -wing_up

    def w_finger(k, u):
        f, names = fingers[k], spec.finger_bones[k]
        w = {}
        for i, name in enumerate(names):
            lo = smoothstep(f.knot(i) - 0.1, f.knot(i) + 0.1, u) if i > 0 else 1.0
            hi = 1 - smoothstep(f.knot(i + 1) - 0.1, f.knot(i + 1) + 0.1, u) if i + 1 < len(names) else 1.0
            w[name] = lo * hi
        h = smoothstep(0.1, 0.0, u)
        return _normalize(_mix([w, {spec.hand_bone: 1.0}], [1 - h, h]))

    def w_arm(u):
        names = spec.arm_bones
        w = {}
        for i, name in enumerate(names):
            lo = smoothstep(arm.knot(i) - 0.12, arm.knot(i) + 0.12, u) if i > 0 else 1.0
            hi = 1 - smoothstep(arm.knot(i + 1) - 0.12, arm.knot(i + 1) + 0.12, u) if i + 1 < len(names) else 1.0
            w[name] = lo * hi
        return _normalize(w)

    w_body = spec.body_weights

    def color(u, v, edge, near_bone, q):
        base = paint.scale(pal.MEMBRANE, 0.82 + 0.36 * fbm((q.x * 0.22, q.y * 0.22, q.z * 0.22), 3, seed + 21))
        c = paint.mix(base, pal.MEMBRANE_EDGE, max(edge, near_bone * 0.55))
        return c

    grid = {}

    def vert(key, q, w, memb, col):
        if key in grid:
            return grid[key]
        i = p.add(q, col, w, part=paint.PART_MEMBRANE, memb=memb, scale=0.12)
        grid[key] = i
        return i

    # 指の間の膜（手首は1点に縮む）
    for k in range(last):
        A, B = fingers[k], fingers[k + 1]
        ta, tb = tips[k], tips[k + 1]
        inward = (W - (ta + tb) * 0.5).normalized()
        depth = spec.scallop * (tb - ta).length
        edge_c = lambda v, ta=ta, tb=tb, inward=inward, depth=depth: ta.lerp(tb, v) + inward * (depth * math.sin(math.pi * v))
        c0 = A.at
        c1 = B.at
        d0 = lambda v: W
        for i in range(NU_F):
            u = i / (NU_F - 1)
            for j in range(NV_F):
                v = j / (NV_F - 1)
                if i == 0:
                    key = ('W', suffix)
                elif j == 0:
                    key = ('F', suffix, k, i)
                elif j == NV_F - 1:
                    key = ('F', suffix, k + 1, i)
                else:
                    key = ('P', suffix, k, i, j)
                q = _coons(c0, c1, d0, edge_c, u, v)
                gap = (A.at(u) - B.at(u)).length
                q = q + wing_up * (0.05 * gap * math.sin(math.pi * v) * math.sqrt(u))
                w = _normalize(_mix([w_finger(k, u), w_finger(k + 1, u)], [1 - v, v]))
                inner = math.sin(math.pi * v) ** 0.7 * smoothstep(0.0, 0.2, u)
                edge = smoothstep(0.9, 1.0, u)
                near = 1.0 - smoothstep(0.0, 0.18, min(v, 1 - v))
                vert(key, q, w, 0.55 + 0.45 * inner, color(u, v, edge, near, q))
        for i in range(NU_F - 1):
            for j in range(NV_F - 1):
                a = grid[_key(suffix, k, i, j, NV_F)]
                b = grid[_key(suffix, k, i + 1, j, NV_F)]
                c = grid[_key(suffix, k, i + 1, j + 1, NV_F)]
                d = grid[_key(suffix, k, i, j + 1, NV_F)]
                if i == 0:
                    p.faces.append((a, b, c) if side > 0 else (a, c, b))
                else:
                    p.faces.append((a, b, c, d) if side > 0 else (a, d, c, b))

    # 最後の指と脇腹の間（腕・指・後ろの縁・胴の線の4辺の Coons）
    f4 = fingers[last]
    t4 = tips[last]
    b_end = body.at(1.0)
    inward = (E - (t4 + b_end) * 0.5).normalized()
    depth = spec.body_scallop * (t4 - b_end).length
    trail = lambda u: b_end.lerp(t4, u) + inward * (depth * math.sin(math.pi * u))
    c0, c1, d0, d1 = arm.at, trail, body.at, f4.at
    wc0 = w_arm
    wc1 = lambda u: _normalize(_mix([w_body(1.0), w_finger(last, 1.0)], [1 - u, u]))
    wd0 = w_body
    wd1 = lambda v: w_finger(last, v)
    for i in range(NU_P):
        u = i / (NU_P - 1)
        for j in range(NV_P):
            v = j / (NV_P - 1)
            if i == NU_P - 1:
                key = ('W', suffix) if j == 0 else ('F', suffix, last, j)
            elif j == 0:
                key = ('A', suffix, i)
            else:
                key = ('Q', suffix, i, j)
            q = _coons(c0, c1, d0, d1, u, v)
            bulge = min(u, 1 - u) * 2 * math.sin(math.pi * v)
            q = q + wing_up * (0.35 * bulge)
            w = _coons_w(wc0, wc1, wd0, wd1, u, v)
            inner = math.sin(math.pi * v) ** 0.6 * math.sin(math.pi * u) ** 0.6
            edge = smoothstep(0.9, 1.0, v)
            near = 1.0 - smoothstep(0.0, 0.14, min(v, 1 - u, u))
            vert(key, q, w, 0.5 + 0.5 * inner, color(u, v, edge, near, q))
    for i in range(NU_P - 1):
        for j in range(NV_P - 1):
            a = grid[_pkey(suffix, i, j, NU_P, last)]
            b = grid[_pkey(suffix, i + 1, j, NU_P, last)]
            c = grid[_pkey(suffix, i + 1, j + 1, NU_P, last)]
            d = grid[_pkey(suffix, i, j + 1, NU_P, last)]
            # 指の間の膜と同じ向き（u が外へ、v が後ろへ）なので、左の翼は (a, b, c, d) で上を向く
            p.faces.append((a, b, c, d) if side > 0 else (a, d, c, b))

    # 腕の前の小さな膜（付け根と手首は1点に縮む）
    NV_A = spec.nv_lead
    lead = lambda u: R.lerp(W, u) + (Vector((0, 0, 1)) * spec.lead_reach + wing_up * 0.2) * math.sin(math.pi * u)
    for i in range(NU_P):
        u = i / (NU_P - 1)
        for j in range(1, NV_A):
            v = j / (NV_A - 1)
            if i == 0:
                continue
            if i == NU_P - 1:
                continue
            q = arm.at(u).lerp(lead(u), v)
            vert(('L', suffix, i, j), q, w_arm(u), 0.6 + 0.3 * math.sin(math.pi * v), color(u, v, smoothstep(0.8, 1.0, v), 0.0, q))
    for i in range(NU_P - 1):
        for j in range(NV_A - 1):
            a = _lkey(grid, suffix, i, j, NU_P)
            b = _lkey(grid, suffix, i + 1, j, NU_P)
            c = _lkey(grid, suffix, i + 1, j + 1, NU_P)
            d = _lkey(grid, suffix, i, j + 1, NU_P)
            # v が前へ伸びるので、左の翼は (a, d, c, b) で上を向く
            quad = [a, d, c, b] if side > 0 else [a, b, c, d]
            uniq = []
            for x in quad:
                if x not in uniq:
                    uniq.append(x)
            if len(uniq) >= 3:
                p.faces.append(tuple(uniq))


def _key(suffix, k, i, j, nv):
    if i == 0:
        return ('W', suffix)
    if j == 0:
        return ('F', suffix, k, i)
    if j == nv - 1:
        return ('F', suffix, k + 1, i)
    return ('P', suffix, k, i, j)


def _pkey(suffix, i, j, nu, last=3):
    if i == nu - 1:
        return ('W', suffix) if j == 0 else ('F', suffix, last, j)
    if j == 0:
        return ('A', suffix, i)
    return ('Q', suffix, i, j)


def _lkey(grid, suffix, i, j, nu):
    if i == 0:
        return grid[('A', suffix, 0)]
    if i == nu - 1:
        return grid[('W', suffix)]
    if j == 0:
        return grid[('A', suffix, i)]
    return grid[('L', suffix, i, j)]
