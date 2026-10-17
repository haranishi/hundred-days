// 2026年（令和8年分。住民税は令和9年度）の年収の壁の基準。数字はここにだけ置き、画面の数字もここから組み立てる。
// 出どころと照合の記録は .kiro/specs/day-069-nenshu-kabe/research.md（2026-10-17確認）。
// 照合できなかった数字（源泉徴収税額表の0円の上限など）は入れない。

export const META = {
  year: 2026,
  label: '2026年（令和8年分。住民税は令和9年度）',
  checkedOn: '2026-10-17',
  checkedOnLabel: '2026年10月17日',
};

// 給与所得：給与収入Rが741,000円未満なら0、741,000円以上2,191,000円未満なら R − 740,000（国税庁 No.1410 の注2の表）。
// このアプリが扱う壁はすべてこの範囲に入るので、基準は「所得の基準 ＋ 740,000円」で給与収入に直せる。
export const SALARY_DEDUCTION = { min: 740_000, zeroBelow: 741_000, linearBelow: 2_191_000 };

// 年齢は2026年12月31日時点。学年ではない
export const AGE_BANDS = [
  { id: 'u18', label: '16〜17歳' },
  { id: 'a18', label: '18歳' },
  { id: 'a19_22', label: '19〜22歳' },
  { id: 'a23p', label: '23歳以上' },
];

const CHECKED = META.checkedOn;

// 出典。exact: true は、ページの実際の題名を確かめたもの（画面では「」で囲む）。false は作者が付けた説明（「」で囲まない）
export const SOURCES = {
  nta1800: { publisher: '国税庁', title: 'No.1800 パート収入はいくらまで所得税がかからないか', url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1800.htm', checkedOn: CHECKED, exact: true },
  nta1410: { publisher: '国税庁', title: 'No.1410 給与所得控除', url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1410.htm', checkedOn: CHECKED, exact: true },
  nta1180: { publisher: '国税庁', title: 'No.1180 扶養控除', url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1180.htm', checkedOn: CHECKED, exact: true },
  nta1177: { publisher: '国税庁', title: 'No.1177 特定親族特別控除', url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1177.htm', checkedOn: CHECKED, exact: true },
  nta1175: { publisher: '国税庁', title: 'No.1175 勤労学生控除', url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1175.htm', checkedOn: CHECKED, exact: true },
  nta2026: { publisher: '国税庁', title: '源泉所得税の改正のあらまし（令和8年4月）', url: 'https://www.nta.go.jp/publication/pamph/gensen/2026kaisei.pdf', checkedOn: CHECKED, exact: true },
  ntaNencho: { publisher: '国税庁', title: '令和8年分の年末調整に関するQ&A（問2）', url: 'https://www.nta.go.jp/publication/pamph/gensen/nencho2026/qa.htm', checkedOn: CHECKED, exact: false },
  kobe: { publisher: '神戸市', title: '2027年度（令和9年度）からの住民税の主な改正内容', url: 'https://www.city.kobe.lg.jp/a83576/kurashi/tax/shikenminze/r9kaisei.html', checkedOn: CHECKED, exact: true },
  nagano: { publisher: '長野市', title: '令和9年度課税の個人市民税・県民税(住民税)控除の種類', url: 'https://www.city.nagano.nagano.jp/n062000/contents/p005573.html', checkedOn: CHECKED, exact: true },
  karuizawa: { publisher: '軽井沢町', title: '個人住民税', url: 'https://www.town.karuizawa.lg.jp/page/1060.html', checkedOn: CHECKED, exact: true },
  kasugai: { publisher: '春日井市', title: '学生でも市民税・県民税はかかりますか？', url: 'https://www.city.kasugai.lg.jp/faq/1000411/1000412/1000879.html', checkedOn: CHECKED, exact: true },
  nenkinDep: { publisher: '日本年金機構', title: '従業員（健康保険・厚生年金保険の被保険者）が家族を被扶養者にするとき、被扶養者に異動があったときの手続き', url: 'https://www.nenkin.go.jp/service/kounen/tekiyo/hihokensha1/20141202.html', checkedOn: CHECKED, exact: true },
  nenkinContract: { publisher: '日本年金機構', title: '労働契約内容による年間収入での被扶養者の認定の取り扱いについて', url: 'https://www.nenkin.go.jp/oshirase/taisetu/jigyosho/2026/202605/0501.html', checkedOn: CHECKED, exact: true },
  nenkinShaho: { publisher: '日本年金機構', title: '2026（令和8）年10月に社会保険の短時間労働者に係る賃金要件が撤廃されました', url: 'https://www.nenkin.go.jp/oshirase/taisetu/jigyosho/2026/202610/100104.html', checkedOn: CHECKED, exact: true },
  pdl: { publisher: 'デジタル庁', title: '公共データ利用規約（第1.0版）', url: 'https://www.digital.go.jp/resources/open_data/public_data_license_v1.0', checkedOn: CHECKED, exact: true },
};

const UNIT_CALENDAR = '2026年1〜12月に支払われた給与の合計で決まります';
const UNIT_RESIDENT = '2026年1〜12月に支払われた給与の合計で決まり、2027年度の住民税になります';
const WINDOW_RESIDENT = '2027年1月1日に住んでいる市区町村の住民税の担当';
const WINDOW_PARENT = '親の勤務先（年末調整）・税務署';

/* 税金の壁。基準はすべて給与収入の「以下」。incomeLimit は所得の基準で、threshold ＝ incomeLimit ＋ 740,000円。
   applies：対象の年齢区分（ageBands）と、学生だけか（studentOnly）。
   variants：条件に合うと上書きする項目（上から順に当てる）。
   prev2025：2025年の基準。照合記録で確かめたものだけ（ほかは null）。changeLabel：「2025年からの変化」で使う名前 */
export const TAX_WALLS = [
  {
    id: 'resident-flat',
    title: '本人に住民税がかかり始める',
    who: 'self',
    kind: 'cliff',
    boundary: 'lte',
    incomeLimit: 450_000,
    threshold: 1_190_000,
    rangeLow: { incomeLimit: 380_000, threshold: 1_120_000 },
    rangeNote: '均等割の基準は、1級地の市区町村で119万円、2級地で115.5万円、3級地で112万円です（標準の基準。条例で違う市区町村もあります）。',
    applies: { ageBands: ['a18', 'a19_22', 'a23p'], studentOnly: false },
    prev2025: 1_100_000,
    changeLabel: '本人の住民税がかからない上限（単身・1級地）',
    effect: '越えると、あなたに住民税がかかり始めます。均等割（所得にかかわらない定額の部分）と森林環境税は112万〜119万円（住んでいる市区町村で違う）を超えるとかかり、所得割（所得に応じた部分）は119万円を超えるとかかります。',
    variants: [
      {
        when: { student: true },
        title: '本人に住民税の均等割がかかり始める',
        effect: '越えると、あなたに住民税の均等割（所得にかかわらない定額の部分）と森林環境税がかかり始めます。所得割（所得に応じた部分）は、勤労学生控除を受けると143万円まで0円です。',
      },
    ],
    unit: UNIT_RESIDENT,
    window: WINDOW_RESIDENT,
    formula: '給与収入から給与所得控除74万円を引いた額（合計所得）で決まります。扶養する家族がいない人は、均等割が1級地で45万円以下（給与119万円以下）、2級地で41.5万円以下（給与115.5万円以下）、3級地で38万円以下（給与112万円以下）、所得割が45万円以下（給与119万円以下）ならかかりません。',
    sources: ['kobe', 'karuizawa'],
  },
  {
    id: 'resident-minor',
    title: '本人に住民税がかかり始める（未成年者）',
    who: 'self',
    kind: 'cliff',
    boundary: 'lte',
    incomeLimit: 1_350_000,
    threshold: 2_090_000,
    applies: { ageBands: ['u18'], studentOnly: false },
    prev2025: null,
    effect: '2027年1月1日時点で18歳未満なら、2026年の給与が209万円以下のあいだ、住民税（均等割・所得割）はかかりません。越えるとかかり始めます。',
    unit: UNIT_RESIDENT,
    window: WINDOW_RESIDENT,
    formula: '給与収入から給与所得控除74万円を引いた合計所得が135万円以下（給与209万円以下）なら、未成年者には住民税がかかりません。2027年1月1日に18歳になる人（2009年1月2日生まれ）は、この特例の対象外です。',
    sources: ['kasugai', 'karuizawa', 'kobe'],
  },
  {
    id: 'resident-income-student',
    title: '本人に住民税の所得割がかかり始める',
    who: 'self',
    kind: 'cliff',
    boundary: 'lte',
    incomeLimit: 690_000,
    threshold: 1_430_000,
    applies: { ageBands: ['a18', 'a19_22', 'a23p'], studentOnly: true },
    prev2025: null,
    effect: '越えると、住民税の所得割（所得に応じた部分）がかかり始めます。この基準は勤労学生控除を受けた場合で、受けないときは119万円を超えたところからです。',
    note: '勤労学生控除は、勤務先に出す扶養控除等申告書に書くか、確定申告をして受けます。学校の種類や、勤労以外の所得が10万円以下であることなどの条件があります。',
    unit: UNIT_RESIDENT,
    window: `${WINDOW_RESIDENT}（勤労学生控除の申告は勤務先か税務署）`,
    formula: '給与収入から給与所得控除74万円・住民税の基礎控除43万円・勤労学生控除26万円を引いた額が0円以下なら、所得割はかかりません（給与143万円以下）。',
    sources: ['nagano', 'kobe', 'nta1175'],
  },
  {
    id: 'parent-dependent',
    title: '親の扶養控除がなくなる',
    who: 'parent',
    kind: 'cliff',
    boundary: 'lte',
    incomeLimit: 620_000,
    threshold: 1_360_000,
    applies: { ageBands: ['u18', 'a18', 'a19_22', 'a23p'], studentOnly: false },
    prev2025: 1_230_000,
    changeLabel: '親の扶養親族になれる上限',
    effect: '越えると、親は扶養控除（所得税38万円・住民税33万円）を受けられなくなります。親の税金がいくら増えるかは、親の収入によって違います。',
    variants: [
      {
        when: { ageBand: 'a19_22' },
        kind: 'switch',
        title: '親の控除の種類が切り替わる',
        effect: '越えても、親の控除額は変わりません（所得税63万円・住民税45万円のまま）。控除の種類が特定扶養控除から特定親族特別控除に変わり、親の年末調整や確定申告での手続きが変わります。',
      },
    ],
    unit: UNIT_CALENDAR,
    window: WINDOW_PARENT,
    formula: '給与収入から給与所得控除74万円を引いた子の合計所得が62万円以下（給与136万円以下）なら、親の扶養親族になります。',
    sources: ['nta1180', 'nta2026'],
  },
  {
    id: 'parent-income-tax-full',
    title: '親の所得税の控除が減り始める',
    who: 'parent',
    kind: 'step',
    boundary: 'lte',
    incomeLimit: 850_000,
    threshold: 1_590_000,
    applies: { ageBands: ['a19_22'], studentOnly: false },
    prev2025: 1_500_000,
    changeLabel: '親の所得税の控除63万円が続く上限（19〜22歳）',
    effect: '越えると、親の所得税の控除（特定親族特別控除）が63万円から段階的に減ります（164万円以下は61万円、169万円以下は51万円など）。親の税金がいくら増えるかは、親の収入によって違います。',
    unit: UNIT_CALENDAR,
    window: WINDOW_PARENT,
    formula: '子の合計所得（給与収入−74万円）が85万円以下（給与159万円以下）なら、親の所得税の控除は63万円です。',
    sources: ['nta1177', 'nta2026'],
  },
  {
    id: 'work-student-limit',
    title: '勤労学生控除が受けられなくなる',
    who: 'self',
    kind: 'cliff',
    boundary: 'lte',
    incomeLimit: 890_000,
    threshold: 1_630_000,
    applies: { ageBands: ['a18', 'a19_22', 'a23p'], studentOnly: true },
    prev2025: 1_500_000,
    changeLabel: '勤労学生控除を受けられる上限（学生）',
    effect: '越えると、あなたは勤労学生控除を受けられなくなり、住民税の所得割を計算するときに差し引ける26万円がなくなります。所得税は、給与のほかに所得がなければ178万円以下でかかりません。',
    unit: UNIT_CALENDAR,
    window: '勤務先（年末調整）・税務署・市区町村',
    formula: '合計所得（給与収入−74万円）が89万円以下（給与163万円以下）で、学校の種類や勤労以外の所得などの条件を満たすと、勤労学生控除を受けられます。',
    sources: ['nta1175', 'nta2026', 'kobe'],
  },
  {
    id: 'parent-resident-full',
    title: '親の住民税の控除が減り始める',
    who: 'parent',
    kind: 'step',
    boundary: 'lte',
    incomeLimit: 950_000,
    threshold: 1_690_000,
    applies: { ageBands: ['a19_22'], studentOnly: false },
    prev2025: null,
    effect: '越えると、親の住民税の控除（特定親族特別控除）が45万円から段階的に減ります（174万円以下は41万円、179万円以下は31万円など）。',
    unit: UNIT_RESIDENT,
    window: '親が住んでいる市区町村の住民税の担当',
    formula: '子の合計所得（給与収入−74万円）が95万円以下（給与169万円以下）なら、親の住民税の控除は45万円です。',
    sources: ['nagano'],
  },
  {
    id: 'self-income-tax',
    title: '本人に所得税がかかり始める',
    who: 'self',
    kind: 'cliff',
    boundary: 'lte',
    incomeLimit: 1_040_000,
    threshold: 1_780_000,
    applies: { ageBands: ['u18', 'a18', 'a19_22', 'a23p'], studentOnly: false },
    prev2025: 1_600_000,
    changeLabel: '本人の所得税がかからない上限（給与のみ）',
    effect: '越えると、あなたに所得税がかかり始めます（給与のほかに所得がない場合）。毎月の給料から引かれた所得税は、1年の給与が178万円以下でほかに所得がなければ、年末調整（12月に勤めていて扶養控除等申告書を出した勤務先で行う）か確定申告で戻ります。',
    unit: UNIT_CALENDAR,
    window: '勤務先（年末調整）・税務署',
    formula: '給与収入から給与所得控除74万円と基礎控除104万円を引いた額が0円以下なら、所得税はかかりません（給与178万円以下。ほかに所得がない場合）。',
    sources: ['nta1800', 'nta1410', 'nta2026'],
  },
  {
    id: 'parent-zero',
    title: '親の特定親族特別控除がなくなる',
    who: 'parent',
    kind: 'cliff',
    boundary: 'lte',
    incomeLimit: 1_230_000,
    threshold: 1_970_000,
    applies: { ageBands: ['a19_22'], studentOnly: false },
    prev2025: 1_880_000,
    changeLabel: '親の特定親族特別控除を受けられる上限（19〜22歳）',
    effect: '越えると、親は特定親族特別控除を受けられなくなります（194万円超〜197万円以下の段では、所得税・住民税とも3万円）。',
    unit: UNIT_CALENDAR,
    window: WINDOW_PARENT,
    formula: '子の合計所得（給与収入−74万円）が123万円を超える（給与197万円を超える）と、親の控除は0円です。',
    sources: ['nta1177', 'nagano'],
  },
];

/* 親の控除額（子の給与収入ごと）。upTo 以下ならその額。最後の段を超えると0円。
   19〜22歳は所得税・住民税で段が違う。ほかの年齢区分は136万円以下だけ控除がある（崖） */
export const PARENT_DEDUCTION = {
  a19_22: {
    incomeTax: [
      { upTo: 1_360_000, amount: 630_000, name: '特定扶養控除' },
      { upTo: 1_590_000, amount: 630_000, name: '特定親族特別控除' },
      { upTo: 1_640_000, amount: 610_000, name: '特定親族特別控除' },
      { upTo: 1_690_000, amount: 510_000, name: '特定親族特別控除' },
      { upTo: 1_740_000, amount: 410_000, name: '特定親族特別控除' },
      { upTo: 1_790_000, amount: 310_000, name: '特定親族特別控除' },
      { upTo: 1_840_000, amount: 210_000, name: '特定親族特別控除' },
      { upTo: 1_890_000, amount: 110_000, name: '特定親族特別控除' },
      { upTo: 1_940_000, amount: 60_000, name: '特定親族特別控除' },
      { upTo: 1_970_000, amount: 30_000, name: '特定親族特別控除' },
    ],
    residentTax: [
      { upTo: 1_360_000, amount: 450_000, name: '扶養控除（特定扶養親族）' },
      { upTo: 1_690_000, amount: 450_000, name: '特定親族特別控除' },
      { upTo: 1_740_000, amount: 410_000, name: '特定親族特別控除' },
      { upTo: 1_790_000, amount: 310_000, name: '特定親族特別控除' },
      { upTo: 1_840_000, amount: 210_000, name: '特定親族特別控除' },
      { upTo: 1_890_000, amount: 110_000, name: '特定親族特別控除' },
      { upTo: 1_940_000, amount: 60_000, name: '特定親族特別控除' },
      { upTo: 1_970_000, amount: 30_000, name: '特定親族特別控除' },
    ],
    sources: ['nta1177', 'nagano', 'nta2026'],
  },
  general: {
    incomeTax: [{ upTo: 1_360_000, amount: 380_000, name: '扶養控除' }],
    residentTax: [{ upTo: 1_360_000, amount: 330_000, name: '扶養控除' }],
    sources: ['nta1180', 'nagano'],
  },
};

// 健康保険の扶養。判定の単位が税金と違う（将来の見込み）ので、税金の壁とは別に持つ。基準は「未満」
export const HEALTH = {
  title: '健康保険の扶養',
  bands: {
    a19_22: {
      annualLimit: 1_500_000,
      boundary: 'lt',
      monthlyMax: 124_999,
      annualLabel: '年150万円未満',
      monthlyLabel: '月12万5千円未満',
      prev2025: 1_300_000,
      changeLabel: '健康保険の扶養の年収の基準（19〜22歳）',
      note: '19歳以上23歳未満（2026年12月31日時点。配偶者を除く）の基準です。2025年10月1日から、130万円未満が150万円未満になりました。',
    },
    general: {
      annualLimit: 1_300_000,
      boundary: 'lt',
      monthlyMax: 108_333,
      annualLabel: '年130万円未満',
      monthlyLabel: '月108,333円以下',
      prev2025: null,
      note: '19〜22歳以外の基準です（60歳以上などの別の基準は対象外）。',
    },
  },
  judgment: '健康保険の扶養は、1〜12月の合計ではなく、認定の時点から先1年間の収入の見込みで判定されます。そのため、ここでは年内の残り金額を出さず、月額の目安と比べます。',
  compareNote: '給料日1回分を1か月分とみなして、月額の目安と比べています（週払いなどには当てはまりません）。',
  contract: '2026年4月から、労働条件通知書などに書かれた時給・時間・手当・賞与から見込みを出す方法もあります。契約期間が1年未満、「シフト制による」など労働時間が書かれていない、「通勤手当有」など手当の金額が書かれていない場合は、この方法は使えません。',
  checkWith: [
    '年収の基準のほか、親と同居なら親の収入の半分未満、別居なら親からの仕送りの額より少ないことなども条件です。',
    '通勤手当を収入に含めるかどうかは、加入先の健康保険で確かめてください。',
    '親が国民健康保険に入っている場合、国民健康保険には扶養という仕組みがありません。',
  ],
  effect: '扶養から外れると、あなたが自分で健康保険（国民健康保険など）に入ることになり、保険料がかかります。',
  window: '親が入っている健康保険（健康保険組合・協会けんぽなど）',
  sources: ['nenkinDep', 'nenkinContract'],
};

export const NOTES = {
  disclaimer: '給与（アルバイト・パート）だけの人を対象に、公表された基準額と入力した数字との差を計算した概算です。税額や扶養の認定を確定するものではありません。作者は税理士・社会保険労務士ではなく、個別の相談には応じていません。',
  timeNote: '時間は、差額を時給だけで割った目安です（1時間未満は切り捨て）。手当や端数の処理で変わり、この時間まで働けることを保証するものではありません。',
  paydayRule: '給料は、支払われた日（振り込まれた日）で年を数えます。12月の勤務分が2027年1月に支払われるなら、2027年の分です。掛け持ちしている人は、すべての勤務先の分を合計してください。',
  ageRule: '年齢は学年ではなく、2026年12月31日時点の年齢で決まります。大学1年生でも、12月31日にまだ18歳なら「18歳」を選んでください。2009年1月2日生まれの人は、2027年1月1日に18歳になり住民税の未成年者の特例を使えないため、「18歳」を選んでください。',
  privacy: '入力した数字は、この端末の外へ送りません。',
  scope: '業務委託など、給与以外の所得がある人には、この計算は当てはまりません。',
  yearBanner2027: 'この計算は2026年分の制度です。2027年分には対応していません。',
  unofficial: '個人の大学生が作った非公式のアプリです。国・自治体・健康保険の運営者とは関係ありません。',
  attribution: '各基準は、下の出典をもとに作者が要約し、計算に使っています。官公庁の資料は公共データ利用規約（第1.0版）に沿って利用しています。',
  contact: 'アプリの不具合や表示の誤りは、GitHubのIssueで受け付けています。Issueは公開されるので、給料などの金額は書かないでください。個別の税金・扶養の相談には応じられません。',
  contactUrl: 'https://github.com/haranishi/hundred-days/issues',
  saveNote: '保存をオンにすると、このブラウザにだけ保存します。削除ボタンか、ブラウザのサイトデータの削除で消えます。共用の端末では保存しないでください。',
  windowsForOther: '入力だけでは当てはめられない事情があるときは、勤務先・税務署・市区町村・健康保険の窓口で確かめてください。',
};

// 参考（壁ではないが、よく誤解される点）
export const REFERENCES = [
  {
    id: 'withholding',
    title: '毎月引かれた所得税',
    body: '毎月の給料から所得税が引かれていても、1年の給与が178万円以下でほかに所得がなければ、年末調整（12月に勤めていて扶養控除等申告書を出した勤務先で行う）か確定申告で戻ります。2026年分の基準の引き上げは、2026年12月の年末調整でまとめて反映されます。掛け持ちの2か所目で引かれた分は、確定申告で精算します。',
    sources: ['nta1800', 'nta2026'],
  },
  {
    id: 'work-insurance',
    title: '勤務先の社会保険',
    body: '勤務先の健康保険・厚生年金に入るかどうかは、年収ではなく働き方で決まります。週20時間以上・従業員51人以上の勤め先などの条件で入る「短時間労働者」の加入は、昼間の学生には原則として当てはまりません（夜間・通信制などは例外があります）。正社員と同じくらい働く場合は、学生でも加入することがあります。月8.8万円の賃金の条件は、2026年10月1日になくなりました。',
    sources: ['nenkinShaho'],
  },
  {
    id: 'family-allowance',
    title: '親の勤務先の家族手当',
    body: '家族手当・扶養手当は会社ごとの決まりで、基準も会社によって違います。税金や健康保険の基準が変わっても、同じように変わるとは限りません。',
    sources: [],
  },
  {
    id: 'payday',
    title: '12月分の給料',
    body: '12月の勤務分を翌年1月に支払う場合、その給料は2026年の年末調整には含まれず、2027年の分になります。',
    sources: ['ntaNencho'],
  },
];

export const GLOSSARY = [
  { term: '給与所得控除', desc: '給与収入から自動で差し引かれる額。2026年分は最低74万円です。' },
  { term: '合計所得', desc: '給与だけの人は、給与収入から給与所得控除を引いた額です。' },
  { term: '均等割', desc: '住民税のうち、所得にかかわらず定額でかかる部分です。' },
  { term: '所得割', desc: '住民税のうち、所得に応じてかかる部分です。' },
  { term: '扶養控除', desc: '家族を養っている人（親など）の所得から差し引く額。19〜22歳の子の分は「特定扶養控除」で、額が大きくなります。' },
  { term: '特定親族特別控除', desc: '19〜22歳の子の給与が136万円を超えても、197万円以下なら親が受けられる控除です（2025年分からの制度）。' },
  { term: '勤労学生控除', desc: '働いている学生本人の所得から差し引く額（所得税27万円・住民税26万円）。条件を満たし、申告すると受けられます。' },
  { term: '被扶養者', desc: '親などが入っている健康保険に、保険料を払わずに入れる家族のことです。' },
];

// 初めて開いたときの例（架空の数字）。住民税の均等割を「予定どおりだと越える」が見える組み合わせ
export const EXAMPLE = {
  ageBand: 'a19_22',
  student: true,
  paidSoFar: 1_030_000,
  hourlyWage: 1_200,
  remainingPaydays: 3,
  hoursPerPayday: 85,
};

// 入力の上限（要件1.5）。下限：金額0円以上、時給1円以上、回数0回以上、時間0時間以上
export const LIMITS = {
  paidSoFar: { min: 0, max: 10_000_000 },
  hourlyWage: { min: 1, max: 10_000 },
  remainingPaydays: { min: 0, max: 12 },
  hoursPerPayday: { min: 0, max: 400 },
};
