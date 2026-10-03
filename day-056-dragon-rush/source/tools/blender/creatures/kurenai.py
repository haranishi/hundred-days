# OWNER: dragon
"""紅竜（くれないりゅう）の設計図：四脚＋翼の西洋竜。全長およそ60m・翼を広げて80m。

骨格の図は dragonlib/anatomy.py、頭は dragonlib/head.py の DRAGON、色は dragonlib/paint.py の DRAGON、
クリップは dragonlib/motion.py にある（r00c で作ったものをそのまま使う）。組み立ての順と数値は r00c と同じで、
GLB（public/assets/dragon.glb）と報告（tools/blender/dragon-report.json）は同じ引数なら同じバイト列になる。
"""
import random
import time

import bpy

from dragonlib import assemble, body, extras, head, membrane, motion, rig
from dragonlib.anatomy import G, HEAD_LENGTH, JAW_TIP, head_point

ID = 'kurenai'
PREFIX = 'dragon'
META_KEY = 'dragon'
SEED = 7
OUT = 'public/assets/dragon.glb'
REPORT = 'tools/blender/dragon-report.json'

# 形の確認の向き（Blender の座標）：(カメラの位置, 注視点, 画角)
PREVIEW = {
    'side': (G(95, 4, -2), G(0, 2, -4), 38),
    'front': (G(0, 6, 95), G(0, 4, 0), 42),
    'top': (G(0, 110, -2), G(0, 0, -2), 50),
    'three_quarter': (G(55, 25, 60), G(0, 3, -2), 45),
    'head': (G(15, 12.5, 31), G(0, 10.4, 25.2), 32),
    'head_side': (G(18, 10.5, 25.5), G(0, 10.3, 25.2), 30),
}
CLIP_VIEW = (G(70, 18, 45), G(0, 1, -3), 52)


def reference_points():
    """実行時が使う目印（遊びの向きの座標）：鼻先・顎の先・口の中（上顎側と下顎側）。"""
    from dragonlib.head import MOUTH
    r = lambda p: [round(c, 4) for c in p]
    return {
        'snout': {'bone': 'head', 'pos': r(head_point(HEAD_LENGTH, 0.0))},
        'jawTip': {'bone': 'jaw', 'pos': r(head_point(*JAW_TIP))},
        'mouthUpper': {'bone': 'head', 'pos': r(head_point(6.2, MOUTH(6.2) - 0.06))},
        'mouthLower': {'bone': 'jaw', 'pos': r(head_point(6.0, MOUTH(6.0) - 0.22))},
    }


def build(args):
    t0 = time.time()
    assemble.reset_scene()
    rng = random.Random(args.seed)
    skin_mat, memb_mat = assemble.make_materials(PREFIX)

    graph, _, total = body.build_graph()
    skins = body.make_skin_objects(graph)
    for ob in skins:
        if ob['chain'] == 'spine':
            body.round_skin(ob, graph)
        body.paint_skin(ob, graph, total, args.seed)
        ob.data.materials.append(skin_mat)
    body_ob = skins[0]

    pieces = head.head_pieces(total, args.seed)
    spikes, n_spikes = extras.dorsal_spikes(rng)
    pieces += [spikes, extras.claws(), extras.finger_tubes(args.seed), membrane.membrane(args.seed)]
    part_obs = []
    for p in pieces:
        ob = body.mesh_from_piece(p, 'part_' + p.name)
        ob.data.materials.append(memb_mat if p.material == 1 else skin_mat)
        part_obs.append(ob)
    timings = {'geometry': round(time.time() - t0, 1)}

    arm = rig.build_armature()
    t1 = time.time()
    for ob in skins:
        rig.weight_body(ob, arm)
    timings['weights'] = round(time.time() - t1, 1)
    for ob in part_obs:
        rig.attach(ob, arm)
    assemble.select_only(skins + part_obs, body_ob)
    bpy.ops.object.join()
    lod0 = body_ob
    if 'chain' in lod0:
        del lod0['chain']
    lod0.name = 'dragon_lod0'
    lod0.data.name = 'dragon_lod0'
    # 同じ位置に重なった頂点（膜の縫い目など）は部品ごとに作ってあるので、ここではつながない
    return {'arm': arm, 'lod0': lod0, 'report': {'spikes': n_spikes}, 'timings': timings}


def author_clips(arm):
    return motion.author_clips(arm)


def metadata(clips):
    return motion.metadata(clips, reference_points())
