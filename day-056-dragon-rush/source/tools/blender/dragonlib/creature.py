# OWNER: dragon
"""設計図から怪獣を組み立てる共通の手順（雷翼・焔角が使う）。紅竜は r00c の手順（creatures/kurenai.py）のまま。

設計図（tools/blender/creatures/<名前>.py）が持つもの：
  ID・PREFIX・SEED・OUT・GROUND   名前と、立ったときの足の裏の高さ（原点 = 胴の中心から、m）
  SPINE_KEYS                      背骨のキーの点（尾の先 → 頭の付け根。名前・点・(横の半径, 縦の半径)）
  LIMBS                           脚や翼の腕の鎖（左の側だけ書く。右は写す）。Limb の並び
  HEAD・PALETTE                    頭の設計（dragonlib.head.HeadSpec）と色の組（dragonlib.paint.Palette）
  bone_table()                    骨の一覧（名前・頭・尾・親）
  painter(pt)                     肉付けの頂点の色と属性（SkinPoint → (色, 属性, 法線の向きへの押し出し m)）
  parts(ctx)                      部品（Piece）の並び。ctx.surface で体表に当てて置ける
  make_author(arm)・BUILDERS・CLIPS・GAITS  クリップ
  reference_points()・chains()    実行時が読む目印と骨の鎖

座標は「遊びの向き」（x 左・y 上・z 前）。Blender へは anatomy.G で直す。
"""
import math
import time

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

from . import assemble, author, body, rig
from .anatomy import SIDES, side_point
from .body import ATTR_NAMES, GraphLookup, SkinGraph, _add_chain, linear_chain, spine_samples
from .shapes import smoothstep

# 怪獣ごとに足した属性：_EMIT は発光の筋（雷翼）・溶岩（焔角）の強さ、_LINE は細い筋の中心からの距離（m）
CREATURE_ATTRS = dict(ATTR_NAMES, emit='_EMIT', line='_LINE')

UP_G = Vector((0.0, 1.0, 0.0))


class Limb:
    """脚や翼の腕の鎖（左の側）。keys は (点, (半径, 半径)) の並び（胴の中の点から先へ）。

    anchor_z：胴のどの前後の位置の点から枝を出すか。toes は指：(先の点, 半径, 付け根)。付け根は None で鎖の先、
    点を渡すとその点にいちばん近い鎖の点から出す（かかとの後ろ向きの指など）。
    """

    def __init__(self, chain, anchor_z, keys, toes=()):
        self.chain = chain
        self.anchor_z = anchor_z
        self.keys = keys
        self.toes = toes


def build_graph(spine_keys, limbs, max_step=3.1):
    """骨格の図（点と辺と半径）：背骨と、左右の脚・腕の鎖と指。紅竜の body.build_graph と同じ作り方の、設計図で動く版。

    max_step は肉付けの輪の間隔の上限（m）。太い怪獣は小さくすると胴の輪郭がなめらかになり、三角形も増える。
    """
    g = SkinGraph()
    spine, total = spine_samples(keys=spine_keys, max_step=max_step)
    spine_ids = _add_chain(g, None, spine, 'spine')

    def nearest_spine(z):
        return min(spine_ids, key=lambda i: abs(g.pos[i].z - z))

    for _, side in SIDES:
        sp = lambda p: side_point(p, side)
        for limb in limbs:
            ids = _add_chain(g, nearest_spine(limb.anchor_z), linear_chain([(sp(p), r) for p, r in limb.keys], max_step=max_step), limb.chain)
            for tip, r, root in limb.toes:
                start = ids[-1] if root is None else min(ids, key=lambda i: (g.pos[i] - Vector(sp(root))).length)
                base = g.pos[start]
                tipv = Vector(sp(tip))
                mid = base.lerp(tipv, 0.5) + Vector((0, 0.06, 0))
                _add_chain(g, start, linear_chain([(mid, (r * 1.75, r * 1.45)), (tipv, (r, r * 0.8))], 0.55), 'toe')
    return g, spine_ids, total


class SkinPoint:
    """肉付けの1頂点の見え方（painter に渡す）。

    pos・normal：休みの姿勢の位置と法線（遊びの向き）。along・u：背骨の弧長（m）と、全長に対する割合（尾の先 0 → 頭 1）。
    dorsal：背骨から見た向きの上下（背の中央 1・腹 -1）、left：左右（左 1・右 -1）、radius：そこでの背骨の半径。
    chain・limb_along・limb_dir・limb_point：いちばん近い脚や腕の鎖と、その弧長・向き・点。limb_t：背骨 0 → 脚や腕 1 の混ぜ具合。
    """

    __slots__ = ('pos', 'normal', 'along', 'u', 'total', 'dorsal', 'left', 'radius', 'spine_point', 'spine_dir',
                 'chain', 'limb_along', 'limb_dir', 'limb_point', 'limb_radius', 'limb_t')


def paint_skin(ob, g, total, painter, limb_chains):
    """肉付けの頂点に、設計図の painter で色と属性を塗り、押し出しを足す。"""
    me = ob.data
    spine = GraphLookup(g, chains={'spine'})
    limbs = GraphLookup(g, chains=set(limb_chains) | {'toe'})
    cols = []
    attrs = {k: [] for k in CREATURE_ATTRS}
    new_co = []
    pt = SkinPoint()
    pt.total = total
    for v in me.vertices:
        co = v.co
        pg = Vector((co.x, co.z, -co.y))
        (sp, _, al, tdir, rad), d_spine = spine.nearest(pg)
        (lp, chain_l, al_l, tdir_l, rad_l), d_limb = limbs.nearest(pg)
        up = (UP_G - tdir * UP_G.dot(tdir)).normalized()
        d = pg - sp
        d_perp = d - tdir * d.dot(tdir)
        dn = d_perp.normalized() if d_perp.length > 1e-6 else up
        pt.pos = pg
        pt.normal = Vector((v.normal.x, v.normal.z, -v.normal.y))
        pt.along = al
        pt.u = al / total
        pt.dorsal = dn.dot(up)
        pt.left = dn.dot(up.cross(tdir).normalized())
        pt.radius = rad
        pt.spine_point = sp
        pt.spine_dir = tdir
        pt.chain = chain_l
        pt.limb_along = al_l
        pt.limb_dir = tdir_l
        pt.limb_point = lp
        pt.limb_radius = rad_l
        pt.limb_t = smoothstep(0.4, 1.6, d_spine - d_limb)
        color, values, push = painter(pt)
        cols.append(color)
        for k in CREATURE_ATTRS:
            attrs[k].append(values.get(k, 0.0))
        new_co.append(co + v.normal * push)
    for v, co in zip(me.vertices, new_co):
        v.co = co
    body.set_attributes(me, cols, attrs, CREATURE_ATTRS)


class Surface:
    """肉付けした体表（休みの姿勢）への当たり。部品（岩の板・発光の筋）を体表に沿って置くのに使う。座標は遊びの向き。"""

    def __init__(self, obs):
        verts, polys = [], []
        for ob in obs:
            base = len(verts)
            verts.extend(Vector((v.co.x, v.co.z, -v.co.y)) for v in ob.data.vertices)
            polys.extend([base + i for i in p.vertices] for p in ob.data.polygons)
        self.tree = BVHTree.FromPolygons(verts, polys)

    def cast(self, origin, direction, distance=200.0):
        """origin から direction へ光線を出し、最初に当たった体表の点と法線（外向き）。当たらなければ (None, None)。"""
        hit, normal, _, _ = self.tree.ray_cast(Vector(origin), Vector(direction).normalized(), distance)
        if hit is None:
            return None, None
        if normal.dot(Vector(direction)) > 0:
            normal = -normal
        return hit, normal

    def nearest(self, p):
        hit, normal, _, _ = self.tree.find_nearest(Vector(p))
        return hit, normal


class PartsContext:
    """parts(ctx) に渡すもの：背骨の全長・体表・種・骨の一覧（いちばん近い骨を引く）。"""

    def __init__(self, total, surface, seed, bones):
        self.total = total
        self.surface = surface
        self.seed = seed
        self.bones = {name: (Vector(h), Vector(t)) for name, h, t, _ in bones}

    def nearest_bone(self, p, names):
        p = Vector(p)

        def dist(n):
            a, b = self.bones[n]
            ab = b - a
            t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-9)))
            return (a + ab * t - p).length

        return min(names, key=dist)


def spine_bones(keys, head, jaw_hinge, jaw_tip):
    """背骨の骨：body（根）・pelvis・spine・chest・尾（tail_01〜）・首（neck_01〜）・head・jaw。名前は紅竜と同じ約束。

    キーの点の名前に hips・belly・chest・withers・head_joint が要る。尾は hips から尾の先へ、首は withers から head_joint へ。
    head は HeadSpec（頭の骨は head_joint → 鼻先、顎の骨は蝶番 → 顎の先）。
    """
    S = {name: p for name, p, _ in keys}
    names = [name for name, _, _ in keys]
    center = (0.0, S['belly'][1], 0.0)
    bones = [
        ('body', (0.0, 0.0, 0.0), (0.0, 0.0, 2.0), None),
        ('pelvis', center, S['hips'], 'body'),
        ('spine', center, S['chest'], 'body'),
        ('chest', S['chest'], S['withers'], 'spine'),
    ]
    tail = names[:names.index('hips') + 1][::-1]
    parent = 'pelvis'
    for i in range(len(tail) - 1):
        name = 'tail_%02d' % (i + 1)
        bones.append((name, S[tail[i]], S[tail[i + 1]], parent))
        parent = name
    neck = names[names.index('withers'):names.index('head_joint') + 1]
    parent = 'chest'
    for i in range(len(neck) - 1):
        name = 'neck_%02d' % (i + 1)
        bones.append((name, S[neck[i]], S[neck[i + 1]], parent))
        parent = name
    bones.append(('head', S['head_joint'], head.point(head.length, 0.0), parent))
    bones.append(('jaw', head.point(*jaw_hinge), head.point(*jaw_tip), 'head'))
    return bones


def head_axes(origin, pitch_deg):
    """頭の局所の軸（原点・前・上・左）と、局所 → 遊びの向きの関数。anatomy.head_frame・head_point と同じ約束。"""
    a = math.radians(pitch_deg)
    o = tuple(origin)
    f = (0.0, math.sin(a), math.cos(a))
    u = (0.0, math.cos(a), -math.sin(a))
    l = (1.0, 0.0, 0.0)

    def frame():
        return o, f, u, l

    def point(s, up, left=0.0):
        return tuple(o[i] + f[i] * s + u[i] * up + l[i] * left for i in range(3))

    return frame, point


def chain_names(bones, prefix):
    return [name for name, _, _, _ in bones if name.startswith(prefix)]


def measure_dims(lod0, ground, withers_z):
    """休みの姿勢の大きさ（m）：全長（前後）・幅（左右。翼を広げた幅）・高さ・肩の高さ（き甲の前後 ±2m の体表のいちばん上）。"""
    xs, ys, zs, shoulder = [], [], [], -1e9
    for v in lod0.data.vertices:
        x, y, z = v.co.x, v.co.z, -v.co.y
        xs.append(x)
        ys.append(y)
        zs.append(z)
        if abs(z - withers_z) < 2.0 and abs(x) < 3.0:
            shoulder = max(shoulder, y)
    r = lambda v: round(v, 2)
    return {'length': r(max(zs) - min(zs)), 'span': r(max(xs) - min(xs)), 'height': r(max(ys) - ground), 'shoulder': r(shoulder - ground),
            'front': r(max(zs)), 'back': r(min(zs))}


def build(bp, args):
    """設計図 bp から、骨組み付きの近景のメッシュを作る（build_creature.py が遠景・クリップ・書き出しを続ける）。"""
    t0 = time.time()
    assemble.reset_scene()
    skin_mat, memb_mat = assemble.make_materials(bp.PREFIX)
    limb_chains = tuple(sorted({limb.chain for limb in bp.LIMBS}))

    graph, _, total = build_graph(bp.SPINE_KEYS, bp.LIMBS, getattr(bp, 'RING_STEP', 3.1))
    skins = body.make_skin_objects(graph)
    for ob in skins:
        if ob['chain'] == 'spine':
            body.round_skin(ob, graph, keys=bp.SPINE_KEYS, limb_chains=limb_chains + ('toe',))
        paint_skin(ob, graph, total, bp.painter, limb_chains)
        ob.data.materials.append(skin_mat)
    body_ob = skins[0]

    bones = bp.bone_table()
    ctx = PartsContext(total, Surface(skins), args.seed, bones)
    part_obs = []
    for p in bp.parts(ctx):
        ob = body.mesh_from_piece(p, 'part_' + p.name, CREATURE_ATTRS)
        ob.data.materials.append(memb_mat if p.material == 1 else skin_mat)
        part_obs.append(ob)
    timings = {'geometry': round(time.time() - t0, 1)}

    arm = rig.build_armature(bp.PREFIX + '_rig', bones)
    t1 = time.time()
    for ob in skins:
        rig.weight_body(ob, arm, exclude=getattr(bp, 'NO_DEFORM', ('jaw',)))
    timings['weights'] = round(time.time() - t1, 1)
    for ob in part_obs:
        rig.attach(ob, arm)
    assemble.select_only(skins + part_obs, body_ob)
    bpy.ops.object.join()
    lod0 = body_ob
    if 'chain' in lod0:
        del lod0['chain']
    lod0.name = bp.PREFIX + '_lod0'
    lod0.data.name = bp.PREFIX + '_lod0'
    withers_z = next(p for name, p, _ in bp.SPINE_KEYS if name == 'withers')[2]
    report = {'id': bp.ID, 'ground': bp.GROUND, 'dims': measure_dims(lod0, bp.GROUND, withers_z), 'parts': len(part_obs)}
    return {'arm': arm, 'lod0': lod0, 'report': report, 'timings': timings}


def author_clips(bp, arm):
    return author.author_clips(arm, bp.make_author(arm), bp.BUILDERS, bp.CLIPS, bp.GAITS)


def metadata(bp, clips):
    """GLB の extras（three.js の userData.creature）に入れる、実行時が読む値。紅竜の motion.metadata と同じ形に、鎖と大きさを足す。

    points は休みの姿勢での目印（glTF の座標 = 遊びの向き）と、それが付く骨。chains は首・尾・翼の先の骨の並び（実行時の注視・ばね用）。
    """
    soles = _soles(bp)
    return {
        'version': 1,
        'id': bp.ID,
        'clips': clips,
        'feet': {foot: {'toe': toe, 'chain': chain, 'touch': touch, 'sole': soles[foot]} for foot, touch, chain, toe, _ in bp.FEET},
        'ground': bp.GROUND,
        'points': bp.reference_points(),
        'chains': bp.chains(),
    }


def _soles(bp):
    """足を地面に置いたとき、足の甲（指の骨の付け根）が足の裏からどれだけ上にあるか（m）。休みの姿勢が立った形でない足
    （雷翼の翼の手首）は、設計図の STANCE の高さから求める。実行時は、足の甲の高さからこれを引いて接地の高さを出す。"""
    heads = {name: h for name, h, _, _ in bp.bone_table()}
    stance = getattr(bp, 'STANCE', {})
    out = {}
    for foot, _, _, toe, _ in bp.FEET:
        # STANCE は Blender の座標（上が Z）、骨の一覧は遊びの向き（上が y）
        y = stance[foot][0].z if foot in stance else heads[toe][1]
        out[foot] = round(y - bp.GROUND, 4)
    return out


def weights_along(points, names, blend=1.0):
    """折れ線の上の弧長で、骨の名前の並びへ重みを配る関数を返す。points は骨の継ぎ目の点（骨の数 + 1）。

    継ぎ目のまわり ±blend m で両側の骨を混ぜる（曲げても割れないように）。戻り値は f(弧長) → {骨: 重み}。
    """
    cum = [0.0]
    for i in range(1, len(points)):
        cum.append(cum[-1] + (Vector(points[i]) - Vector(points[i - 1])).length)

    def f(s):
        out = {}
        for i, name in enumerate(names):
            lo = smoothstep(cum[i] - blend, cum[i] + blend, s) if i > 0 else 1.0
            hi = 1.0 - smoothstep(cum[i + 1] - blend, cum[i + 1] + blend, s) if i + 1 < len(names) else 1.0
            w = lo * hi
            if w > 1e-4:
                out[name] = w
        total = sum(out.values())
        return {k: v / total for k, v in out.items()}

    return f, cum
