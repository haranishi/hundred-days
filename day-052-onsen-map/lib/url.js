// URL に残す状態（?m=指標&pref=県コード&bath=お風呂の番号）の読み書き。
// 変な値は捨てて、何を捨てたかを notices で返す（画面に小さく知らせる）。

import { DEFAULT_METRIC, METRIC_IDS, metricOf } from './metrics.js';
import { isBathId } from './baths.js';

export function readParams(search, prefCodes) {
  const params = new URLSearchParams(search);
  const notices = [];
  let metric = DEFAULT_METRIC;
  let pref = null;
  let bath = null;
  const m = params.get('m');
  if (m !== null) {
    if (METRIC_IDS.includes(m)) metric = m;
    else notices.push('metric');
  }
  const p = params.get('pref');
  if (p !== null) {
    if (prefCodes.includes(p)) pref = p;
    else notices.push('pref');
  }
  const b = params.get('bath');
  if (b !== null) {
    if (isBathId(b)) bath = b;
    else notices.push('bath');
  }
  return { metric, pref, bath, notices };
}

// 既定の指標（源泉の数）は書かない。bath は県とセットのときだけ書く
export function writeParams({ metric, pref, bath }) {
  const params = new URLSearchParams();
  if (metric && metric !== DEFAULT_METRIC) params.set('m', metric);
  if (pref) params.set('pref', pref);
  if (pref && bath) params.set('bath', bath);
  const text = params.toString();
  return text ? `?${text}` : '';
}

// where は「何を表示しているか」（全国・県名）
export function noticeText(kind, where = '全国') {
  if (kind === 'metric') return `指定された指標が見つからないので${metricOf(DEFAULT_METRIC).label}を表示しています`;
  if (kind === 'pref') return '指定された県が見つからないので全国を表示しています';
  if (kind === 'bath') return `指定されたお風呂が見つからないので${where}を表示しています`;
  return '';
}
