// 文節単位の折り返しの参考実装（試作・検証用。アプリに入れるときは lib/phrase.js に整えてテストを付ける）。
// Intl.Segmenter('ja') の「語」を、次の規則で文節（内容語＋付属語）にまとめる。文節の切れ目に <wbr> を入れ、
// CSS は word-break: keep-all; overflow-wrap: anywhere; line-break: strict にすると、Safari でも文節の途中では折れない。
const seg = new Intl.Segmenter('ja', { granularity: 'word' });
const isHira = (c) => /[ぁ-ゟ]/.test(c);
// ひらがな以外の「内容語の文字」。中点（U+30FB）は区切りなので含めない
const isContent = (c) => c !== '・' && !isHira(c) && /[一-鿿々゠-ヿA-Za-z0-9０-９Ａ-Ｚａ-ｚ¥￥$＄%％]/.test(c);
const OPEN = /[「『（(［\[【〈《“‘]$/;
const ATTACH_TO_PREV = /^[、。，．！？!?）)」』］\]】〉》”’・：:；;…ー〜~／/＝=％%]/;
const JOIN_NEXT = /[＝=＋+→➔−－¥￥$＄-]$/;
const CLAUSE_END = /[、。，．！？!?…]$/;
const NUM_SEP = /[:：.,，〜~／/-]$/;
const last = (s) => s[s.length - 1];

export function phrases(text) {
  const out = [];
  for (const { segment: s } of seg.segment(text)) {
    if (!out.length) { out.push(s); continue; }
    const prev = out[out.length - 1];
    const first = s[0];
    let attach = false;
    if (/^\s+$/.test(s)) attach = true;                                            // 空白は直前に付ける
    else if (ATTACH_TO_PREV.test(s)) attach = true;                                // 句読点・閉じ括弧・区切り記号
    else if (OPEN.test(prev) || JOIN_NEXT.test(prev)) attach = true;               // 開き括弧・符号・通貨記号のあと
    else if (/[0-9０-９]/.test(first) && NUM_SEP.test(prev) && /[0-9０-９]/.test(prev.slice(-2, -1))) attach = true; // 11:00〜14:00 など
    else if (isHira(first) && !CLAUSE_END.test(prev)) attach = true;               // ひらがな始まり（助詞・活用語尾）
    else if (isContent(last(prev.trimEnd())) && isContent(first)) attach = true;   // 複合語・単位・Latin/数字
    if (attach) out[out.length - 1] = prev + s; else out.push(s);
  }
  return out;
}

if (process.argv[1] && process.argv[1].endsWith('phrase-reference.mjs')) {
  const samples = [
    'ネットに潜む「罠UI」を看破せよ',
    'S＝被害0円・時間切れなし・合計45秒以内／A＝被害0円・時間切れなし',
    '利用者の冷静な判断を阻害する情緒的圧迫であり、OECDのダークパターン報告書でも悪質な感情操作的UIとして問題視されています。',
    '特定商取引法および消費者庁ガイドラインでは、定期購入である旨や支払総額を明瞭に表示しないこと、意図しない定期移行は規制・是正勧告の対象となっています。',
    'スマホやWebで契約したサービスを電話窓口でのみ解約させる「電話限定縛り」は、国民生活センターでもトラブル相談が急増し、行政処分が相次いでいます。',
    '※本無料トライアルは、期間終了の48時間前までに所定の電話サポート窓口（平日11:00〜14:00のみ受付）にお申し出がない場合、自動的に年額プレミアムプラン（¥12,800/年）へと更新されます。',
    '出典参考：消費者庁「欺瞞的パターンに関する実態調査」、OECD「Dark Commercial Patterns」、国民生活センター相談事例。',
    '考え直す（契約を維持）',
    '「有料の配送補償」に、最初からチェックを入れておく手口です。',
    'いいえ、割引を捨てて、わざわざ高い買い物をする道を選びます',
    '今解除すると、初回限定の特別割引（-90%）や送料無料特典が失効する可能性があります。',
    'プレミアムあんしん配送補償プラン（+¥950）',
  ];
  for (const t of samples) {
    const p = phrases(t);
    if (p.join('') !== t) console.log('!! 連結が元の文と一致しない', t);
    console.log(p.join(' | '), '\n');
  }
}
