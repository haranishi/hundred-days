// research/R3 §G。利用者が押したときだけ開く公式の窓口。
export const CONSULT_LINKS = [
  {
    "id": "antiphishing",
    "name": "フィッシング対策協議会",
    "purpose": "フィッシングメール・SMS・サイトの報告",
    "url": "https://www.antiphishing.jp/registration.html"
  },
  {
    "id": "police-cyber",
    "name": "都道府県警察サイバー窓口",
    "purpose": "犯罪被害・サイバー事案の相談・オンライン通報案内",
    "url": "https://www.npa.go.jp/bureau/cyber/soudan.html",
    "note": "緊急時は110。被害届については最寄りの警察署へ連絡してください。"
  },
  {
    "id": "police-phone",
    "name": "警察相談専用電話",
    "purpose": "緊急ではない犯罪の相談",
    "url": "https://www.npa.go.jp/bureau/soumu/soudan/soudanmadoguti.pdf",
    "phone": "#9110",
    "note": "土日祝日・夜間は当直や音声案内等になる場合があります。"
  },
  {
    "id": "consumer",
    "name": "消費者ホットライン",
    "purpose": "消費生活センター等への相談",
    "url": "https://www.caa.go.jp/policies/policy/local_cooperation/local_consumer_administration/hotline/",
    "phone": "188",
    "note": "受付時間は接続先により異なります。"
  },
  {
    "id": "ipa",
    "name": "IPA 情報セキュリティ相談窓口",
    "purpose": "ウイルス・不正アクセス等の一般的な技術相談",
    "url": "https://www.ipa.go.jp/security/anshin/about.html",
    "phone": "03-5978-7509",
    "note": "10:00–17:00。土日祝日・年末年始を除きます。"
  },
  {
    "id": "jpcert",
    "name": "JPCERT/CC",
    "purpose": "インシデントの報告・調整依頼",
    "url": "https://www.jpcert.or.jp/form/",
    "note": "捜査・法的対応の代行ではありません。原則電話報告はできません。"
  },
  {
    "id": "ipa-vuln",
    "name": "IPA 脆弱性関連情報の届出",
    "purpose": "製品・Webアプリの脆弱性の届出",
    "url": "https://isec-vul-form.ipa.go.jp/ipa-vul-main/index.html",
    "note": "必要以上の追加調査はせず、案内を確認してください。"
  },
  {
    "id": "ipa-owner",
    "name": "IPA ウェブサイトの作り方",
    "purpose": "サイト運営者向けの改善資料",
    "url": "https://www.ipa.go.jp/security/vuln/websecurity/about.html",
    "note": "相談受付ではありません。"
  },
  {
    "id": "japanpost",
    "name": "日本郵便",
    "purpose": "日本郵便を装うメール・SMSへの注意喚起",
    "url": "https://www.post.japanpost.jp/notification/notice/fraud-mail.html",
    "phone": "0120-23-28-86",
    "note": "全日8:00–21:00。"
  },
  {
    "id": "yamato",
    "name": "ヤマト運輸・ヤマトHD",
    "purpose": "なりすましサイトや迷惑メールへの注意喚起",
    "url": "https://www.yamato-hd.co.jp/important/info_181212.html"
  },
  {
    "id": "sagawa",
    "name": "佐川急便",
    "purpose": "なりすまし連絡の注意喚起・案内",
    "url": "https://www2.sagawa-exp.co.jp/information/list/"
  },
  {
    "id": "smbc",
    "name": "三井住友銀行",
    "purpose": "フィッシング対策・不正送金時の案内",
    "url": "https://www.smbc.co.jp/security/"
  },
  {
    "id": "google-report",
    "name": "Google フィッシング報告",
    "purpose": "疑いのあるページをGoogleへ報告",
    "url": "https://safebrowsing.google.com/safebrowsing/report_phish/",
    "note": "入力内容はGoogleへ送られます。フォームの送信操作は未確認です。"
  }
];

const targetUrl = target => typeof target === 'string' ? new URL(target) : new URL(target.finalUrl ?? target.href);
export const EXTERNAL_CHECKS = [
  { id: 'securityheaders', name: 'Security Headers', forOwner: true, forVisitor: false, verified: true,
    base: 'https://securityheaders.com/', sends: 'URL',
    note: '押すと対象のURL全体を相手に渡します。既存のレポートが表示される場合があります。秘密のあるURLは渡さないでください。',
    build(target) { return `${this.base}?q=${encodeURIComponent(targetUrl(target).href)}`; } },
  { id: 'ssllabs', name: 'SSL Labs', forOwner: true, forVisitor: false, verified: true,
    base: 'https://www.ssllabs.com/ssltest/', sends: 'ホスト名',
    note: '押すとホスト名を相手に渡します。入力画面への到達を確認済みで、診断の完了は未確認です。',
    build(target) { return `${this.base}analyze.html?d=${encodeURIComponent(targetUrl(target).hostname)}`; } },
  { id: 'urlscan', name: 'urlscan.io 履歴検索', forOwner: false, forVisitor: true, verified: true,
    base: 'https://urlscan.io/search/', sends: 'ホスト名',
    note: '押すとホスト名を既存の履歴検索に使います。検索ページへの到達を確認済みで、結果の自動表示は未確認です。新しいスキャンは送信しません。',
    build(target) { return `${this.base}#${encodeURIComponent(`task.domain:${targetUrl(target).hostname}`)}`; } },
  { id: 'google', name: 'Google 透明性レポート', forOwner: false, forVisitor: true, verified: false,
    base: 'https://transparencyreport.google.com/safe-browsing/search', sends: 'URL',
    note: 'URLを相手に渡す形式は未確認です。ブラウザで確認するまで表示しません。',
    build(target) { return `${this.base}?url=${encodeURIComponent(targetUrl(target).href)}`; } },
  { id: 'virustotal', name: 'VirusTotal', forOwner: false, forVisitor: true, verified: false,
    base: 'https://www.virustotal.com/gui/home/url', sends: 'URL',
    note: '入口で手動入力します。検索したURLは相手のデータセットに加えられます。秘密や個人情報のあるURLは渡さないでください。',
    build() { return this.base; } },
  { id: 'observatory', name: 'MDN HTTP Observatory', forOwner: true, forVisitor: false, verified: false,
    base: 'https://developer.mozilla.org/en-US/observatory', sends: 'ホスト名',
    note: 'ホスト名を相手に渡す形式は未確認です。ブラウザで確認するまで表示しません。',
    build(target) { return `${this.base}/analyze?host=${encodeURIComponent(targetUrl(target).hostname)}`; } }
];
