import { RULES as R } from './rules.js';
// 課題の文の数字は、判定の値（rules.js）から作る。山に合わせて値を変えたとき、文と判定がずれないようにする
// （文に 2.5 秒・5 m と書いたまま、判定だけ 1.36 秒・4.8 m へ変わったことがあった）。切り上げて出す：文の数字に届けば、必ず達成になる
const up = (value, digits = 1) => (Math.ceil(value * 10 ** digits - 1e-9) / 10 ** digits).toLocaleString('ja-JP');
const TABLE = {
  practice:[['spin','360 を決める'],['practiceScore',`技の点 ${R.practiceScore.toLocaleString('ja-JP')} 以上`]],
  park:[['parkScore',`技の点 ${R.parkScore.toLocaleString('ja-JP')} 以上`],['flip','宙返りを決める']],
  bigair:[['bigAir',`滞空 ${up(R.bigAir)} 秒以上の飛びを決める`],['bigScore',`1 回の飛びで ${R.bigScore.toLocaleString('ja-JP')} 点以上`]],
  open:[['fast',`最高速度 ${up(R.fastSpeed * 3.6, 0)} km/h 以上`],['safe','転ばずに駅まで']],
  forest:[['safe','転ばずに駅まで'],['otherScore',`技の点 ${R.otherScore.toLocaleString('ja-JP')} 以上`]],
  ridge:[['ridge',`滞空 ${up(R.ridgeAir)} 秒以上の飛びを 2 回`],['otherScore',`技の点 ${R.otherScore.toLocaleString('ja-JP')} 以上`]],
  gully:[['air',`滞空の合計 ${up(R.gullyAir)} 秒以上`],['safe','転ばずに駅まで']],
  steep:[['safe','転ばずに駅まで'],['drop',`落差 ${up(R.dropHeight)} m 以上の飛びを決める`]],
};
TABLE.plateau=TABLE.open; TABLE.chute=TABLE.spine=TABLE.steep;
export function goalsFor(kind) { return [['station','駅まで滑りきる'],...(TABLE[kind] ?? TABLE.open)].map(([id,label])=>({id,label})); }
export function evaluateGoals(kind,run) {
  const clean=(run.tricks ?? []).filter(t=>['clean','heavy'].includes(t.quality));
  const results={station:!!run.station,safe:!!run.station&&run.crashes===0,spin:clean.some(t=>t.spin>=360),flip:clean.some(t=>t.flip>=1),
    practiceScore:run.score>=R.practiceScore,parkScore:run.score>=R.parkScore,otherScore:run.score>=R.otherScore,
    bigAir:clean.some(t=>t.air>=R.bigAir),bigScore:(run.tricks ?? []).some(t=>t.score>=R.bigScore),fast:run.maxSpeed>=R.fastSpeed,
    ridge:clean.filter(t=>t.air>=R.ridgeAir).length>=2,air:run.air>=R.gullyAir,drop:clean.some(t=>t.drop>=R.dropHeight)};
  return goalsFor(kind).map(g=>results[g.id]);
}
