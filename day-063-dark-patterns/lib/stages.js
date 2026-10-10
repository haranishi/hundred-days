/**
 * ダークパターンのステージデータと解説
 */

export const STAGES = [
  {
    id: 1,
    title: "お試し500円の罠",
    siteName: "健康ライフ通販",
    category: "スニーク・イントゥ・バスケット / 事前チェックボックス",
    scenario: "話題のサプリをお試しワンコイン（500円）で購入したい。余計なオプションや定期縛りを回避して注文を完了せよ！",
    darkPatternName: "事前選択（Pre-selection）＆ 抱き合わせ（Sneak into Basket）",
    explanation: "「定期購入への自動移行」や「有料サポートオプション」が最初からチェックされた状態で提供される手口。利用者が気づかずに進むと、意図しない高額な月額契約や不要な追加料金が発生します。",
    legalNote: "特定商取引法および消費者庁ガイドラインにおいて、定期購入である旨や支払総額を明瞭に表示しないこと、意図しない定期移行は規制・是正勧告の対象となっています。",
    traps: [
      { id: "trap-sub", name: "定期便自動移行（毎月お届け）", cost: 4980, defaultChecked: true },
      { id: "trap-warranty", name: "安心配送プレミアム保証", cost: 550, defaultChecked: true }
    ],
    basePrice: 500,
    timeLimit: 25
  },
  {
    id: 2,
    title: "罪悪感の押し売りモーダル",
    siteName: "TRENDY STYLE",
    category: "コンファームシェイミング（Confirmshaming）",
    scenario: "ショッピング中に画面全体を覆うポップアップが出現した。不要な有料メルマガや会員登録を断り、モーダルを閉じよ！",
    darkPatternName: "コンファームシェイミング（罪悪感・自己否定の植え付け）",
    explanation: "拒否する選択肢に「いいえ、私は損をするのが大好きです」「お金をドブに捨てます」といった自尊心を傷つける表現を使い、感情的な居心地の悪さから承諾ボタンを押させる心理誘導の手口です。",
    legalNote: "利用者の冷静な判断を阻害する情緒的圧迫であり、OECDのダークパターン報告書でも悪質な感情操作的UIとして問題視されています。",
    traps: [
      { id: "trap-newsletter", name: "毎日3通届くVIP有料メルマガ", cost: 980 }
    ],
    basePrice: 0,
    timeLimit: 20
  },
  {
    id: 3,
    title: "偽の緊急性と閲覧者数",
    siteName: "トラベルナウ！",
    category: "偽の緊急性（Fake Urgency）＆ 希少性の偽装",
    scenario: "週末の宿を予約したい。「残り1室！」「32人が閲覧中！」の煽り文句に惑わされず、最も安全な条件で予約を確定せよ！",
    darkPatternName: "偽の緊急性（Fake Urgency）＆ 偽の社会的証明",
    explanation: "「あと3分で値上げ」「現在40人が見ています」といったタイマーや数字で焦燥感を煽り、規約やキャンセル条件を吟味させずに即決・返金不可プランへと誘導する手法です。",
    legalNote: "実態と異なる「残りわずか」や架空の閲覧者数表示は、景品表示法における「有利誤認表示」に該当する違法行為となる可能性があります。",
    traps: [
      { id: "trap-nonrefundable", name: "返金不可・即時全額決済プラン（キャンセル時100%請求）", cost: 18000 }
    ],
    basePrice: 0,
    timeLimit: 25
  },
  {
    id: 4,
    title: "迷宮の退会アンケート",
    siteName: "動画デリバリーPlus",
    category: "ゴキブリホイホイ（Roach Motel）＆ 二重否定",
    scenario: "使わなくなった有料サービスの退会画面。引き留め工作と紛らわしい二重否定の質問文を突破し、確実に解約を完了せよ！",
    darkPatternName: "離脱妨害（Roach Motel）＆ 二重否定（Double Negatives）",
    explanation: "加入は1クリックで簡単な一方、解約は複雑怪奇なページ遷移を強いられる手口（ゴキブリホイホイ）。さらに「解約の中止を拒否しますか？」のような二重否定文でユーザーを混乱させます。",
    legalNote: "「入口は広く、出口は狭く」する設計は、電気通信事業法や消費者契約法などの観点からも改善指導の対象となっています。",
    traps: [
      { id: "trap-cancel-fail", name: "解約失敗による翌月自動更新", cost: 1980 }
    ],
    basePrice: 0,
    timeLimit: 30
  },
  {
    id: 5,
    title: "隠された年額自動更新",
    siteName: "クラウドミュージックFREE",
    category: "隠されたコスト（Hidden Costs）＆ 電話解約縛り",
    scenario: "「初月無料」の音楽アプリ。極小文字で書かれた危険な罠を見抜き、解約しやすい安全な契約形態で無料体験を始めよ！",
    darkPatternName: "隠されたコスト（Hidden Costs）＆ トラップドア解約",
    explanation: "「初月0円」と目立つ表記をしつつ、薄く小さな注記で「無料期間終了の48時間前までに平日日中の電話でのみ解約可能」「未解約時は年額一括請求へ自動移行」といった極めて不利な条件を隠蔽する手口です。",
    legalNote: "スマホやWebで契約したサービスを電話窓口でのみ解約させる「電話限定縛り」は、国民生活センターでもトラブル相談が急増し、行政処分が相次いでいます。",
    traps: [
      { id: "trap-annual-lock", name: "電話解約限定・年額一括自動課金", cost: 14800 }
    ],
    basePrice: 0,
    timeLimit: 30
  }
];

/**
 * 捜査官ランクの算出
 * @param {number} totalDamage - 合計被害額（円）
 * @param {number} totalTime - クリアまでの秒数
 * @returns {{ rank: string, title: string, comment: string, color: string }}
 */
export function calculateRank(totalDamage, totalTime) {
  if (totalDamage === 0) {
    if (totalTime <= 45) {
      return {
        rank: "S",
        title: "特務UI捜査官（神の洞察眼）",
        comment: "驚異的なスピードで全5つの悪質手口を完全看破！騙しの天才すら舌を巻くデジタル自衛能力の持ち主です。",
        color: "#10b981"
      };
    }
    return {
      rank: "A",
      title: "敏腕リテラシー捜査官（安全第一）",
      comment: "被害額0円で全ステージを制覇！細部まで規約やチェックボックスを確認できる堅実な判断力があります。",
      color: "#3b82f6"
    };
  } else if (totalDamage <= 5000) {
    return {
      rank: "B",
      title: "一般ネット市民（軽傷で生還）",
      comment: "一部の巧妙な手口に引っかかってしまいましたが、大惨事は回避。日常のネット通販でも油断は禁物です。",
      color: "#f59e0b"
    };
  } else if (totalDamage <= 15000) {
    return {
      rank: "C",
      title: "要注意カモ予備軍（毎月謎の引き落とし）",
      comment: "複数のダークパターンに被弾。「初月無料」や「残り1点」の甘い言葉に流されやすい傾向があります。",
      color: "#ef4444"
    };
  } else {
    return {
      rank: "D",
      title: "悪質ECのプラチナ上客（全財産カモられ）",
      comment: "仕掛けられた罠のほぼ全てを踏み抜いてしまいました。今すぐ通帳とカード明細を確認してください！",
      color: "#8b5cf6"
    };
  }
}
