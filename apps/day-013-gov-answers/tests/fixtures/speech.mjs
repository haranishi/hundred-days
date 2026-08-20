/* 国会会議録APIの応答を模した固定データ。
   本物は毎回中身が変わるうえ、上流の都合でCIが落ちるのでE2Eからは繋がない。
   「政府だけを残す」判定を確かめたいので、政府・議員・民間参考人を意図的に混ぜてある。 */

const speech = (over) => ({
  speechID: 'x', issueID: 'y', imageKind: '会議録', searchObject: 1, session: 183,
  nameOfHouse: '衆議院', nameOfMeeting: '環境委員会', issue: '第1号',
  speaker: '名無し', speakerYomi: 'ななし', speakerGroup: null,
  speakerPosition: null, speakerRole: null,
  speech: '○政府参考人（名無し君）　お答えいたします。',
  speechURL: 'https://kokkai.ndl.go.jp/txt/000/1',
  ...over,
});

export const GOVERNMENT = [
  speech({ date: '2013-04-10', speaker: '石原伸晃', speakerPosition: '環境大臣',
           speech: '○国務大臣（石原伸晃君）　特定外来生物の防除は重要な課題と考えております。',
           speechURL: 'https://kokkai.ndl.go.jp/txt/gov/1' }),
  speech({ date: '2013-05-21', speaker: '星野一昭', speakerPosition: '環境省自然環境局長',
           speech: '○政府参考人（星野一昭君）　リストづくりを進めてございます。',
           speechURL: 'https://kokkai.ndl.go.jp/txt/gov/2' }),
  // 「環境副大臣」は「環境大臣」を含まない。所管を引けるかをここで固定する
  speech({ date: '2022-06-01', speaker: '務台俊介', speakerPosition: '環境副大臣',
           speech: '○副大臣（務台俊介君）　条件付特定外来生物の運用を開始いたします。',
           speechURL: 'https://kokkai.ndl.go.jp/txt/gov/3' }),
  speech({ date: '2022-06-02', speaker: '野村哲郎', speakerPosition: '農林水産大臣',
           nameOfMeeting: '農林水産委員会',
           speech: '○国務大臣（野村哲郎君）　水産資源への影響を注視しております。',
           speechURL: 'https://kokkai.ndl.go.jp/txt/gov/4' }),
];

export const NOT_GOVERNMENT = [
  // 質問した議員。役職欄が空で会派だけ入る
  speech({ date: '2013-04-10', speaker: '田島一成', speakerGroup: '民主党',
           speech: '○田島（一）委員　大臣にお伺いします。',
           speechURL: 'https://kokkai.ndl.go.jp/txt/mp/1' }),
  // 民間の参考人。肩書が入るので役職欄の有無だけでは政府と区別できない
  speech({ date: '2022-06-01', speaker: '外来太郎', speakerPosition: '公益財団法人日本自然保護協会保護室室長',
           speech: '○参考人（外来太郎君）　現場の実感を申し上げます。',
           speechURL: 'https://kokkai.ndl.go.jp/txt/mp/2' }),
  speech({ date: '2022-06-02', speaker: '調査花子', speakerPosition: '株式会社ニッセイ基礎研究所上席研究員',
           speech: '○参考人（調査花子君）　統計上は増加傾向にあります。',
           speechURL: 'https://kokkai.ndl.go.jp/txt/mp/3' }),
];

export const MIXED = [...GOVERNMENT, ...NOT_GOVERNMENT];

/** APIの応答の形に包む。件数だけ聞かれる1回目と、本体を返す2回目の両方に使う */
export const envelope = (records, total = records.length, start = 1) => ({
  numberOfRecords: total,
  numberOfReturn: records.length,
  startRecord: start,
  nextRecordPosition: start + records.length <= total ? start + records.length : null,
  speechRecord: records,
});
