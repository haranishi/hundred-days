/**
 * 国土交通省「航空機への危険物の持込み・お預けについて（代表例）」および
 * 国際民間航空機関（ICAO）技術指針・主要航空会社共通案内をもとに整理した手荷物36品目データ。
 *
 * 仕分け先（action）:
 * - 'carry_on'   : 機内持ち込み（客室へ携帯）
 * - 'checked'    : お預け手荷物（貨物室へ預託）
 * - 'prohibited' : 持込不可（機内・お預けともに禁止／放棄箱）
 */

export const CATEGORIES = [
  { id: 'all', label: 'すべて' },
  { id: 'battery', label: '電池・電子機器' },
  { id: 'liquid', label: '液体・化粧品' },
  { id: 'blade', label: '刃物・工具・長尺' },
  { id: 'spray', label: 'スプレー・日用品' },
  { id: 'fire', label: '喫煙具・火気・危険物' },
  { id: 'drink', label: '飲料・食品・薬' }
];

export const ACTION_META = {
  carry_on: {
    id: 'carry_on',
    label: '機内持ち込み',
    shortLabel: '機内へ',
    keyHint: '← / A',
    direction: 'left',
    description: '客室の手荷物バッグへ入れる（預け入れNGや手元管理品）'
  },
  checked: {
    id: 'checked',
    label: '預け荷物',
    shortLabel: '預けへ',
    keyHint: '↑ / W',
    direction: 'up',
    description: 'カウンターでスーツケースに入れて貨物室へ預ける'
  },
  prohibited: {
    id: 'prohibited',
    label: '持込不可（没収）',
    shortLabel: '不可・破棄',
    keyHint: '→ / D',
    direction: 'right',
    description: '機内も預けも全面禁止（飛行機に乗せられない危険物）'
  }
};

export const ITEMS = [
  // ==================== 1. 機内持ち込みのみOK（預けNG）10品目 ====================
  {
    id: 'powerbank-10000',
    name: 'モバイルバッテリー',
    spec: '10,000mAh・37Wh',
    category: 'battery',
    allowed: ['carry_on'],
    ruleBadge: '機内のみOK（預けNG）',
    shortReason: '貨物室で発火すると消火できないため、スーツケース預け入れは厳禁！必ず機内へ。',
    detailRule: '予備のリチウムイオン電池（モバイルバッテリー）は短絡・衝撃による発火時に客室で即座に対処できるよう、預け入れは禁止。100Wh以下は機内持ち込みのみ可能です。',
    icon: 'battery',
    featuredInTraining: true
  },
  {
    id: 'powerbank-140wh',
    name: 'ノートPC用 大型バッテリー',
    spec: '140Wh（100Wh超〜160Wh以下）',
    category: 'battery',
    allowed: ['carry_on'],
    ruleBadge: '機内のみOK（最大2個）',
    shortReason: '100Wh超〜160Wh以下のリチウム電池は1人2個まで機内持ち込みのみ可（預けNG）。',
    detailRule: '100Whを超え160Wh以下の大容量モバイルバッテリーや予備電池は、航空会社の承認のもと1人2個まで機内持ち込みのみ可能です。預け入れはできません。',
    icon: 'battery'
  },
  {
    id: 'lighter-1',
    name: '使い捨てライター（1個）',
    spec: '液化ガス式・ポケットに携帯',
    category: 'fire',
    allowed: ['carry_on'],
    ruleBadge: '機内のみOK（1人1個）',
    shortReason: '喫煙用ライターは「本人が身につける1個」に限り機内持ち込みOK。預け入れは禁止！',
    detailRule: '一般的な使い捨てライターや金属製オイルライター（吸収剤入り）は、乗客1人につき1個だけ身につけて機内へ持ち込めます。受託手荷物に入れることはできません。',
    icon: 'lighter',
    featuredInTraining: true
  },
  {
    id: 'safety-match',
    name: '安全マッチ（小型1箱）',
    spec: '側薬で擦る通常のマッチ',
    category: 'fire',
    allowed: ['carry_on'],
    ruleBadge: '機内のみOK（1人1箱）',
    shortReason: '小型の安全マッチは1人1箱まで身につけて機内持ち込みのみ可能（ライターと合計1個）。',
    detailRule: '箱の側面で擦って火をつける「安全マッチ」は、1人1箱に限り身につけて機内へ持ち込めます。スーツケースに入れて預けることは禁止されています。',
    icon: 'match'
  },
  {
    id: 'heated-tobacco',
    name: '加熱式タバコ（本体）',
    spec: 'リチウムイオン電池内蔵',
    category: 'fire',
    allowed: ['carry_on'],
    ruleBadge: '機内のみOK（預けNG）',
    shortReason: '発熱部とリチウム電池を内蔵しているため、貨物室への預け入れは禁止。機内持ち込みのみ！',
    detailRule: 'アイコス等の加熱式タバコや電子タバコ本体は、貨物室内で誤作動・発熱する危険があるため預け入れ禁止です。機内へ持ち込み、機内での使用・充電は行わないでください。',
    icon: 'vape',
    featuredInTraining: true
  },
  {
    id: 'spare-lithium-camera',
    name: 'カメラの交換用バッテリー',
    spec: 'リチウムイオン電池（単体・60Wh）',
    category: 'battery',
    allowed: ['carry_on'],
    ruleBadge: '機内のみOK（端子保護）',
    shortReason: '機器から外した予備のリチウム電池はすべて「モバイルバッテリーと同じ扱い」で預けNG！',
    detailRule: '一眼レフカメラやドローン等の交換用リチウムイオン電池（単体）は、端子が金属と触れてショートしないよう保護したうえで機内持ち込みのみ可能です。',
    icon: 'battery'
  },
  {
    id: 'earphone-charging-case',
    name: 'ワイヤレスイヤホン充電ケース',
    spec: 'バッテリー内蔵ケース単体',
    category: 'battery',
    allowed: ['carry_on'],
    ruleBadge: '機内のみOK（預けNG）',
    shortReason: '充電ケースはモバイルバッテリー機能を持つため、スーツケース預け入れはNG。手元へ！',
    detailRule: 'リチウムイオン電池を内蔵しイヤホンを充電するケースは、貨物室での発火リスクを避けるため預け荷物に入れず、機内手荷物として携帯してください。',
    icon: 'earphone'
  },
  {
    id: 'handy-fan',
    name: '充電式ハンディファン',
    spec: 'リチウムイオン電池内蔵・小型扇風機',
    category: 'battery',
    allowed: ['carry_on'],
    ruleBadge: '機内へ携帯（衝撃防止）',
    shortReason: 'バッテリー内蔵の小型扇風機は衝撃による発火を防ぐため、機内手荷物での携帯が安全基準。',
    detailRule: 'リチウムイオン電池内蔵の携帯扇風機は、落下や圧迫による発火事故が報告されており、誤作動防止措置をとって機内へ持ち込む運用が求められます。',
    icon: 'fan'
  },
  {
    id: 'hair-iron-removed-battery',
    name: 'コードレスヘアアイロンの抜取電池',
    spec: '本体から外したリチウム電池（100Wh以下）',
    category: 'battery',
    allowed: ['carry_on'],
    ruleBadge: '機内のみOK（本体から分離）',
    shortReason: '電池が取り外せるヘアアイロンは、外した電池を「機内手荷物」にすれば持ち込みOK！',
    detailRule: '充電式ヘアアイロンは「電池を本体から取り外せるタイプ」に限り、外した電池を端子保護して機内持ち込みにすることで飛行機に乗せられます（外した電池の預けはNG）。',
    icon: 'battery',
    featuredInTraining: true
  },
  {
    id: 'vape-mod',
    name: '電子タバコ（VAPE・リキッド式）',
    spec: 'バッテリー内蔵デバイス',
    category: 'fire',
    allowed: ['carry_on'],
    ruleBadge: '機内のみOK（預けNG）',
    shortReason: '電子タバコ本体は誤作動による発熱防止のため、預け荷物には入れられません。',
    detailRule: '国際基準（ICAO）により、バッテリー内蔵の電子タバコは受託手荷物への収納が禁止されており、客室への持ち込みのみ認められています。',
    icon: 'vape'
  },

  // ==================== 2. 預け荷物のみOK（機内NG）10品目 ====================
  {
    id: 'scissors-8cm',
    name: '文房具のハサミ',
    spec: '刃渡り 8cm（先端尖り）',
    category: 'blade',
    allowed: ['checked'],
    ruleBadge: '預けのみOK（機内NG）',
    shortReason: '刃物類はハイジャック・凶器防止のため客室持ち込み禁止！スーツケースで預ければOK。',
    detailRule: 'ハサミやナイフ等の刃物類は機内への持ち込みが航空法で禁止されています。ペンケース内のハサミも保安検査で引っかかるため、必ず預け荷物に入れてください。',
    icon: 'scissors',
    featuredInTraining: true
  },
  {
    id: 'cutter-knife',
    name: 'カッターナイフ',
    spec: '折る刃式・事務用小型',
    category: 'blade',
    allowed: ['checked'],
    ruleBadge: '預けのみOK（機内NG）',
    shortReason: 'カッターナイフはサイズを問わず機内持ち込み厳禁！預け荷物に入れましょう。',
    detailRule: '小型の事務用カッターやデザインナイフであっても、鋭利な刃物として機内持ち込みは全面禁止です。受託手荷物として預けることは可能です。',
    icon: 'cutter'
  },
  {
    id: 'swiss-knife',
    name: '十徳ナイフ（マルチツール）',
    spec: 'キーホルダー型・小刀付き',
    category: 'blade',
    allowed: ['checked'],
    ruleBadge: '預けのみOK（機内NG）',
    shortReason: 'キーホルダー型でもナイフ刃がついているものは機内NG。外して預け荷物へ！',
    detailRule: 'キャンプや防災用のマルチツール（十徳ナイフ）は、鍵やカバンに付けたまま保安検査場へ入ると持ち込めません。事前にスーツケースへ入れて預けてください。',
    icon: 'cutter'
  },
  {
    id: 'lotion-150ml-intl',
    name: '化粧水ボトル（国際線）',
    spec: '150ml容器（中身は残り30ml）',
    category: 'liquid',
    allowed: ['checked'],
    ruleBadge: '預けのみOK（国際線100ml制限）',
    shortReason: '国際線は中身が30mlでも「100mlを超える容器」自体が機内NG！スーツケース預け入れへ。',
    detailRule: '国際線の液体物制限（LAGs規制）では、中身の残量ではなく「容器の表示容量が100ml（g）以下か」で判定されます。150mlボトルは預け荷物に入れる必要があります。',
    icon: 'bottle',
    featuredInTraining: true
  },
  {
    id: 'pudding-jelly-intl',
    name: 'お土産のプリン・ゼリー（国際線）',
    spec: '1個 180gカップ',
    category: 'drink',
    allowed: ['checked'],
    ruleBadge: '預けのみOK（国際線は液体扱い）',
    shortReason: 'プリン・ゼリー・ヨーグルト・味噌・ジャムも国際線では「液体物」扱い！100g超は預けへ。',
    detailRule: '保安検査ではジェル状・ペースト状・クリーム状の食品（プリン、ゼリー、味噌、漬物、缶詰等）もすべて液体物とみなされます。100ml（g）超は受託手荷物へ預けてください。',
    icon: 'jar'
  },
  {
    id: 'screwdriver-tool',
    name: '工具ドライバー・レンチ',
    spec: '金属製・全長 20cm',
    category: 'blade',
    allowed: ['checked'],
    ruleBadge: '預けのみOK（機内NG）',
    shortReason: 'ドライバーやレンチ等の工具類は凶器となり得るため客室持ち込み不可。預け荷物ならOK！',
    detailRule: 'プラス・マイナスドライバー、スパナ、ペンチ、かなづち等の工具類は、機内への持ち込みが制限されています。作業用工具は受託手荷物として預けてください。',
    icon: 'tool'
  },
  {
    id: 'baseball-bat',
    name: '金属バット・ゴルフクラブ',
    spec: 'スポーツ用長尺物',
    category: 'blade',
    allowed: ['checked'],
    ruleBadge: '預けのみOK（機内NG）',
    shortReason: 'バットやゴルフクラブ等の打撃になり得るスポーツ用品は機内NG。カウンターで預け入れへ。',
    detailRule: '野球のバット、ゴルフクラブ、アイスホッケースティック、木刀などは凶器として使用される恐れがあるため客室へは持ち込めず、預け荷物扱いとなります。',
    icon: 'bat'
  },
  {
    id: 'souvenir-kitchen-knife',
    name: 'お土産の料理包丁（箱入り）',
    spec: '刃渡り 16cm・未開封箱',
    category: 'blade',
    allowed: ['checked'],
    ruleBadge: '預けのみOK（機内NG）',
    shortReason: '未開封の箱入りでも包丁は客室に持ち込めません！必ずスーツケースに入れて預けましょう。',
    detailRule: '旅行先で購入した工芸包丁や果物ナイフは、厳重に包装されていても機内持ち込みはできません。保安検査場を通る前にカウンターで預けてください。',
    icon: 'cutter'
  },
  {
    id: 'gel-ice-pack-intl',
    name: '大型保冷剤（ジェル・国際線）',
    spec: '250g 保冷ジェルパック',
    category: 'liquid',
    allowed: ['checked'],
    ruleBadge: '預けのみOK（国際線液体扱い）',
    shortReason: '保冷剤もジェル（液体物）扱い！国際線で100gを超える保冷剤は預け荷物に入れましょう。',
    detailRule: '要冷蔵のお土産に添えられた保冷剤（ジェル）も液体物制限の対象です。国際線では100ml（g）を超えると機内持ち込み不可となるため、品物ごと預け荷物にしてください。',
    icon: 'ice'
  },
  {
    id: 'camp-peg-hammer',
    name: 'キャンプ用金属ペグ＆ハンマー',
    spec: '鍛造スチール製・30cm',
    category: 'blade',
    allowed: ['checked'],
    ruleBadge: '預けのみOK（機内NG）',
    shortReason: '先端が尖った金属製テントペグやハンマーは機内持ち込み不可。預け荷物で運びましょう。',
    detailRule: 'アウトドア用の金属ペグやハンマーは先端が鋭利・重量物のため客室へは持ち込めません。保護キャップをつけて受託手荷物として預けてください。',
    icon: 'tool'
  },

  // ==================== 3. 持込不可・没収（機内も預けもNG）10品目 ====================
  {
    id: 'powerbank-200wh',
    name: '大容量ポータブル電源',
    spec: '200Wh (約54,000mAh・キャンプ用)',
    category: 'battery',
    allowed: ['prohibited'],
    ruleBadge: '機内・預け ともに不可',
    shortReason: '160Whを超えるリチウムイオン電池は、機内持ち込みも預け入れも法律で全面禁止！',
    detailRule: '国土交通省およびICAO基準により、ワット時定格量が160Whを超えるリチウムイオン電池（ポータブル電源等）は危険物として旅客機での輸送が全面的に禁止されています。',
    icon: 'battery-huge',
    featuredInTraining: true
  },
  {
    id: 'lighter-turbo',
    name: 'ターボライター（青白い炎）',
    spec: 'プリミキシングバーナー式・防風',
    category: 'fire',
    allowed: ['prohibited'],
    ruleBadge: '機内・預け ともに不可',
    shortReason: '高温の青い炎が出るターボライター（防風ライター）は、1個であっても全面禁止！',
    detailRule: '通常の使い捨てライターとは異なり、プリミキシングバーナーライター（ターボライター・ジェットライター・葉巻用ライター）は着火時の火力・危険性が高いため機内も預けも一切不可です。',
    icon: 'lighter-turbo',
    featuredInTraining: true
  },
  {
    id: 'lighter-multiple',
    name: '使い捨てライター（3本セット）',
    spec: 'カバンの中に予備含め3個',
    category: 'fire',
    allowed: ['prohibited'],
    ruleBadge: '2個目以降は不可（上限1個）',
    shortReason: 'ライターは「1人1個」まで！複数個持っている場合、2個目以降は機内も預けも不可。',
    detailRule: '喫煙用ライターの機内持ち込みは1人1個（安全マッチと合わせて1個）に厳しく制限されています。予備のライターは預け荷物にも入れられないため放棄となります。',
    icon: 'lighter'
  },
  {
    id: 'hair-iron-fixed-battery',
    name: '電池が外せないコードレスヘアアイロン',
    spec: 'リチウムイオン電池内蔵（固定式）',
    category: 'battery',
    allowed: ['prohibited'],
    ruleBadge: '機内・預け ともに不可',
    shortReason: '【空港で没収急増中！】リチウム電池が本体から取り外せない充電式ヘアアイロンは全面禁止！',
    detailRule: 'リチウムイオン電池を内蔵し、乗客自身で電池を本体から取り外せないコードレスヘアアイロンは、誤作動による高温発火リスクがあるため機内持ち込みも預け入れもできません。',
    icon: 'hair-iron',
    featuredInTraining: true
  },
  {
    id: 'gas-cartridge-camp',
    name: 'カセットコンロ・登山用ガスボンベ',
    spec: 'LPG引火性高圧ガス 250g',
    category: 'fire',
    allowed: ['prohibited'],
    ruleBadge: '機内・預け ともに不可',
    shortReason: 'カセットボンベやキャンプ用OD缶（ガス）は引火性高圧ガスのため航空機への搭載は全面禁止！',
    detailRule: 'キャンプや自炊用のガスカートリッジ（CB缶・OD缶）や補充用ガスボンベは、気圧変化や引火による爆発の危険があるため、未使用・使用中を問わず一切持ち込めません。',
    icon: 'gas'
  },
  {
    id: 'spray-waterproof',
    name: '靴・衣類用の防水スプレー',
    spec: '引火性ガス使用・300ml',
    category: 'spray',
    allowed: ['prohibited'],
    ruleBadge: '機内・預け ともに不可',
    shortReason: '人体用以外の引火性スプレー（防水スプレー・塗料・冷却ガス等）は機内も預けも全面禁止！',
    detailRule: 'スプレー缶のうち、機内や預けが認められるのは「化粧品・医薬品（制汗・ヘアスプレー等）」や「スポーツ・家庭用で引火性ガスを含まないもの」のみ。防水スプレーは引火性のため全面禁止です。',
    icon: 'spray-danger',
    featuredInTraining: true
  },
  {
    id: 'alcohol-spirytus',
    name: 'スピリタス（超高濃度ウォッカ）',
    spec: 'アルコール度数 96%・500ml',
    category: 'drink',
    allowed: ['prohibited'],
    ruleBadge: '機内・預け ともに不可（70度超）',
    shortReason: 'アルコール度数70%を超えるお酒は「引火性液体（危険物）」にあたり、飛行機に乗せられません！',
    detailRule: '酒類の輸送基準では、アルコール度数70%（70度）を超えるものは引火性液体として機内持ち込み・お預けともに禁止されています（24%超〜70%以下は1人合計5Lまで可）。',
    icon: 'bottle-danger'
  },
  {
    id: 'fireworks-cracker',
    name: '手持ち花火・パーティクラッカー',
    spec: '火薬類使用',
    category: 'fire',
    allowed: ['prohibited'],
    ruleBadge: '機内・預け ともに不可',
    shortReason: '花火やクラッカーは「火薬類」のため、少量であっても機内・預けともに全面禁止！',
    detailRule: '玩具用花火、線香花火、パーティー用クラッカー、発煙筒などは火薬類（爆発物）に分類されるため、航空法により一切の持ち込み・預け入れが禁じられています。',
    icon: 'fireworks'
  },
  {
    id: 'strike-anywhere-match',
    name: 'どこでもつくマッチ（硫化りんマッチ）',
    spec: '摩擦発火性・ロウマッチ',
    category: 'fire',
    allowed: ['prohibited'],
    ruleBadge: '機内・預け ともに不可',
    shortReason: '箱の側面以外でも摩擦で発火する「硫化りんマッチ」は自然発火リスクのため全面禁止！',
    detailRule: '靴底や壁などどこで擦っても発火する硫化りんマッチ（Strike-anywhere matches）は危険物（可燃性物質）にあたり、1箱であっても機内・預けともに禁止です。',
    icon: 'match'
  },
  {
    id: 'chlorine-bleach',
    name: '塩素系漂白剤・カビ取り洗剤',
    spec: '次亜塩素酸・腐食性液体',
    category: 'liquid',
    allowed: ['prohibited'],
    ruleBadge: '機内・預け ともに不可',
    shortReason: '塩素系漂白剤や強酸・強アルカリ洗剤は「腐食性物質」のため航空機への積載は全面禁止！',
    detailRule: '機体金属を腐食させたり有毒ガスを発生させる恐れのある塩素系漂白剤・カビ取り剤・パイプ洗浄剤等は、危険物（腐食性物質）として持ち込みも預け入れも禁止です。',
    icon: 'bottle-danger'
  },

  // ==================== 4. 両方OK（機内でも預けでもOK）6品目 ====================
  {
    id: 'liquid-pouch-intl',
    name: '透明ジッパー袋入りの化粧水セット',
    spec: '各100ml以下×3本・1L以下の透明袋',
    category: 'liquid',
    allowed: ['carry_on', 'checked'],
    ruleBadge: '機内・預け 両方OK',
    shortReason: '100ml以下の容器に入れ1L以下の透明ジッパー袋にまとめれば、国際線の機内持ち込みも預けもOK！',
    detailRule: '国際線でも、1容器あたり100ml（g）以下で、縦横合計40cm以内の1リットル以下透明再封可能プラスチック袋（1人1袋）に余裕をもって収めれば機内へ持ち込めます。もちろん預け入れもOKです。',
    icon: 'pouch',
    featuredInTraining: true
  },
  {
    id: 'spray-deodorant',
    name: '制汗スプレー・ヘアスプレー（肌用）',
    spec: '医薬部外品・200ml（1容器0.5L以下）',
    category: 'spray',
    allowed: ['carry_on', 'checked'],
    ruleBadge: '機内・預け 両方OK（規定量内）',
    shortReason: '化粧品・医薬部外品の人体用スプレーは、1容器500ml以下（合計2L以下）なら機内も預けもOK！',
    detailRule: '制汗スプレー、ヘアスプレー、肌用虫除けスプレーなどの化粧品・医薬品類は、1容器0.5kg（0.5L）以下、1人あたり合計2kg（2L）まで機内持ち込み・預け入れが可能です（※国際線機内は100ml以下）。',
    icon: 'spray-ok'
  },
  {
    id: 'hair-iron-corded',
    name: 'コンセント式ヘアアイロン',
    spec: 'AC電源コード式（電池内蔵なし）',
    category: 'battery',
    allowed: ['carry_on', 'checked'],
    ruleBadge: '機内・預け 両方OK',
    shortReason: '電池を内蔵しない「コンセントに挿して使うコード式ヘアアイロン」は機内も預けも制限なし！',
    detailRule: 'リチウムイオン電池やガスカートリッジを内蔵していない、通常のACコンセント電源コード式のヘアアイロン・コテ・ドライヤーは、機内持ち込みも預け入れも自由に行えます。',
    icon: 'plug'
  },
  {
    id: 'wine-bottle-domestic',
    name: 'ワイン・日本酒ボトル（度数15%）',
    spec: 'アルコール度数 15%・750ml（国内線）',
    category: 'drink',
    allowed: ['carry_on', 'checked'],
    ruleBadge: '機内・預け 両方OK（24度以下）',
    shortReason: 'アルコール度数24%以下の酒類（ワイン・日本酒・ビール等）は危険物制限の対象外で両方OK！',
    detailRule: 'アルコール度数24%以下の飲料は航空法上の危険物に該当しません。国内線なら機内持ち込み・お預けともに可能（国際線の場合は100ml超のため預け荷物または免税店購入品ルールに従う）。',
    icon: 'wine'
  },
  {
    id: 'nail-clipper-shaver',
    name: '爪切り・T字カミソリ',
    spec: '一般的な身だしなみ用品',
    category: 'blade',
    allowed: ['carry_on', 'checked'],
    ruleBadge: '機内・預け 両方OK',
    shortReason: '一般的な爪切りや、刃がガードされたT字カミソリ・電気シェーバーは機内も預けもOK！',
    detailRule: '化粧用の毛抜き、一般的な爪切り（ナイフ刃がないもの）、安全ガード付きのT字カミソリ、電動シェーバーは客室への持ち込みも受託手荷物への預け入れも可能です。',
    icon: 'clipper'
  },
  {
    id: 'eyedrops-medicine',
    name: '目薬・常備薬（処方薬）',
    spec: '点眼液 15ml・錠剤シート',
    category: 'drink',
    allowed: ['carry_on', 'checked'],
    ruleBadge: '機内・預け 両方OK（機内推奨）',
    shortReason: '目薬（100ml以下）や機内で必要な常備薬・処方薬は機内持ち込みも預けもOK！',
    detailRule: '医薬品（錠剤・点眼薬・インスリン等）は機内持ち込み・お預けともに可能です。遅延やロストバゲージに備え、必要な常備薬は機内手荷物として手元に持つことが推奨されます。',
    icon: 'medicine'
  }
];

export const XRAY_BY_ID = {
  'powerbank-10000': {
    scanColor: 'cyan',
    materialTag: 'X線所見：リチウムイオンセル×2（定格37Wh・単体予備電池）',
    inspectPoint: '着眼点：160Wh以下の予備リチウム電池は発火時に客室で対処するため貨物室預けNG'
  },
  'powerbank-140wh': {
    scanColor: 'cyan',
    materialTag: 'X線所見：高密度リチウムセル×6（定格140Wh・100〜160Wh帯）',
    inspectPoint: '着眼点：100Wh超〜160Wh以下の予備電池は1人2個まで客室手荷物のみ可（預けNG）'
  },
  'lighter-1': {
    scanColor: 'amber',
    materialTag: 'X線所見：小型液化ガス容器×1（着火フリント式・1個のみ）',
    inspectPoint: '着眼点：通常の喫煙ライターは「1人1個・身につけて機内持込」のみ許可（預けNG）'
  },
  'safety-match': {
    scanColor: 'amber',
    materialTag: 'X線所見：木軸マッチ1箱（側面擦り着火式）',
    inspectPoint: '着眼点：小型の安全マッチは1人1箱に限り身につけて機内持ち込みのみ可（預けNG）'
  },
  'heated-tobacco': {
    scanColor: 'cyan',
    materialTag: 'X線所見：リチウムイオン電池内蔵＋加熱ブレード回路',
    inspectPoint: '着眼点：発熱素子と電池を内蔵する電子タバコ・加熱式タバコは貨物室への預け入れ禁止'
  },
  'spare-lithium-camera': {
    scanColor: 'cyan',
    materialTag: 'X線所見：カメラ用リチウムイオン電池パック単体（60Wh）',
    inspectPoint: '着眼点：機器から外した予備のリチウム電池はすべてモバイルバッテリーと同じく預けNG'
  },
  'earphone-charging-case': {
    scanColor: 'cyan',
    materialTag: 'X線所見：充電用リチウム電池内蔵ケース＋小型基板',
    inspectPoint: '着眼点：イヤホンを充電するバッテリー内蔵ケースはモバイルバッテリー扱いで機内へ携帯'
  },
  'handy-fan': {
    scanColor: 'cyan',
    materialTag: 'X線所見：18650型リチウムイオン電池内蔵＋モーター羽根',
    inspectPoint: '着眼点：衝撃で発火しやすいリチウム電池内蔵ファンは誤作動を防いで機内手荷物へ'
  },
  'hair-iron-removed-battery': {
    scanColor: 'cyan',
    materialTag: 'X線所見：ヘアアイロン本体から分離されたリチウム電池単体',
    inspectPoint: '着眼点：本体から取り外したリチウム電池（160Wh以下）は予備電池として機内持ち込みへ'
  },
  'vape-mod': {
    scanColor: 'cyan',
    materialTag: 'X線所見：バッテリー内蔵VAPE本体＋アトマイザーコイル',
    inspectPoint: '着眼点：バッテリー内蔵の電子タバコは貨物室での誤作動発熱を防ぐため機内持ち込みのみ'
  },
  'scissors-8cm': {
    scanColor: 'crimson',
    materialTag: 'X線所見：高密度金属二枚刃（刃渡り8cm・先端鋭利）',
    inspectPoint: '着眼点：ハサミやナイフ等の刃物類は客室持ち込み禁止。スーツケースに預ければ輸送可'
  },
  'cutter-knife': {
    scanColor: 'crimson',
    materialTag: 'X線所見：スライド式金属替刃（鋭利な鋼製ブレード）',
    inspectPoint: '着眼点：小型の事務用カッターでも鋭利な刃物として客室持ち込みは厳禁（預け荷物へ）'
  },
  'swiss-knife': {
    scanColor: 'crimson',
    materialTag: 'X線所見：折りたたみ金属ナイフ刃・缶切り内蔵マルチツール',
    inspectPoint: '着眼点：キーホルダー型でもナイフ刃付きのマルチツールは客室NG（外して預け荷物へ）'
  },
  'lotion-150ml-intl': {
    scanColor: 'amber',
    materialTag: 'X線所見：樹脂ボトル容器（容器刻印 150ml ／ 液面残り約30ml）',
    inspectPoint: '着眼点：国際線の液体物は残量ではなく「容器の表示容量が100ml以下か」で判定される'
  },
  'pudding-jelly-intl': {
    scanColor: 'amber',
    materialTag: 'X線所見：高水分ゲル状食品カップ（1個 180g）',
    inspectPoint: '着眼点：プリン・ゼリー・味噌・ジャム等も国際線では液体物扱い（100g超は預け荷物へ）'
  },
  'screwdriver-tool': {
    scanColor: 'crimson',
    materialTag: 'X線所見：鋼製シャフト工具（全長20cm・先端金属）',
    inspectPoint: '着眼点：ドライバー・レンチ・ペンチ等の作業工具は凶器防止のため客室NG（預け荷物へ）'
  },
  'baseball-bat': {
    scanColor: 'crimson',
    materialTag: 'X線所見：中空アルミ合金製長尺バット（打撃用具）',
    inspectPoint: '着眼点：バットやゴルフクラブ等の長尺スポーツ用品は客室へ持ち込めず預け荷物扱い'
  },
  'souvenir-kitchen-knife': {
    scanColor: 'crimson',
    materialTag: 'X線所見：箱内部に鋼製包丁ブレード（刃渡り16cm）',
    inspectPoint: '着眼点：未開封の贈答箱入りでも包丁・ナイフ類は客室持ち込み不可（カウンターで預けへ）'
  },
  'gel-ice-pack-intl': {
    scanColor: 'amber',
    materialTag: 'X線所見：高密度ポリマー保冷ジェルパック（250g）',
    inspectPoint: '着眼点：保冷剤もジェル（液体物）扱い。国際線で100g超は品物と一緒に預け荷物へ'
  },
  'camp-peg-hammer': {
    scanColor: 'crimson',
    materialTag: 'X線所見：鍛造スチール製ペグ（30cm）＋金属ヘッドハンマー',
    inspectPoint: '着眼点：先端が尖った金属ペグや重量ハンマーは客室NG。受託手荷物として預け入れへ'
  },
  'powerbank-200wh': {
    scanColor: 'crimson',
    materialTag: 'X線所見：超大型リチウムイオン電池ブロック（定格200Wh・上限160Wh超過）',
    inspectPoint: '着眼点：160Whを超えるリチウムイオン電池（ポータブル電源）は機内も預けも法律で全面禁止'
  },
  'lighter-turbo': {
    scanColor: 'crimson',
    materialTag: 'X線所見：高圧プリミキシングノズル内蔵バーナーライター（青炎式）',
    inspectPoint: '着眼点：高温の青い炎が出るターボライター・ジェットライターは1個でも機内・預け全面禁止'
  },
  'lighter-multiple': {
    scanColor: 'crimson',
    materialTag: 'X線所見：液化ガスライター×3本（1人1個の上限超過）',
    inspectPoint: '着眼点：ライターは「1人1個」まで。2個目以降の予備ライターは機内も預けも一切不可'
  },
  'hair-iron-fixed-battery': {
    scanColor: 'crimson',
    materialTag: 'X線所見：ヒータープレート＋固定式リチウムイオン電池（取外し不可構造）',
    inspectPoint: '着眼点：電池が本体から取り外せないコードレスヘアアイロンは機内・預けともに全面禁止'
  },
  'gas-cartridge-camp': {
    scanColor: 'crimson',
    materialTag: 'X線所見：高圧LPG液化ガス充填ボンベ（250g・引火性高圧ガス）',
    inspectPoint: '着眼点：カセットコンロ用ボンベやキャンプ用ODガス缶は爆発危険のため機内・預け全面禁止'
  },
  'spray-waterproof': {
    scanColor: 'crimson',
    materialTag: 'X線所見：エアゾール缶（300ml・LPG引火性噴射剤＋有機溶剤）',
    inspectPoint: '着眼点：化粧品・医薬品以外の引火性スプレー（防水スプレー・塗料等）は機内・預け全面禁止'
  },
  'alcohol-spirytus': {
    scanColor: 'crimson',
    materialTag: 'X線所見：ガラス瓶液体（アルコール度数96%・上限70%超過の引火性液体）',
    inspectPoint: '着眼点：アルコール度数70%を超える酒類は引火性液体（危険物）として機内・預けともに不可'
  },
  'fireworks-cracker': {
    scanColor: 'crimson',
    materialTag: 'X線所見：黒色火薬・発火薬充填チューブ（火薬類反応あり）',
    inspectPoint: '着眼点：手持ち花火やパーティー用クラッカーは「火薬類」のため少量でも全面禁止'
  },
  'strike-anywhere-match': {
    scanColor: 'crimson',
    materialTag: 'X線所見：硫化りん頭薬マッチ（摩擦発火性物質）',
    inspectPoint: '着眼点：どこで擦っても発火する硫化りんマッチ（ロウマッチ）は自然発火リスクで全面禁止'
  },
  'chlorine-bleach': {
    scanColor: 'crimson',
    materialTag: 'X線所見：強アルカリ・次亜塩素酸液体ボトル（腐食性物質マーク）',
    inspectPoint: '着眼点：塩素系漂白剤やカビ取り剤は機体金属を腐食させる危険物として機内・預け全面禁止'
  },
  'liquid-pouch-intl': {
    scanColor: 'amber',
    materialTag: 'X線所見：1L透明ジッパー袋内に小型ボトル×3本（各100ml以下）',
    inspectPoint: '着眼点：100ml以下の容器＋1L透明ジッパー袋1袋に収まっていれば国際線の機内も預けもOK'
  },
  'spray-deodorant': {
    scanColor: 'amber',
    materialTag: 'X線所見：人体用医薬部外品スプレー缶（200ml・1容器500ml以下）',
    inspectPoint: '着眼点：肌・髪用の化粧品・医薬品スプレー（1容器500ml以下）は国内線機内も預けもOK'
  },
  'hair-iron-corded': {
    scanColor: 'cyan',
    materialTag: 'X線所見：ヒータープレート＋AC電源コードのみ（内蔵電池なし）',
    inspectPoint: '着眼点：リチウム電池やガスを内蔵しない「コンセント電源コード式」は機内も預けも自由'
  },
  'wine-bottle-domestic': {
    scanColor: 'amber',
    materialTag: 'X線所見：ガラス瓶飲料（750ml・アルコール度数15%・24%以下）',
    inspectPoint: '着眼点：アルコール度数24%以下のワイン・日本酒・ビールは国内線なら機内も預けもOK'
  },
  'nail-clipper-shaver': {
    scanColor: 'cyan',
    materialTag: 'X線所見：てこ式爪切り（ナイフ刃なし）＋安全ガード付きT字カミソリ',
    inspectPoint: '着眼点：ナイフ刃のない一般的な爪切りや安全ガード付きT字カミソリは機内も預けもOK'
  },
  'eyedrops-medicine': {
    scanColor: 'amber',
    materialTag: 'X線所見：小型点眼薬ボトル（15ml）＋PTP錠剤シート',
    inspectPoint: '着眼点：目薬（100ml以下）や機内で必要な常備薬・処方薬は機内持ち込みも預け入れもOK'
  }
};

for (const item of ITEMS) {
  item.xray = XRAY_BY_ID[item.id] || {
    scanColor: 'cyan',
    materialTag: `X線所見：${item.spec}`,
    inspectPoint: `着眼点：${item.ruleBadge}`
  };
}

/**
 * アイテムのX線スキャン所見を取得する純関数
 * @param {object} item
 */
export function getXrayTelemetry(item) {
  if (!item) return null;
  return item.xray || XRAY_BY_ID[item.id] || {
    scanColor: 'cyan',
    materialTag: `X線所見：${item.spec || ''}`,
    inspectPoint: `着眼点：${item.ruleBadge || ''}`
  };
}

/**
 * IDからアイテムを取得する
 * @param {string} id
 */
export function getItemById(id) {
  return ITEMS.find((item) => item.id === id) || null;
}

/**
 * カテゴリと検索文字列でアイテムを絞り込む純関数
 * @param {object} params
 * @param {string} [params.category='all']
 * @param {string} [params.query='']
 */
export function filterItems({ category = 'all', query = '' } = {}) {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  return ITEMS.filter((item) => {
    if (category !== 'all' && item.category !== category) return false;
    if (!normalizedQuery) return true;
    const haystack = `${item.name} ${item.spec} ${item.ruleBadge} ${item.shortReason} ${item.detailRule}`.toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}
