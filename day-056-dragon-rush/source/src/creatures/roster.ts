// OWNER: creatures
// 操作できる怪獣の一覧（docs/CHARACTERS.md）：紅竜・雷翼・焔角。見た目の読み方（GLB の置き場所・中の名前・材質・標本の見せ方）を1つにまとめる。
// r03-roster：数値は src/config/creatures/ へ移した（r02-roster ではここに置いていた）。ここは見た目の側が使う形に並べ直すだけ。
import { CREATURE_CONFIG, CREATURE_IDS, isCreatureId, type CreatureId } from '../config/creatures';
import type { DragonMaterialOptions } from '../dragon/dragonMaterial';

export { CREATURE_IDS, isCreatureId, type CreatureId };

export interface CreatureSpec {
  id: CreatureId;
  name: string;
  /** public/ からの道のり */
  url: string;
  /** GLB の中のアーマチュア・近景と遠景の節の名前、目印とクリップの表を持つ extras の名前 */
  rig: string;
  lods: [string, string];
  metaKey: 'dragon' | 'creature';
  material: DragonMaterialOptions;
  /** 空中で見せるクリップ（標本は地面に置かず、空に浮かべる） */
  airClips: readonly string[];
  /** クリップの時刻を指定しないときに見せる時刻（秒）。その動きがいちばん読める瞬間 */
  showcase: Record<string, number>;
  /** 足もとの接地の影の大きさ（紅竜 = 1） */
  contactScale: number;
  /** 全長の目安（m、Blender の報告の dims.length）。横顔の構図の離し方に使う */
  length: number;
  /** 札の影絵の姿勢（?clip=card）：元のクリップ・時刻と、頭をカメラの側へ回す角度（度） */
  card: { clip: string; t: number; turnDeg: number };
}

function specOf(id: CreatureId): CreatureSpec {
  const c = CREATURE_CONFIG[id];
  const v = c.view;
  return { id, name: c.name, url: v.url, rig: v.rig, lods: v.lods, metaKey: v.metaKey, material: v.material, airClips: v.airClips, showcase: v.showcase, contactScale: v.contactScale, length: v.length, card: v.card };
}

export const CREATURES: Record<CreatureId, CreatureSpec> = {
  kurenai: specOf('kurenai'),
  raiyoku: specOf('raiyoku'),
  homuratsuno: specOf('homuratsuno'),
};
