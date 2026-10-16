const m = (s) => { const [h, min] = s.split(':').map(Number); return h * 60 + min; };
const stop = (station, arrive, depart = arrive) => ({ station, arrive: m(arrive), depart: m(depart) });
const train = (id, name, color, stops, express = false) => ({ id, name, color, stops, express });
const person = (id, name, role, portrait, recordStation, recordTime, claimStation, claimTime, words) => ({
  id, name, role, portrait,
  record: { station: recordStation, time: m(recordTime) },
  claim: { station: claimStation, time: m(claimTime) }, words
});
export const CASES = [
  {
    id: 'blue-ticket', title: '消えた青い切符', subtitle: 'まずは、到着時刻を。',
    intro: '開業記念展まで、あと3日。準備中の展示台から青い切符が消えた。3人の話を聞き、その行方を追おう。',
    difficulty: '入門', theme: '所要時間', start: m('18:00'), end: m('18:55'), transferMinutes: 2,
    hints: ['確認記録は、確実にいた駅と時刻。そこから乗れる列車を探そう。', '星見温泉へは汐見中央と霧山を経由する。途中駅の発車時刻にも注目。'],
    trains: [
      train('A1', '海岸線 101', '#e5b36a', [stop('harbor','18:05'),stop('central','18:14','18:16'),stop('forest','18:24')]),
      train('A2', '山手線 201', '#7ec9bd', [stop('central','18:18'),stop('ridge','18:28','18:30'),stop('onsen','18:38')]),
      train('A3', '海岸線 102', '#e5b36a', [stop('forest','18:07'),stop('central','18:15','18:17'),stop('harbor','18:26')]),
      train('A4', '山手線 202', '#7ec9bd', [stop('onsen','18:09'),stop('ridge','18:17','18:19'),stop('central','18:29')]),
      train('A5', '海岸線 103', '#e5b36a', [stop('harbor','18:31'),stop('central','18:40','18:42'),stop('forest','18:50')])
    ],
    people: [
      person('shiori','水瀬 栞','古書店の店主',0,'central','18:12','ridge','18:30','山の古本市へ。18時30分には、霧山の駅前にいました。'),
      person('toru','朝倉 透','旅行写真家',1,'harbor','18:04','onsen','18:30','港の撮影を終えて列車へ。18時30分には、星見温泉に着いていました。'),
      person('akari','三好 灯','パン屋の配達員',2,'forest','18:06','harbor','18:30','白樺で配達を済ませ、灯台港へ戻りました。18時30分には港にいました。')
    ]
  },
  {
    id: 'two-minutes', title: '二分間の空白', subtitle: 'つながる列車、乗れる列車。',
    intro: '翌日の中央駅で目撃された、青い封筒。「すぐ乗り換えた」という証言は、ホームを移る時間まで数えても成り立つだろうか。',
    difficulty: '中級', theme: '乗換時間', start: m('19:00'), end: m('19:45'), transferMinutes: 2,
    hints: ['別の列車への乗換えには、どの駅でも2分かかる。同じ列車なら降りなくていい。', '汐見中央の19:13着と19:14発。その1分で、ホームを移れるだろうか。'],
    trains: [
      train('B1','海岸線 111','#e5b36a',[stop('harbor','19:04'),stop('central','19:13','19:14'),stop('forest','19:22')]),
      train('B2','山手線 211','#7ec9bd',[stop('central','19:14'),stop('ridge','19:24','19:25'),stop('onsen','19:33')]),
      train('B3','山手線 213','#7ec9bd',[stop('central','19:20'),stop('ridge','19:30','19:32'),stop('onsen','19:40')]),
      train('B4','海岸線 112','#e5b36a',[stop('forest','19:01'),stop('central','19:09','19:11'),stop('harbor','19:20')]),
      train('B5','山手線 212','#7ec9bd',[stop('onsen','19:02'),stop('ridge','19:10','19:12'),stop('central','19:22')])
    ],
    people: [
      person('akari','三好 灯','パン屋の配達員',2,'harbor','19:03','ridge','19:25','港での配達を終え、中央で山手線に乗り換えました。19時25分には、霧山にいました。'),
      person('toru','朝倉 透','旅行写真家',1,'forest','19:00','harbor','19:25','白樺での撮影を終えて列車へ。19時25分には、灯台港へ戻っています。'),
      person('shiori','水瀬 栞','古書店の店主',0,'ridge','19:10','central','19:25','古本市を後にして、中央の店へ。19時25分には、汐見中央にいました。')
    ]
  },
  {
    id: 'passing-station', title: '窓の向こうの駅', subtitle: 'そこを通っても、降りられない。',
    intro: 'いよいよ展示前夜。青い封筒と古い時刻表の紙片を手に、夜の急行の証言を追う。「窓から見た駅」で、本当に降りられただろうか。',
    difficulty: '上級', theme: '急行の停車駅', start: m('20:00'), end: m('20:48'), transferMinutes: 2,
    hints: ['急行は、灯台港と星見温泉にだけ停まる。時刻表の「通過」をよく見よう。', '霧山へ行くには汐見中央から普通列車へ。急行の窓から見えても、そこで降りることはできない。'],
    trains: [
      train('C1','急行 ほしあかり','#e5a08c',[stop('harbor','20:06'),stop('onsen','20:27')],true),
      train('C2','海岸線 121','#e5b36a',[stop('harbor','20:10'),stop('central','20:19','20:21'),stop('forest','20:29')]),
      train('C3','山手線 221','#7ec9bd',[stop('central','20:24'),stop('ridge','20:34','20:36'),stop('onsen','20:44')]),
      train('C4','海岸線 122','#e5b36a',[stop('forest','20:03'),stop('central','20:11','20:13'),stop('harbor','20:22')]),
      train('C5','山手線 222','#7ec9bd',[stop('onsen','20:00'),stop('ridge','20:08','20:10'),stop('central','20:20')])
    ],
    people: [
      person('toru','朝倉 透','旅行写真家',1,'harbor','20:05','onsen','20:30','夜の撮影は温泉街で。20時30分には、星見温泉に着いていました。'),
      person('akari','三好 灯','パン屋の配達員',2,'forest','20:02','harbor','20:25','白樺から海岸線に乗りました。20時25分には灯台港で、配達の片付けをしていました。'),
      person('shiori','水瀬 栞','古書店の店主',0,'harbor','20:05','ridge','20:25','港から急行に乗りました。20時25分には霧山で、古書仲間に会っていました。')
    ]
  }
];
