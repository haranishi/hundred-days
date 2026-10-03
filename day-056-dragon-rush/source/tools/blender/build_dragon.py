# OWNER: dragon
"""紅竜の GLB を作る（npm run build:dragon が呼ぶ）。中身は build_creature.py の --creature kurenai と同じ。

  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
      --python tools/blender/build_dragon.py -- --out public/assets/dragon.glb

引数（--out・--report・--preview・--no-anim・--seed）は build_creature.py と同じ。設計図は tools/blender/creatures/kurenai.py。
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# dragonlib の .pyc（__pycache__）をリポジトリの中に残さない
sys.dont_write_bytecode = True

import build_creature  # noqa: E402

build_creature.main(default_creature='kurenai')
