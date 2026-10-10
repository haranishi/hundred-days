// 5つの現場の中身と、ランク・次の目標・共有文の決め方。DOMに触らない純粋なデータと関数だけを置く（node --test で確かめる）

// Sランクの合計秒数。開始画面のルール欄・結果画面の目標・calculateRank がすべてこの値を見る
export const S_TIME_LIMIT_SEC = 45;
export const RULES_LINE = `S＝被害0円・時間切れなし・合計${S_TIME_LIMIT_SEC}秒以内／A＝被害0円・時間切れなし`;

export const STAGES = [
  {
    id: 1,
    title: "罪悪感の押し売りモーダル",
    domain: "trendy-style-fashion.jp",
    path: "/items/autumn-trench",
    category: "コンファームシェイミング（Confirmshaming）",
    scenario: "割引ポップアップが出た。有料メルマガを断って閉じよ！",
    successTitle: "罪悪感の誘導を振り切った！",
    darkPatternName: "コンファームシェイミング（罪悪感の押し付け）",
    explanation: "断る側の選択肢に、自分を責める言い回しを置く手口です。居心地の悪さを避けたくなり、つい承諾ボタンを押してしまいます。",
    legalNote: "利用者の冷静な判断を阻害する情緒的圧迫であり、OECDのダークパターン報告書でも悪質な感情操作的UIとして問題視されています。",
    timeLimit: 20
  },
  {
    id: 2,
    title: "隠された年額自動更新",
    domain: "cloud-music-free.jp",
    path: "/signup",
    category: "隠されたコスト（Hidden Costs）＆ 電話解約縛り",
    scenario: "初月無料の音楽アプリ。小さな注記を確かめ、解約しやすい契約で無料体験を始めよ！",
    successTitle: "隠れた年額縛りを回避！",
    darkPatternName: "隠されたコスト ＆ トラップドア解約",
    explanation: "「初月0円」を大きく見せながら、不利な条件を小さな注記に隠す手口です。",
    legalNote: "スマホやWebで契約したサービスを電話窓口でのみ解約させる「電話限定縛り」は、国民生活センターでもトラブル相談が急増し、行政処分が相次いでいます。",
    timeLimit: 30
  },
  {
    id: 3,
    title: "偽の緊急性と閲覧者数",
    domain: "travel-now-hotel.jp",
    path: "/booking",
    category: "偽の緊急性（Fake Urgency）＆ 希少性の偽装",
    // 画面の閲覧者数は毎回20〜60人で変わるので、ミッション文には具体的な人数を書かない。
    // 縦の短い画面でも偽サイトの確定ボタンまで見えるよう、ミッションは2行に収まる長さにする
    scenario: "「残り1室」「大勢が検討中」の煽りに焦らず、安全な条件で宿を予約せよ！",
    successTitle: "煽りに負けず安全に予約！",
    darkPatternName: "偽の緊急性 ＆ 偽の社会的証明",
    explanation: "数字や通知で焦らせ、キャンセル条件を読ませないまま返金不可プランへ進ませる手口です。",
    legalNote: "実態と異なる「残りわずか」や架空の閲覧者数表示は、景品表示法における「有利誤認表示」に該当する違法行為となる可能性があります。",
    // 両プランが同額なのに全額を被害に数える理由を、内訳に1行添える
    trapNote: "同じ料金でも、返金不可プランはキャンセルしたときに全額が戻りません。",
    timeLimit: 25
  },
  {
    id: 4,
    title: "お試し500円の罠",
    domain: "kenko-life-ec.jp",
    path: "/checkout",
    category: "スニーク・イントゥ・バスケット / 事前チェックボックス",
    scenario: "お試しサプリの注文。勝手に付いた定期便と有料オプションを外して確定せよ！",
    successTitle: "余計な契約を外して注文！",
    darkPatternName: "事前選択 ＆ 抱き合わせ（Sneak into Basket）",
    explanation: "「定期便への自動移行」や「有料の配送補償」に、最初からチェックを入れておく手口です。気づかずに進むと、意図しない月額契約や追加料金が発生します。",
    legalNote: "特定商取引法および消費者庁ガイドラインでは、定期購入である旨や支払総額を明瞭に表示しないこと、意図しない定期移行は規制・是正勧告の対象となっています。",
    // 定期便のチェックを外そうとすると出る、サイトの引き留めダイアログの見出し（解説でもこの文言をそのまま引く）
    retentionQuestion: "本当に定期便を解除しますか？",
    // 定期便を外そうとして引き留めダイアログに押し戻されたまま確定した人に、被弾の内訳で何に負けたのかを示す
    retentionNotes: {
      keep: "解除しようとしたとき、確認ダイアログの赤いボタン「お得な定期便を続ける」で定期便に戻されました。",
      escape: "解除しようとしたとき、確認ダイアログを閉じたので、定期便が付いたままになりました。"
    },
    timeLimit: 25
  },
  {
    id: 5,
    title: "迷宮の退会アンケート",
    domain: "movie-delivery-plus.jp",
    path: "/account/cancel",
    category: "ゴキブリホイホイ（Roach Motel）＆ 二重否定",
    scenario: "引き留めと二重否定の質問を見抜き、使わない動画サービスを退会せよ！",
    successTitle: "迷路を抜けて退会完了！",
    darkPatternName: "離脱妨害（ゴキブリホイホイ）＆ 二重否定",
    question: "今後のプレミアム会員資格の停止を取り消さないことを希望しますか？",
    explanation: "入会は1クリックなのに、退会は引き留めや分かりにくい質問で出口を隠す手口です。",
    legalNote: "「入口は広く、出口は狭く」する設計は、電気通信事業法や消費者契約法などの観点からも改善指導の対象となっています。",
    timeLimit: 30
  }
];

/* 解説モーダルの「心理誘導のメカニズム」。画面に実際に出た文言をそのまま引く。
   第1・第2・第3現場は周ごとに文言や数字が変わるので、その周の値を ctx で受け取る */
export function explanationFor(stage, ctx = {}) {
  switch (stage.id) {
    case 1:
      return ctx.rejectText
        ? `断る側の選択肢に「${ctx.rejectText}」のような、自分を責める言い回しを置く手口です。居心地の悪さを避けたくなり、つい承諾ボタンを押してしまいます。`
        : stage.explanation;
    case 2: {
      const place = ctx.notePlacement === "below" ? "開始ボタンの下の小さな注記" : "折りたたみの中";
      return `「初月0円」を大きく見せながら、${place}に「期間終了の48時間前までに電話窓口（平日11:00〜14:00）へ申し出ないと、年額プランへ自動更新」という不利な条件を置く手口です。`;
    }
    case 3:
      return Number.isInteger(ctx.viewers)
        ? `「残りあと1室！」「現在${ctx.viewers}人が検討中」「あと1分で部屋が解放されます」のような数字や通知で焦らせ、キャンセル条件を読ませないまま返金不可プランへ進ませる手口です。`
        : stage.explanation;
    case 4:
      // 成功しても被弾しても、プレイ中に必ず出会う引き留めダイアログの手口にも触れる
      return `${stage.explanation}さらに、チェックを外そうとすると「${stage.retentionQuestion}」と引き留めるダイアログが出る手口も使われます。`;
    case 5:
      return `${stage.explanation}さらに「${stage.question}」のような二重否定の質問で、どちらを選べば退会になるのかを迷わせます。`;
    default:
      return stage.explanation;
  }
}

/* 時間切れの内訳。被害0円でも「被弾 +¥0」とは出さず、未達として示す。
   第5現場だけは退会できないまま翌月の料金が発生するので、金額つきの未達にする */
export function timeoutResult(stage) {
  if (stage.id === 5) {
    return { damage: 1980, breakdown: [{ name: "退会未完了（翌月も自動更新）", status: "timeout", cost: 1980 }] };
  }
  return { damage: 0, breakdown: [{ name: "時間切れ（手続き未完了）", status: "timeout", cost: 0 }] };
}

const yen = (value) => `¥${Number(value).toLocaleString("ja-JP")}`;

// 解説モーダルの内訳の札。tone は色の種類（ok＝緑／hit＝赤／timeout＝琥珀）
export function breakdownTag(item) {
  if (item.status === "timeout") return { text: item.cost > 0 ? `未達 +${yen(item.cost)}` : "未達", tone: "timeout" };
  if (item.status === "hit") return { text: `被弾 +${yen(item.cost)}`, tone: "hit" };
  return { text: "解除済 ¥0", tone: "ok" };
}

// 結果画面の「各現場の捜査記録」の右側。時間切れの表記はユーザー確定の仕様（E2Eで固定）
export function stageResultLabel(result) {
  if (result.isTimeout) return { text: "未達 (時間切れ)", tone: "timeout" };
  if (result.damage === 0) return { text: "回避 ¥0", tone: "ok" };
  return { text: `被弾 +${yen(result.damage)}`, tone: "hit" };
}

export function calculateRank(totalDamage, totalTime, hasTimeouts = false) {
  if (totalDamage === 0 && !hasTimeouts) {
    if (totalTime <= S_TIME_LIMIT_SEC) {
      return { rank: "S", title: "特務UI捜査官（神の洞察眼）", comment: `全5現場を被害0円・${S_TIME_LIMIT_SEC}秒以内で突破。罠の気配を一瞬で見抜く目を持っています。`, color: "#10b981" };
    }
    return { rank: "A", title: "敏腕リテラシー捜査官（安全第一）", comment: "被害0円で全現場を突破。細かな注記やチェックまで確かめる、堅実な判断力です。", color: "#3b82f6" };
  } else if (totalDamage === 0 && hasTimeouts) {
    return { rank: "B", title: "迷えるネット市民（時間切れ）", comment: "被害は0円でしたが、時間切れの現場がありました。迷ったら、小さな注記から読むのが近道です。", color: "#f59e0b" };
  } else if (totalDamage <= 5000) {
    return { rank: "C", title: "一般ネット市民（軽傷で生還）", comment: "いくつかの罠に捕まりましたが、被害は小さめ。注文の前に、ひと呼吸おいて確かめましょう。", color: "#f59e0b" };
  } else if (totalDamage <= 15000) {
    return { rank: "D", title: "要注意カモ予備軍（毎月謎の引き落とし）", comment: "複数の罠で被害が出ました。「初月無料」「残りわずか」の言葉に急かされやすいかもしれません。", color: "#ef4444" };
  }
  // 5現場中2つを突破していてもここに入るので、「ほぼ全てを踏み抜いた」とは断定しない
  return { rank: "E", title: "悪質ECのプラチナ上客（全財産カモられ）", comment: "高額の罠にいくつも捕まりました。いますぐカードの利用明細を確かめてください！", color: "#8b5cf6" };
}

/* 結果画面の「次の目標」1行。ランクの決め方（calculateRank）と同じ条件で書く */
export function describeNextGoal({ totalDamage, totalTimeSec, hasTimeouts }) {
  if (totalDamage === 0 && !hasTimeouts) {
    if (totalTimeSec <= S_TIME_LIMIT_SEC) return { kind: "top", text: "最高ランク達成！次は自己ベストの更新を狙おう" };
    return { kind: "time", text: `Sまであと${totalTimeSec - S_TIME_LIMIT_SEC}秒（合計${S_TIME_LIMIT_SEC}秒以内でS）` };
  }
  if (totalDamage === 0) return { kind: "timeout", text: "時間切れなしで通すとA以上" };
  const condition = hasTimeouts ? "被害0円・時間切れなし" : "被害0円";
  return { kind: "damage", text: `${condition}で通すとA以上。${S_TIME_LIMIT_SEC}秒以内ならS` };
}

/* 結果画面の「やり直し」の表示。やり直さずに全現場を被害0円・時間切れなしで通した周だけを「ノーミス」と呼ぶ
   （やり直して¥0にした周や、被弾したまま進んだ周と区別するため） */
export function describeRetries({ retries, totalDamage, hasTimeouts }) {
  if (retries === 0 && totalDamage === 0 && !hasTimeouts) return { text: "ノーミス", perfect: true };
  return { text: `やり直し ${retries}回`, perfect: false };
}

/* 結果の共有文。ランクと同じ材料から作るので、時間切れや被害のある周に「クリア」とは書かない。
   称号に「時間切れ」が入っているとき（ランクB）は、末尾の注記を省く（同じ語を2回書かない） */
export function buildShareText({ rank, title, totalDamage, totalTimeSec, hasTimeouts }) {
  const timeoutNote = hasTimeouts && !title.includes("時間切れ") ? "（時間切れあり）" : "";
  return `悪質UI脱出ゲーム『解約ボタンは、どれ？』で「${title}」になった。ランク${rank}・被害${yen(totalDamage)}・${totalTimeSec}秒${timeoutNote} #100日チャレンジ #Day063`;
}
