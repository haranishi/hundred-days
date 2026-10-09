/**
 * 全国主要駅マスターデータ (座標・代表路線・終電時刻目安)
 * オフライン・即時判定用
 */

export const STATIONS_DATABASE = [
  // --- 東京 山手線 ---
  { id: 'shinjuku', name: '新宿駅', lat: 35.6896, lng: 139.7006, line: '山手線 / 中央線', train: '23:55' },
  { id: 'shibuya', name: '渋谷駅', lat: 35.6580, lng: 139.7016, line: '山手線 / 東横線 / 田園都市線', train: '23:52' },
  { id: 'ikebukuro', name: '池袋駅', lat: 35.7295, lng: 139.7109, line: '山手線 / 東武東上線 / 西武池袋線', train: '23:50' },
  { id: 'tokyo', name: '東京駅', lat: 35.6812, lng: 139.7671, line: '山手線 / 中央線 / 東海道線', train: '23:58' },
  { id: 'shinagawa', name: '品川駅', lat: 35.6284, lng: 139.7387, line: '山手線 / 京浜東北線 / 京急本線', train: '23:54' },
  { id: 'shimbashi', name: '新橋駅', lat: 35.6663, lng: 139.7583, line: '山手線 / 銀座線 / 都営浅草線', train: '23:56' },
  { id: 'akihabara', name: '秋葉原駅', lat: 35.6983, lng: 139.7731, line: '山手線 / 総武線 / 日比谷線', train: '23:53' },
  { id: 'ueno', name: '上野駅', lat: 35.7141, lng: 139.7774, line: '山手線 / 宇都宮線 / 銀座線', train: '23:50' },
  { id: 'ebisu', name: '恵比寿駅', lat: 35.6467, lng: 139.7101, line: '山手線 / 日比谷線 / 埼京線', train: '23:51' },
  { id: 'meguro', name: '目黒駅', lat: 35.6339, lng: 139.7157, line: '山手線 / 目黒線 / 南北線', train: '23:50' },
  { id: 'gotanda', name: '五反田駅', lat: 35.6264, lng: 139.7234, line: '山手線 / 池上線 / 都営浅草線', train: '23:48' },
  { id: 'osaki', name: '大崎駅', lat: 35.6197, lng: 139.7285, line: '山手線 / 埼京線 / りんかい線', train: '23:55' },
  { id: 'hamamatsucho', name: '浜松町駅', lat: 35.6556, lng: 139.7571, line: '山手線 / 東京モノレール', train: '23:52' },
  { id: 'yurakucho', name: '有楽町駅', lat: 35.6750, lng: 139.7633, line: '山手線 / 有楽町線', train: '23:57' },
  { id: 'kanda', name: '神田駅', lat: 35.6917, lng: 139.7708, line: '山手線 / 中央線 / 銀座線', train: '23:55' },
  { id: 'takadanobaba', name: '高田馬場駅', lat: 35.7122, lng: 139.7037, line: '山手線 / 西武新宿線 / 東西線', train: '23:52' },
  { id: 'harajuku', name: '原宿駅', lat: 35.6702, lng: 139.7027, line: '山手線 / 千代田線(明治神宮前)', train: '23:49' },
  { id: 'yoyogi', name: '代々木駅', lat: 35.6830, lng: 139.7020, line: '山手線 / 総武線 / 都営大江戸線', train: '23:53' },
  { id: 'tamachi', name: '田町駅', lat: 35.6457, lng: 139.7475, line: '山手線 / 京浜東北線', train: '23:52' },
  { id: 'takanawa_gw', name: '高輪ゲートウェイ駅', lat: 35.6355, lng: 139.7407, line: '山手線 / 京浜東北線', train: '23:51' },
  { id: 'otsuka', name: '大塚駅', lat: 35.7314, lng: 139.7281, line: '山手線 / 都電荒川線', train: '23:48' },
  { id: 'sugamo', name: '巣鴨駅', lat: 35.7334, lng: 139.7393, line: '山手線 / 都営三田線', train: '23:49' },
  { id: 'komagome', name: '駒込駅', lat: 35.7365, lng: 139.7469, line: '山手線 / 南北線', train: '23:48' },
  { id: 'tabata', name: '田端駅', lat: 35.7381, lng: 139.7608, line: '山手線 / 京浜東北線', train: '23:49' },
  { id: 'nippori', name: '日暮里駅', lat: 35.7277, lng: 139.7712, line: '山手線 / 常磐線 / 京成本線', train: '23:51' },
  { id: 'nishi_nippori', name: '西日暮里駅', lat: 35.7321, lng: 139.7668, line: '山手線 / 千代田線', train: '23:50' },

  // --- 都内 主要エリア ---
  { id: 'roppongi', name: '六本木駅', lat: 35.6628, lng: 139.7314, line: '日比谷線 / 都営大江戸線', train: '23:50' },
  { id: 'ginza', name: '銀座駅', lat: 35.6719, lng: 139.7639, line: '銀座線 / 丸ノ内線 / 日比谷線', train: '23:55' },
  { id: 'omotesando', name: '表参道駅', lat: 35.6652, lng: 139.7123, line: '銀座線 / 千代田線 / 半蔵門線', train: '23:53' },
  { id: 'akasaka_mitsuke', name: '赤坂見附駅', lat: 35.6766, lng: 139.7369, line: '銀座線 / 丸ノ内線', train: '23:54' },
  { id: 'otemachi', name: '大手町駅', lat: 35.6848, lng: 139.7661, line: '丸ノ内線 / 東西線 / 千代田線 / 半蔵門線', train: '23:56' },
  { id: 'iidabashi', name: '飯田橋駅', lat: 35.7020, lng: 139.7450, line: '総武線 / 東西線 / 有楽町線 / 南北線', train: '23:52' },
  { id: 'kichijoji', name: '吉祥寺駅', lat: 35.7031, lng: 139.5798, line: '中央線 / 井の頭線', train: '23:55' },
  { id: 'shimokitazawa', name: '下北沢駅', lat: 35.6617, lng: 139.6670, line: '小田急線 / 井の頭線', train: '23:50' },
  { id: 'nakano', name: '中野駅', lat: 35.7058, lng: 139.6658, line: '中央線 / 東西線', train: '23:56' },
  { id: 'ogikubo', name: '荻窪駅', lat: 35.7044, lng: 139.6201, line: '中央線 / 丸ノ内線', train: '23:52' },
  { id: 'tachikawa', name: '立川駅', lat: 35.6979, lng: 139.4138, line: '中央線 / 南武線 / 青梅線', train: '23:55' },
  { id: 'machida', name: '町田駅', lat: 35.5429, lng: 139.4455, line: '横浜線 / 小田急線', train: '23:50' },
  { id: 'kitasenju', name: '北千住駅', lat: 35.7494, lng: 139.8051, line: '常磐線 / 千代田線 / 日比谷線 / 東武', train: '23:55' },
  { id: 'kinshicho', name: '錦糸町駅', lat: 35.6967, lng: 139.8145, line: '総武線 / 半蔵門線', train: '23:52' },
  { id: 'nakameguro', name: '中目黒駅', lat: 35.6442, lng: 139.6988, line: '東横線 / 日比谷線', train: '23:50' },
  { id: 'jiyugaoka', name: '自由が丘駅', lat: 35.6074, lng: 139.6687, line: '東横線 / 大井町線', train: '23:48' },
  { id: 'futakotamagawa', name: '二子玉川駅', lat: 35.6119, lng: 139.6268, line: '田園都市線 / 大井町線', train: '23:50' },

  // --- 神奈川 ---
  { id: 'yokohama', name: '横浜駅', lat: 35.4658, lng: 139.6227, line: '東海道線 / 京浜東北線 / 東急東横線', train: '23:45' },
  { id: 'kawasaki', name: '川崎駅', lat: 35.5313, lng: 139.6969, line: '東海道線 / 京浜東北線 / 南武線', train: '23:50' },
  { id: 'musashikosugi', name: '武蔵小杉駅', lat: 35.5765, lng: 139.6598, line: '南武線 / 横須賀線 / 東横線', train: '23:52' },
  { id: 'shinyokohama', name: '新横浜駅', lat: 35.5074, lng: 139.6176, line: '横浜線 / ブルーライン / 新横浜線', train: '23:45' },
  { id: 'fujisawa', name: '藤沢駅', lat: 35.3388, lng: 139.4878, line: '東海道線 / 小田急線 / 江ノ電', train: '23:40' },
  { id: 'kamakura', name: '鎌倉駅', lat: 35.3190, lng: 139.5504, line: '横須賀線 / 江ノ電', train: '23:35' },

  // --- 埼玉 ---
  { id: 'omiya', name: '大宮駅', lat: 35.9063, lng: 139.6240, line: '京浜東北線 / 宇都宮線 / 高崎線 / 埼京線', train: '23:55' },
  { id: 'urawa', name: '浦和駅', lat: 35.8590, lng: 139.6571, line: '京浜東北線 / 宇都宮線 / 湘南新宿ライン', train: '23:52' },
  { id: 'kawaguchi', name: '川口駅', lat: 35.8016, lng: 139.7180, line: '京浜東北線', train: '23:50' },
  { id: 'kawagoe', name: '川越駅', lat: 35.9069, lng: 139.4855, line: '川越線 / 東武東上線', train: '23:45' },
  { id: 'tokorozawa', name: '所沢駅', lat: 35.7869, lng: 139.4728, line: '西武池袋線 / 西武新宿線', train: '23:48' },

  // --- 千葉 ---
  { id: 'chiba', name: '千葉駅', lat: 35.6133, lng: 140.1132, line: '総武本線 / 外房線 / 内房線', train: '23:50' },
  { id: 'funabashi', name: '船橋駅', lat: 35.7006, lng: 139.9856, line: '総武線 / 東武アーバンパークライン', train: '23:55' },
  { id: 'kashiwa', name: '柏駅', lat: 35.8622, lng: 139.9710, line: '常磐線 / 東武アーバンパークライン', train: '23:50' },
  { id: 'nishifunabashi', name: '西船橋駅', lat: 35.7074, lng: 139.9593, line: '総武線 / 武蔵野線 / 京葉線 / 東西線', train: '23:55' },

  // --- 関西 (大阪・京都・兵庫) ---
  { id: 'osaka_umeda', name: '大阪・梅田駅', lat: 34.7024, lng: 135.4959, line: 'JR環状線 / 御堂筋線 / 阪急 / 阪神', train: '23:50' },
  { id: 'namba', name: 'なんば駅', lat: 34.6669, lng: 135.5015, line: '御堂筋線 / 南海本線 / 近鉄', train: '23:48' },
  { id: 'tennoji', name: '天王寺駅', lat: 34.6469, lng: 135.5133, line: 'JR環状線 / 阪和線 / 御堂筋線', train: '23:45' },
  { id: 'kyobashi', name: '京橋駅', lat: 34.6969, lng: 135.5336, line: 'JR環状線 / 京阪本線 / 長堀鶴見緑地線', train: '23:48' },
  { id: 'shin_osaka', name: '新大阪駅', lat: 34.7335, lng: 135.5002, line: '東海道線 / 御堂筋線', train: '23:52' },
  { id: 'kyoto', name: '京都駅', lat: 34.9858, lng: 135.7588, line: 'JR京都線 / 琵琶湖線 / 烏丸線 / 近鉄', train: '23:45' },
  { id: 'shijo_karasuma', name: '四条烏丸駅', lat: 35.0037, lng: 135.7594, line: '烏丸線 / 阪急京都線', train: '23:48' },
  { id: 'sannomiya', name: '三ノ宮駅', lat: 34.6938, lng: 135.1955, line: 'JR神戸線 / 阪急 / 阪神 / ポートライナー', train: '23:45' },

  // --- 中部 (愛知・静岡) ---
  { id: 'nagoya', name: '名古屋駅', lat: 35.1709, lng: 136.8815, line: '東海道線 / 中央線 / 地下鉄東山線 / 名鉄', train: '23:52' },
  { id: 'sakae', name: '栄駅', lat: 35.1697, lng: 136.9080, line: '東山線 / 名城線', train: '23:50' },
  { id: 'kanayama', name: '金山駅', lat: 35.1430, lng: 136.9012, line: '東海道線 / 中央線 / 名鉄 / 名城線', train: '23:48' },
  { id: 'shizuoka', name: '静岡駅', lat: 34.9717, lng: 138.3890, line: '東海道本線', train: '23:40' },
  { id: 'hamamatsu', name: '浜松駅', lat: 34.7037, lng: 137.7348, line: '東海道本線', train: '23:40' },

  // --- 九州 ---
  { id: 'hakata', name: '博多駅', lat: 33.5902, lng: 130.4207, line: '空港線 / 鹿児島本線 / 篠栗線', train: '23:50' },
  { id: 'tenjin', name: '天神駅', lat: 33.5916, lng: 130.3989, line: '空港線 / 西鉄天神大牟田線', train: '23:48' },
  { id: 'kokura', name: '小倉駅', lat: 33.8867, lng: 130.8828, line: '鹿児島本線 / 日豊本線 / モノレール', train: '23:45' },
  { id: 'kumamoto', name: '熊本駅', lat: 32.7898, lng: 130.6888, line: '鹿児島本線 / 豊肥本線', train: '23:40' },

  // --- 東北・北海道・中国四国 ---
  { id: 'akita', name: '秋田駅', lat: 39.7171, lng: 140.1293, line: '奥羽本線 / 羽越本線', train: '23:18' },
  { id: 'sendai', name: '仙台駅', lat: 38.2601, lng: 140.8824, line: '東北本線 / 仙石線 / 地下鉄東西線・南北線', train: '23:45' },
  { id: 'sapporo', name: '札幌駅', lat: 43.0687, lng: 141.3508, line: '函館本線 / 千歳線 / 南北線 / 東豊線', train: '23:50' },
  { id: 'hiroshima', name: '広島駅', lat: 34.3977, lng: 132.4753, line: '山陽本線 / 呉線 / 可部線 / 広電', train: '23:45' },
  { id: 'okayama', name: '岡山駅', lat: 34.6663, lng: 133.9186, line: '山陽本線 / 瀬戸大橋線 / 伯備線', train: '23:45' }
];
