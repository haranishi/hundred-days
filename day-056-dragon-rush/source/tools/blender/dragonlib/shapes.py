# OWNER: dragon
"""形の道具：管の掃引・円錐・球・ロフト・なめらかな1次元の表・決定的な値ノイズ。bpy に依存しない（mathutils だけ）。"""
import math

from mathutils import Matrix, Quaternion, Vector


class Piece:
    """部品1つ分の三角形の素（頂点・面・頂点ごとの属性と重み）。最後に1つのメッシュへまとめる。"""

    def __init__(self, name, material=0):
        self.name = name
        self.material = material
        self.verts = []
        self.faces = []
        self.attrs = {'part': [], 'belly': [], 'memb': [], 'glow': [], 'along': [], 'scale': []}
        self.colors = []
        self.weights = []
        self.subdivide = 0
        # 面の向きを外向きにそろえ直すか（開いた膜や内張りは自分で向きを決める）
        self.recalc = True
        # add の extra で足した属性の名前（足した順）
        self.extra_keys = []
        # False にすると面ごとの陰影（岩の板のような角の立った部品）
        self.smooth = True

    def add(self, co, color, weights, part=0.0, belly=0.0, memb=0.0, glow=0.0, along=0.0, scale=0.3, **extra):
        """extra は怪獣ごとに足す属性（雷翼の発光の筋・焔角の溶岩など）。一度も渡さなかった属性は持たない（紅竜の GLB は変わらない）。"""
        self.verts.append(Vector(co))
        self.colors.append(tuple(color))
        self.weights.append(dict(weights))
        a = self.attrs
        a['part'].append(part)
        a['belly'].append(belly)
        a['memb'].append(memb)
        a['glow'].append(glow)
        a['along'].append(along)
        a['scale'].append(scale)
        for key in self.extra_keys:
            a[key].append(extra.pop(key, 0.0))
        for key, value in extra.items():
            a[key] = [0.0] * (len(self.verts) - 1) + [value]
            self.extra_keys.append(key)
        return len(self.verts) - 1


def lerp(a, b, t):
    return a + (b - a) * t


def smoothstep(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3.0 - 2.0 * t)


def gauss(x, w):
    return math.exp(-(x / w) ** 2)


class Curve1D:
    """単調な3次の補間（行き過ぎない）。形の輪郭の表（前後の位置 → 幅や高さ）に使う。"""

    def __init__(self, table):
        self.x = [p[0] for p in table]
        self.y = [p[1] for p in table]
        n = len(table)
        h = [self.x[i + 1] - self.x[i] for i in range(n - 1)]
        d = [(self.y[i + 1] - self.y[i]) / h[i] for i in range(n - 1)]
        m = [0.0] * n
        m[0] = d[0]
        m[-1] = d[-1]
        for i in range(1, n - 1):
            if d[i - 1] * d[i] <= 0:
                m[i] = 0.0
            else:
                # 重み付きの調和平均（Fritsch–Carlson）。単調な区間で行き過ぎない
                w1 = 2 * h[i] + h[i - 1]
                w2 = h[i] + 2 * h[i - 1]
                m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
        self.m = m

    def __call__(self, x):
        xs, ys, m = self.x, self.y, self.m
        if x <= xs[0]:
            return ys[0] + m[0] * (x - xs[0])
        if x >= xs[-1]:
            return ys[-1] + m[-1] * (x - xs[-1])
        i = 0
        while xs[i + 1] < x:
            i += 1
        h = xs[i + 1] - xs[i]
        t = (x - xs[i]) / h
        t2, t3 = t * t, t * t * t
        return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1]


def _hash3(ix, iy, iz, seed):
    h = (ix * 374761393 + iy * 668265263 + iz * 2147483647 + seed * 144269504) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFFFF) / float(0xFFFFFF)


def value_noise(p, seed=0):
    """決定的な3次元の値ノイズ（0〜1）。"""
    x, y, z = p
    ix, iy, iz = math.floor(x), math.floor(y), math.floor(z)
    fx, fy, fz = x - ix, y - iy, z - iz
    ux, uy, uz = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy), fz * fz * (3 - 2 * fz)
    out = 0.0
    for dz in (0, 1):
        for dy in (0, 1):
            for dx in (0, 1):
                w = (ux if dx else 1 - ux) * (uy if dy else 1 - uy) * (uz if dz else 1 - uz)
                out += w * _hash3(ix + dx, iy + dy, iz + dz, seed)
    return out


def fbm(p, octaves=3, seed=0):
    s, amp, norm = 0.0, 0.5, 0.0
    q = Vector(p)
    for o in range(octaves):
        s += amp * value_noise(q, seed + o * 17)
        norm += amp
        amp *= 0.5
        q = q * 2.03 + Vector((5.1, 1.7, 9.3))
    return s / norm


def frames_along(path, up_hint=Vector((0, 0, 1))):
    """折れ線に沿った断面の向き（平行移送でねじれを出さない）。(接線, 上, 横) の組の並び。"""
    n = len(path)
    tangents = []
    for i in range(n):
        a = path[max(0, i - 1)]
        b = path[min(n - 1, i + 1)]
        t = (b - a)
        tangents.append(t.normalized() if t.length > 1e-9 else Vector((0, 0, 1)))
    up = up_hint - tangents[0] * up_hint.dot(tangents[0])
    if up.length < 1e-6:
        up = Vector((1, 0, 0)) - tangents[0] * tangents[0].x
    up.normalize()
    out = []
    prev_t = tangents[0]
    for t in tangents:
        q = prev_t.rotation_difference(t)
        up = q @ up
        up = (up - t * up.dot(t)).normalized()
        side = t.cross(up).normalized()
        out.append((t, up.copy(), side))
        prev_t = t
    return out


def sweep(piece, path, radii, sides, color_fn, weight_fn, attrs, flatten=(1.0, 1.0), up_hint=Vector((0, 0, 1)), cap_end=True, cap_start=True, section=None, vertex_attrs=None):
    """折れ線 path に沿って断面（楕円）を掃引した管。radii は点ごと。color_fn(k, i) は k=断面番号・i=周の番号。

    section(k, a) を与えると、断面の角度 a での半径の倍率になる（角の縦の溝など、周に沿った凹凸）。
    vertex_attrs(k, q, p) を与えると、頂点ごとの属性（点 q・断面の中心 p）を attrs(k) に重ねる（管の前縁の発光の筋など）。
    """
    frames = frames_along(path, up_hint)
    rings = []
    for k, (p, r) in enumerate(zip(path, radii)):
        t, up, side = frames[k]
        ring = []
        for i in range(sides):
            a = 2 * math.pi * i / sides
            rr = r * section(k, a) if section else r
            q = p + up * (math.cos(a) * rr * flatten[1]) + side * (math.sin(a) * rr * flatten[0])
            extra = attrs(k) if vertex_attrs is None else dict(attrs(k), **vertex_attrs(k, q, p))
            ring.append(piece.add(q, color_fn(k, i), weight_fn(k, q), **extra))
        rings.append(ring)
    for k in range(len(rings) - 1):
        a, b = rings[k], rings[k + 1]
        for i in range(sides):
            j = (i + 1) % sides
            piece.faces.append((a[i], a[j], b[j], b[i]))
    if cap_end:
        tip = piece.add(path[-1] + frames[-1][0] * 1e-3, color_fn(len(path) - 1, 0), weight_fn(len(path) - 1, path[-1]), **attrs(len(path) - 1))
        last = rings[-1]
        for i in range(sides):
            piece.faces.append((last[i], last[(i + 1) % sides], tip))
    if cap_start:
        base = piece.add(path[0] - frames[0][0] * 1e-3, color_fn(0, 0), weight_fn(0, path[0]), **attrs(0))
        first = rings[0]
        for i in range(sides):
            piece.faces.append((first[(i + 1) % sides], first[i], base))
    return rings


def bezier(p0, p1, p2, p3, n):
    out = []
    for k in range(n):
        t = k / (n - 1)
        u = 1 - t
        out.append(p0 * (u * u * u) + p1 * (3 * u * u * t) + p2 * (3 * u * t * t) + p3 * (t * t * t))
    return out


def curved_cone(piece, base, tip, radius, bend, sides, rings, color_fn, weight_fn, attrs, flatten=(1.0, 1.0), up_hint=Vector((0, 0, 1)), profile=None, section=None):
    """base から tip へ、bend の向きに反った円錐（角・爪・歯・とげ）。profile(t) は太さの割合（既定は先細り）。"""
    base = Vector(base)
    tip = Vector(tip)
    bend = Vector(bend)
    mid1 = base.lerp(tip, 0.33) + bend * 0.66
    mid2 = base.lerp(tip, 0.66) + bend * 0.66
    path = bezier(base, mid1, mid2, tip, rings)
    prof = profile or (lambda t: (1 - t) ** 0.85 * 0.97 + 0.03)
    radii = [radius * prof(k / (rings - 1)) for k in range(rings)]
    return sweep(piece, path, radii, sides, color_fn, weight_fn, attrs, flatten=flatten, up_hint=up_hint, cap_end=True, cap_start=True, section=section)


def ellipsoid(piece, center, axes, radii, rows, cols, color_fn, weight_fn, attrs):
    """軸 axes（3本の単位ベクトル）と半径 radii の楕円体。color_fn(p_local) は局所の単位球の点。"""
    center = Vector(center)
    ax, ay, az = [Vector(a) for a in axes]
    idx = {}
    top = piece.add(center + az * radii[2], color_fn(Vector((0, 0, 1))), weight_fn(center), **attrs)
    bottom = piece.add(center - az * radii[2], color_fn(Vector((0, 0, -1))), weight_fn(center), **attrs)
    for r in range(1, rows):
        th = math.pi * r / rows
        for c in range(cols):
            ph = 2 * math.pi * c / cols
            u = Vector((math.sin(th) * math.cos(ph), math.sin(th) * math.sin(ph), math.cos(th)))
            q = center + ax * (u.x * radii[0]) + ay * (u.y * radii[1]) + az * (u.z * radii[2])
            idx[(r, c)] = piece.add(q, color_fn(u), weight_fn(q), **attrs)
    for c in range(cols):
        c2 = (c + 1) % cols
        piece.faces.append((top, idx[(1, c)], idx[(1, c2)]))
        piece.faces.append((bottom, idx[(rows - 1, c2)], idx[(rows - 1, c)]))
        for r in range(1, rows - 1):
            piece.faces.append((idx[(r, c)], idx[(r + 1, c)], idx[(r + 1, c2)], idx[(r, c2)]))


def loft(piece, rings, closed=True):
    """同じ点数の断面の並びを四角形でつなぐ。rings は頂点番号の並びの並び。"""
    for k in range(len(rings) - 1):
        a, b = rings[k], rings[k + 1]
        n = len(a)
        last = n if closed else n - 1
        for i in range(last):
            j = (i + 1) % n
            piece.faces.append((a[i], a[j], b[j], b[i]))


def sgnpow(x, e):
    return math.copysign(abs(x) ** e, x)


def rotation_between(a, b):
    """a を b へ回す最小の回転。"""
    return Vector(a).normalized().rotation_difference(Vector(b).normalized())


def axis_angle(axis, deg):
    return Quaternion(Vector(axis).normalized(), math.radians(deg))


def to_matrix(q):
    return q.to_matrix().to_4x4() if isinstance(q, Quaternion) else Matrix(q)
