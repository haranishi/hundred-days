# OWNER: dragon
"""どの怪獣でも同じ組み立ての手順：場面の初期化・材質・部品の結合・遠景（簡略版）・GLB の書き出し・形の確認の撮影。

紅竜（creatures/kurenai.py）・雷翼・焔角が同じ関数を同じ順で呼ぶ。紅竜の GLB は r00c と同じバイト列のままにしてあるので、
書き出しの設定や名前の付け方を変えるときは、npm run build:creatures の SHA-256 の表示で紅竜が変わらないことを確かめる。
"""
import math
import os

import bpy
from mathutils import Vector

LOD1_TRIANGLES = 20000


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = 30
    scene.render.fps_base = 1.0
    scene.frame_start = 0


def make_materials(prefix):
    """皮膚（裏を描かない）と膜（両面）の2つ。色は頂点の色で持つので、材質は名前と粗さだけ。"""
    skin = bpy.data.materials.new(prefix + '_skin')
    skin.use_backface_culling = True
    memb = bpy.data.materials.new(prefix + '_membrane')
    memb.use_backface_culling = False
    for m, rough in ((skin, 0.55), (memb, 0.65)):
        m.use_nodes = True
        bsdf = m.node_tree.nodes.get('Principled BSDF')
        if bsdf is not None:
            bsdf.inputs['Roughness'].default_value = rough
            bsdf.inputs['Base Color'].default_value = (1, 1, 1, 1)
    return skin, memb


def triangles(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def select_only(obs, active):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in obs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active


def make_lod1(lod0, arm, attach, name):
    """近景を複製して間引いた遠景（約2万三角形）。左右対称のまま間引く。"""
    lod1 = lod0.copy()
    lod1.data = lod0.data.copy()
    lod1.name = name
    lod1.data.name = name
    bpy.context.scene.collection.objects.link(lod1)
    for m in list(lod1.modifiers):
        lod1.modifiers.remove(m)
    dec = lod1.modifiers.new('Decimate', 'DECIMATE')
    dec.ratio = min(1.0, LOD1_TRIANGLES / max(1, triangles(lod0)))
    dec.use_symmetry = True
    dec.symmetry_axis = 'X'
    select_only([lod1], lod1)
    bpy.ops.object.modifier_apply(modifier='Decimate')
    attach(lod1, arm)
    return lod1


def export_glb(path, arm, meshes, animations):
    """GLB の書き出し（紅竜の r00c と同じ設定）。頂点の色は線形の COLOR_0、下線で始まる属性はそのまま出る。"""
    out = os.path.abspath(path)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    select_only([arm] + list(meshes), arm)
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format='GLB',
        export_yup=True,
        export_apply=False,
        export_texcoords=False,
        export_normals=True,
        export_tangents=False,
        export_attributes=True,
        export_vertex_color='ACTIVE',
        export_all_vertex_colors=False,
        export_materials='EXPORT',
        export_skins=True,
        export_influence_nb=4,
        export_morph=False,
        export_animations=animations,
        export_animation_mode='ACTIONS',
        export_force_sampling=True,
        export_frame_step=1,
        export_optimize_animation_size=True,
        export_anim_slide_to_zero=False,
        export_reset_pose_bones=True,
        export_rest_position_armature=True,
        export_extras=True,
        export_cameras=False,
        export_lights=False,
        use_selection=False,
    )
    return os.path.getsize(out)


def _camera():
    scene = bpy.context.scene
    cam = scene.camera
    if cam is None:
        cam = bpy.data.objects.new('preview', bpy.data.cameras.new('preview'))
        scene.collection.objects.link(cam)
        scene.camera = cam
    return cam


def _aim(cam, pos, target, fov):
    cam.location = pos
    cam.rotation_mode = 'QUATERNION'
    cam.rotation_quaternion = (Vector(target) - Vector(pos)).to_track_quat('-Z', 'Y')
    cam.data.angle = math.radians(fov)
    cam.data.clip_end = 1000


def _workbench(width, height, cavity):
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'VERTEX'
    scene.display.shading.show_cavity = cavity
    scene.render.resolution_x = width
    scene.render.resolution_y = height


def preview(outdir, views):
    """形の確認用：Workbench で数方向から撮る。views は {名前: (カメラの位置, 注視点, 画角)}（Blender の座標）。"""
    os.makedirs(outdir, exist_ok=True)
    _workbench(1280, 800, True)
    cam = _camera()
    scene = bpy.context.scene
    for name, (pos, target, fov) in views.items():
        _aim(cam, pos, target, fov)
        scene.render.filepath = os.path.join(outdir, name + '.png')
        bpy.ops.render.render(write_still=True)


def preview_clips(outdir, arm, view, times=3):
    """動きの確認用：クリップごとに times 個の時刻で、決まった向きから撮る。"""
    os.makedirs(outdir, exist_ok=True)
    _workbench(640, 400, False)
    cam = _camera()
    _aim(cam, *view)
    scene = bpy.context.scene
    for act in bpy.data.actions:
        arm.animation_data.action = act
        end = int(act.frame_range[1])
        for k in range(times):
            scene.frame_set((k * end) // times)
            scene.render.filepath = os.path.join(outdir, '%s_%d.png' % (act.name, k))
            bpy.ops.render.render(write_still=True)
    arm.animation_data.action = None
    scene.frame_set(0)
