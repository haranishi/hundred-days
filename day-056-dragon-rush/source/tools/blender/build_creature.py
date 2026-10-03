# OWNER: dragon
"""操作できる怪獣を、設計図（tools/blender/creatures/）から Blender のスクリプトで作り、GLB に書き出す（第三者の素材は使わない）。

  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
      --python tools/blender/build_creature.py -- --creature raiyoku

  --creature NAME  kurenai（紅竜）・raiyoku（雷翼）・homuratsuno（焔角）
  --out PATH       GLB の書き出し先（既定は設計図の OUT。紅竜は public/assets/dragon.glb）
  --report PATH    組み立ての要約（三角形の数・骨の数・クリップ・歩幅・大きさ）を書く JSON
  --preview DIR    できた形を Workbench で数方向から撮る（形の確認用）
  --no-anim        動きのクリップを作らない（形だけ早く確かめる）
  --seed N         まだら・部品の揺らぎの種（既定は設計図の SEED）。同じ引数なら同じ GLB になる

3体まとめて作り直すのは npm run build:creatures（tools/blender/build_creatures.mjs）。紅竜だけなら npm run build:dragon。
"""
import argparse
import importlib
import json
import os
import sys
import time

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# dragonlib・creatures の .pyc（__pycache__）をリポジトリの中に残さない
sys.dont_write_bytecode = True

from creatures import NAMES  # noqa: E402
from dragonlib import assemble, rig  # noqa: E402


def parse_args(default_creature=None):
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--creature', choices=NAMES, default=default_creature, required=default_creature is None)
    ap.add_argument('--out', default=None)
    ap.add_argument('--preview', default=None)
    ap.add_argument('--no-anim', action='store_true')
    ap.add_argument('--seed', type=int, default=None)
    ap.add_argument('--report', default=None, help='組み立ての要約（三角形の数・クリップ・歩幅）を書く JSON')
    return ap.parse_args(argv)


def main(default_creature=None):
    args = parse_args(default_creature)
    bp = importlib.import_module('creatures.' + args.creature)
    if args.seed is None:
        args.seed = bp.SEED
    built = bp.build(args)
    arm, lod0 = built['arm'], built['lod0']
    lod1 = assemble.make_lod1(lod0, arm, rig.attach, bp.PREFIX + '_lod1')
    report = {
        'blender': bpy.app.version_string,
        'seed': args.seed,
        'triangles': {'lod0': assemble.triangles(lod0), 'lod1': assemble.triangles(lod1)},
        'vertices': {'lod0': len(lod0.data.vertices), 'lod1': len(lod1.data.vertices)},
        'bones': len(arm.data.bones),
        'timings': built['timings'],
    }
    report.update(built['report'])
    if not args.no_anim:
        t2 = time.time()
        report['clips'] = bp.author_clips(arm)
        report['timings']['clips'] = round(time.time() - t2, 1)
        arm[bp.META_KEY] = json.dumps(bp.metadata(report['clips']), sort_keys=True)
    if args.preview:
        lod1.hide_render = True
        assemble.preview(args.preview, bp.PREVIEW)
        if not args.no_anim:
            assemble.preview_clips(os.path.join(args.preview, 'clips'), arm, bp.CLIP_VIEW)
        lod1.hide_render = False
    report['bytes'] = assemble.export_glb(args.out or bp.OUT, arm, [lod0, lod1], not args.no_anim)
    print('CREATURE_REPORT %s %s' % (args.creature, json.dumps(report, sort_keys=True)))
    if args.report:
        # かかった時間は毎回変わるので、ファイルには書かない（同じ引数なら報告のファイルも同じになる）
        with open(args.report, 'w') as fh:
            json.dump({k: v for k, v in report.items() if k != 'timings'}, fh, indent=2, sort_keys=True)
            fh.write('\n')


if __name__ == '__main__':
    main()
