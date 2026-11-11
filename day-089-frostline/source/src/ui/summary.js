import { createPlayDialog, textNode, actionButton } from './play-dialog.js';
const n = v => Math.round(v).toLocaleString('ja-JP');
/** 数字 1 つぶん：値と単位の組を並べる（単位は小さく出す）。text は、つなげて読んだ形 */
const stat = (label, ...parts) => ({ label, parts, text: parts.map(([value, unit]) => `${value}${unit}`).join('') });
/** 技の 1 行。名前と点のあいだを空けて「＋」を付ける（「テール 180 419 点」は 180419 と読めた：画面の採点 1 周目） */
const trickText = trick => `${trick.name}　＋${n(trick.score)} 点`;

/**
 * 記録の画面の中身。
 * 数字は「値」と「単位」に分けて返す（「0分13秒」だけ大きく見えた：画面の採点 1 周目。単位を小さく出して、5 つの見え方をそろえる）。
 */
export function summaryContent(summary) {
  if (!summary) return null;
  const nextDrop = summary.next?.id !== summary.dropId ? summary.next : summary.other;
  const next = nextDrop && nextDrop.id !== summary.dropId ? { action: 'next', id: nextDrop.id, label: `次の一本：${nextDrop.name}` } : null;
  const again = { action: 'again', id: summary.dropId, label: '同じ地点をもう一度' };
  const primary = summary.station && next ? next : again;
  const actions = [...(next ? [next] : []), again, { action: 'map', label: '山の地図' }].map(a => ({ ...a, primary: a === primary }));
  return {
    stats: [stat('標高差', [n(summary.descent), ' m']), stat('距離', [n(summary.distance), ' m']),
      stat('時間', [String(Math.floor(summary.time / 60)), '分'], [String(Math.floor(summary.time % 60)), '秒']),
      stat('最高速度', [n(summary.maxSpeed * 3.6), ' km/h']), stat('技の点', [n(summary.score), ' 点'])],
    best: summary.bestTrick ? trickText(summary.bestTrick) : '技はまだありません',
    hasBest: !!summary.bestTrick,
    goals: summary.goals.map(g => ({ ...g, mark: g.earned ? '★' : '☆', note: g.fresh ? '今回達成' : g.earned ? '達成済み' : 'まだ' })),
    opened: summary.opened.map(d => d.name).join('・'), next: summary.next, dropId: summary.dropId,
    title: summary.dropName ? `一本の記録：${summary.dropName}` : '一本の記録',
    primary, secondary: primary === again ? next : again, actions,
  };
}

export function createSummary({ document, onNext, onAgain, onMap, onClose }) {
  const dialog = createPlayDialog({ document, screen: 'summary', title: '一本の記録', onClose });
  return { ...dialog, update(summary) {
    const m = summaryContent(summary); if (!m) return; dialog.body.replaceChildren();
    dialog.heading.textContent = m.title; dialog.element.setAttribute('aria-label', m.title);
    const stats = document.createElement('dl'); stats.className = 'summary-stats';
    for (const s of m.stats) {
      const item = document.createElement('div'), dd = document.createElement('dd');
      for (const [value, unit] of s.parts) dd.append(textNode(document, 'span', value), textNode(document, 'small', unit));
      item.append(textNode(document, 'dt', s.label), dd); stats.append(item);
    }
    const best = textNode(document, 'p', m.hasBest ? `いちばん高い技：${m.best}` : m.best, 'summary-best');
    const goals = document.createElement('ul'); goals.className = 'goal-list';
    for (const goal of m.goals) {
      const li = textNode(document, 'li', `${goal.mark} ${goal.label}`, goal.fresh ? 'fresh' : goal.earned ? 'earned' : '');
      li.append(textNode(document, 'small', `（${goal.note}）`)); goals.append(li);
    }
    const opened = textNode(document, 'p', m.opened ? `新しく開いた地点：${m.opened}` : '', 'summary-opened'); opened.hidden = !m.opened;
    const actions = document.createElement('div'); actions.className = 'summary-actions';
    for (const a of m.actions) {
      const handler = a.action === 'map' ? onMap : () => (a.action === 'again' ? onAgain : onNext)(a.id);
      const button = actionButton(document, a.action, a.label, handler);
      if (a.primary) button.className = 'primary';
      actions.append(button);
    }
    // 課題の列を、いちばん上に出す（今回取れたものは、枠と太字で強める）。
    // 数字の下に置くと今回の成果が先に目に入らず（1 周目）、別の文で上にも出すと同じ内容が二度になった（2 周目）
    dialog.body.append(goals, opened, stats, best, actions);
  } };
}
