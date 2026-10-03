# OWNER: dragon
"""胴・首・尾・脚・翼の腕と指：骨格の図の点と辺に半径を持たせ、Skin モディファイアで肉付けし、細分化する。

背骨は点の間を Catmull-Rom でなめらかにつなぎ、脚と翼は付け根を胴の中の点から出して、継ぎ目を胴に溶け込ませる。
頂点の属性（腹・背の中央・脚の先・鱗の大きさ・喉の光）は、いちばん近い骨格の点から決める。
"""
import math

import bmesh
import bpy
from mathutils import Vector, kdtree

from . import paint
from .anatomy import FRONT, FRONT_TOES, G, HIND, HIND_TOES, SPINE_KEYS, UP, WING, side_point, SIDES
from .shapes import lerp, smoothstep


def hind_keys(sp):
    """後ろ脚の鎖の鍵の点（腰の中の点 → 付け根 → 太もも → 膝 → すね → かかと → 足の甲）。"""
    H = {k: (sp(v[0]), v[1]) for k, v in HIND.items()}
    return [(sp((1.5, -0.2, -6.6)), (2.35, 2.55)), H['hip'], H['thigh_mid'], H['knee'], H['shin_mid'], H['ankle'], H['ball']]


def front_keys(sp):
    """前脚の鎖の鍵の点（胸の中の点 → 肩 → 上腕 → 肘 → 前腕 → 手首 → 手の甲）。"""
    F = {k: (sp(v[0]), v[1]) for k, v in FRONT.items()}
    return [(sp((1.4, -0.1, 6.0)), (2.0, 2.2)), F['shoulder'], F['upperarm_mid'], F['elbow'], F['forearm_mid'], F['wrist'], F['hand']]


def _key_along(keys, index):
    """鍵の点 index までの、鎖に沿った長さ（m）。"""
    return sum((Vector(keys[k][0]) - Vector(keys[k - 1][0])).length for k in range(1, index + 1))


def joint_bumps():
    """関節の骨の出っ張り：(鎖, 鎖に沿った位置 m, 向き（+1 で前・-1 で後ろ）, 高さ m, 幅 m)。
    膝の皿は前、かかとは後ろ、肘は後ろ、手首の節は前に出る。r00c-竜: 指摘「脚が空気で膨らませた管のよう」"""
    h = hind_keys(lambda p: p)
    f = front_keys(lambda p: p)
    return [
        ('hind', _key_along(h, 3), 1.0, 0.42, 0.75),
        ('hind', _key_along(h, 5), -1.0, 0.36, 0.55),
        ('front', _key_along(f, 3), -1.0, 0.45, 0.65),
        ('front', _key_along(f, 5), 1.0, 0.2, 0.45),
    ]


class SkinGraph:
    def __init__(self):
        self.pos = []
        self.rad = []
        self.edges = []
        self.chain = []
        self.along = []

    def node(self, p, r, chain, along):
        self.pos.append(Vector(p))
        self.rad.append((float(r[0]), float(r[1])))
        self.chain.append(chain)
        self.along.append(float(along))
        return len(self.pos) - 1

    def link(self, a, b):
        self.edges.append((a, b))


def _catmull(p0, p1, p2, p3, t):
    t2, t3 = t * t, t * t * t
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)


def _spacing(radius, max_step=3.1):
    """Skin の輪の間隔。半径に比べて輪が近すぎると断面が折れてひれのような面が出るので、半径に比例させる（上限 max_step m）。"""
    return max(0.5, min(max_step, 0.85 * radius))


def spine_samples(spacing=None, keys=None, max_step=3.1):
    """背骨のキーの点を Catmull-Rom でつなぎ、(点, 半径, 弧長) を尾の先 → 頭の順に返す。

    キーの点そのものは必ず通る（骨の関節と肉の輪をそろえる）。キーの間は、太さに応じた間隔で刻む。
    spacing を与えたら、太さに関係なくその間隔で刻む（背のとげの置き場所などに使う）。
    keys は背骨のキーの点の並び（既定は紅竜の anatomy.SPINE_KEYS。ほかの怪獣は設計図の並びを渡す）。max_step は輪の間隔の上限。
    """
    keys = SPINE_KEYS if keys is None else keys
    pts = [Vector(p) for _, p, _ in keys]
    rad = [r for _, _, r in keys]
    out = [(pts[0], rad[0], 0.0)]
    along = 0.0
    for i in range(len(pts) - 1):
        p0 = pts[i - 1] if i > 0 else pts[0] * 2 - pts[1]
        p3 = pts[i + 2] if i + 2 < len(pts) else pts[-1] * 2 - pts[-2]
        fine = [_catmull(p0, pts[i], pts[i + 1], p3, k / 40) for k in range(41)]
        arc = [0.0]
        for k in range(1, 41):
            arc.append(arc[-1] + (fine[k] - fine[k - 1]).length)
        L = arc[-1]
        r_avg = 0.5 * (rad[i][1] + rad[i + 1][1])
        n = max(1, int(round(L / (spacing if spacing else _spacing(r_avg, max_step)))))
        j = 0
        for k in range(1, n + 1):
            s = L * k / n
            while j + 1 < 40 and arc[j + 1] < s:
                j += 1
            seg = arc[j + 1] - arc[j]
            t = 0.0 if seg <= 0 else (s - arc[j]) / seg
            u = (j + t) / 40
            r = (lerp(rad[i][0], rad[i + 1][0], u), lerp(rad[i][1], rad[i + 1][1], u))
            out.append((fine[j].lerp(fine[j + 1], t), r, along + s))
        along += L
    return out, along


def linear_chain(keys, spacing=None, max_step=3.1):
    """点と半径の並びを直線でつなぎ、(点, 半径, 弧長) の並びにする。キーの点は必ず通る。

    spacing を省くと、太さに応じた間隔（_spacing。上限 max_step m）で刻む。
    """
    out = [(Vector(keys[0][0]), keys[0][1], 0.0)]
    along = 0.0
    for i in range(len(keys) - 1):
        a, ra = Vector(keys[i][0]), keys[i][1]
        b, rb = Vector(keys[i + 1][0]), keys[i + 1][1]
        L = (b - a).length
        step = spacing if spacing else _spacing(0.5 * (max(ra) + max(rb)), max_step)
        n = max(1, int(round(L / step)))
        for k in range(1, n + 1):
            t = k / n
            out.append((a.lerp(b, t), (lerp(ra[0], rb[0], t), lerp(ra[1], rb[1], t)), along + L * t))
        along += L
    return out


def _add_chain(g, start, samples, chain):
    """start（既存の点）から samples の点を順につなぐ。最初の点は start と別の点として足す。"""
    prev = start
    ids = []
    for p, r, a in samples:
        n = g.node(p, r, chain, a)
        if prev is not None:
            g.link(prev, n)
        prev = n
        ids.append(n)
    return ids


def build_graph():
    """骨格の図（点と辺と半径）を、遊びの向きの座標で作る。

    1枚の図にまとめて持つが、肉付けは鎖ごと（背骨・脚・翼の腕）に分けて行う（make_skin_objects）。
    Skin は枝分かれの点で大きな凸包を作り、太い胴の輪を飲み込んで平らな板を残すため。
    脚と翼の腕は胴の中の点から始め、付け根を胴に埋める。
    """
    g = SkinGraph()
    spine, total = spine_samples()
    spine_ids = _add_chain(g, None, spine, 'spine')

    def nearest_spine(z):
        return min(spine_ids, key=lambda i: abs(g.pos[i].z - z))

    g.branch_from = nearest_spine

    for _, side in SIDES:
        sp = lambda p: side_point(p, side)
        # 後ろ脚：腰の中の点から、太もも・膝・すね・かかと・足の甲へ
        H = {k: (sp(v[0]), v[1]) for k, v in HIND.items()}
        leg = _add_chain(g, nearest_spine(-6.6), linear_chain(hind_keys(sp)), 'hind')
        ball = leg[-1]
        heel = min(leg, key=lambda i: (g.pos[i] - Vector(H['ankle'][0]).lerp(Vector(H['ball'][0]), 0.6)).length)
        for k, (tip, r) in enumerate(HIND_TOES):
            start = heel if k == 3 else ball
            base = g.pos[start]
            tipv = Vector(sp(tip))
            mid = base.lerp(tipv, 0.5) + Vector((0, 0.06, 0))
            _add_chain(g, start, linear_chain([(mid, (r * 1.75, r * 1.45)), (tipv, (r, r * 0.8))], 0.55), 'toe')
        # 前脚：胸の中の点から、肩・上腕・肘・前腕・手首・手の甲へ
        F = {k: (sp(v[0]), v[1]) for k, v in FRONT.items()}
        arm = _add_chain(g, nearest_spine(3.9), linear_chain(front_keys(sp)), 'front')
        hand = arm[-1]
        wristish = min(arm, key=lambda i: (g.pos[i] - Vector(F['wrist'][0]).lerp(Vector(F['hand'][0]), 0.5)).length)
        for k, (tip, r) in enumerate(FRONT_TOES):
            start = wristish if k == 3 else hand
            base = g.pos[start]
            tipv = Vector(sp(tip))
            mid = base.lerp(tipv, 0.5) + Vector((0, 0.05, 0))
            _add_chain(g, start, linear_chain([(mid, (r * 1.75, r * 1.45)), (tipv, (r, r * 0.8))], 0.55), 'toe')
        # 翼の腕：背（き甲）の中から、翼の付け根・上腕・肘・前腕・手首へ。半径は（前後の幅, 厚み）
        W = WING
        root = sp(W['root'])
        elbow = sp(W['elbow'])
        wrist = sp(W['wrist'])
        e_mid = Vector(root).lerp(Vector(elbow), 0.42) + Vector((0, 0.35, 0))
        w_mid = Vector(elbow).lerp(Vector(wrist), 0.4)
        keys = [
            (sp((1.1, 3.2, 6.7)), (1.05, 0.95)),
            (root, (0.98, 0.86)),
            (e_mid, (0.86, 0.74)),
            (elbow, (0.62, 0.56)),
            (w_mid, (0.58, 0.5)),
            (wrist, (0.47, 0.42)),
        ]
        arm_ids = _add_chain(g, nearest_spine(6.8), linear_chain(keys), 'wingarm')
        w0 = arm_ids[-1]
        f1_k = Vector(sp(W['fingers'][0][0]))
        u = (f1_k - Vector(wrist)).normalized()
        w1 = g.node(Vector(wrist) + u * 1.2, (0.42, 0.36), 'wingarm', g.along[w0] + 1.2)
        g.link(w0, w1)
        # 翼の指は細く長いので、Skin には入れず別の管にする（extras.finger_tubes）。細分化を2段かけると三角形が多すぎる
    return g, spine_ids, total


def components(g):
    """背骨から枝への橋の辺を外し、鎖ごと（つながった点の組）に分ける。[(名前, 点の番号, 辺)] の並び。"""
    edges = [(a, b) for a, b in g.edges if not (g.chain[a] == 'spine') != (g.chain[b] == 'spine')]
    parent = list(range(len(g.pos)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for a, b in edges:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[max(ra, rb)] = min(ra, rb)
    groups = {}
    for i in range(len(g.pos)):
        groups.setdefault(find(i), []).append(i)
    out = []
    for root in sorted(groups):
        ids = groups[root]
        idset = set(ids)
        comp_edges = [(a, b) for a, b in edges if a in idset]
        name = g.chain[ids[0]] if g.chain[ids[0]] != 'toe' else g.chain[ids[-1]]
        out.append((name + '_%d' % len(out), ids, comp_edges))
    return out


def make_skin_objects(g, subdiv=2):
    """鎖ごとに Skin → 細分化して、物体の並びを返す。背骨の管だけは rounding（round_skin）の対象にする。"""
    obs = []
    for name, ids, edges in components(g):
        index = {v: k for k, v in enumerate(ids)}
        sub = SkinGraph()
        for v in ids:
            sub.node(g.pos[v], g.rad[v], g.chain[v], g.along[v])
        for a, b in edges:
            sub.link(index[a], index[b])
        ob = make_skin_object(sub, name='skin_' + name, subdiv=subdiv)
        ob['chain'] = g.chain[ids[0]]
        obs.append(ob)
    return obs


def make_skin_object(g, name='dragon_body', subdiv=2):
    """骨格の図 → Skin モディファイア → 細分化。適用済みのメッシュの物体を返す（座標は Blender）。"""
    me = bpy.data.meshes.new(name + '_graph')
    me.from_pydata([G(*p) for p in g.pos], g.edges, [])
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    skin = ob.modifiers.new('Skin', 'SKIN')
    skin.branch_smoothing = 0.5
    skin.use_smooth_shade = True
    sv = me.skin_vertices[0].data
    for i, r in enumerate(g.rad):
        sv[i].radius = r
    sv[0].use_root = True
    sub = ob.modifiers.new('Subsurf', 'SUBSURF')
    sub.levels = subdiv
    sub.render_levels = subdiv
    sub.quality = 3
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.ops.object.modifier_apply(modifier='Skin')
    bpy.ops.object.modifier_apply(modifier='Subsurf')
    return ob


class GraphLookup:
    """骨格の辺を細かく刻んだ点の KD 木。頂点から、いちばん近い骨格の点（鎖の種類・弧長・接線）を引く。"""

    def __init__(self, g, chains=None):
        self.items = []
        for a, b in g.edges:
            # chains を与えたら、両端がその鎖の辺だけを入れる（背骨から枝への橋の辺は入らない）
            if chains is not None and (g.chain[a] not in chains or g.chain[b] not in chains):
                continue
            pa, pb = g.pos[a], g.pos[b]
            L = (pb - pa).length
            n = max(1, int(L / 0.2))
            t_dir = (pb - pa).normalized() if L > 1e-9 else Vector((0, 0, 1))
            chain = g.chain[b]
            for k in range(n + 1):
                t = k / n
                ra = g.rad[a]
                rb = g.rad[b]
                self.items.append((pa.lerp(pb, t), chain, lerp(g.along[a], g.along[b], t) if g.chain[a] == chain else g.along[b] - L * (1 - t), t_dir, (lerp(ra[0], rb[0], t), lerp(ra[1], rb[1], t))))
        self.tree = kdtree.KDTree(len(self.items))
        for i, it in enumerate(self.items):
            self.tree.insert(it[0], i)
        self.tree.balance()

    def nearest(self, p_game):
        _, i, dist = self.tree.find(p_game)
        return self.items[i], dist


def _spine_scale(along, total):
    """背骨の弧長 → 鱗の大きさ（m）。尾の先で小さく、背で大きく、首で中くらい。"""
    return lerp(0.22, 0.6, smoothstep(0.0, 0.42 * total, along)) if along < 0.62 * total else lerp(0.6, 0.34, smoothstep(0.62 * total, total, along))


class SpineFrames:
    """背骨を細かく刻んだ点（Catmull-Rom）の KD 木。点ごとに接線・上向き・横向き・半径を持つ。"""

    def __init__(self, step=0.25, keys=None):
        samples, self.total = spine_samples(step, keys)
        self.items = []
        n = len(samples)
        for i, (p, r, a) in enumerate(samples):
            t = (samples[min(n - 1, i + 1)][0] - samples[max(0, i - 1)][0]).normalized()
            up = (UP_G - t * UP_G.dot(t)).normalized()
            side = t.cross(up).normalized()
            self.items.append((p, t, up, side, r, a))
        self.tree = kdtree.KDTree(n)
        for i, it in enumerate(self.items):
            self.tree.insert(it[0], i)
        self.tree.balance()

    def nearest(self, p_game):
        _, i, dist = self.tree.find(p_game)
        return self.items[i], dist


def round_skin(ob, g, iterations=8, keys=None, limb_chains=('hind', 'front', 'wingarm', 'toe')):
    """Skin の輪は4角なので、枝の付け根では大きな平らな面ができる（細分化しても板のまま）。

    背骨が近い頂点を、背骨の断面の楕円（横の半径・縦の半径）へ寄せる。寄せる量はメッシュの上で何度かならしてから足す
    （隣どうしで寄せ方が違うと、付け根でしわが寄る）。脚と翼の腕は Skin の丸みのまま使う。
    keys は背骨のキーの点、limb_chains は脚や腕の鎖の名前（既定は紅竜）。
    """
    me = ob.data
    frames = SpineFrames(keys=keys)
    limbs = GraphLookup(g, chains=set(limb_chains))
    n = len(me.vertices)
    delta = []
    for v in me.vertices:
        co = v.co
        pg = Vector((co.x, co.z, -co.y))
        (sp, t, up, side, r, _), d_spine = frames.nearest(pg)
        _, d_limb = limbs.nearest(pg)
        k_limb = smoothstep(0.3, 1.5, d_spine - d_limb)
        d = pg - sp
        d = d - t * d.dot(t)
        if d.length < 1e-6:
            delta.append(Vector((0, 0, 0)))
            continue
        dn = d.normalized()
        c = dn.dot(up)
        s_ = dn.dot(side)
        re = 1.0 / math.sqrt((c / r[1]) ** 2 + (s_ / r[0]) ** 2)
        move = dn * (re - d.length) * smoothstep(0.55, 0.05, k_limb)
        if move.length > 1.2:
            move = move.normalized() * 1.2
        # Blender の座標へ（x, y, z）→（x, -z, y）
        delta.append(Vector((move.x, -move.z, move.y)))
    nbr = [[] for _ in range(n)]
    for e in me.edges:
        a, b = e.vertices
        nbr[a].append(b)
        nbr[b].append(a)
    for _ in range(iterations):
        nxt = []
        for i in range(n):
            if not nbr[i]:
                nxt.append(delta[i])
                continue
            avg = Vector((0, 0, 0))
            for j in nbr[i]:
                avg += delta[j]
            nxt.append(delta[i] * 0.5 + avg * (0.5 / len(nbr[i])))
        delta = nxt
    for v, dv in zip(me.vertices, delta):
        v.co = v.co + dv
    me.update()


def paint_skin(ob, g, total, seed=0):
    """細分化した胴の頂点に、色と属性（腹・鱗の大きさ・弧長・喉の光）を塗る。背の中央に低い稜線を盛る。

    背骨からの見え方（背・腹）と、脚や翼の腕からの見え方を、どちらに近いかでなめらかに混ぜる。
    いちばん近い鎖だけで決めると、脚の付け根で腹の色が四角く途切れる。
    """
    me = ob.data
    n = len(me.vertices)
    spine = GraphLookup(g, chains={'spine'})
    limbs = GraphLookup(g, chains={'hind', 'front', 'toe', 'wingarm', 'finger'})
    cols, part, belly, memb, glow, along, scale = [], [], [], [], [], [], []
    new_co = []
    # 喉の光の始まり：首の中ほど（キーの点の間の直線の長さで近似した弧長）
    pts = [Vector(p) for _, p, _ in SPINE_KEYS]
    seg = [(pts[k] - pts[k - 1]).length for k in range(1, len(pts))]
    names = [name for name, _, _ in SPINE_KEYS]
    neck_start = sum(seg[:names.index('neck_2')]) * total / sum(seg)
    joints = joint_bumps()
    for v in me.vertices:
        co = v.co
        pg = Vector((co.x, co.z, -co.y))
        ng = Vector((v.normal.x, v.normal.z, -v.normal.y))
        (sp, _, al, tdir, _), d_spine = spine.nearest(pg)
        (lp, chain_l, al_l, tdir_l, _), d_limb = limbs.nearest(pg)
        up = (UP_G - tdir * UP_G.dot(tdir)).normalized()
        d = pg - sp
        d_perp = d - tdir * d.dot(tdir)
        dn = d_perp.normalized() if d_perp.length > 1e-6 else up
        dorsal_s = dn.dot(up)
        side = abs(dn.dot(tdir.cross(up).normalized()))
        # 腹の板：喉から尾の途中まで、下側の扇形
        fade = smoothstep(0.05 * total, 0.28 * total, al) * (1.0 - smoothstep(0.93 * total, 0.985 * total, al))
        belly_s = smoothstep(-0.42, -0.74, dorsal_s) * fade
        glow_s = smoothstep(neck_start, total - 0.6, al) * smoothstep(-0.2, -0.75, dorsal_s)
        ridge_h = 0.28 * smoothstep(0.08 * total, 0.3 * total, al) * (1.0 - smoothstep(0.9 * total, 0.99 * total, al))
        ridge = ridge_h * math.exp(-((1.0 - dorsal_s) / 0.05) ** 2) * (1.0 - side) if dorsal_s > 0.7 else 0.0
        # 脚・翼の腕の側
        span = 13.0 if chain_l == 'hind' else 11.5
        lower_l = 1.0 if chain_l == 'toe' else (smoothstep(0.45 * span, span, al_l) if chain_l in ('hind', 'front') else 0.0)
        # r00c-竜: 指摘「脚の鱗が胴と同じ大きさで、ひび割れた土のよう」 脚 0.42→0.2 を 0.3→0.15 に、指は 0.12
        sc_l = lerp(0.3, 0.15, lower_l) if chain_l in ('hind', 'front') else (0.12 if chain_l == 'toe' else (0.3 if chain_l == 'wingarm' else 0.18))
        # 背の中央は大きな鱗、脇腹の下は小さな鱗（腹の板の手前）
        sc_s = _spine_scale(al, total) * lerp(0.72, 1.3, smoothstep(-0.45, 0.85, dorsal_s))
        t = smoothstep(0.4, 1.6, d_spine - d_limb)
        dorsal = lerp(dorsal_s, ng.dot(UP_G), t)
        b = belly_s * (1.0 - t)
        c = paint.skin_color(pg, dorsal, b, lower_l * t, seed)
        if chain_l in ('wingarm', 'finger'):
            c = paint.mix(c, paint.MEMBRANE_EDGE, 0.35 * t)
        # 足の裏のまわりの暗がり（地面との隙間に光が届かない分と、土の汚れ）。
        # r00c-竜: 指摘「足が地面から浮いて見える」 目の高さから見ると地面の影はほとんど潰れるので、足そのものの下側を暗くする
        sole = smoothstep(-8.2, -9.45, pg.y)
        c = paint.mix(paint.scale(c, 1.0 - 0.5 * sole), paint.FEET_DIRT, 0.3 * sole)
        cols.append(c)
        part.append(paint.PART_SKIN)
        belly.append(b)
        memb.append(0.0)
        glow.append(glow_s * (1.0 - t))
        along.append(al)
        scale.append(lerp(sc_s, sc_l, t))
        bump = 0.0
        if t > 0.02 and chain_l in ('hind', 'front'):
            dl = pg - lp
            dl = dl - tdir_l * dl.dot(tdir_l)
            fwd_l = FWD_G - tdir_l * FWD_G.dot(tdir_l)
            if dl.length > 1e-6 and fwd_l.length > 1e-6:
                c_front = dl.normalized().dot(fwd_l.normalized())
                for chain_j, al_j, facing, amp, width in joints:
                    if chain_j == chain_l:
                        bump += amp * math.exp(-((al_l - al_j) / width) ** 2) * max(0.0, c_front * facing) ** 3
        new_co.append(co + v.normal * (ridge * (1.0 - t) + bump * t))
    for v, co in zip(me.vertices, new_co):
        v.co = co
    set_attributes(me, cols, {'part': part, 'belly': belly, 'memb': memb, 'glow': glow, 'along': along, 'scale': scale})
    return n


UP_G = Vector((0.0, 1.0, 0.0))
FWD_G = Vector((0.0, 0.0, 1.0))

ATTR_NAMES = {'part': '_PART', 'belly': '_BELLY', 'memb': '_MEMB', 'glow': '_GLOW', 'along': '_ALONG', 'scale': '_SCALE'}


def set_attributes(me, colors, attrs, names=None):
    """頂点の色（線形）と属性を書く。glTF には COLOR_0 と _PART 等（下線で始まる名前）で出る。

    names は書く属性（既定は紅竜の6つ）。attrs に無い属性は 0 で埋める（怪獣ごとに足した属性を、ほかの部品にもそろえるため）。
    """
    col = me.color_attributes.get('Col') or me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    flat = []
    for c in colors:
        flat.extend((c[0], c[1], c[2], 1.0))
    col.data.foreach_set('color', flat)
    me.color_attributes.active_color = col
    n = len(colors)
    for key, name in (ATTR_NAMES if names is None else names).items():
        a = me.attributes.get(name) or me.attributes.new(name, 'FLOAT', 'POINT')
        a.data.foreach_set('value', attrs[key] if key in attrs else [0.0] * n)


def mesh_from_piece(piece, name, names=None):
    """Piece（遊びの向きの座標）→ Blender のメッシュの物体。重みは頂点グループにする。names は書く属性（set_attributes）。"""
    me = bpy.data.meshes.new(name)
    me.from_pydata([G(*v) for v in piece.verts], [], [tuple(f) for f in piece.faces])
    me.validate(clean_customdata=False)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    set_attributes(me, piece.colors, piece.attrs, names)
    groups = {}
    for vi, w in enumerate(piece.weights):
        for bone, value in w.items():
            if value <= 0:
                continue
            if bone not in groups:
                groups[bone] = ob.vertex_groups.new(name=bone)
            groups[bone].add([vi], float(value), 'REPLACE')
    if piece.recalc:
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
    for poly in me.polygons:
        poly.use_smooth = piece.smooth
    if piece.subdivide > 0:
        bpy.context.view_layer.objects.active = ob
        for o in bpy.context.view_layer.objects:
            o.select_set(False)
        ob.select_set(True)
        sub = ob.modifiers.new('Subsurf', 'SUBSURF')
        sub.levels = piece.subdivide
        sub.render_levels = piece.subdivide
        bpy.ops.object.modifier_apply(modifier='Subsurf')
    return ob
