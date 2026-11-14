import type { Source } from './types';

/**
 * 数字と単語の出典の登録簿（numbers.ts・words.ts の sources はここの id を参照する）。
 * 元は調査 r2（.agent-harness/research/r2_numbers_words.json・r2_numbers_words_notes.md）と、
 * 数字の形を目で照合した2つの表（神奈川県 p.15・前橋市 p.12。図はアプリに入れず、リンクだけを出典に載せる）。
 *
 * sources.ts（指文字の担当）と同じ資料を指すものがある。統合するときに1つにまとめてよい:
 *  - kanagawa-num ≒ kanagawa-2025（同じ冊子。こちらは数字の p.15）
 *  - maebashi-num ≒ maebashi-panf（同じ PDF の同じ p.12。こちらは数字の欄）
 *  - iwate-aisatsu ≒ iwate（同じ PDF。こちらは「色々なあいさつ」の欄）
 * id は sources.ts と重ならない名前にしてある。
 */
// 数字・単語の調査（r2）の出典。指文字と同じ資料（神奈川県・前橋市の表、岩手県のあいさつ）は sources.ts の ID を使う
export const SOURCES_EXTRA: Source[] = [
  // 数字の表（形の目視照合に使った2つ）
  // 数字の文章の資料
  {
    id: 'baika-suuji',
    title: '3Dモデルで学ぶ手話：数字',
    url: 'https://mv.baika.ac.jp/imamura/www/suuji.html',
    publisher: '岸本あゆみ（梅花女子大学のサイトの教材）',
  },
  {
    id: 'baika-yubimoji',
    title: '3Dモデルで学ぶ手話：指文字',
    url: 'https://mv.baika.ac.jp/imamura/www/yubimoji.html',
    publisher: '岸本あゆみ（梅花女子大学のサイトの教材）',
  },
  {
    id: 'sagara-2020',
    title: '日本手話，台湾手話，韓国手話の二桁から四桁の数の表現における変化（国立民族学博物館研究報告 44(3)）',
    url: 'https://minpaku.repo.nii.ac.jp/record/8389/files/KH_044_3_03.pdf',
    publisher: '相良啓子（国立民族学博物館）',
  },
  {
    id: 'tarl-2023',
    title: '手話と出会う。オンライン講座（2023年1月18日）の報告',
    url: 'https://tarl.jp/review/step2-report/',
    publisher: 'Tokyo Art Research Lab',
  },
  {
    id: 'hashimoto-shuwa',
    title: '8. 手話をやってみよう',
    url: 'https://www.city.hashimoto.lg.jp/kurashi_tetsuduki/fukushi/syougaihukusi/9244.html',
    publisher: '橋本市',
  },
  {
    id: 'ninjal-dialect',
    title: '日本手話に方言はありますか',
    url: 'https://kotoba.ninjal.ac.jp/qa/yokuaru/qa-237/',
    publisher: '国立国語研究所',
  },
  // 単語の資料
  {
    id: 'baika-aisatsu',
    title: '3Dモデルで学ぶ手話：あいさつ',
    url: 'https://mv.baika.ac.jp/imamura/www/aisatu.html',
    publisher: '岸本あゆみ（梅花女子大学のサイトの教材）',
  },
  {
    id: 'akita-shuwa',
    title: '手話を覚えよう！',
    url: 'https://www.city.akita.lg.jp/faq/syogaifukushi/1012867.html',
    publisher: '秋田市',
  },
  {
    id: 'obihiro-shuwa',
    title: 'ワンポイント手話講座',
    url: 'https://www.city.obihiro.hokkaido.jp/kenko/fukushi/shogai/1004966.html',
    publisher: '帯広市',
  },
  {
    id: 'tottori-shuwa',
    title: '手話を覚えてみよう！',
    url: 'https://www.pref.tottori.lg.jp/283721.htm',
    publisher: '鳥取県',
  },
  {
    id: 'tokyo-deaflympics',
    title: '学ぼう！デフリンピック：手話を学んでみよう',
    url: 'https://www.sports-tokyo-info.metro.tokyo.lg.jp/tokyoforward2025-legacy/deaflympics/manabou_deaflympics/sign/',
    publisher: '東京都',
  },
  {
    id: 'gunma-aisatsu',
    title: '手話で簡単なあいさつをしてみよう！',
    url: 'https://www.pref.gunma.jp/site/fukushinomachi/2871.html',
    publisher: '群馬県',
  },
  {
    id: 'jeed-manual',
    title: '聴覚障害者の雇用支援マニュアル（印刷 p.113）',
    url: 'https://www.jeed.go.jp/disability/data/handbook/choukaku/pageindices/index115.html',
    publisher: '高齢・障害・求職者雇用支援機構',
  },
  {
    id: 'toda-2020-09',
    title: '手話の紹介（2020年9月の資料・PDF）',
    url: 'https://www.city.toda.saitama.jp/uploaded/attachment/61509.pdf',
    publisher: '戸田市',
  },
  {
    id: 'maniwa-koza',
    title: 'かんたん手話講座（広報 p.19）',
    url: 'https://www.city.maniwa.lg.jp/uploaded/attachment/32951.pdf',
    publisher: '真庭市',
  },
  {
    id: 'kushiro-video',
    title: '手話動画 第11回 電話を頼まれた時の応対',
    url: 'https://www.city.kushiro.lg.jp/kenfuku/fukushi/1004747/1004748/1009905/1007918/1007928.html',
    publisher: '釧路市',
  },
  {
    id: 'oizumi-onepoint',
    title: '手話ワンポイントコーナー 第1〜100回',
    url: 'https://www.town.oizumi.gunma.jp/s013/kenko/010/230/20200819160124.html',
    publisher: '大泉町',
  },
  {
    id: 'ritsumei-club',
    title: '立命館CLUB No.112（手話サークルの取材）',
    url: 'https://www.ritsumei.ac.jp/rclub/magazine/article.html/?No=112&id=118',
    publisher: '立命館大学',
  },
  {
    id: 'ishikawa-sign',
    title: '障害について学ぼう！ 手話 よく使う言葉',
    url: 'https://www.pref.ishikawa.jp/fukusi/manabu/sign/02/',
    publisher: '石川県',
  },
  {
    id: 'kanagawa-chirashi',
    title: '手話マークデザイン募集チラシ（裏面の手話の説明）',
    url: 'https://www.pref.kanagawa.jp/documents/121427/shuwakotoba_chirashi.pdf',
    publisher: '神奈川県',
  },
  {
    id: 'kounosu-809',
    title: '広報こうのす No.809 手話コーナー',
    url: 'https://www.city.kounosu.saitama.jp/uploaded/attachment/6614.pdf',
    publisher: '鴻巣市',
  },
  {
    id: 'soja-monthly',
    title: '今月の手話（令和3年度4月〜9月）',
    url: 'https://www.city.soja.okayama.jp/soshiki/22/3180.html',
    publisher: '総社市',
  },
  {
    id: 'hitoyoshi-2025-08',
    title: '広報ひとよし 2025年8月号 pp.24–25 手話',
    url: 'https://www.city.hitoyoshi.lg.jp/resource.php?e=0363dca38b98329bc32a190569f81bdfa1fc7862ecd654a5e7384dbb97b4532ad16f9d339f7b01d71378c10e65bac695',
    publisher: '人吉市',
  },
  {
    id: 'ikoma-2026-06',
    title: '広報いこま 2026年6月 いこま手話通信',
    url: 'https://www.city.ikoma.lg.jp/cmsfiles/contents/0000004/4970/260601_all.pdf',
    publisher: '生駒市',
  },
  {
    id: 'fukuoka-video',
    title: '手話動画「手話で話そう」',
    url: 'https://www.pref.fukuoka.lg.jp/contents/syuwahyougendouga.html',
    publisher: '福岡県',
  },
  {
    id: 'shibukawa-310',
    title: '広報しぶかわ No.310（2019年1月15日）p.5',
    url: 'https://www.city.shibukawa.lg.jp/manage/contents/upload/5f6d3877e1737.pdf',
    publisher: '渋川市',
  },
  {
    id: 'sagamihara-shuwa',
    title: '手話を覚えてみよう',
    url: 'https://www.city.sagamihara.kanagawa.jp/kosodate/fukushi/1026641/1006534.html',
    publisher: '相模原市',
  },
];
