export const GUIDE_LIMIT = 12;
export const GUIDE_STORAGE_KEY = 'day072.career-guide.v1';
export const ANSWER_OPTIONS = Object.freeze([
  { id: 'yes', label: 'かなり当てはまる', value: 2 },
  { id: 'maybe', label: '少し当てはまる', value: 1 },
  { id: 'unknown', label: 'まだ分からない', value: null },
  { id: 'unlikely', label: 'あまり当てはまらない', value: -1 },
  { id: 'no', label: '当てはまらない', value: -2 },
]);

export const AXES = Object.freeze([
  { id: 'care', label: '相手に寄り添う', title: '誰かの変化を、そばで支える', phrase: '相手の話を聞き、一人ひとりの変化を支えられる', check: '相手と継続して関わり、反応を受け取れるか', question: '利用者やお客さまと、どのくらい継続して関われますか？', short: '人の変化' },
  { id: 'improve', label: '仕組みを改善する', title: '困りごとを、仕組みから変える', phrase: '課題の原因を考え、仕組みや手順を改善できる', check: '現場の困りごとを見つけ、改善を試せるか', question: '若手が気づいた課題から、仕事の進め方を変えた例はありますか？', short: '仕組みの改善' },
  { id: 'create', label: 'アイデアを形にする', title: '考えたものを、形にして届ける', phrase: 'アイデアを商品や表現の形にして届けられる', check: '企画から実現まで、どの部分を担当できるか', question: '入社後は、企画から完成までのどの工程に関われますか？', short: '形にすること' },
  { id: 'connect', label: '人をつなぎ、提案する', title: '人と人のあいだに、可能性をつくる', phrase: '異なる立場の人の話を聞き、提案や協力につなげられる', check: '誰と関わり、どんな調整や提案をするか', question: '普段はどんな立場の方と関わり、何を調整する仕事ですか？', short: '人をつなぐこと' },
  { id: 'mastery', label: '専門性を磨く', title: '知るほどに、できることを増やす', phrase: '一つの分野を深く学び、専門性を積み重ねられる', check: '学んだ知識を仕事に使い、継続して深められるか', question: '最初の数年で、どんな専門知識や経験を身につけられますか？', short: '深く学ぶこと' },
  { id: 'sustain', label: '日常を着実に支える', title: '当たり前が続くように、支える', phrase: '正確さや継続的な運営で、人の暮らしを支えられる', check: '日々の確認や運営が、誰の生活を支えているか', question: '日々の正確な仕事が、利用者のどんな当たり前につながりますか？', short: '日常を支えること' },
]);

// 既存の検査から転載しない。後半は同じ観点を別の具体場面で確かめる。
const prompts = {
  care: [
    '困っている人の話を聞いて、一緒に次の一歩を考えることに、やりがいを感じそうですか？',
    '同じ相手と関わり続けて、少しずつできることが増えるのを支える仕事に興味がありますか？',
    '何かを教えたり、相手が安心できるように手助けする役割を、やってみたいですか？',
  ],
  improve: [
    '面倒な作業に出会うと、手順や仕組みを変えて楽にする方法を考えたくなりますか？',
    '問題の原因を調べて、小さく試しながら改善を重ねる仕事を、やってみたいですか？',
    'データや利用者の声から「どこを変えたらよいか」を考える仕事に興味がありますか？',
  ],
  create: [
    'まだないアイデアを、商品・文章・イベントなどの形にする仕事に、わくわくしますか？',
    '伝え方や見せ方を工夫して、自分たちの企画を誰かに届ける仕事に興味がありますか？',
    '完成したものを見て「ここに自分の工夫が入っている」と感じられる仕事をしたいですか？',
  ],
  connect: [
    '立場の違う人の話を聞き、みんなが動ける提案にまとめる役割を、やってみたいですか？',
    '相手の希望を聞き、合いそうな商品や協力相手を探して提案する仕事に興味がありますか？',
    '一人で完結する作業より、人と相談・交渉しながら進める場面に、やりがいを感じそうですか？',
  ],
  mastery: [
    '一つのテーマを深く調べて、自分の得意分野を育てていくことに、楽しさを感じますか？',
    'すぐに答えが出なくても、専門知識を学び続けて難しい課題に取り組む仕事をしたいですか？',
    '新しい知識や技術を身につけ、それを使ってできることを増やせる仕事に興味がありますか？',
  ],
  sustain: [
    '毎日の確認や段取りで、誰かの暮らしが滞りなく続くことを支える仕事に、やりがいを感じそうですか？',
    '目立つ成果だけでなく、ミスやトラブルを防いで安定した運営を守ることも、大切にしたいですか？',
    '決まった手順や予定を丁寧に守り、必要なものを確実に届ける仕事に興味がありますか？',
  ],
};
export const GUIDE_QUESTIONS = Object.freeze(AXES.flatMap(axis => prompts[axis.id].map((text, index) => ({
  id: axis.id + ['-first', '-deepen', '-explore'][index], axis: axis.id, text,
  hint: index === 0 ? '経験の有無より、「やってみたいか」で選んでください。' : 'さっきと少し違う場面を、思い浮かべてみましょう。',
}))));

// 仕事例は公的な職業解説で確認。観点の重みはこのアプリ独自の編集判断。
export const INDUSTRIES = Object.freeze([
  { id: 'education', name: '教育・人材', description: '学びや仕事選びを通じて、人の次の一歩を支える分野。', jobs: '学習支援、研修企画、キャリア支援', weights: { care: 3, connect: 1, mastery: 1 }, check: '支援する相手、関わる期間、成果の捉え方を確かめよう。', source: 136, sourceLabel: 'キャリア支援の仕事内容' },
  { id: 'it', name: 'IT・Web', description: 'デジタルの仕組みやサービスで、使う人の困りごとを解く分野。', jobs: 'システム開発、ITコンサルティング、サービスの運用', weights: { improve: 3, mastery: 2, create: 1 }, check: '開発・提案・運用のどこを担当するか、学ぶ支援があるかを確かめよう。', source: 362, sourceLabel: 'ITで課題を解く仕事の例' },
  { id: 'maker', name: 'メーカー', description: '製品の企画や開発、生産を通じて、使えるものを社会に届ける分野。', jobs: '製品開発、生産技術、品質の管理', weights: { create: 2, mastery: 2, improve: 1, sustain: 1 }, check: '扱う製品、必要な専攻、企画・開発・生産の配属条件を確かめよう。', source: 273, sourceLabel: '製品開発・生産技術の仕事の例' },
  { id: 'media', name: '広告・メディア', description: '企画や表現を通じて、人に情報や商品の価値を届ける分野。', jobs: '広告企画、制作の進行、コンテンツ制作', weights: { create: 3, connect: 2 }, check: '企画・制作・営業の役割と、納期前の働き方を確かめよう。', source: 333, sourceLabel: '広告制作の仕事内容' },
  { id: 'consulting', name: 'コンサルティング', description: '相手の課題を整理し、調査や提案で変化を後押しする分野。', jobs: '課題調査、業務改善の提案、実行の支援', weights: { improve: 3, connect: 2, mastery: 1 }, check: '提案の後まで関われるか、担当する領域と働き方を確かめよう。', source: 81, sourceLabel: '経営課題を扱う仕事の例' },
  { id: 'welfare', name: '医療・福祉', description: '人の生活や健康を支えるサービスと、その運営に関わる分野。', jobs: '相談支援、生活の支援、サービスの運営', weights: { care: 3, sustain: 2, mastery: 1 }, check: '職種ごとの資格・配属条件、支援の範囲や勤務時間を確かめよう。', source: 409, sourceLabel: '相談支援の内容・資格を調べる' },
  { id: 'logistics', name: '物流', description: 'ものが必要な場所へ届くよう、日々の流れを支える分野。', jobs: '物流の管理、出荷の調整、現場の改善', weights: { sustain: 3, improve: 1, connect: 1 }, check: '現場と企画の比重、勤務地、時間帯を含む勤務条件を確かめよう。', source: 542, sourceLabel: '物流を管理する仕事の例' },
  { id: 'retail', name: '商社・小売', description: '仕入先や買う人をつなぎ、求められる商品を届ける分野。', jobs: '仕入れ、商品企画、販売や取引先への提案', weights: { connect: 3, create: 1, sustain: 1 }, check: '店舗・仕入れ・法人営業など、最初に担う役割を確かめよう。', source: 544, sourceLabel: '仕入れ・商品企画の仕事内容' },
]);
