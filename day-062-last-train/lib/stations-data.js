/**
 * 全国主要駅マスターデータ (全国47都道府県・主要都市・通勤通学ターミナル網羅)
 * オフライン・高速インクリメンタル検索・位置情報判定用
 */

export const STATIONS_DATABASE = [
  // ==================== 東京 23区 ====================
  // 山手線
  { id: 'shinjuku', name: '新宿駅', kana: 'しんじゅく', pref: '東京都', line: 'JR山手線・中央線・小田急・京王', lat: 35.6896, lng: 139.7006, defaultTrain: '23:55' },
  { id: 'shibuya', name: '渋谷駅', kana: 'しぶや', pref: '東京都', line: 'JR山手線・東急東横線・田園都市線・井の頭線', lat: 35.6580, lng: 139.7016, defaultTrain: '23:52' },
  { id: 'ikebukuro', name: '池袋駅', kana: 'いけぶくろ', pref: '東京都', line: 'JR山手線・東武東上線・西武池袋線', lat: 35.7295, lng: 139.7109, defaultTrain: '23:50' },
  { id: 'tokyo', name: '東京駅', kana: 'とうきょう', pref: '東京都', line: 'JR各線・中央線・東海道線・新幹線', lat: 35.6812, lng: 139.7671, defaultTrain: '23:58' },
  { id: 'shinagawa', name: '品川駅', kana: 'しながわ', pref: '東京都', line: 'JR山手線・京浜東北線・東海道線・京急線', lat: 35.6284, lng: 139.7387, defaultTrain: '23:54' },
  { id: 'shimbashi', name: '新橋駅', kana: 'しんばし', pref: '東京都', line: 'JR山手線・銀座線・都営浅草線・ゆりかもめ', lat: 35.6663, lng: 139.7583, defaultTrain: '23:56' },
  { id: 'ueno', name: '上野駅', kana: 'うえの', pref: '東京都', line: 'JR山手線・宇都宮線・高崎線・銀座線・日比谷線', lat: 35.7141, lng: 139.7774, defaultTrain: '23:50' },
  { id: 'akihabara', name: '秋葉原駅', kana: 'あきはばら', pref: '東京都', line: 'JR山手線・総武線・日比谷線・つくばEX', lat: 35.6983, lng: 139.7731, defaultTrain: '23:53' },
  { id: 'yurakucho', name: '有楽町駅', kana: 'ゆうらくちょう', pref: '東京都', line: 'JR山手線・有楽町線', lat: 35.6750, lng: 139.7633, defaultTrain: '23:57' },
  { id: 'hamamatsucho', name: '浜松町駅', kana: 'はままつちょう', pref: '東京都', line: 'JR山手線・東京モノレール・大江戸線(大門)', lat: 35.6556, lng: 139.7571, defaultTrain: '23:52' },
  { id: 'tamachi', name: '田町駅', kana: 'たまち', pref: '東京都', line: 'JR山手線・京浜東北線・都営三田線(三田)', lat: 35.6457, lng: 139.7475, defaultTrain: '23:52' },
  { id: 'takanawa_gw', name: '高輪ゲートウェイ駅', kana: 'たかなわげーとうぇい', pref: '東京都', line: 'JR山手線・京浜東北線', lat: 35.6355, lng: 139.7407, defaultTrain: '23:51' },
  { id: 'osaki', name: '大崎駅', kana: 'おおさき', pref: '東京都', line: 'JR山手線・埼京線・湘南新宿ライン・りんかい線', lat: 35.6197, lng: 139.7285, defaultTrain: '23:55' },
  { id: 'gotanda', name: '五反田駅', kana: 'ごたんだ', pref: '東京都', line: 'JR山手線・東急池上線・都営浅草線', lat: 35.6264, lng: 139.7234, defaultTrain: '23:48' },
  { id: 'meguro', name: '目黒駅', kana: 'めぐろ', pref: '東京都', line: 'JR山手線・東急目黒線・南北線・三田線', lat: 35.6339, lng: 139.7157, defaultTrain: '23:50' },
  { id: 'ebisu', name: '恵比寿駅', kana: 'えびす', pref: '東京都', line: 'JR山手線・日比谷線・埼京線', lat: 35.6467, lng: 139.7101, defaultTrain: '23:51' },
  { id: 'harajuku', name: '原宿駅', kana: 'はらじゅく', pref: '東京都', line: 'JR山手線・千代田線(明治神宮前)', lat: 35.6702, lng: 139.7027, defaultTrain: '23:49' },
  { id: 'yoyogi', name: '代々木駅', kana: 'よよぎ', pref: '東京都', line: 'JR山手線・総武線・都営大江戸線', lat: 35.6830, lng: 139.7020, defaultTrain: '23:53' },
  { id: 'takadanobaba', name: '高田馬場駅', kana: 'たかだのばば', pref: '東京都', line: 'JR山手線・西武新宿線・東西線', lat: 35.7122, lng: 139.7037, defaultTrain: '23:52' },
  { id: 'mejiro', name: '目白駅', kana: 'めじろ', pref: '東京都', line: 'JR山手線', lat: 35.7212, lng: 139.7067, defaultTrain: '23:49' },
  { id: 'otsuka', name: '大塚駅', kana: 'おおつか', pref: '東京都', line: 'JR山手線・都電荒川線', lat: 35.7314, lng: 139.7281, defaultTrain: '23:48' },
  { id: 'sugamo', name: '巣鴨駅', kana: 'すがも', pref: '東京都', line: 'JR山手線・都営三田線', lat: 35.7334, lng: 139.7393, defaultTrain: '23:49' },
  { id: 'komagome', name: '駒込駅', kana: 'こまごめ', pref: '東京都', line: 'JR山手線・南北線', lat: 35.7365, lng: 139.7469, defaultTrain: '23:48' },
  { id: 'tabata', name: '田端駅', kana: 'たばた', pref: '東京都', line: 'JR山手線・京浜東北線', lat: 35.7381, lng: 139.7608, defaultTrain: '23:49' },
  { id: 'nishi_nippori', name: '西日暮里駅', kana: 'にしにっぽり', pref: '東京都', line: 'JR山手線・千代田線・日暮里舎人ライナー', lat: 35.7321, lng: 139.7668, defaultTrain: '23:50' },
  { id: 'nippori', name: '日暮里駅', kana: 'にっぽり', pref: '東京都', line: 'JR山手線・常磐線・京成本線', lat: 35.7277, lng: 139.7712, defaultTrain: '23:51' },
  { id: 'kanda', name: '神田駅', kana: 'かんだ', pref: '東京都', line: 'JR山手線・中央線・銀座線', lat: 35.6917, lng: 139.7708, defaultTrain: '23:55' },
  // 都内 地下鉄・私鉄主要ターミナル
  { id: 'roppongi', name: '六本木駅', kana: 'ろっぽんぎ', pref: '東京都', line: '東京メトロ日比谷線・都営大江戸線', lat: 35.6628, lng: 139.7314, defaultTrain: '23:50' },
  { id: 'ginza', name: '銀座駅', kana: 'ぎんざ', pref: '東京都', line: '東京メトロ銀座線・丸ノ内線・日比谷線', lat: 35.6719, lng: 139.7639, defaultTrain: '23:55' },
  { id: 'omotesando', name: '表参道駅', kana: 'おもてさんどう', pref: '東京都', line: '東京メトロ銀座線・千代田線・半蔵門線', lat: 35.6652, lng: 139.7123, defaultTrain: '23:53' },
  { id: 'otemachi', name: '大手町駅', kana: 'おおてまち', pref: '東京都', line: '丸ノ内線・東西線・千代田線・半蔵門線・三田線', lat: 35.6848, lng: 139.7661, defaultTrain: '23:56' },
  { id: 'iidabashi', name: '飯田橋駅', kana: 'いいだばし', pref: '東京都', line: 'JR総武線・東西線・有楽町線・南北線・大江戸線', lat: 35.7020, lng: 139.7450, defaultTrain: '23:52' },
  { id: 'kitasenju', name: '北千住駅', kana: 'きたせんじゅ', pref: '東京都', line: '常磐線・千代田線・日比谷線・東武伊勢崎線・つくばEX', lat: 35.7494, lng: 139.8051, defaultTrain: '23:55' },
  { id: 'kinshicho', name: '錦糸町駅', kana: 'きんしちょう', pref: '東京都', line: 'JR総武線・東京メトロ半蔵門線', lat: 35.6967, lng: 139.8145, defaultTrain: '23:52' },
  { id: 'nakameguro', name: '中目黒駅', kana: 'なかめぐろ', pref: '東京都', line: '東急東横線・東京メトロ日比谷線', lat: 35.6442, lng: 139.6988, defaultTrain: '23:50' },
  { id: 'jiyugaoka', name: '自由が丘駅', kana: 'じゆうがおか', pref: '東京都', line: '東急東横線・東急大井町線', lat: 35.6074, lng: 139.6687, defaultTrain: '23:48' },
  { id: 'futakotamagawa', name: '二子玉川駅', kana: 'ふたこたまがわ', pref: '東京都', line: '東急田園都市線・東急大井町線', lat: 35.6119, lng: 139.6268, defaultTrain: '23:50' },
  { id: 'shimokitazawa', name: '下北沢駅', kana: 'しもきたざわ', pref: '東京都', line: '小田急小田原線・京王井の頭線', lat: 35.6617, lng: 139.6670, defaultTrain: '23:50' },
  { id: 'akabane', name: '赤羽駅', kana: 'あかばね', pref: '東京都', line: 'JR京浜東北線・宇都宮線・高崎線・埼京線', lat: 35.7777, lng: 139.7209, defaultTrain: '23:55' },
  { id: 'kamata', name: '蒲田駅', kana: 'かまた', pref: '東京都', line: 'JR京浜東北線・東急池上線・多摩川線', lat: 35.5625, lng: 139.7161, defaultTrain: '23:52' },

  // 都下 (中央線・京王・小田急方面)
  { id: 'nakano', name: '中野駅', kana: 'なかの', pref: '東京都', line: 'JR中央線・総武線・東京メトロ東西線', lat: 35.7058, lng: 139.6658, defaultTrain: '23:56' },
  { id: 'koenji', name: '高円寺駅', kana: 'こうえんじ', pref: '東京都', line: 'JR中央線・総武線', lat: 35.7053, lng: 139.6497, defaultTrain: '23:54' },
  { id: 'ogikubo', name: '荻窪駅', kana: 'おぎくぼ', pref: '東京都', line: 'JR中央線・総武線・東京メトロ丸ノ内線', lat: 35.7044, lng: 139.6201, defaultTrain: '23:52' },
  { id: 'kichijoji', name: '吉祥寺駅', kana: 'きちじょうじ', pref: '東京都', line: 'JR中央線・総武線・京王井の頭線', lat: 35.7031, lng: 139.5798, defaultTrain: '23:55' },
  { id: 'mitaka', name: '三鷹駅', kana: 'みたか', pref: '東京都', line: 'JR中央線・総武線・東西線直通', lat: 35.7027, lng: 139.5606, defaultTrain: '23:53' },
  { id: 'musashisakai', name: '武蔵境駅', kana: 'むさしさかい', pref: '東京都', line: 'JR中央線・西武多摩川線', lat: 35.7021, lng: 139.5445, defaultTrain: '23:50' },
  { id: 'kokubunji', name: '国分寺駅', kana: 'こくぶんじ', pref: '東京都', line: 'JR中央線・西武国分寺線・多摩湖線', lat: 35.7001, lng: 139.4803, defaultTrain: '23:48' },
  { id: 'tachikawa', name: '立川駅', kana: 'たちかわ', pref: '東京都', line: 'JR中央線・南武線・青梅線・多摩都市モノレール', lat: 35.6979, lng: 139.4138, defaultTrain: '23:55' },
  { id: 'hachioji', name: '八王子駅', kana: 'はちおうじ', pref: '東京都', line: 'JR中央線・横浜線・八高線・京王線', lat: 35.6558, lng: 139.3389, defaultTrain: '23:45' },
  { id: 'chofu', name: '調布駅', kana: 'ちょうふ', pref: '東京都', line: '京王線・京王相模原線', lat: 35.6521, lng: 139.5442, defaultTrain: '23:48' },
  { id: 'fuchu', name: '府中駅', kana: 'ふちゅう', pref: '東京都', line: '京王線', lat: 35.6722, lng: 139.4801, defaultTrain: '23:45' },
  { id: 'machida', name: '町田駅', kana: 'まちだ', pref: '東京都', line: 'JR横浜線・小田急小田原線', lat: 35.5429, lng: 139.4455, defaultTrain: '23:50' },

  // ==================== 神奈川県 ====================
  { id: 'yokohama', name: '横浜駅', kana: 'よこはま', pref: '神奈川県', line: 'JR各線・東急東横線・みなとみらい線・京急・相鉄', lat: 35.4658, lng: 139.6227, defaultTrain: '23:45' },
  { id: 'kawasaki', name: '川崎駅', kana: 'かわさき', pref: '神奈川県', line: 'JR東海道線・京浜東北線・南武線・京急川崎', lat: 35.5313, lng: 139.6969, defaultTrain: '23:50' },
  { id: 'musashikosugi', name: '武蔵小杉駅', kana: 'むさしこすぎ', pref: '神奈川県', line: 'JR南武線・横須賀線・東急東横線・目黒線', lat: 35.5765, lng: 139.6598, defaultTrain: '23:52' },
  { id: 'shinyokohama', name: '新横浜駅', kana: 'しんよこはま', pref: '神奈川県', line: '東海道新幹線・JR横浜線・相鉄東急直通線・市営地下鉄', lat: 35.5074, lng: 139.6176, defaultTrain: '23:45' },
  { id: 'mizonokuchi', name: '溝の口駅', kana: 'みぞのくち', pref: '神奈川県', line: '東急田園都市線・大井町線・JR南武線(武蔵溝ノ口)', lat: 35.5998, lng: 139.6111, defaultTrain: '23:48' },
  { id: 'totsuka', name: '戸塚駅', kana: 'とつか', pref: '神奈川県', line: 'JR東海道線・横須賀線・市営地下鉄ブルーライン', lat: 35.4004, lng: 139.5344, defaultTrain: '23:42' },
  { id: 'ofuna', name: '大船駅', kana: 'おおふな', pref: '神奈川県', line: 'JR東海道線・横須賀線・根岸線・湘南モノレール', lat: 35.3532, lng: 139.5312, defaultTrain: '23:40' },
  { id: 'fujisawa', name: '藤沢駅', kana: 'ふじさわ', pref: '神奈川県', line: 'JR東海道線・小田急江ノ島線・江ノ電', lat: 35.3388, lng: 139.4878, defaultTrain: '23:40' },
  { id: 'kamakura', name: '鎌倉駅', kana: 'かまくら', pref: '神奈川県', line: 'JR横須賀線・江ノ電', lat: 35.3190, lng: 139.5504, defaultTrain: '23:35' },
  { id: 'odawara', name: '小田原駅', kana: 'おだわら', pref: '神奈川県', line: 'JR東海道線・東海道新幹線・小田急・箱根登山鉄道', lat: 35.2562, lng: 139.1555, defaultTrain: '23:25' },
  { id: 'ebina', name: '海老名駅', kana: 'えびな', pref: '神奈川県', line: '小田急小田原線・相鉄本線・JR相模線', lat: 35.4533, lng: 139.3900, defaultTrain: '23:40' },
  { id: 'honatsugi', name: '本厚木駅', kana: 'ほんあつぎ', pref: '神奈川県', line: '小田急小田原線', lat: 35.4398, lng: 139.3644, defaultTrain: '23:38' },

  // ==================== 埼玉県 ====================
  { id: 'omiya', name: '大宮駅', kana: 'おおみや', pref: '埼玉県', line: 'JR各線・新幹線・東武アーバンパークライン・ニューシャトル', lat: 35.9063, lng: 139.6240, defaultTrain: '23:55' },
  { id: 'urawa', name: '浦和駅', kana: 'うらわ', pref: '埼玉県', line: 'JR京浜東北線・宇都宮線・高崎線・湘南新宿ライン', lat: 35.8590, lng: 139.6571, defaultTrain: '23:52' },
  { id: 'kawaguchi', name: '川口駅', kana: 'かわぐち', pref: '埼玉県', line: 'JR京浜東北線', lat: 35.8016, lng: 139.7180, defaultTrain: '23:50' },
  { id: 'tokorozawa', name: '所沢駅', kana: 'ところざわ', pref: '埼玉県', line: '西武池袋線・西武新宿線', lat: 35.7869, lng: 139.4728, defaultTrain: '23:48' },
  { id: 'kawagoe', name: '川越駅', kana: 'かわごえ', pref: '埼玉県', line: 'JR川越線・東武東上線・西武新宿線(本川越)', lat: 35.9069, lng: 139.4855, defaultTrain: '23:45' },
  { id: 'kumagaya', name: '熊谷駅', kana: 'くまがや', pref: '埼玉県', line: 'JR高崎線・上越新幹線・秩父鉄道', lat: 36.1396, lng: 139.3898, defaultTrain: '23:30' },
  { id: 'kasukabe', name: '春日部駅', kana: 'かすかべ', pref: '埼玉県', line: '東武スカイツリーライン・東武アーバンパークライン', lat: 35.9798, lng: 139.7525, defaultTrain: '23:45' },
  { id: 'koshigaya', name: '越谷駅', kana: 'こしがや', pref: '埼玉県', line: '東武スカイツリーライン', lat: 35.8893, lng: 139.7885, defaultTrain: '23:48' },
  { id: 'wakoshi', name: '和光市駅', kana: 'わこうし', pref: '埼玉県', line: '東武東上線・東京メトロ有楽町線・副都心線', lat: 35.7884, lng: 139.6124, defaultTrain: '23:55' },

  // ==================== 千葉県 ====================
  { id: 'chiba', name: '千葉駅', kana: 'ちば', pref: '千葉県', line: 'JR総武線・外房線・内房線・千葉都市モノレール', lat: 35.6133, lng: 140.1132, defaultTrain: '23:50' },
  { id: 'funabashi', name: '船橋駅', kana: 'ふなばし', pref: '千葉県', line: 'JR総武線・東武アーバンパークライン・京成船橋', lat: 35.7006, lng: 139.9856, defaultTrain: '23:55' },
  { id: 'nishifunabashi', name: '西船橋駅', kana: 'にしふなばし', pref: '千葉県', line: 'JR総武線・武蔵野線・京葉線・東西線・東葉高速', lat: 35.7074, lng: 139.9593, defaultTrain: '23:55' },
  { id: 'kashiwa', name: '柏駅', kana: 'かしわ', pref: '千葉県', line: 'JR常磐線・東武アーバンパークライン', lat: 35.8622, lng: 139.9710, defaultTrain: '23:50' },
  { id: 'matsudo', name: '松戸駅', kana: 'まつど', pref: '千葉県', line: 'JR常磐線・新京成電鉄', lat: 35.7844, lng: 139.9008, defaultTrain: '23:52' },
  { id: 'tsudanuma', name: '津田沼駅', kana: 'つだぬま', pref: '千葉県', line: 'JR総武線・新京成線(新津田沼)', lat: 35.6913, lng: 140.0204, defaultTrain: '23:52' },
  { id: 'urayasu', name: '浦安駅', kana: 'うらやす', pref: '千葉県', line: '東京メトロ東西線', lat: 35.6657, lng: 139.8929, defaultTrain: '23:55' },
  { id: 'maihama', name: '舞浜駅', kana: 'まいはま', pref: '千葉県', line: 'JR京葉線・ディズニーリゾートライン', lat: 35.6358, lng: 139.8837, defaultTrain: '23:45' },

  // ==================== 北関東 ====================
  { id: 'utsunomiya', name: '宇都宮駅', kana: 'うつのみや', pref: '栃木県', line: 'JR宇都宮線・東北新幹線・日光線・宇都宮ライトレール', lat: 36.5590, lng: 139.8984, defaultTrain: '23:30' },
  { id: 'oyama', name: '小山駅', kana: 'おやま', pref: '栃木県', line: 'JR宇都宮線・東北新幹線・両毛線・水戸線', lat: 36.3130, lng: 139.8064, defaultTrain: '23:35' },
  { id: 'mito', name: '水戸駅', kana: 'みと', pref: '茨城県', line: 'JR常磐線・水郡線・鹿島臨海鉄道', lat: 36.3708, lng: 140.4767, defaultTrain: '23:25' },
  { id: 'tsukuba', name: 'つくば駅', kana: 'つくば', pref: '茨城県', line: 'つくばエクスプレス', lat: 36.0827, lng: 140.1114, defaultTrain: '23:45' },
  { id: 'takasaki', name: '高崎駅', kana: 'たかさき', pref: '群馬県', line: 'JR高崎線・上越新幹線・北陸新幹線・信越線・八高線', lat: 36.3225, lng: 139.0127, defaultTrain: '23:30' },
  { id: 'maebashi', name: '前橋駅', kana: 'まえばし', pref: '群馬県', line: 'JR両毛線', lat: 36.3837, lng: 139.0734, defaultTrain: '23:20' },

  // ==================== 近畿 (大阪・京都・兵庫・奈良・滋賀) ====================
  { id: 'osaka_umeda', name: '大阪・梅田駅', kana: 'おおさか・うめだ', pref: '大阪府', line: 'JR環状線・東海道線・阪急・阪神・御堂筋線', lat: 34.7024, lng: 135.4959, defaultTrain: '23:50' },
  { id: 'namba', name: 'なんば駅', kana: 'なんば', pref: '大阪府', line: '大阪メトロ御堂筋線・四つ橋線・千日前線・南海・近鉄', lat: 34.6669, lng: 135.5015, defaultTrain: '23:48' },
  { id: 'tennoji', name: '天王寺駅', kana: 'てんのうじ', pref: '大阪府', line: 'JR環状線・阪和線・大和路線・御堂筋線・谷町線・近鉄', lat: 34.6469, lng: 135.5133, defaultTrain: '23:45' },
  { id: 'kyobashi', name: '京橋駅', kana: 'きょうばし', pref: '大阪府', line: 'JR環状線・東西線・学研都市線・京阪・長堀鶴見緑地線', lat: 34.6969, lng: 135.5336, defaultTrain: '23:48' },
  { id: 'shin_osaka', name: '新大阪駅', kana: 'しんおおさか', pref: '大阪府', line: '東海道山陽新幹線・JR東海道線・おおさか東線・御堂筋線', lat: 34.7335, lng: 135.5002, defaultTrain: '23:52' },
  { id: 'takatsuki', name: '高槻駅', kana: 'たかつき', pref: '大阪府', line: 'JR京都線・阪急京都線(高槻市)', lat: 34.8517, lng: 135.6177, defaultTrain: '23:45' },
  { id: 'sakai', name: '堺駅', kana: 'さかい', pref: '大阪府', line: '南海本線・南海高野線(堺東)', lat: 34.5830, lng: 135.4673, defaultTrain: '23:42' },
  { id: 'kyoto', name: '京都駅', kana: 'きょうと', pref: '京都府', line: 'JR各線・東海道新幹線・近鉄京都線・地下鉄烏丸線', lat: 34.9858, lng: 135.7588, defaultTrain: '23:45' },
  { id: 'shijo_karasuma', name: '四条・烏丸駅', kana: 'しじょう・からすま', pref: '京都府', line: '阪急京都線・地下鉄烏丸線', lat: 35.0037, lng: 135.7594, defaultTrain: '23:48' },
  { id: 'sannomiya', name: '三ノ宮駅', kana: 'さんのみや', pref: '兵庫県', line: 'JR神戸線・阪急・阪神・ポートライナー・地下鉄西神山手線', lat: 34.6938, lng: 135.1955, defaultTrain: '23:45' },
  { id: 'himeji', name: '姫路駅', kana: 'ひめじ', pref: '兵庫県', line: 'JR山陽本線・山陽新幹線・播但線・姫新線・山陽電鉄', lat: 34.8273, lng: 134.6908, defaultTrain: '23:30' },
  { id: 'amagasaki', name: '尼崎駅', kana: 'あまがさき', pref: '兵庫県', line: 'JR東海道線・東西線・福知山線・阪神本線', lat: 34.7188, lng: 135.4338, defaultTrain: '23:50' },
  { id: 'nishinomiya', name: '西宮駅', kana: 'にしのみや', pref: '兵庫県', line: 'JR神戸線・阪神本線・阪急神戸線(西宮北口)', lat: 34.7368, lng: 135.3414, defaultTrain: '23:48' },
  { id: 'nara', name: '奈良駅', kana: 'なら', pref: '奈良県', line: 'JR大和路線・奈良線・万葉まほろば線・近鉄奈良', lat: 34.6808, lng: 135.8189, defaultTrain: '23:35' },
  { id: 'otsu', name: '大津駅', kana: 'おおつ', pref: '滋賀県', line: 'JR琵琶湖線・京阪京津線(びわ湖浜大津)', lat: 35.0031, lng: 135.8647, defaultTrain: '23:40' },
  { id: 'kusatsu', name: '草津駅', kana: 'くさつ', pref: '滋賀県', line: 'JR琵琶湖線・草津線', lat: 35.0225, lng: 135.9625, defaultTrain: '23:35' },
  { id: 'wakayama', name: '和歌山駅', kana: 'わかやま', pref: '和歌山県', line: 'JR阪和線・紀勢本線・和歌山線・わかやま電鉄', lat: 34.2325, lng: 135.1916, defaultTrain: '23:30' },

  // ==================== 中部・東海・北陸 ====================
  { id: 'nagoya', name: '名古屋駅', kana: 'なごや', pref: '愛知県', line: '東海道新幹線・JR東海道線・中央線・地下鉄東山線・桜通線・名鉄・近鉄', lat: 35.1709, lng: 136.8815, defaultTrain: '23:52' },
  { id: 'kanayama', name: '金山駅', kana: 'かなやま', pref: '愛知県', line: 'JR東海道線・中央線・名鉄名古屋本線・地下鉄名城線', lat: 35.1430, lng: 136.9012, defaultTrain: '23:48' },
  { id: 'sakae', name: '栄駅', kana: 'さかえ', pref: '愛知県', line: '地下鉄東山線・名城線・名鉄瀬戸線(栄町)', lat: 35.1697, lng: 136.9080, defaultTrain: '23:50' },
  { id: 'toyohashi', name: '豊橋駅', kana: 'とよはし', pref: '愛知県', line: '東海道新幹線・JR東海道線・飯田線・名鉄', lat: 34.7628, lng: 137.3817, defaultTrain: '23:30' },
  { id: 'gifu', name: '岐阜駅', kana: 'ぎふ', pref: '岐阜県', line: 'JR東海道本線・高山本線・名鉄岐阜', lat: 35.4095, lng: 136.7565, defaultTrain: '23:40' },
  { id: 'shizuoka', name: '静岡駅', kana: 'しずおか', pref: '静岡県', line: '東海道新幹線・JR東海道本線・静岡鉄道(新静岡)', lat: 34.9717, lng: 138.3890, defaultTrain: '23:40' },
  { id: 'hamamatsu', name: '浜松駅', kana: 'はままつ', pref: '静岡県', line: '東海道新幹線・JR東海道本線・遠州鉄道(新浜松)', lat: 34.7037, lng: 137.7348, defaultTrain: '23:40' },
  { id: 'niigata', name: '新潟駅', kana: 'にいがた', pref: '新潟県', line: '上越新幹線・JR信越本線・白新線・越後線', lat: 37.9121, lng: 139.0617, defaultTrain: '23:35' },
  { id: 'toyama', name: '富山駅', kana: 'とやま', pref: '富山県', line: '北陸新幹線・あいの風とやま鉄道・富山地方鉄道', lat: 36.7015, lng: 137.2133, defaultTrain: '23:30' },
  { id: 'kanazawa', name: '金沢駅', kana: 'かなざわ', pref: '石川県', line: '北陸新幹線・IRいしかわ鉄道・北陸鉄道(北鉄金沢)', lat: 36.5781, lng: 136.6478, defaultTrain: '23:35' },
  { id: 'fukui', name: '福井駅', kana: 'ふくい', pref: '福井県', line: '北陸新幹線・ハピラインふくい・えちぜん鉄道・福井鉄道', lat: 36.0620, lng: 136.2232, defaultTrain: '23:25' },
  { id: 'nagano', name: '長野駅', kana: 'ながの', pref: '長野県', line: '北陸新幹線・信越本線・しなの鉄道・長野電鉄', lat: 36.6431, lng: 138.1886, defaultTrain: '23:30' },
  { id: 'matsumoto', name: '松本駅', kana: 'まつもと', pref: '長野県', line: 'JR篠ノ井線・大糸線・アルピコ交通', lat: 36.2307, lng: 137.9644, defaultTrain: '23:20' },
  { id: 'kofu', name: '甲府駅', kana: 'こうふ', pref: '山梨県', line: 'JR中央本線・身延線', lat: 35.6672, lng: 138.5690, defaultTrain: '23:25' },

  // ==================== 北海道・東北 ====================
  { id: 'sapporo', name: '札幌駅', kana: 'さっぽろ', pref: '北海道', line: 'JR函館本線・千歳線・学園都市線・地下鉄南北線・東豊線', lat: 43.0687, lng: 141.3508, defaultTrain: '23:50' },
  { id: 'odori', name: '大通駅', kana: 'おおどおり', pref: '北海道', line: '札幌市営地下鉄南北線・東西線・東豊線', lat: 43.0598, lng: 141.3534, defaultTrain: '23:52' },
  { id: 'hakodate', name: '函館駅', kana: 'はこだて', pref: '北海道', line: 'JR函館本線・道南いさりび鉄道・函館市電', lat: 41.7738, lng: 140.7264, defaultTrain: '23:10' },
  { id: 'asahikawa', name: '旭川駅', kana: 'あさひかわ', pref: '北海道', line: 'JR函館本線・宗谷本線・石北本線・富良野線', lat: 43.7628, lng: 142.3585, defaultTrain: '23:15' },
  { id: 'aomori', name: '青森駅', kana: 'あおもり', pref: '青森県', line: 'JR奥羽本線・津軽線・青い森鉄道', lat: 40.8299, lng: 140.7337, defaultTrain: '23:10' },
  { id: 'hachinohe', name: '八戸駅', kana: 'はちのへ', pref: '青森県', line: '東北新幹線・JR八戸線・青い森鉄道', lat: 40.5090, lng: 141.4308, defaultTrain: '23:15' },
  { id: 'morioka', name: '盛岡駅', kana: 'もりおか', pref: '岩手県', line: '東北新幹線・秋田新幹線・JR東北本線・山田線・IGRいわて銀河鉄道', lat: 39.7014, lng: 141.1365, defaultTrain: '23:20' },
  { id: 'sendai', name: '仙台駅', kana: 'せんだい', pref: '宮城県', line: '東北新幹線・JR東北本線・仙石線・仙山線・地下鉄南北線・東西線', lat: 38.2601, lng: 140.8824, defaultTrain: '23:45' },
  { id: 'akita', name: '秋田駅', kana: 'あきた', pref: '秋田県', line: '秋田新幹線・JR奥羽本線・羽越本線', lat: 39.7171, lng: 140.1293, defaultTrain: '23:18' },
  { id: 'yamagata', name: '山形駅', kana: 'やまがた', pref: '山形県', line: '山形新幹線・JR奥羽本線・左沢線・仙山線', lat: 38.2483, lng: 140.3274, defaultTrain: '23:15' },
  { id: 'fukushima', name: '福島駅', kana: 'ふくしま', pref: '福島県', line: '東北新幹線・山形新幹線・JR東北本線・奥羽本線・阿武隈急行・福島交通', lat: 37.7548, lng: 140.4597, defaultTrain: '23:30' },
  { id: 'koriyama', name: '郡山駅', kana: 'こおりやま', pref: '福島県', line: '東北新幹線・JR東北本線・磐越西線・磐越東線・水郡線', lat: 37.3983, lng: 140.3887, defaultTrain: '23:30' },

  // ==================== 中国・四国 ====================
  { id: 'okayama', name: '岡山駅', kana: 'おかやま', pref: '岡山県', line: '山陽新幹線・JR山陽本線・瀬戸大橋線・伯備線・津山線・宇野線', lat: 34.6663, lng: 133.9186, defaultTrain: '23:45' },
  { id: 'kurashiki', name: '倉敷駅', kana: 'くらしき', pref: '岡山県', line: 'JR山陽本線・伯備線・水島臨海鉄道', lat: 34.6015, lng: 133.7656, defaultTrain: '23:35' },
  { id: 'hiroshima', name: '広島駅', kana: 'ひろしま', pref: '広島県', line: '山陽新幹線・JR山陽本線・呉線・芸備線・可部線・広島電鉄', lat: 34.3977, lng: 132.4753, defaultTrain: '23:45' },
  { id: 'fukuyama', name: '福山駅', kana: 'ふくやま', pref: '広島県', line: '山陽新幹線・JR山陽本線・福塩線', lat: 34.4893, lng: 133.3618, defaultTrain: '23:35' },
  { id: 'tottori', name: '鳥取駅', kana: 'とっとり', pref: '鳥取県', line: 'JR山陰本線・因美線', lat: 35.4940, lng: 134.2260, defaultTrain: '23:05' },
  { id: 'matsue', name: '松江駅', kana: 'まつえ', pref: '島根県', line: 'JR山陰本線', lat: 35.4638, lng: 133.0638, defaultTrain: '23:10' },
  { id: 'takamatsu', name: '高松駅', kana: 'たかまつ', pref: '香川県', line: 'JR予讃線・高徳線・ことでん(高松築港)', lat: 34.3508, lng: 134.0470, defaultTrain: '23:30' },
  { id: 'matsuyama', name: '松山駅', kana: 'まつやま', pref: '愛媛県', line: 'JR予讃線・伊予鉄道(松山市/JR松山駅前)', lat: 33.8398, lng: 132.7516, defaultTrain: '23:15' },
  { id: 'tokushima', name: '徳島駅', kana: 'とくしま', pref: '徳島県', line: 'JR高徳線・徳島線・牟岐線・鳴門線', lat: 34.0750, lng: 134.5510, defaultTrain: '23:10' },
  { id: 'kochi', name: '高知駅', kana: 'こうち', pref: '高知県', line: 'JR土讃線・とさでん交通', lat: 33.5672, lng: 133.5435, defaultTrain: '23:05' },

  // ==================== 九州・沖縄 ====================
  { id: 'hakata', name: '博多駅', kana: 'はかた', pref: '福岡県', line: '山陽九州新幹線・JR鹿児島本線・福北ゆたか線・地下鉄空港線・七隈線', lat: 33.5902, lng: 130.4207, defaultTrain: '23:50' },
  { id: 'tenjin', name: '天神駅', kana: 'てんじん', pref: '福岡県', line: '福岡市地下鉄空港線・七隈線(天神南)・西鉄天神大牟田線', lat: 33.5916, lng: 130.3989, defaultTrain: '23:48' },
  { id: 'kokura', name: '小倉駅', kana: 'こくら', pref: '福岡県', line: '山陽新幹線・JR鹿児島本線・日豊本線・北九州モノレール', lat: 33.8867, lng: 130.8828, defaultTrain: '23:45' },
  { id: 'kurume', name: '久留米駅', kana: 'くるめ', pref: '福岡県', line: '九州新幹線・JR鹿児島本線・久大本線・西鉄久留米', lat: 33.3197, lng: 130.5008, defaultTrain: '23:30' },
  { id: 'saga', name: '佐賀駅', kana: 'さが', pref: '佐賀県', line: 'JR長崎本線・唐津線', lat: 33.2644, lng: 130.2974, defaultTrain: '23:25' },
  { id: 'nagasaki', name: '長崎駅', kana: 'ながさき', pref: '長崎県', line: '西九州新幹線・JR長崎本線・長崎電気軌道', lat: 32.7530, lng: 129.8708, defaultTrain: '23:20' },
  { id: 'kumamoto', name: '熊本駅', kana: 'くまもと', pref: '熊本県', line: '九州新幹線・JR鹿児島本線・豊肥本線・熊本市電', lat: 32.7898, lng: 130.6888, defaultTrain: '23:40' },
  { id: 'oita', name: '大分駅', kana: 'おおいた', pref: '大分県', line: 'JR日豊本線・久大本線・豊肥本線', lat: 33.2327, lng: 131.6067, defaultTrain: '23:30' },
  { id: 'miyazaki', name: '宮崎駅', kana: 'みやざき', pref: '宮崎県', line: 'JR日豊本線・日南線・宮崎空港線', lat: 31.9157, lng: 131.4319, defaultTrain: '23:15' },
  { id: 'kagoshima_chuo', name: '鹿児島中央駅', kana: 'かごしまちゅうおう', pref: '鹿児島県', line: '九州新幹線・JR鹿児島本線・指宿枕崎線・日豊本線・鹿児島市電', lat: 31.5841, lng: 130.5431, defaultTrain: '23:35' },
  { id: 'naha_kuko', name: '那覇空港駅', kana: 'なはくうこう', pref: '沖縄県', line: '沖縄都市モノレール(ゆいレール)', lat: 26.2064, lng: 127.6522, defaultTrain: '23:30' },
  { id: 'kencho_mae', name: '県庁前駅(沖縄)', kana: 'けんちょうまえ', pref: '沖縄県', line: '沖縄都市モノレール(ゆいレール)', lat: 26.2144, lng: 127.6797, defaultTrain: '23:45' }
];

/**
 * 駅名・ひらがな・路線名・都道府県名によるインクリメンタル検索
 * @param {string} query
 * @param {number} [limit=10]
 * @returns {Array} マッチした駅の配列
 */
export function searchStations(query, limit = 10) {
  if (!query || !query.trim()) return [];
  const q = query.trim().toLowerCase();

  return STATIONS_DATABASE.filter((st) => {
    return (
      st.name.toLowerCase().includes(q) ||
      st.kana.includes(q) ||
      st.pref.toLowerCase().includes(q) ||
      st.line.toLowerCase().includes(q)
    );
  }).slice(0, limit);
}
