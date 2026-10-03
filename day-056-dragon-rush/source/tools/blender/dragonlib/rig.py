# OWNER: dragon
"""骨組み（アーマチュア）と重み、姿勢の計算（FK・2本の骨の IK）。

姿勢は「骨ごとの回転 D を、休みの姿勢のときの軸（アーマチュアの軸）で書く」約束にする。
D は骨の付け根を中心に回り、親の動きに乗る。だから首を曲げる・尾を振る・翼を畳むを、骨のロールを気にせず書ける。
Blender のポーズへは rotation_quaternion = R_rest⁻¹ · D · R_rest で直す（R_rest は骨の休みの向き）。
"""
import bpy
from mathutils import Quaternion, Vector

from .anatomy import G, bone_table

IDENTITY = Quaternion((1.0, 0.0, 0.0, 0.0))


def build_armature(name='dragon_rig', bones=None):
    """骨の一覧（名前・頭・尾・親。既定は紅竜の anatomy.bone_table()）から骨組みを作る。"""
    data = bpy.data.armatures.new(name)
    arm = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    arm.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = data.edit_bones
    for bname, head, tail, parent in (bone_table() if bones is None else bones):
        b = eb.new(bname)
        b.head = G(*head)
        b.tail = G(*tail)
        d = (b.tail - b.head).normalized()
        ref = Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((0, -1, 0))
        b.align_roll(ref)
        if parent is not None:
            b.parent = eb[parent]
            b.use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    return arm


class Rig:
    """休みの姿勢の骨の情報と、D から姿勢を組む FK。座標は Blender（アーマチュアの空間）。"""

    def __init__(self, arm):
        self.arm = arm
        self.head = {}
        self.tail = {}
        self.parent = {}
        self.rest = {}
        self.order = []
        for b in arm.data.bones:
            self.head[b.name] = b.head_local.copy()
            self.tail[b.name] = b.tail_local.copy()
            self.parent[b.name] = b.parent.name if b.parent else None
            self.rest[b.name] = b.matrix_local.to_quaternion()
        # 親から子の順
        done = set()
        names = [b.name for b in arm.data.bones]
        while len(self.order) < len(names):
            for n in names:
                if n in done:
                    continue
                p = self.parent[n]
                if p is None or p in done:
                    self.order.append(n)
                    done.add(n)

    def rest_dir(self, name):
        return (self.tail[name] - self.head[name]).normalized()

    def length(self, name):
        return (self.tail[name] - self.head[name]).length

    def fk(self, D, root_offset=Vector((0, 0, 0))):
        """D（骨名 → 回転）から、骨ごとの変形 (Q, T)（休みの点 p → Q·p + T）を作る。"""
        W = {}
        for n in self.order:
            h = self.head[n]
            d = D.get(n, IDENTITY)
            p = self.parent[n]
            if p is None:
                W[n] = (d.copy(), h - d @ h + root_offset)
            else:
                qp, tp = W[p]
                W[n] = (qp @ d, qp @ (h - d @ h) + tp)
        return W

    @staticmethod
    def apply(W, name, point):
        q, t = W[name]
        return q @ point + t

    def to_pose(self, D, root_offset):
        """D をポーズの骨に書く（キーフレームを打つ前）。"""
        for pb in self.arm.pose.bones:
            r = self.rest[pb.name]
            d = D.get(pb.name, IDENTITY)
            pb.rotation_quaternion = r.inverted() @ d @ r
            pb.location = Vector((0, 0, 0))
        body = self.arm.pose.bones['body']
        body.location = self.rest['body'].inverted() @ root_offset


def aim(rig, W_parent_q, name, direction):
    """骨 name の向きを direction（アーマチュアの空間）に向ける D。ねじれは親から受け継ぐ（最小の振り）。"""
    r0 = rig.rest_dir(name)
    cur = W_parent_q @ r0
    q_cum = cur.rotation_difference(direction.normalized()) @ W_parent_q
    return W_parent_q.inverted() @ q_cum, q_cum


def two_bone(a, l1, l2, target, pole):
    """付け根 a から長さ l1・l2 の2本で target へ届く中の関節の位置と、届いた先。pole は曲がる向き。"""
    d = target - a
    dist = d.length
    lo = abs(l1 - l2) + 1e-3
    hi = l1 + l2 - 1e-3
    dist_c = max(lo, min(hi, dist))
    u = d.normalized() if dist > 1e-6 else Vector((0, 0, -1))
    cos_a = (l1 * l1 + dist_c * dist_c - l2 * l2) / (2 * l1 * dist_c)
    cos_a = max(-1.0, min(1.0, cos_a))
    sin_a = (1 - cos_a * cos_a) ** 0.5
    v = pole - u * pole.dot(u)
    if v.length < 1e-6:
        # 曲がる向きが脚の線と平行なときは、脚に垂直な適当な向きを使う
        ref = Vector((0, -1, 0)) if abs(u.y) < 0.9 else Vector((1, 0, 0))
        v = ref - u * ref.dot(u)
    v.normalize()
    mid = a + u * (l1 * cos_a) + v * (l1 * sin_a)
    end = a + u * dist_c
    return mid, end


def solve_leg(rig, D, W, chain, toe, ball_target, meta_dir, toe_dir):
    """脚の IK：付け根の関節から、足の甲（ball）を ball_target に置く。chain は [上の骨, 下の骨, 甲の骨]。

    甲の骨の向き meta_dir と指の向き toe_dir は与える（かかとの持ち上げ・指の丸めは呼ぶ側で決める）。D を書き換える。
    """
    upper, lower, meta = chain
    parent = rig.parent[upper]
    qp = W[parent][0]
    root = rig.apply(W, parent, rig.head[upper])
    l1, l2, l3 = rig.length(upper), rig.length(lower), rig.length(meta)
    ankle_target = ball_target - meta_dir.normalized() * l3
    # 曲がる向き：休みの姿勢で、付け根と足首を結ぶ線から中の関節がずれている向き（親の回転に乗せる）
    h0, m0, a0 = rig.head[upper], rig.head[lower], rig.head[meta]
    line = (a0 - h0).normalized()
    pole0 = (m0 - h0) - line * (m0 - h0).dot(line)
    mid, ankle = two_bone(root, l1, l2, ankle_target, qp @ pole0)
    D[upper], q1 = aim(rig, qp, upper, mid - root)
    D[lower], q2 = aim(rig, q1, lower, ankle - mid)
    D[meta], q3 = aim(rig, q2, meta, ball_target - ankle)
    D[toe], _ = aim(rig, q3, toe, toe_dir)
    return D


def weight_body(body, arm, exclude=('jaw',)):
    """胴（Skin の肉付け）に自動の重み（熱の拡散）を付ける。顎などは外して、首の下が口と一緒に動かないようにする。"""
    saved = {}
    for n in exclude:
        b = arm.data.bones[n]
        saved[n] = b.use_deform
        b.use_deform = False
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    body.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    for n, v in saved.items():
        arm.data.bones[n].use_deform = v


def attach(ob, arm):
    """頂点グループの重みを持つ部品を、アーマチュアに付ける（Armature モディファイア＋親子）。"""
    ob.parent = arm
    ob.matrix_parent_inverse.identity()
    mod = ob.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    return mod
