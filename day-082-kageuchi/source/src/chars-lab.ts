// OWNER: chars-art
// 人物の見た目と動きを単独で確かめるページ chars.html の入口。
//   ?shot=lineup|poses|gameplay|closeup…   決まった刻みを進めてから window.__shotReady=true
//   ?film=walk|run|crouch|takedown|assassinate&frames=N   window.__filmStep() で1コマずつ進めて撮る（足の滑りは window.__footSlip）
//   ?perf=1   人物10人を歩かせ、300 コマの update の時間などを window.__perfResult に
//   引数なし：全員がゆっくり歩き回る（マウスで回して見る）
import { runLab } from './art/characters/lab/run';

runLab().catch((e: unknown) => {
  const msg = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e);
  window.__labError = msg;
  console.error(msg);
});
