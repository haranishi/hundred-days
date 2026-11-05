import { FOOD_GROUPS, selectedGroup, selectedDish } from './food.js';
export const COMPANIONS = [
  { id: 'partner', icon: 'pair', label: 'パートナー', detail: 'ふたりで、いい時間を' },
  { id: 'friends', icon: 'friends', label: '友達', detail: 'このあと、どこ行こう' },
  { id: 'family', icon: 'home', label: '家族', detail: 'みんなで、ひと休み' },
  { id: 'solo', icon: 'walk', label: 'ひとり', detail: '自分の気分にまかせて' },
];

export const QUESTIONS = [
  {
    id: 'mood', title: 'いまの胃袋の気分は？', subtitle: '深く考えず、いちばん近いものを。',
    choices: [
      { id: 'meal', icon: 'bowl', label: 'ガッツリ満腹', detail: 'ごはん・定食・ラーメン' },
      { id: 'cafe', icon: 'cup', label: '軽め・お茶したい', detail: 'カフェ・喫茶・ベーカリー' },
      { id: 'drink', icon: 'glass', label: 'ちょっと一杯', detail: '居酒屋・バー・バル' },
      { id: 'outside', icon: 'tree', label: '外でリフレッシュ', detail: '公園・緑地・庭園' },
    ],
  },
  {
    id: 'space', title: 'どんな空間がいい？', subtitle: 'いま、どんな時間を過ごしたい？',
    choices: [
      { id: 'quiet', icon: 'leaf', label: '静かにゆっくり', detail: '会話や、ひと息つく時間を' },
      { id: 'lively', icon: 'spark', label: '賑やかでもOK', detail: 'わいわい、気軽に楽しみたい' },
    ],
  },
  {
    id: 'walk', title: 'どれくらい動ける？', subtitle: 'がんばらない距離で、見つけよう。',
    choices: [
      { id: 'near', icon: 'pin', label: 'すぐそこがいい', detail: '徒歩約3分の範囲', radius: 180, minutes: 3 },
      { id: 'stroll', icon: 'walk', label: '少し散歩してもいい', detail: '徒歩約10分の範囲', radius: 600, minutes: 10 },
    ],
  },
];

export const MOODS = {
  meal: { query: 'レストラン 定食 ラーメン 食堂', label: 'ごはん', icon: 'bowl' },
  cafe: { query: 'カフェ 喫茶 コーヒー ベーカリー', label: 'カフェ・軽食', icon: 'cup' },
  drink: { query: '居酒屋 バー バル', label: 'お酒・一杯', icon: 'glass' },
  outside: { query: '公園 緑地 庭園', label: '外でリフレッシュ', icon: 'tree' },
};

export function walkRange(id) {
  return QUESTIONS[2].choices.find((choice) => choice.id === id);
}

export function questionsFor(answers) {
  const flow = [QUESTIONS[0]];
  const groups = FOOD_GROUPS[answers.mood];
  if (groups) {
    flow.push({ id: 'genre', title: answers.mood === 'meal' ? 'まず、どれが食べたい？' : 'もう少し、気分を聞かせて。',
      subtitle: 'いまの気分に近いものを、ひとつ。', choices: groups });
    const selected = selectedGroup(answers);
    flow.push({ id: 'dish', title: selected?.title || '食べたいものを絞ろう。',
      subtitle: 'これなら食べたい、と思うものを。', choices: selected?.dishes || [] });
  }
  return [...flow, QUESTIONS[1], QUESTIONS[2]];
}

export function chooseAnswer(answers, id, value) {
  const question = questionsFor(answers).find((item) => item.id === id);
  if (!question?.choices.some((item) => item.id === value)) return answers;
  const next = { ...answers, [id]: value };
  if (id === 'mood' && answers.mood !== value) { delete next.genre; delete next.dish; }
  if (id === 'genre' && answers.genre !== value) delete next.dish;
  return next;
}

export function completeAnswers(answers) {
  return questionsFor(answers).every((question) => question.choices.some((choice) => choice.id === answers[question.id]));
}

export function searchQuery(answers) {
  return answers.mood === 'outside' ? MOODS.outside.query : selectedDish(answers)?.query || '';
}
