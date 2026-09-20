// 将来の実データ用の接続確認だけを行う開発ツール。公開版は架空デモのまま。
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { handleTrains } from '../../functions/api/day-044/trains.js';

const usage = '利用登録・用途確認後に npm run connect を端末から実行してください。キーは非表示入力し、ファイルには保存しません。';
function question(label, secret = false) {
  return new Promise((resolve, reject) => {
    let muted = false;
    const output = new Writable({ write(chunk, encoding, next) { if (!muted) process.stdout.write(chunk, encoding); next(); } });
    const reader = createInterface({ input: process.stdin, output, terminal: true, historySize: 0 });
    reader.once('SIGINT', () => { muted = false; reader.close(); reject(new Error('CANCELLED')); });
    reader.question(label, answer => { muted = false; reader.close(); if (secret) process.stdout.write('\n'); resolve(answer.trim()); });
    muted = secret;
  });
}
async function main() {
  if (process.argv.includes('--help')) { console.log(usage); return; }
  // パイプや引数からキーを渡さない。本人の端末での確認・非表示入力だけを受け付ける。
  if (!process.stdin.isTTY || !process.stdout.isTTY || process.argv.length !== 2) {
    console.error(usage); process.exitCode = 1; return;
  }
  console.log('JR東日本の対象データはチャレンジ限定です。用途・競合サービスの制約と提供期限があります。');
  console.log('登録: https://developer.odpt.org/signup');
  console.log('条件: https://developer.odpt.org/challenge_license');
  console.log('登録とメール認証を済ませ、このアプリでの利用が条件を満たすことを確認してから進んでください。');
  const confirmed = await question('確認済みの場合のみ CONFIRMED と入力（それ以外は中止）: ');
  if (confirmed !== 'CONFIRMED') { console.log('接続を中止しました。APIは呼び出していません。'); return; }
  const token = await question('チャレンジ用APIキー（非表示・保存しません）: ', true);
  if (!token || token.length > 512 || /\s/.test(token)) { console.error('キーの入力を確認してください。APIは呼び出していません。'); process.exitCode = 1; return; }
  const env = { ODPT_CHALLENGE_TOKEN: token, ODPT_USE_CONFIRMED: 'true' };
  const response = await handleTrains({ request: new Request('http://127.0.0.1:8445/api/day-044/trains'), env });
  const data = await response.json();
  if (!response.ok) {
    const reasons = { ACCESS_DENIED: 'キーやデータへのアクセス権を確認してください。', UNSUPPORTED_UPSTREAM: '実応答と現在の変換処理が一致していません。接続検証が必要です。' };
    console.error(reasons[data.code] || '列車情報を取得できませんでした。時間を置いて再試行してください。');
    process.exitCode = 1; return;
  }
  if (data.status === 'live') console.log(`山手線の有効な列車位置を${data.trains.length}件確認しました。`);
  else console.log(data.status === 'stale' ? '応答はありましたが情報が古いため、列車は表示しません。' : '応答はありましたが、現在配信されている列車位置は0件です。');
  console.log('接続確認だけで終了します。公開版は架空デモのままです。本番への設定・配信・公開は行いません。');
}
main().catch(() => { console.error('接続を中止しました。秘密値や取得内容は保存していません。'); process.exitCode = 1; });
