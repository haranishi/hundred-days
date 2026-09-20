import { ageRange, environment } from './geology.js';
import { formatDistance } from './geo.js';
export function answerFor(collection, envTable) {
  const env = environment(collection.env, envTable);
  const distance = formatDistance(collection.distance);
  const age = ageRange(collection.eag, collection.lag);
  const setting = env ? `、${env.phrase}の記録` : 'の記録';
  // 離れた記録を、選んだ地点の過去だと読ませない。
  return collection.distance >= 50
    ? `いちばん近い記録は${distance}先。${age}${setting}です。`
    : `${distance}先で見つかった、${age}${setting}です。`;
}
export function setState(name, message = '') {
  document.getElementById('app').dataset.state = name;
  for (const [id, show] of Object.entries({ answer: name === 'ready', failure: name === 'error',
    'no-records': name === 'none', skeleton: name === 'loading', results: name === 'ready' })) {
    document.getElementById(id).hidden = !show;
  }
  document.getElementById('status').textContent = message;
  document.getElementById('failure-text').textContent = name === 'error' ? message : '';
  document.getElementById('status').hidden = !message || name === 'error';
}
