// 低温保存の温度と、冷蔵庫を出てからの時間を扱う厚生労働省の通知。
const coldStorage = {
  label: '厚生労働省「食品衛生法施行規則及び食品、添加物等の規格基準の一部改正について」',
  url: 'https://www.mhlw.go.jp/web/t_doc?dataId=00ta6135&dataType=1&pageNo=1',
};
const parasites = {
  label: '内閣府食品安全委員会「寄生虫による食中毒にご注意ください」',
  url: 'https://www.fsc.go.jp/sonota/kiseichu_foodpoisoning2.html',
};

export default {
  intro: '釣ったフグはさばかず、持ち帰らないでください。ソウシハギや種類の分からない魚も食べないでください。刃物と生ものは自己責任で、無理のない範囲で扱ってください。\n'
    + '手順は複数の公開資料に基づく参考情報です。標準的な方法を紹介していますが、地域や流派によって異なります。魚の立体図は、形を計算して描いています。',
  items: [
    {
      id: 'anisakis', title: 'アニサキス',
      summary: '内臓は早めに取り出し、身の両面を見て、見つけた虫を取り除きます。',
      detail: [
        '生きている魚の身にも虫がいることがあります。酢、塩、しょうゆ、わさびでは死滅しません。',
        '農林水産省は、冷凍する場合は−20℃以下で、魚全体が完全に凍ってから24時間以上置くよう案内しています。',
        '食品安全委員会によると、加熱では中心60℃で1分以上、中心70℃以上なら瞬時にアニサキスが死滅します。',
      ],
      sources: [
        { label: '農林水産省「海の幸を安全に楽しむために ～アニサキスの予防～」', url: 'https://www.maff.go.jp/j/syouan/seisaku/foodpoisoning/f_encyclopedia/anisakis.html' },
        parasites,
      ],
      confidence: 'verified',
    },
    {
      id: 'kudoa', title: 'ヒラメのクドア',
      summary: 'クドアのいるヒラメを生で食べると、一時的に吐いたり下痢をしたりすることがあります。',
      detail: [
        '厚生労働省が示すクドア対策の冷凍条件は、−20℃で4時間以上です。',
        '加熱する場合は、ヒラメの中心75℃で5分以上としています。',
        'ヒラメを生で食べるときは、アニサキスの対策も確かめてください。',
      ],
      sources: [
        { label: '厚生労働省「クドアによる食中毒について」', url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000133250.html' },
        { label: '農林水産省「ヒラメを介したクドアの一種による食中毒Q&A」', url: 'https://www.maff.go.jp/j/syouan/seisaku/foodpoisoning/f_encyclopedia/kudoa_qa.html' },
        parasites,
      ],
      confidence: 'verified',
    },
    {
      id: 'histamine', title: 'ヒスタミン',
      summary: 'サバやカツオはすぐ冷やし、保冷が途切れて傷みが疑われる魚は食べません。',
      detail: [
        'アジ、イワシ、サンマでも食中毒が起きます。えらと内臓は早めに外します。',
        '厚生労働省によると、10℃でも長く置くと、菌が魚の成分からヒスタミンを作ることがあります。',
        'いったんできたヒスタミンは、魚を焼いたり煮たりしても残ります。',
      ],
      sources: [
        { label: '厚生労働省「ヒスタミンによる食中毒について」', url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000130677.html' },
      ],
      confidence: 'verified',
    },
    {
      id: 'bacteria', title: '腸炎ビブリオ（ちょうえんビブリオ）などの細菌',
      summary: '内臓を取った後は、腹の中の菌を水道水で洗い流します。',
      detail: [
        '消費者庁の基準では、冷凍していない生食用の魚の切り身は10℃以下で保存します。',
        '厚生労働省は、家庭ではできるだけ4℃以下で冷蔵するよう勧めています。',
        '下処理と刺身で包丁とまな板を分けてください。使った道具は洗剤で洗い、熱湯で消毒します。',
      ],
      sources: [
        { label: '消費者庁「食品別の規格基準・生食用鮮魚介類」', url: 'https://www.caa.go.jp/policies/policy/standards_evaluation/other/category/assets/0000126765.pdf' },
        coldStorage,
        { label: '神奈川県「腸炎ビブリオ菌」', url: 'https://www.pref.kanagawa.jp/docs/d3x/shokuhineisei/p654.html' },
        { label: '奈良県「腸炎ビブリオ食中毒を予防しよう」', url: 'https://www.pref.nara.lg.jp/n086/5031.html' },
      ],
      confidence: 'verified',
    },
    {
      id: 'toxic', title: '▲ 釣ったフグはさばかず、持ち帰りません',
      summary: '営業でフグを処理するには、都道府県の条例により、東京では原則免許、大阪では登録が必要です。',
      detail: [
        'フグなど毒のある魚のさばき方は資格が必要なため、このアプリでは扱っていません。見分けがつかない魚や、毒の有無が不明な魚はさばかないでください。',
        'ソウシハギや種類の分からない魚は食べないでください。',
        '東京都は「ふぐ取扱責任者」の免許、大阪府は「ふぐ処理登録者」としての登録を定めています。',
      ],
      sources: [
        { label: '海上保安庁「ウォーターセーフティガイド・危険な生物について」', url: 'https://www6.kaiho.mlit.go.jp/watersafety/fishing/25_fish/index.html' },
        { label: '神奈川県「『ソウシハギ』は食べないで」', url: 'https://www.pref.kanagawa.jp/docs/e8z/cnt/f6576/p535595.html' },
        { label: '東京都「東京都ふぐの取扱い規制条例」', url: 'https://www.reiki.metro.tokyo.lg.jp/reiki/reiki_honbun/g101RG00000903.html' },
        { label: '大阪府「ふぐの取扱いについて」', url: 'https://www.pref.osaka.lg.jp/o100110/shokuhin/hugu/jorei.html' },
      ],
      confidence: 'verified',
    },
    {
      id: 'hygiene', title: '刺身を扱うとき',
      summary: '刺身には生食用の魚を選び、食べる直前まで冷蔵します。',
      detail: [
        '手は石けんで洗います。内臓を出した後の腹を流水で洗い、水気を拭き取ってから魚を包みます。',
        '消費期限は、未開封のまま表示どおりに保存した場合の期限です。開封後は早めに食べます。',
        '厚生労働省は、冷蔵庫から出してから食べ終えるまでを2時間以内としています。',
        '魚をおろしてから刺身に切るまでの全国一律の時間は確認できていません。',
      ],
      sources: [
        { label: '京都府「魚の下処理方法（マアジ）」', url: 'https://www.pref.kyoto.jp/suiji/1177383498745.html' },
        { label: '農林水産省「期限表示について教えてください。」', url: 'https://www.maff.go.jp/j/heya/kodomo_sodan/0309/02.html' },
        coldStorage,
      ],
      confidence: 'partial',
    },
    {
      id: 'knife', title: '包丁とひれでのけが',
      summary: '包丁を握る前に、手と柄の水気を拭き取ります。',
      detail: [
        'まな板の下に清潔なぬれ布巾を敷き、板が動かないか確かめます。',
        '魚を押さえる指先は曲げて、刃の通り道を空けます。足立区は、包丁を置くときは刃を奥に向けるよう案内しています。',
        'ひれのとげや、アジの尾に並ぶ硬いうろこで手を切ることもあります。',
      ],
      sources: [
        { label: '足立区「あだち 食のスタンダード サポートBOOK ステップ1・包丁の使い方」', url: 'https://www.city.adachi.tokyo.jp/documents/47293/step1.pdf' },
        { label: 'ノースカロライナ州立大学ほか「Cooking Local Foods Made Simple – Using and Caring for Knives」', url: 'https://localfood.ces.ncsu.edu/wp-content/uploads/2015/04/CLFMS-Part-1-Day-2-Handouts-Knives-and-Cutting-Boards.pdf?fwd=no' },
        { label: '海上保安庁「ウォーターセーフティガイド・危険な生物について」', url: 'https://www6.kaiho.mlit.go.jp/watersafety/fishing/25_fish/index.html' },
        { label: '京都府「魚の下処理方法（マアジ）」', url: 'https://www.pref.kyoto.jp/suiji/1177383498745.html' },
      ],
      confidence: 'verified',
    },
    {
      id: 'fresh', title: '鮮度の目安と生食用の表示',
      summary: '刺身にする切り身は、買うときに「生食用」の表示を確かめます。',
      detail: [
        '千葉県が挙げる一尾の鮮度の目安は、澄んだ目、鮮やかな赤いえら、つやのある皮です。',
        '腹に張りがあるか、魚のにおいが強くないかも見ます。',
        '農林水産省によると、見た目の新鮮さだけで生食できるかは判断できません。',
      ],
      sources: [
        { label: '千葉県「鮮度の見分け方」', url: 'https://www.pref.chiba.lg.jp/suisan/mamechishiki/miwakekata.html' },
        { label: '農林水産省「新鮮なものは生で食べても大丈夫？」', url: 'https://www.maff.go.jp/j/syouan/seisaku/foodpoisoning/shinsennamono.html' },
      ],
      confidence: 'verified',
    },
  ],
  stepNotes: [
    '食用の魚は冷やしたまま持ち帰ります。',
    '作業の前後は石けんで手を洗います。',
    '濡れた包丁の柄は拭いてから握ります。',
    '刃が進む先に指を置かないでください。',
    'アジの尾の硬いうろこに注意してください。',
    '内臓は生で食べないでください。',
    '腹に残った血を流水で洗い落とします。',
    'ペーパーで魚の水気を拭き取ります。',
    '刺身を切る前に刺身用の包丁に替えます。',
    '刺身は盛り付けたらすぐに食べます。',
  ],
};
