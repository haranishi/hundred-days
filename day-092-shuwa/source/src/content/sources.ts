import type { Source } from './types';
import { SOURCES_EXTRA } from './sources-extra';

/**
 * 出典の登録簿。各項目の sources はここの id を参照する。
 * 元は調査 r1（.agent-harness/research/r1_yubimoji.json）・r4（r4_followup.md）と、形を目で照合した4つの指文字表。
 * 指文字表は照合に使っただけで、図はアプリに入れていない（リンクだけを出典として載せる）。
 * 宇治市・朝来市は表の PDF ではなく掲載ページへリンクする（宇治市はトップへのリンクを推奨しているため、PDF への直リンクを避ける）。
 */
export const SOURCES: Source[] = [
  // 指文字表（形の目視照合に使った4つ）
  {
    id: 'kanagawa-2025',
    title: '手話を学んでみよう（子ども向け冊子）p.14–15 指文字',
    url: 'https://www.pref.kanagawa.jp/documents/12774/shuwasassi_kodomo.pdf#page=14',
    publisher: '神奈川県',
  },
  {
    id: 'uji-table',
    title: '指文字50音表（宇治市手話言語条例のページ）',
    url: 'https://www.city.uji.kyoto.jp/soshiki/50/4662.html',
    publisher: '宇治市',
  },
  {
    id: 'asago-table',
    title: '指文字表（手話はみんなのもの No.7）',
    url: 'https://www.city.asago.hyogo.jp/soshiki/19/12782.html',
    publisher: '朝来市',
  },
  {
    id: 'maebashi-panf',
    title: '手話パンフレット p.12 指文字',
    url: 'https://www.city.maebashi.gunma.jp/material/files/group/39/syuwa_panf.pdf#page=12',
    publisher: '前橋市',
  },
  // 文章の資料（調査 r1）
  {
    id: 'hiroshima-a',
    title: '写真で分かる指文字 あ行編（広島県ろうあ連盟 横村恭子さん）',
    url: 'https://hread.home-tv.co.jp/post-32812/',
    publisher: '広島ホームテレビ',
  },
  { id: 'hiroshima-ka', title: '写真で分かる指文字 か行編', url: 'https://hread.home-tv.co.jp/post-33668/', publisher: '広島ホームテレビ' },
  { id: 'hiroshima-sa', title: '写真で分かる指文字 さ行編', url: 'https://hread.home-tv.co.jp/post-34885/', publisher: '広島ホームテレビ' },
  { id: 'hiroshima-ta', title: '写真で分かる指文字 た行編', url: 'https://hread.home-tv.co.jp/post-35984/', publisher: '広島ホームテレビ' },
  { id: 'hiroshima-na', title: '写真で分かる指文字 な行編', url: 'https://hread.home-tv.co.jp/post-36665/', publisher: '広島ホームテレビ' },
  { id: 'hiroshima-ha', title: '写真で分かる指文字 は行編', url: 'https://hread.home-tv.co.jp/post-39108/', publisher: '広島ホームテレビ' },
  { id: 'hiroshima-ma', title: '写真で分かる指文字 ま行編', url: 'https://hread.home-tv.co.jp/post-42135/', publisher: '広島ホームテレビ' },
  { id: 'hiroshima-ya', title: '写真で分かる指文字 や行編', url: 'https://hread.home-tv.co.jp/post-44595/', publisher: '広島ホームテレビ' },
  { id: 'hiroshima-ra', title: '写真で分かる指文字 ら行編', url: 'https://hread.home-tv.co.jp/post-48250/', publisher: '広島ホームテレビ' },
  { id: 'hiroshima-wa', title: '写真で分かる指文字 わ行編', url: 'https://hread.home-tv.co.jp/post-50419/', publisher: '広島ホームテレビ' },
  { id: 'benricho-1', title: '指文字 あ行〜な行', url: 'https://www.benricho.org/yubimoji/01.html', publisher: 'みんなの知識 ちょっと便利帳' },
  { id: 'benricho-2', title: '指文字 は行〜わ行・ん', url: 'https://www.benricho.org/yubimoji/02.html', publisher: 'みんなの知識 ちょっと便利帳' },
  {
    id: 'suretalk',
    title: '手話の指文字・50音一覧を表現する方法',
    url: 'https://www.suretalk.mb.softbank.jp/column/contents/000106.php',
    publisher: 'ソフトバンク SureTalk',
  },
  {
    id: 'makki',
    title: '指文字（50音・アルファベット・数字）',
    url: 'https://makki-english.moo.jp/SignLanguageAIUEO.html',
    publisher: "Makki's 英語",
  },
  {
    id: 'lovespo',
    title: 'やさしい手話・指文字の基本（『動画で学ぶ やさしい手話』の紹介記事）',
    url: 'https://love-spo.com/article/yasashiisyuwa_001/',
    publisher: 'ラブすぽ',
  },
  { id: 'hope', title: '指文字一覧表・覚え方と由来', url: 'https://hope-npo.org/?p=7308', publisher: 'NPO法人ホープ' },
  {
    id: 'kanagawa-video',
    title: '指文字50音 濁音から応用（動画の説明）',
    url: 'https://www.pref.kanagawa.jp/docs/dc4/cnt/f533708/p1112880.html',
    publisher: '神奈川県',
  },
  { id: 'kyoto-rou-a', title: '指文字 あ', url: 'https://www.kyoto-be.ne.jp/rou-s/hdstext/html/a.htm', publisher: '京都府立聾学校' },
  { id: 'kyoto-rou-i', title: '指文字 い', url: 'https://www.kyoto-be.ne.jp/rou-s/hdstext/html/i.htm', publisher: '京都府立聾学校' },
  { id: 'kyoto-rou-o', title: '指文字 お', url: 'https://www.kyoto-be.ne.jp/rou-s/hdstext/html/o.htm', publisher: '京都府立聾学校' },
  {
    id: 'iwate',
    title: '自立活動指導資料（聴覚障がい）の指文字表',
    url: 'https://www.pref.iwate.jp/_res/projects/default_project/_page_/001/062/894/jiritukatudou-choukaku.pdf#page=23',
    publisher: '岩手県教育委員会',
  },
  { id: 'syuwafriends', title: '指文字の「ろ」の表現', url: 'https://syuwafriends.com/1553.html', publisher: 'しゅわぶくろ' },
  {
    id: 'waseda',
    title: '2018年度 修士論文（指文字の動作の分類）',
    url: 'https://waseda.repo.nii.ac.jp/record/45973/files/t5117F034.pdf',
    publisher: '早稲田大学リポジトリ',
  },
  {
    id: 'osaka-amt',
    title: 'みんなで指文字をやってみよう（指文字表）',
    url: 'https://osaka-amt.or.jp/cms/wp-content/uploads/2025/07/ea5712308e973bb980b38eed0a8cce91.pdf',
    publisher: '大阪府臨床検査技師会（掲載）',
  },
  // 「も」「ろ」の追加調査（r4）
  {
    id: 'isahaya',
    title: "Let's 手話：名前の表し方 p.8",
    url: 'https://www.city.isahaya.nagasaki.jp/uploaded/attachment/12747.pdf#page=8',
    publisher: '諫早市',
  },
  {
    id: 'saikai-175',
    title: '広報さいかい 2019年11月号（No.175）p.11 手話',
    url: 'https://www.city.saikai.nagasaki.jp/material/files/group/5/koho175.pdf#page=11',
    publisher: '西海市',
  },
  {
    id: 'saikai-177',
    title: '広報さいかい 2020年1月号（No.177）p.9 手話',
    url: 'https://www.city.saikai.nagasaki.jp/material/files/group/5/koho177.pdf#page=9',
    publisher: '西海市',
  },
  {
    id: 'chikuzen-79',
    title: '社協だより No.79 指文字',
    url: 'https://chikuzen-shakyo.or.jp/wp-content/uploads/2023/08/chikuzenshakyodayori_79.pdf',
    publisher: '筑前町社会福祉協議会',
  },
];

// 数字・単語の出典（sources-extra.ts）も同じ登録簿に入れてから、引く表を作る
SOURCES.push(...SOURCES_EXTRA);
const byId = new Map(SOURCES.map((s) => [s.id, s]));

export function getSource(id: string): Source | undefined {
  return byId.get(id);
}
