// 地質年代の日本語名。PBDB が返す区間名（英語）に対応させる。
// 紀（period）と世（epoch）だけを持つ。期（age）は数値で紀・世へ当てるので訳さない。
export const PERIOD_JA = {
  Quaternary: '第四紀', Neogene: '新第三紀', Paleogene: '古第三紀',
  Cretaceous: '白亜紀', Jurassic: 'ジュラ紀', Triassic: '三畳紀',
  Permian: 'ペルム紀', Carboniferous: '石炭紀', Devonian: 'デボン紀',
  Silurian: 'シルル紀', Ordovician: 'オルドビス紀', Cambrian: 'カンブリア紀',
  Ediacaran: 'エディアカラ紀', Cryogenian: '成氷紀', Tonian: 'トニア紀',
  Stenian: '狭帯紀', Ectasian: '延伸紀', Calymmian: '被覆紀',
  Statherian: '固結紀', Orosirian: '造山紀', Rhyacian: '層状紀', Siderian: '成鉄紀',
};
export const EPOCH_JA = {
  Terreneuvian: 'カンブリア紀 テレヌーブ世', 'Series 2': 'カンブリア紀 第2世',
  Miaolingian: 'カンブリア紀 ミャオリンギアン世', Furongian: 'カンブリア紀 フロンギアン世',
  'Early Ordovician': 'オルドビス紀 前期', 'Middle Ordovician': 'オルドビス紀 中期',
  'Late Ordovician': 'オルドビス紀 後期',
  Llandovery: 'シルル紀 ランドベリ世', Wenlock: 'シルル紀 ウェンロック世',
  Ludlow: 'シルル紀 ラドロー世', Pridoli: 'シルル紀 プリドリ世',
  'Early Devonian': 'デボン紀 前期', 'Middle Devonian': 'デボン紀 中期',
  'Late Devonian': 'デボン紀 後期',
  Mississippian: '石炭紀 前半（ミシシッピ亜紀）', Pennsylvanian: '石炭紀 後半（ペンシルベニア亜紀）',
  Cisuralian: 'ペルム紀 前期', Guadalupian: 'ペルム紀 中期', Lopingian: 'ペルム紀 後期',
  'Early Triassic': '三畳紀 前期', 'Middle Triassic': '三畳紀 中期', 'Late Triassic': '三畳紀 後期',
  'Early Jurassic': 'ジュラ紀 前期', 'Middle Jurassic': 'ジュラ紀 中期', 'Late Jurassic': 'ジュラ紀 後期',
  'Early Cretaceous': '白亜紀 前期', 'Late Cretaceous': '白亜紀 後期',
  Paleocene: '暁新世', Eocene: '始新世', Oligocene: '漸新世',
  Miocene: '中新世', Pliocene: '鮮新世', Pleistocene: '更新世', Holocene: '完新世',
};
