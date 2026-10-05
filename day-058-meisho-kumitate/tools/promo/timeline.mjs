// 宣伝動画の台本。録画（cache/solo.webm・duo.webm）のどこを使い、字幕と効果音をいつ置くかを、
// record-game.mjs が記録した出来事の時刻（cache/events.json・ミリ秒）から決める。
// 出力の時刻はすべて動画の頭からの秒。

const s = (ms) => ms / 1000;
const END_CARD = 3.6;

export function buildTimeline(events) {
  const solo = events.solo;
  const duo = events.duo;
  // 組み立ての進み具合は 15 秒で 0→1。色が付き始めるのは 0.72
  const paint1 = s(solo.building1) + 0.72 * 15;

  const segments = [
    { name: 'title', src: 'solo', from: s(solo.title) + 0.2, to: s(solo.title) + 2.6 },
    { name: 'white', src: 'solo', from: s(solo.building1) + 3.0, to: s(solo.building1) + 6.0 },
    { name: 'paint', src: 'solo', from: paint1 - 2.0, to: s(solo.buzz1) },
    { name: 'answer', src: 'solo', from: s(solo.buzz1), to: s(solo.reveal1) + 2.5 },
    { name: 'second', src: 'solo', from: s(solo.building2) + 5.5, to: s(solo.building2) + 8.0 },
    { name: 'duo', src: 'duo', from: s(duo.p1Buzz) - 1.6, to: s(duo.p2Reveal) + 1.8 },
  ];
  let at = 0;
  for (const seg of segments) {
    seg.start = at;
    seg.length = seg.to - seg.from;
    at += seg.length;
  }
  const endCard = { start: at, length: END_CARD };
  const total = at + END_CARD;
  const seg = Object.fromEntries(segments.map((x) => [x.name, x]));
  // 元の録画の時刻 → 出力の時刻
  const out = (name, ms) => seg[name].start + (s(ms) - seg[name].from);

  const captions = [
    // タイトルの画面では、上の題字を隠さないよう島の上に置く
    { text: '白い模型、どこの名所？', from: 0, to: seg.white.start, top: 1060 },
    { text: '少しずつ、組み上がる', from: seg.white.start, to: seg.paint.start },
    { text: '色が付いたら、わかる？', from: seg.paint.start, to: out('paint', paint1 * 1000 + 300) },
    { text: 'わかったら、早押し！', from: out('paint', paint1 * 1000 + 300), to: seg.answer.start },
    { text: '4択で答える', from: seg.answer.start, to: out('answer', solo.reveal1) },
    { text: '正解！ 早いほど高得点', from: out('answer', solo.reveal1), to: seg.second.start },
    { text: '日本32・世界36、68名所', from: seg.second.start, to: seg.duo.start },
    { text: '1台をふたりで囲んでも', from: seg.duo.start, to: out('duo', duo.p1Wrong) },
    { text: 'まちがえると −200点', from: out('duo', duo.p1Wrong), to: out('duo', duo.p2Reveal) },
    { text: '相手に取り返される！', from: out('duo', duo.p2Reveal), to: endCard.start },
  ];

  // 効果音（ゲームと同じ合成の音）。時刻はゲームの中で鳴る瞬間に合わせる
  const cues = [
    { sound: 'buzz', at: seg.answer.start },
    { sound: 'correct', at: out('answer', solo.reveal1) },
    { sound: 'buzz', at: out('duo', duo.p1Buzz) },
    { sound: 'wrong', at: out('duo', duo.p1Wrong) },
    { sound: 'buzz', at: out('duo', duo.p2Buzz) },
    { sound: 'correct', at: out('duo', duo.p2Reveal) },
    { sound: 'fanfare', at: endCard.start + 0.15 },
  ];

  return { segments, endCard, total, captions, cues };
}
