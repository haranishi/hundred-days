// 落とす素材の一覧。id はアプリ内の呼び名、ph は Poly Haven の素材名。
// tex は質感画像の一辺（px）、maxTris は三角形の上限（超えたら間引く）。
// 大きく近づいて見る家具ほど画像を大きく、小物ほど小さくして、読み込みとGPUの記憶域を抑える。
const big = { tex: 1024, maxTris: 14000 };
const mid = { tex: 512, maxTris: 9000 };
const small = { tex: 512, maxTris: 6000 };
const tiny = { tex: 256, maxTris: 5000 };

export const MODEL_SOURCES = [
  // 動かない家具
  { id: 'sofa', ph: 'Sofa_01', ...big },
  { id: 'coffee-table', ph: 'modern_coffee_table_01', ...mid },
  { id: 'tv-cabinet', ph: 'modern_wooden_cabinet', ...big, error: 0.005 },
  { id: 'cube-shelf', ph: 'wooden_display_shelves_01', ...mid },
  { id: 'side-table', ph: 'side_table_01', ...small },
  { id: 'dining-table', ph: 'dining_table', ...big },
  { id: 'dining-chair', ph: 'dining_chair_02', ...mid },
  { id: 'stove', ph: 'electric_stove', ...mid },
  { id: 'kitchen-cabinet', ph: 'painted_wooden_cabinet', ...mid },
  { id: 'kitchen-rack', ph: 'drawer_cabinet', ...mid },
  { id: 'bed', ph: 'GothicBed_01', ...big },
  { id: 'nightstand', ph: 'ClassicNightstand_01', ...small },
  { id: 'dresser', ph: 'WoodenTable_03', ...mid },
  { id: 'desk', ph: 'SchoolDesk_01', ...small },
  { id: 'bookshelf', ph: 'wooden_bookshelf_worn', ...mid },
  { id: 'bench', ph: 'painted_wooden_bench', ...small },
  { id: 'chandelier', ph: 'Chandelier_01', ...small, maxTris: 8000 },
  { id: 'ceiling-lamp', ph: 'modern_ceiling_lamp_01', ...tiny },
  // 消えるかもしれない物（大）
  { id: 'armchair', ph: 'ArmChair_01', ...mid },
  { id: 'rocking-chair', ph: 'Rockingchair_01', ...mid },
  { id: 'tall-plant', ph: 'potted_plant_01', ...mid, maxTris: 16000, error: 0.02, lockBorder: false },
  { id: 'leafy-plant', ph: 'potted_plant_02', ...mid, maxTris: 12000, error: 0.02, lockBorder: false },
  { id: 'grandfather-clock', ph: 'vintage_grandfather_clock_01', ...mid },
  { id: 'tv', ph: 'television_02', ...small },
  { id: 'desk-lamp', ph: 'desk_lamp_arm_01', ...small },
  { id: 'school-chair', ph: 'SchoolChair_01', ...small },
  { id: 'suitcase', ph: 'vintage_suitcase', ...small },
  { id: 'oil-painting', ph: 'fancy_picture_frame_01', ...small },
  { id: 'wall-clock', ph: 'wall_clock', ...small },
  { id: 'microwave', ph: 'vintage_microwave', ...small },
  { id: 'pillows', ph: 'throw_pillows_01', ...small },
  { id: 'boombox', ph: 'boombox', ...small },
  { id: 'painting', ph: 'hanging_picture_frame_02', ...small },
  // 消えるかもしれない物（中）
  { id: 'kettle', ph: 'vintage_electric_kettle', ...small },
  { id: 'tea-set', ph: 'tea_set_01', ...small, maxTris: 9000, error: 0.01 },
  { id: 'blue-vase', ph: 'antique_ceramic_vase_01', ...small },
  { id: 'laptop', ph: 'classic_laptop', ...small },
  { id: 'wine-bottles', ph: 'wine_bottles_01', ...small, error: 0.01 },
  { id: 'mantel-clock', ph: 'mantel_clock_01', ...small },
  { id: 'oil-lamp', ph: 'vintage_oil_lamp', ...small },
  { id: 'chess', ph: 'chess_set', ...small, maxTris: 9000, error: 0.01, lockBorder: false },
  { id: 'cat-statue', ph: 'concrete_cat_statue', ...small },
  { id: 'lantern', ph: 'wooden_lantern_01', ...small },
  { id: 'watering-can', ph: 'watering_can_metal_01', ...small },
  { id: 'cake', ph: 'strawberry_chocolate_cake', ...small, error: 0.01, lockBorder: false },
  { id: 'ukulele', ph: 'Ukulele_01', ...small },
  { id: 'basket', ph: 'wicker_basket_01', ...small, error: 0.01, lockBorder: false },
  // 消えるかもしれない物（小）
  { id: 'alarm-clock', ph: 'alarm_clock_01', ...tiny },
  { id: 'duck', ph: 'rubber_duck_toy', ...tiny },
  { id: 'camera', ph: 'Camera_01', ...tiny, error: 0.01, lockBorder: false },
  { id: 'cassette', ph: 'cassette_player', ...tiny },
  { id: 'binoculars', ph: 'vintage_binocular', ...tiny, error: 0.01, lockBorder: false },
  { id: 'apple', ph: 'food_apple_01', ...tiny },
  { id: 'lemon', ph: 'lemon', ...tiny },
  { id: 'horse', ph: 'horse_statue_01', ...tiny },
  { id: 'elephant', ph: 'carved_wooden_elephant', ...tiny },
  { id: 'jug', ph: 'jug_01', ...tiny },
  { id: 'photo-frame', ph: 'standing_picture_frame_01', ...tiny },
  { id: 'succulent', ph: 'potted_plant_04', ...tiny },
  { id: 'bananas', ph: 'bananas', ...tiny },
  { id: 'enamel-pot', ph: 'pot_enamel_01', ...tiny },
  { id: 'game-console', ph: 'gaming_console', ...tiny, error: 0.01, lockBorder: false }
];

// 床・壁・敷物。diff＝色、nor＝凹凸、arm＝陰り・粗さ・金属感
export const TEXTURE_SOURCES = [
  { id: 'parquet', auxSize: 512, ph: 'herringbone_parquet', size: 1024, maps: ['diff', 'nor', 'arm'] },
  { id: 'oak-floor', auxSize: 512, ph: 'laminate_floor_02', size: 1024, maps: ['diff', 'nor', 'arm'] },
  { id: 'checker-tile', auxSize: 512, ph: 'floor_tiles_06', size: 1024, maps: ['diff', 'nor', 'arm'] },
  { id: 'stone-tile', ph: 'floor_tiles_08', size: 512, maps: ['diff', 'nor', 'arm'] },
  { id: 'plaster', ph: 'beige_wall_001', size: 512, maps: ['nor'] },
  { id: 'rug', ph: 'fabric_pattern_05', size: 512, maps: ['diff', 'nor'], diffKey: 'col_01' }
];

// 窓の外の景色。実写のパノラマ（HDRI）を、色調を整えた JPG 版から縮小して使う（家の中の光には使わない）
export const BACKDROP_SOURCES = [
  { id: 'garden', ph: 'charolettenbrunn_park', width: 2048 }
];
