# OWNER: dragon
"""怪獣ごとの設計図。1体1ファイルで、骨格の図・部品・色・クリップを持ち、共通の処理は dragonlib を使う。

どの設計図も同じ口を持つ：ID・PREFIX・META_KEY・build(args)・author_clips(arm)・metadata(clips)・PREVIEW・CLIP_VIEW。
tools/blender/build_creature.py が --creature の名前でこの中の設計図を読む。
"""
NAMES = ('kurenai', 'raiyoku', 'homuratsuno')
