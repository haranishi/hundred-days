import { ACTION_META, ITEMS } from './items.js';

export const MODES = {
  rush: {
    id: 'rush',
    label: '60秒タイムアタック',
    subLabel: '次々流れる荷物を制限時間内に高速仕分け',
    durationSeconds: 60,
    targetCount: null
  },
  training: {
    id: 'training',
    label: '厳選10問・研修シフト',
    subLabel: '時間制限なし・空港で一番引っかかる10品をじっくり確認',
    durationSeconds: null,
    targetCount: 10
  }
};

export const VALID_ACTIONS = ['carry_on', 'checked', 'prohibited'];

/**
 * 決定論的または乱数関数注入可能なフィッシャー・イェーツシャッフル
 * @template T
 * @param {readonly T[]} list
 * @param {() => number} [rng=Math.random]
 * @returns {T[]}
 */
export function shuffleList(list, rng = Math.random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const raw = Number(rng());
    const normalized = Number.isFinite(raw) ? Math.min(0.999999, Math.max(0, raw)) : 0;
    const j = Math.floor(normalized * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

/**
 * モードに応じた出題デッキを作成する
 * @param {'rush' | 'training'} mode
 * @param {() => number} [rng=Math.random]
 */
export function buildDeck(mode = 'rush', rng = Math.random) {
  if (mode === 'training') {
    const featured = ITEMS.filter((item) => item.featuredInTraining);
    const others = ITEMS.filter((item) => !item.featuredInTraining);
    const picked = [...shuffleList(featured, rng), ...shuffleList(others, rng)].slice(0, MODES.training.targetCount);
    return picked;
  }
  return shuffleList(ITEMS, rng);
}

/**
 * アイテムに対する仕分けアクションの正誤を判定する純関数
 * @param {object} item
 * @param {string} chosenAction - 'carry_on' | 'checked' | 'prohibited'
 */
export function evaluateChoice(item, chosenAction) {
  if (!item || !Array.isArray(item.allowed)) {
    throw new Error('Invalid item provided to evaluateChoice');
  }
  if (!VALID_ACTIONS.includes(chosenAction)) {
    throw new Error(`Invalid action: ${chosenAction}`);
  }

  const isCorrect = item.allowed.includes(chosenAction);
  const chosenMeta = ACTION_META[chosenAction];
  const allowedLabels = item.allowed.map((act) => ACTION_META[act]?.label || act).join(' または ');

  return {
    isCorrect,
    itemId: item.id,
    chosenAction,
    chosenLabel: chosenMeta.label,
    allowedActions: [...item.allowed],
    allowedLabels,
    ruleBadge: item.ruleBadge,
    shortReason: item.shortReason,
    detailRule: item.detailRule
  };
}

/**
 * 新しいゲームセッション状態を作成する
 * @param {'rush' | 'training'} [mode='rush']
 * @param {() => number} [rng=Math.random]
 */
export function createGameState(mode = 'rush', rng = Math.random) {
  const safeMode = MODES[mode] ? mode : 'rush';
  const deck = buildDeck(safeMode, rng);
  return {
    mode: safeMode,
    status: 'playing', // 'playing' | 'finished'
    remainingSeconds: MODES[safeMode].durationSeconds,
    score: 0,
    combo: 0,
    maxCombo: 0,
    correctCount: 0,
    mistakeCount: 0,
    totalAnswered: 0,
    targetCount: MODES[safeMode].targetCount,
    deck,
    currentIndex: 0,
    currentItem: deck[0] || null,
    nextItem: deck[1] || null,
    history: [],
    lastFeedback: null
  };
}

/**
 * 現在のトレイアイテムを仕分け、次の状態を返す純関数
 * @param {object} state
 * @param {'carry_on' | 'checked' | 'prohibited'} action
 * @param {object} [options]
 * @param {number} [options.elapsedMs=1500] - トレイ表示からの経過ミリ秒
 * @param {() => number} [options.rng=Math.random]
 */
export function submitAction(state, action, { elapsedMs = 1500, rng = Math.random } = {}) {
  if (!state || state.status !== 'playing' || !state.currentItem) {
    return state;
  }

  const item = state.currentItem;
  const result = evaluateChoice(item, action);

  let nextCombo = state.combo;
  let gainedPoints = 0;

  if (result.isCorrect) {
    nextCombo = state.combo + 1;
    const basePoints = 100;
    const comboBonus = Math.min(nextCombo, 10) * 20;
    const speedBonus = state.mode === 'rush' && elapsedMs <= 2500 ? 30 : 0;
    gainedPoints = basePoints + comboBonus + speedBonus;
  } else {
    nextCombo = 0;
    gainedPoints = 0;
  }

  const nextScore = state.score + gainedPoints;
  const nextMaxCombo = Math.max(state.maxCombo, nextCombo);
  const nextCorrect = state.correctCount + (result.isCorrect ? 1 : 0);
  const nextMistake = state.mistakeCount + (result.isCorrect ? 0 : 1);
  const nextTotal = state.totalAnswered + 1;

  const entry = {
    item,
    chosenAction: action,
    chosenLabel: result.chosenLabel,
    allowedActions: result.allowedActions,
    allowedLabels: result.allowedLabels,
    isCorrect: result.isCorrect,
    gainedPoints,
    comboAfter: nextCombo,
    shortReason: item.shortReason,
    detailRule: item.detailRule,
    ruleBadge: item.ruleBadge
  };

  const nextHistory = [...state.history, entry];

  // 研修モードの規定問題数に達したか判定
  if (state.targetCount && nextTotal >= state.targetCount) {
    return {
      ...state,
      status: 'finished',
      score: nextScore,
      combo: nextCombo,
      maxCombo: nextMaxCombo,
      correctCount: nextCorrect,
      mistakeCount: nextMistake,
      totalAnswered: nextTotal,
      currentIndex: state.currentIndex + 1,
      currentItem: null,
      nextItem: null,
      history: nextHistory,
      lastFeedback: entry
    };
  }

  // 次のアイテムを取り出す（rushモードでデッキ末尾付近に達したら再シャッフル補充）
  let nextDeck = state.deck;
  let nextIndex = state.currentIndex + 1;
  if (nextIndex + 1 >= nextDeck.length && !state.targetCount) {
    const reshuffled = shuffleList(ITEMS, rng);
    // 直前のアイテムと連続しないよう配慮
    if (reshuffled.length > 1 && reshuffled[0].id === item.id) {
      const swap = reshuffled[1];
      reshuffled[1] = reshuffled[0];
      reshuffled[0] = swap;
    }
    nextDeck = [...nextDeck, ...reshuffled];
  }

  return {
    ...state,
    score: nextScore,
    combo: nextCombo,
    maxCombo: nextMaxCombo,
    correctCount: nextCorrect,
    mistakeCount: nextMistake,
    totalAnswered: nextTotal,
    deck: nextDeck,
    currentIndex: nextIndex,
    currentItem: nextDeck[nextIndex] || null,
    nextItem: nextDeck[nextIndex + 1] || null,
    history: nextHistory,
    lastFeedback: entry
  };
}

/**
 * 1秒経過（または任意秒経過）時のタイマー更新純関数
 * @param {object} state
 * @param {number} [deltaSeconds=1]
 */
export function tickTimer(state, deltaSeconds = 1) {
  if (!state || state.status !== 'playing' || state.remainingSeconds === null) {
    return state;
  }
  const step = Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? deltaSeconds : 1;
  const nextRemaining = Math.max(0, state.remainingSeconds - step);
  if (nextRemaining <= 0) {
    return {
      ...state,
      remainingSeconds: 0,
      status: 'finished',
      currentItem: null
    };
  }
  return {
    ...state,
    remainingSeconds: nextRemaining
  };
}

/**
 * 結果からランクと称号を計算する純関数
 * @param {object} state
 */
export function calculateRank(state) {
  const total = state?.totalAnswered || 0;
  const correct = state?.correctCount || 0;
  const score = state?.score || 0;
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;

  if (state?.mode === 'training') {
    if (correct >= 10) {
      return {
        grade: 'S',
        title: '伝説の保安検査長',
        comment: '10問すべて完璧に仕分けました！危険物・制限品のルールを完全に把握しています。',
        accuracy
      };
    }
    if (correct >= 8) {
      return {
        grade: 'A',
        title: '熟練の主任検査官',
        comment: '高い正答率です！引っかかりやすい特例品だけ出発前にもう一度チェックしておきましょう。',
        accuracy
      };
    }
    if (correct >= 6) {
      return {
        grade: 'B',
        title: '一人前の保安検査員',
        comment: '基本ルールは押さえています。バッテリー・液体・ヘアアイロンの境界線を復習すると安心です。',
        accuracy
      };
    }
    return {
      grade: 'C',
      title: '研修中の新人検査員',
      comment: '飛行機の手荷物には意外な罠がたくさんあります。下の復習リストでNG理由を確認してみましょう！',
      accuracy
    };
  }

  // rushモード（60秒タイムアタック）
  if (score >= 2800 && accuracy >= 85) {
    return {
      grade: 'S',
      title: '伝説の保安検査長',
      comment: '圧倒的なスピードと正確さ！ピーク時の保安検査レーンもあなたがいれば詰まりません。',
      accuracy
    };
  }
  if (score >= 1800 && accuracy >= 75) {
    return {
      grade: 'A',
      title: '熟練の主任検査官',
      comment: '素早く的確な判断力です！迷いやすい特例アイテムを覚えればさらにスコアが伸びます。',
      accuracy
    };
  }
  if (score >= 900) {
    return {
      grade: 'B',
      title: '一人前の保安検査員',
      comment: '着実に荷物をさばけました。間違えた荷物の理由を確認して、もう1シフト挑戦してみましょう！',
      accuracy
    };
  }
  return {
    grade: 'C',
    title: '研修中の新人検査員',
    comment: 'まずは「バッテリーは機内」「刃物は預け」「160Wh超や防水スプレーは不可」の3原則から覚えましょう！',
    accuracy
  };
}

/**
 * 間違えたアイテムの復習リスト（ミス0件なら重要ポイント3選）を返す
 * @param {object} state
 */
export function getReviewItems(state) {
  const history = Array.isArray(state?.history) ? state.history : [];
  const mistakes = [];
  const seen = new Set();

  for (const entry of history) {
    if (!entry.isCorrect && entry.item && !seen.has(entry.item.id)) {
      seen.add(entry.item.id);
      mistakes.push({
        item: entry.item,
        chosenLabel: entry.chosenLabel,
        allowedLabels: entry.allowedLabels,
        isMistake: true
      });
    }
  }

  if (mistakes.length > 0) {
    return {
      hasMistakes: true,
      heading: `今回まちがえた荷物（${mistakes.length}件）`,
      items: mistakes
    };
  }

  // ミス0件（または未回答）の場合は重要ポイント3品目をピックアップ
  const highlights = ITEMS.filter((item) =>
    ['powerbank-10000', 'hair-iron-fixed-battery', 'lotion-150ml-intl'].includes(item.id)
  ).map((item) => ({
    item,
    chosenLabel: null,
    allowedLabels: item.allowed.map((act) => ACTION_META[act]?.label || act).join(' または '),
    isMistake: false
  }));

  return {
    hasMistakes: false,
    heading: 'ミスなし完璧！出発前に押さえておきたい重要3品目',
    items: highlights
  };
}
