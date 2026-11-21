// 「時給」にも「時」が入るので、複数の手掛かりがあるときは上から先に選ぶ。
const RULES = [
  [/円|料金|時給|価格|費|送料|税|無料/u, 'yen'],
  [/時間|時|分|朝|夜|営業|受付/u, 'clock'],
  [/曜日|日程|予約|予定|日付|期限/u, 'calendar'],
  [/場所|道|駅|アクセス|住所|店|来て/u, 'pin'],
  [/メール|連絡|返信|問い合わせ|相談/u, 'mail'],
  [/電話/u, 'phone'],
  [/声|話|聞|伝え|質問/u, 'chat'],
  [/人|スタッフ|お客さん|方/u, 'user'],
  [/買い|かご|注文|購入/u, 'cart'],
  [/贈り|プレゼント|ギフト/u, 'gift'],
  [/飲み物|コーヒー|お茶|カフェ|食事/u, 'cup'],
  [/安心|守る|保証|安全/u, 'shield'],
  [/好き|大切|やさしい|想い|応援|ありがとう/u, 'heart'],
];

const DEFAULT_ICONS = ['check', 'star', 'spark'];

export function pickIcon(text, index = 0, fallbacks = DEFAULT_ICONS) {
  for (const [pattern, icon] of RULES) {
    if (pattern.test(text)) return icon;
  }
  // 書き手の気持ちは、文章に手掛かりがあるときだけ示す。
  const neutral = fallbacks.filter(icon => icon !== 'heart');
  return neutral.length ? neutral[index % neutral.length] : 'check';
}
