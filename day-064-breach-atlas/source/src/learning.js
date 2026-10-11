// Editorial questions grounded in public guidance; no incident-specific diagnosis.
const guide = 'https://www.ipa.go.jp/security/guide/sme/about.html';
const guidePdf = 'https://www.ipa.go.jp/security/guide/sme/ug65p90000019cbk-att/sme_guideline_v4.0.pdf';
export const LESSONS = [
  { cause: 'intrusion', label: '外部侵入', title: '更新と認証を見直す', description: '外からのアクセスに備える、基本の確認から。', questions: ['更新が必要な機器・ソフトを把握できていますか？', '重要なサービスで多要素認証を利用できますか？'], url: `${guidePdf}#page=26`, source: 'IPA · 基本的対策', icon: 'shield' },
  { cause: 'ransomware', label: 'ランサムウェア', title: '復旧できる備えを持つ', description: 'バックアップは、保存と復元の両方を確かめる。', questions: ['必要なデータをバックアップしていますか？', '分離した保管と、復元の手順を確認できますか？'], url: `${guidePdf}#page=35`, source: 'IPA · バックアップ', icon: 'restore' },
  { cause: 'insider', label: '内部持ち出し', title: '情報を扱う権限を整える', description: '必要な人が、必要な情報を扱える状態へ。', questions: ['異動・退職時にアクセス権を見直していますか？', '持ち出しルールと操作の記録を確認できますか？'], url: 'https://www.ipa.go.jp/security/guide/insider.html', source: 'IPA · 内部不正防止ガイドライン', icon: 'key' },
  { cause: 'exposure', label: '公開・権限の不備', title: '公開範囲を確かめる', description: '見せたい相手と、見られる相手は一致していますか。', questions: ['共有する情報の閲覧範囲を確認していますか？', '不要になった公開やアクセス権を見直せますか？'], url: `${guidePdf}#page=26`, source: 'IPA · 共有範囲・アクセス制御', icon: 'eye' },
  { cause: 'loss', label: '紛失・盗難等', title: '持ち出す情報を守る', description: '端末や媒体を失ったときの影響も考える。', questions: ['持ち出し・保管のルールを共有していますか？', '端末の認証と、重要情報の暗号化を確認できますか？'], url: `${guidePdf}#page=34`, source: 'IPA · アクセス・媒体管理', icon: 'device' },
  { cause: 'mistake', label: '誤送信・処理ミス', title: '取扱いと報告の手順を共有', description: '日々の情報の扱い方を、チームで見直す。', questions: ['情報を取り扱うルールを担当者に共有していますか？', 'ミスに気づいたときの報告先が分かりますか？'], url: guide, source: 'IPA · 規程・ハンドブック・対応の手引き', icon: 'check' },
];
const paths = {
  shield: '<path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6z"/><path d="m8 12 3 3 5-6"/>',
  restore: '<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/><path d="M12 8v5l3 2"/>',
  key: '<circle cx="8" cy="8" r="4"/><path d="m11 11 9 9m-4-4 3-3m-6 0 3-3"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  device: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 18h4"/>',
  check: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="m8 12 3 3 5-6"/>',
};
export function renderLearning() {
  return `<div class="learning-intro"><p class="eyebrow">LEARN / 事例から備えへ</p><h2 id="learning-title" tabindex="-1">記録を、自分たちの備えに。</h2><p>過去の公表記録を読み、公的な対策資料で見直す項目を考えます。<br>組織の勉強会や、日々の確認の入口として使えます。</p></div><ol class="learning-steps"><li><span>1</span>原因から記録を読む</li><li><span>2</span>原資料で内容を確かめる</li><li><span>3</span>自分たちの備えを見直す</li></ol><div class="lesson-grid">${LESSONS.map(lesson => `<article class="lesson-card" id="lesson-${lesson.cause}" aria-labelledby="lesson-title-${lesson.cause}"><div class="lesson-top"><span class="lesson-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${paths[lesson.icon]}</svg></span><span>${lesson.label}</span></div><h3 id="lesson-title-${lesson.cause}">${lesson.title}</h3><p>${lesson.description}</p><ul>${lesson.questions.map(question => `<li>${question}</li>`).join('')}</ul><div class="lesson-actions"><button class="quiet-button" data-lesson-records="${lesson.cause}">日本の記録を読む →</button><a href="${lesson.url}" target="_blank" rel="noopener noreferrer">${lesson.source} ↗</a></div></article>`).join('')}</div><section class="learning-response"><div><h3>漏えいに気づいたときの対応を知る</h3><p>報告・本人への連絡・対応資料は、公的機関の最新の案内で確認できます。</p></div><a class="quiet-button" href="https://www.ppc.go.jp/personalinfo/legal/leakAction/" target="_blank" rel="noopener noreferrer">個人情報保護委員会の案内 ↗</a></section><p class="learning-context">この問いは公的資料を参考にした編集です。個別事故への対策の認定や公式の自己診断ではありません。原因が不明な記録は不明のまま扱います。資料確認：2026.10.11</p>`;
}
