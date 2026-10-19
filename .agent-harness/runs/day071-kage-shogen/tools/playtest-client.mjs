// playtest-server.mjs を呼ぶ小さなクライアント（curl が使えない環境向け）。結果のJSONを標準出力へ出す。
// 使い方: node playtest-client.mjs <PORT> <コマンド> [引数...]
//   state                         今の画面の文字・押せる部品・ゲームの状態
//   shot <name> [full]            スクリーンショット（返った path を Read で見る）
//   click <x> <y> | click-text <文字>   タップ
//   drag <x1> <y1> <x2> <y2> [steps]    押す→少しずつ動かす→離す
//   press <key> [times]           キー（例: ArrowDown 5 / Shift+ArrowDown 3 / Tab）
//   scroll <dy>                   縦スクロール
//   wait <ms>                     待つ
//   restart [width] [height] [unlock]   新しいセッション（unlock=N で最初のN夜を解決済みに）
//   reload                        再読み込み
//   events                        起きたエラー・警告
const [port, command, ...rest] = process.argv.slice(2);
if (!port || !command) { console.error('使い方: node playtest-client.mjs <PORT> <コマンド> [引数...]'); process.exit(1); }
const base = `http://127.0.0.1:${port}`;
const num = (value) => Number(value);
const routes = {
  state: () => ['GET', '/state'],
  shot: ([name = 'shot', full]) => ['GET', `/shot?name=${encodeURIComponent(name)}&full=${full ? 1 : 0}`],
  events: () => ['GET', '/events'],
  click: ([x, y]) => ['POST', '/click', { x: num(x), y: num(y) }],
  'click-text': ([text, nth]) => ['POST', '/click', { text, nth: nth ? num(nth) : 0 }],
  drag: ([x1, y1, x2, y2, steps]) => ['POST', '/drag', { from: { x: num(x1), y: num(y1) }, to: { x: num(x2), y: num(y2) }, steps: steps ? num(steps) : undefined }],
  press: ([key, times]) => ['POST', '/press', { key, times: times ? num(times) : 1 }],
  scroll: ([dy]) => ['POST', '/scroll', { dy: num(dy) }],
  wait: ([ms]) => ['POST', '/wait', { ms: num(ms) }],
  restart: ([width, height, unlock]) => ['POST', '/restart', { width: width ? num(width) : undefined, height: height ? num(height) : undefined, unlock: unlock ? num(unlock) : 0 }],
  reload: () => ['POST', '/reload', {}],
};
const route = routes[command];
if (!route) { console.error(`不明なコマンド: ${command}。使えるもの: ${Object.keys(routes).join(' ')}`); process.exit(1); }
const [method, path, body] = route(rest);
const response = await fetch(base + path, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
console.log(await response.text());
