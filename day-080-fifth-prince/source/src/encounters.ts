import type { Battle } from './types';
export interface EnemyIntent {kind:'strike'|'heavy'|'heal'|'drain'|'barrage';name:string;description:string;multiplier:number}
const move=(kind:EnemyIntent['kind'],name:string,description:string,multiplier=1):EnemyIntent=>({kind,name,description,multiplier});
const PATTERNS:Record<Battle['enemy'],EnemyIntent[]>={
 bramble:[move('strike','いばらの爪','枝がしなり、爪が振り下ろされる。'),move('drain','絡みつく蔓','共鳴を1つ奪う。「守る」で蔓を防げる。',.7),move('heavy','根の大槌','地面が隆起する。大きな一撃に備えよう。',2.25)],
 flame:[move('strike','火花の剣','切っ先が赤く染まる。'),move('heavy','紅蓮の一閃','炎が刀身に集まる。守って受け流そう。',2.1),move('strike','残り火','剣の軌跡に火の粉が残る。',.8)],
 tide:[move('strike','水の槍','透き通る槍が宙に浮かぶ。'),move('heal','癒やしの潮','次は回復。「仲間の一手」で集中を崩せる。',0),move('strike','しぶきの刃','水の刃が左右から迫る。'),move('heavy','蒼海の奔流','大きな水の輪が崩れ落ちる。',2.2)],
 grove:[move('drain','眠れる根','共鳴を1つ奪う。「守る」で根を断てる。',.75),move('strike','枝葉の矢','木々が弓のようにしなる。'),move('heal','再生の芽','次は回復。「仲間の一手」で芽吹きを止めよう。',0),move('heavy','大樹の脈動','森全体が息を吸う。守りを固めよう。',2.3)],
 storm:[move('barrage','二連雷刃','素早い二連撃。合計ダメージは通常より大きい。',1.3),move('strike','閃光の踏み込み','足元に雷の線が走る。',.8),move('heavy','紫電一閃','雷が一点に集まる。強攻撃が来る。',2.35)],
 demon:[move('drain','孤絶の鎖','共鳴を2つ奪う。「守る」でつながりを守ろう。',.7),move('strike','宵闇の剣','影が刃の形をとる。'),move('heavy','黒き王の慟哭','強攻撃。五人の絆を盾に受け止めよう。',2.35),move('heal','闇への回帰','魔王が回復する。「仲間の一手」か共鳴で阻止。',0),move('barrage','影の双刃','二つの影が左右から迫る。',1.3),move('heavy','終わりの夜','すべての光を消す一撃。必ず備えよう。',2.4)]
};
export function intentFor(b:Battle):EnemyIntent {return PATTERNS[b.enemy][(b.turn-1)%PATTERNS[b.enemy].length];}
