// さばき方ガイド画面（#/fish/<id>/<n>）：3D領域・操作札・再生バー・手順カード・なぞって練習・手順一覧シート。
import { SPECIES_META } from './species/meta.js';
import { VIEW_LABELS, formatPracticeResult, formatStepView } from './ui-format.js';
import { appendRubyText, h, icon } from './ui-icons.js';

/** ガイド画面の骨格DOMを構築し、更新用ハンドルを返す。 */
export function mountGuideView(container, { speciesId, procedure, actions }) {
  container.replaceChildren();
  const meta = SPECIES_META[speciesId] || SPECIES_META.aji;
  const totalSteps = procedure.steps.length;

  const root = h('div', { class: 'guide-layout', dataset: { mode: 'guide' } });

  // 左／上：3D領域＋札＋再生バー
  const stagePane = h('section', { class: 'stage-pane', 'aria-label': `${meta.name}の3Dガイド` });
  const stageBox = h('div', { id: 'stage', class: 'stage' });

  // 3D領域の上端に並ぶ半透明の丸いトグル札（押す場所を固定）
  const pillsBar = h('div', { class: 'stage-pills', role: 'toolbar', 'aria-label': '表示の切り替え' });

  const btnView = h('button', {
    type: 'button',
    class: 'pill pill--stage',
    dataset: { testid: 'toggle-view' },
    onClick: () => actions.onCycleView(),
  }, [icon('view'), h('span', { class: 'pill-label' }, ['台所'])]);

  const btnXray = h('button', {
    type: 'button',
    class: 'pill pill--stage',
    'aria-pressed': 'false',
    dataset: { testid: 'toggle-xray' },
    onClick: () => actions.onToggleXray(),
  }, [icon('xray'), h('span', { class: 'pill-label' }, ['透視'])]);

  const btnLabels = h('button', {
    type: 'button',
    class: 'pill pill--stage',
    'aria-pressed': 'false',
    dataset: { testid: 'toggle-labels' },
    onClick: () => actions.onToggleLabels(),
  }, [icon('label'), h('span', { class: 'pill-label' }, ['ラベル'])]);

  const btnLeft = h('button', {
    type: 'button',
    class: 'pill pill--stage',
    'aria-pressed': 'false',
    dataset: { testid: 'toggle-left' },
    onClick: () => actions.onToggleLeftHanded(),
  }, [icon('hand'), h('span', { class: 'pill-label' }, ['左利き'])]);

  const btnPractice = h('button', {
    type: 'button',
    class: 'pill pill--stage pill--practice',
    'aria-pressed': 'false',
    'aria-label': 'なぞって練習を切り替える',
    hidden: true,
    dataset: { testid: 'btn-practice' },
    onClick: () => actions.onTogglePractice(),
  }, [icon('trace'), h('span', { class: 'pill-label' }, ['練習'])]);

  pillsBar.append(btnView, btnXray, btnLabels, btnLeft, btnPractice);

  // 右下：視点リセットボタン
  const btnResetCam = h('button', {
    type: 'button',
    class: 'pill pill--stage stage-reset',
    'aria-label': 'この手順の視点に戻す',
    dataset: { testid: 'btn-reset-camera' },
    onClick: () => actions.onResetCamera(),
  }, [icon('reset')]);

  stageBox.append(pillsBar, btnResetCam);

  // 再生バー（再生／一時停止・速さ・進み具合スライダー・繰り返し）
  const playbackBar = h('div', { class: 'playback-bar', 'aria-label': '動きの再生操作' });

  const btnPlay = h('button', {
    type: 'button',
    class: 'ctrl-btn',
    'aria-pressed': 'false',
    'aria-label': '動きを再生する',
    dataset: { testid: 'btn-play' },
    onClick: () => actions.onTogglePlay(),
  }, [icon('play'), h('span', { class: 'ctrl-label' }, ['再生'])]);

  const btnSpeed = h('button', {
    type: 'button',
    class: 'ctrl-btn ctrl-btn--compact',
    'aria-label': '再生の速さを切り替える',
    dataset: { testid: 'btn-speed' },
    onClick: () => actions.onToggleSpeed(),
  }, ['1×']);

  const slider = h('input', {
    type: 'range',
    class: 'u-slider',
    min: '0',
    max: '100',
    step: '1',
    value: '0',
    'aria-label': '手順の動きの進み具合',
    dataset: { testid: 'slider-u' },
    onInput: (e) => actions.onScrubU(Number(e.target.value) / 100),
  });

  const btnLoop = h('button', {
    type: 'button',
    class: 'ctrl-btn ctrl-btn--compact',
    'aria-pressed': 'true',
    'aria-label': '繰り返し再生を切り替える',
    dataset: { testid: 'btn-loop' },
    onClick: () => actions.onToggleLoop(),
  }, [icon('repeat')]);

  playbackBar.append(btnPlay, btnSpeed, slider, btnLoop);
  stagePane.append(stageBox, playbackBar);

  // 右／下：手順カード領域＋下端の主ボタン帯
  const panelPane = h('section', { class: 'panel-pane', 'aria-label': '手順の説明と操作' });

  // 手順の進み具合（上端バー）
  const stepBar = h('div', { class: 'step-bar' });
  const stepNumEl = h('span', { class: 'step-counter', dataset: { testid: 'step-counter' } }, [`1 / ${totalSteps}`]);
  const dotsWrap = h('div', { class: 'step-dots', 'aria-hidden': 'true' });
  const dotEls = [];
  for (let i = 0; i < totalSteps; i++) {
    const dot = h('span', { class: 'step-dot' });
    dotEls.push(dot);
    dotsWrap.append(dot);
  }
  const btnSpeak = h('button', {
    type: 'button',
    class: 'icon-btn',
    'aria-label': 'この手順を声で読み上げる',
    dataset: { testid: 'btn-speak' },
    hidden: true,
    onClick: () => actions.onSpeakStep(),
  }, [icon('volume')]);

  const btnSteps = h('button', {
    type: 'button',
    class: 'button button--compact',
    dataset: { testid: 'btn-steps' },
    onClick: () => actions.onOpenStepsSheet(btnSteps),
  }, [icon('list'), '一覧']);

  stepBar.append(stepNumEl, dotsWrap, btnSpeak, btnSteps);

  // スクロール可能な本文領域（通常ガイド OR 練習パネル）
  const cardScroll = h('div', { class: 'card-scroll' });
  const guideArticle = h('article', { class: 'step-card', dataset: { testid: 'step-card' } });
  const practicePanel = h('div', { class: 'practice-panel', hidden: true, dataset: { testid: 'practice-panel' } });
  cardScroll.append(guideArticle, practicePanel);

  // 下端固定の操作帯（「前へ」＋親指の届く最大の「次へ」）
  const thumbBar = h('div', { class: 'thumb-bar' });
  const btnPrev = h('button', {
    type: 'button',
    class: 'button btn-prev',
    dataset: { testid: 'btn-prev' },
    onClick: () => actions.onPrevStep(),
  }, [icon('prev'), '前へ']);

  const btnNext = h('button', {
    type: 'button',
    class: 'button button--primary btn-next',
    dataset: { testid: 'btn-next' },
    onClick: () => actions.onNextStep(),
  }, [h('span', { class: 'btn-next-label' }, ['次へ']), icon('next')]);

  thumbBar.append(btnPrev, btnNext);
  panelPane.append(stepBar, cardScroll, thumbBar);

  root.append(stagePane, panelPane);
  container.append(root);

  let renderedStepKey = '';

  function renderStepCard(stepView, bestScore) {
    guideArticle.replaceChildren();

    // 見出し（aria-live=polite で手順切替時に読み上げる）
    const titleEl = h('h2', {
      class: 'step-title',
      'aria-live': 'polite',
      dataset: { testid: 'step-title' },
    });
    appendRubyText(titleEl, stepView.title);

    const summaryEl = h('p', { class: 'step-summary' });
    appendRubyText(summaryEl, stepView.summary);
    guideArticle.append(titleEl, summaryEl);

    // 魚の置き方（最重要項目）
    const placeEl = h('div', { class: 'place-bar' }, [
      icon('place'),
      h('span', { class: 'place-label' }, ['魚の置き方']),
      h('span', { class: 'place-text' }),
    ]);
    appendRubyText(placeEl.lastChild, stepView.place);
    guideArticle.append(placeEl);

    // どうする
    const howSec = h('div', { class: 'step-block' }, [
      h('h3', { class: 'block-heading' }, [icon('cut', 'icon icon--cut'), 'どうする']),
    ]);
    const howList = h('ul', { class: 'how-list' });
    for (const line of stepView.how) {
      const li = h('li');
      appendRubyText(li, line);
      howList.append(li);
    }
    howSec.append(howList);
    guideArticle.append(howSec);

    // 手の位置（青＋手の印）
    if (stepView.hands.length > 0) {
      const handBox = h('div', { class: 'hand-box' });
      for (const hand of stepView.hands) {
        const row = h('p', { class: 'hand-row' }, [
          icon('hand', 'icon icon--hand'),
          h('strong', {}, [`${hand.whoLabel}：`]),
        ]);
        appendRubyText(row, hand.text);
        handBox.append(row);
      }
      guideArticle.append(handBox);
    }

    // 道具のチップ＋ベスト記録
    const toolsRow = h('div', { class: 'tools-row' });
    for (const tool of stepView.tools) {
      const chip = h('span', { class: 'chip chip--tool' }, [icon('knife')]);
      appendRubyText(chip, tool.label);
      toolsRow.append(chip);
    }
    if (bestScore !== null && bestScore !== undefined) {
      toolsRow.append(h('span', { class: 'chip chip--best' }, [`練習ベスト ${bestScore}点`]));
    }
    if (toolsRow.childNodes.length > 0) guideArticle.append(toolsRow);

    // コツ・やりがち・できた目印・安全
    const notes = h('dl', { class: 'step-notes' });
    const addNote = (iconName, iconCls, label, text, rowCls = '') => {
      if (!text) return;
      const dt = h('dt', { class: rowCls }, [icon(iconName, `icon ${iconCls}`), label]);
      const dd = h('dd', { class: rowCls });
      appendRubyText(dd, text);
      notes.append(dt, dd);
    };
    addNote('tip', '', 'コツ', stepView.tip);
    addNote('alert', 'icon--muted', 'やりがち', stepView.mistake);
    addNote('check', 'icon--done', 'できた目印', stepView.done, 'note--done');
    if (stepView.safety) {
      addNote('alert', 'icon--warn', '安全の注意', stepView.safety, 'note--warn');
    }
    guideArticle.append(notes);
  }

  function renderPracticeArea({ stepView, practiceResult, statusText }) {
    practicePanel.replaceChildren();

    if (!practiceResult) {
      const box = h('div', { class: 'practice-prompt' }, [
        h('div', { class: 'practice-head' }, [
          h('span', { class: 'badge badge--cut' }, [icon('cut', 'icon icon--cut'), 'なぞって練習']),
          h('h2', { class: 'step-title', 'aria-live': 'polite' }, [stepView.title]),
        ]),
        h('p', { class: 'practice-inst' }, [
          '光っている線を、指で一筆でなぞります。小刻みに動かさず、一定の速さで引いてみましょう。',
        ]),
        h('p', { class: 'practice-status', role: 'status', 'aria-live': 'polite' }, [
          statusText || '上の図の朱色の線に沿ってなぞってください。',
        ]),
        h('div', { class: 'practice-actions' }, [
          h('button', {
            type: 'button',
            class: 'button',
            dataset: { testid: 'btn-practice-exit' },
            onClick: () => actions.onExitPractice(),
          }, ['ガイドに戻る（やめる）']),
        ]),
      ]);
      practicePanel.append(box);
      return;
    }

    const fmt = formatPracticeResult(practiceResult.result, practiceResult.previousBest);
    const card = h('div', { class: 'practice-result', dataset: { testid: 'practice-result' } }, [
      h('div', { class: 'result-header' }, [
        h('span', { class: 'result-metric-label' }, [fmt.metricLabel]),
        fmt.isNewBest ? h('span', { class: 'badge badge--done' }, ['✓ ベスト更新']) : null,
      ]),
      h('div', { class: 'result-score-row' }, [
        h('p', { class: 'result-score' }, [
          h('strong', {}, [String(fmt.score)]),
          h('span', {}, ['点']),
        ]),
        h('p', { class: 'result-grade', 'aria-label': `ランク ${fmt.grade}` }, [
          h('span', { class: 'grade-symbol', 'aria-hidden': 'true' }, [fmt.gradeSymbol]),
          h('span', {}, [`ランク ${fmt.grade}`]),
        ]),
      ]),
      h('dl', { class: 'result-metrics' }, [
        h('div', {}, [h('dt', {}, ['一致度']), h('dd', {}, [`${fmt.accuracyPct}%`])]),
        h('div', {}, [h('dt', {}, ['なめらかさ']), h('dd', {}, [`${fmt.smoothnessPct}%`])]),
        h('div', {}, [h('dt', {}, ['線のカバー']), h('dd', {}, [`${fmt.coveragePct}%`])]),
      ]),
      h('p', { class: 'result-comment' }, [fmt.comment]),
      h('p', { class: 'small-note muted' }, [
        '※この点数は、お手本の切り線に沿って一筆で引けたか（ガイドとの一致度）の目安です。',
      ]),
      h('div', { class: 'practice-actions' }, [
        h('button', {
          type: 'button',
          class: 'button',
          dataset: { testid: 'btn-practice-retry' },
          onClick: () => actions.onRetryPractice(),
        }, [icon('reset'), 'もう一度']),
        h('button', {
          type: 'button',
          class: 'button button--primary',
          dataset: { testid: 'btn-practice-next' },
          onClick: () => actions.onNextAfterPractice(),
        }, ['次へ', icon('next')]),
      ]),
    ]);
    practicePanel.append(card);
  }

  function update({ state, practiceResult, practiceStatus, speechSupported, forcePracticeButton = false }) {
    const stepRaw = procedure.steps[state.step];
    if (!stepRaw) return;
    const stepView = formatStepView(stepRaw, state.step, totalSteps, state.leftHanded);
    const bestScore = state.best && state.best[speciesId] ? state.best[speciesId][stepRaw.id] : null;

    root.dataset.mode = state.mode;

    // 札の状態
    const shortView = state.view === 'cook' ? '台所' : (VIEW_LABELS[state.view] || state.view);
    btnView.querySelector('.pill-label').textContent = shortView;
    btnView.setAttribute('aria-label', `視点を切り替える（現在：${VIEW_LABELS[state.view]}）`);
    btnXray.setAttribute('aria-pressed', String(state.xray));
    btnLabels.setAttribute('aria-pressed', String(state.labels));
    btnLeft.setAttribute('aria-pressed', String(state.leftHanded));

    const showPracticeBtn = stepView.hasPractice || state.mode === 'practice' || forcePracticeButton;
    btnPractice.hidden = !showPracticeBtn;
    btnPractice.setAttribute('aria-pressed', String(state.mode === 'practice'));

    // 再生バーと下端バー（練習中は専用ボタンを優先し、結果カードを画面内に収める）
    playbackBar.hidden = state.mode === 'practice';
    thumbBar.hidden = state.mode === 'practice';
    btnPlay.setAttribute('aria-pressed', String(state.playing));
    btnPlay.setAttribute('aria-label', state.playing ? '一時停止する' : '動きを再生する');
    btnPlay.replaceChildren(icon(state.playing ? 'pause' : 'play'), h('span', { class: 'ctrl-label' }, [state.playing ? '停止' : '再生']));
    btnSpeed.textContent = state.speed === 0.5 ? '0.5×' : '1×';
    btnSpeed.setAttribute('aria-pressed', String(state.speed === 0.5));
    btnLoop.setAttribute('aria-pressed', String(state.loop));
    slider.value = String(Math.round(state.u * 100));

    // ステップ番号・ドット
    stepNumEl.textContent = `${stepView.stepNumber} / ${totalSteps}`;
    dotEls.forEach((dot, idx) => {
      dot.dataset.state = idx === state.step ? 'current' : idx < state.step ? 'done' : 'todo';
    });
    btnSpeak.hidden = !speechSupported;

    // 前へ／次へボタン
    btnPrev.disabled = state.step <= 0;
    const isLast = state.step >= totalSteps - 1;
    btnNext.querySelector('.btn-next-label').textContent = isLast ? 'できた・部位を見る' : '次へ';

    // 手順カード or 練習パネル
    if (state.mode === 'practice') {
      guideArticle.hidden = true;
      practicePanel.hidden = false;
      renderPracticeArea({ stepView, practiceResult, statusText: practiceStatus });
      renderedStepKey = '';
    } else {
      guideArticle.hidden = false;
      practicePanel.hidden = true;
      const key = `${state.step}|${state.leftHanded}|${bestScore ?? ''}`;
      if (key !== renderedStepKey) {
        renderedStepKey = key;
        renderStepCard(stepView, bestScore);
        cardScroll.scrollTop = 0;
      }
    }
  }

  return {
    stageEl: stageBox,
    update,
    updateSlider(u) {
      slider.value = String(Math.round(Math.min(1, Math.max(0, u)) * 100));
    },
  };
}

/** 手順一覧シート（<dialog>）の中身を描画する。 */
export function renderStepsSheet(bodyEl, { speciesId, procedure, currentStep, leftHanded, bestTable, onSelectStep }) {
  bodyEl.replaceChildren();
  const list = h('ol', { class: 'steps-sheet-list' });
  procedure.steps.forEach((st, idx) => {
    const view = formatStepView(st, idx, procedure.steps.length, leftHanded);
    const isCurrent = idx === currentStep;
    const bestScore = bestTable && bestTable[st.id] !== undefined ? bestTable[st.id] : null;
    const btn = h('button', {
      type: 'button',
      class: 'steps-sheet-item',
      'aria-current': isCurrent ? 'step' : null,
      dataset: { testid: `step-item-${idx + 1}` },
      onClick: () => onSelectStep(idx),
    }, [
      h('span', { class: 'steps-sheet-num' }, [`${idx + 1}`]),
      h('span', { class: 'steps-sheet-text' }, [
        h('strong', { class: 'steps-sheet-title' }),
        h('span', { class: 'steps-sheet-place' }),
      ]),
      bestScore !== null ? h('span', { class: 'badge badge--done' }, [`${bestScore}点`]) : null,
      isCurrent ? h('span', { class: 'badge badge--current' }, ['いまここ']) : null,
    ]);
    appendRubyText(btn.querySelector('.steps-sheet-title'), view.title);
    appendRubyText(btn.querySelector('.steps-sheet-place'), view.place);
    list.append(h('li', {}, [btn]));
  });
  bodyEl.append(list);
}
