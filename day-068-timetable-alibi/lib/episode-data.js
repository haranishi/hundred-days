import {EXTRA_TRAINS,NEXT_CHARACTERS,CONTINUATION_EVIDENCE} from './continuation-data.js';
const m=s=>{const[h,n]=s.split(':').map(Number);return h*60+n;};
const stop=(station,arrive,depart=arrive)=>({station,arrive:m(arrive),depart:m(depart)});
export const EPISODE_CASE={
 id:'the-last-promise',title:'映像の嘘',start:m('23:00'),end:m('23:59'),transferMinutes:2,
 trains:[
  {id:'E401',name:'海岸線 401',color:'#e5bd7d',stops:[stop('harbor','23:03'),stop('central','23:12','23:14'),stop('forest','23:22')]},
  {id:'EX1',name:'急行 ほしあかり',color:'#c79179',express:true,stops:[stop('harbor','23:15'),stop('onsen','23:36')]},
  {id:'M501',name:'山手線 501',color:'#7ebdb3',stops:[stop('central','23:23'),stop('ridge','23:33','23:35'),stop('onsen','23:43')]},
  {id:'R502',name:'山海直通 502',color:'#8bbab9',stops:[stop('ridge','23:22'),stop('central','23:32','23:34'),stop('harbor','23:43')]},
  {id:'LAST',name:'海岸線 最終列車',color:'#e5bd7d',stops:[stop('harbor','23:47'),stop('central','23:56')]},
  ...EXTRA_TRAINS
 ],
 people:[{id:'toru',name:'朝倉 透',record:{station:'ridge',time:m('23:14')},claim:{station:'onsen',time:m('23:36')}}]
};
export const CHARACTERS={
 toru:{name:'朝倉 透',role:'旅行写真家 / あなたの相棒',image:'./assets/toru-expressions.webp'},
 shiori:{name:'水瀬 栞',role:'古書店の店主 / 駅文庫の管理人',image:'./assets/shiori-expressions.webp'},
 you:{name:'あなた',role:'透を探している'},
 narrator:{name:'捜査の記録',role:'霧山駅'}
};
export const EVIDENCE={
 ticket:{title:'半分の青い切符',kind:'約束',summary:'取材の帰りに、透と半分ずつ持った切符。23:47、港で合流する約束。',detail:'「はぐれても、これが目印」。透は切符を二つに裂き、片方をあなたに渡した。'},
 message:{title:'23:12の伝言',kind:'メッセージ',summary:'「俺が急行に乗ったって言われても、信じるな」',detail:'透からの伝言はそこで途切れた。電話はつながらない。最後にいた霧山で、足取りを探す。'},
 footage:{title:'港の記録映像',kind:'映像',summary:'23:14、灯台港。青い傘の人物が急行へ向かっている。',detail:'栞は、この人物が透だと話す。顔は傘に隠れ、はっきり見えない。急行は23:15に港を出発する。'},
 testimony:{title:'栞の証言',kind:'証言',summary:'「透さんは23:15の急行で温泉へ。もう、ここにはいません」',detail:'急行の終点・星見温泉は23:36着。栞は港の映像を根拠に、透がその列車に乗ったと言っている。'},
 photo:{title:'カメラの最後の写真',kind:'現場の記録',summary:'保存時刻23:14。写真には、霧山の駅名標と透が写っている。',detail:'ベンチに残された透のカメラ。その最後の写真だ。カメラの保存時刻は23:14。端には、実名の書かれた赤い封筒が写り込んでいる。壁の時計は故障中なので、撮影時刻の判断には使わない。'},
 express:{title:'急行の停車駅',kind:'時刻表',summary:'23:15 灯台港 → 23:36 星見温泉。途中はすべて通過。',detail:'急行ほしあかりが停まるのは灯台港と星見温泉だけ。汐見中央と霧山では、乗り降りできない。'},
 key:{title:'閉鎖ホームの鍵',kind:'協力のしるし',summary:'栞が差し出した鍵。待合室の奥の扉を開けられる。',detail:'「追ってきた人から、透さんを隠したんです」。栞は、あなたを相棒だと信じて鍵を渡した。'},
 fragment:{title:'もう半分の切符',kind:'足取り',summary:'閉鎖ホームのベンチに落ちていた。あなたの切符と裂け目が合う。',detail:'透がここにいた。それも、ついさっきまで。階段のほうから、小さな音が聞こえる。'},
 reunion:{title:'透との再会',kind:'わかったこと',summary:'透は急行に乗っていなかった。閉鎖ホームの階段で見つかった。',detail:'透は、港の記録映像の人物は自分ではないと言う。あの青い傘は、昼に港でなくしていた。'}
};
export const PROOF_REASONS=[
 {id:'no-stop',text:'霧山は、急行の停車駅に入っていない'},
 {id:'last-train',text:'急行の発車時刻は、23:47のはずだ'},
 {id:'two-transfers',text:'霧山から温泉へは、必ず2回乗り換える'}
];
export const L=(speaker,text,mood='neutral')=>({speaker,text,mood});
export const OPENING=[
 L('narrator','22:30、霧山駅。取材の帰り、あなたと透は、雨がやむのを待っていた。'),
 L('toru','この時計、また止まってる。去年と同じ、8時40分だ。変わらないな、ここ。'),
 L('toru','23:47、港の最終列車で帰ろう。今夜の最後の一枚は、一緒に撮る。約束な。'),
 L('toru','これ、半分持ってて。はぐれても、これが目印。……子どもっぽい？','relieved')
];
export function openingReply(choice){
 return choice==='promise'?
  [L('you','約束。最後の一枚は、一緒に。'),L('toru','うん。少しだけ撮ってくる。先に帰るなよ。','relieved')]:
  [L('you','今度こそ、遅れないでよ。'),L('toru','はは。去年のこと、まだ言う？ 今日はちゃんと戻るって。','relieved')];
}
export const MESSAGE_LINES=[
 L('narrator','23:12。透から、一通の伝言が届いた。'),
 L('toru','俺が急行に乗ったって言われても、信じるな。お願いだ。駅の――','surprised'),
 L('narrator','伝言はそこで途切れた。かけ直しても、透は出ない。'),
 L('you','透は、まだこの近くにいる。駅を調べよう。')
];
export function witnessLines(hasPhoto=false){
 return [
  L('narrator','23:18。駅文庫を閉めていた栞が、あなたに気づいた。'),
  L('shiori',hasPhoto?'そのカメラ……どこで？ いえ、何でもありません。':'お連れの方を探しているんですか。'),
  L('you','写真家の朝倉透です。さっきまで、一緒に。'),
  L('shiori','透さんなら、23:15の急行で温泉へ向かいました。港の記録映像にも、写っています。'),
  L('shiori','もう、ここにはいません。……あまり、探さないほうが。')
 ];
}
export function questionLines(id,unlocked=false){
 if(unlocked)return [L('shiori','奥の扉から閉鎖ホームへ。鍵は、あなたに渡したものです。透さんを、お願いします。','relieved')];
 return id==='about-toru'?
 [L('you','透を、前から知っているんですか。'),L('shiori','駅文庫の写真を撮ってくれた方です。だから……無事に帰ってほしいと思っています。')]:
 [L('you','奥のホームは、なぜ閉まっているんですか。'),L('shiori','夜は、駅の関係者しか入れない決まりなんです。鍵は私が。……そこまで調べるんですか。','surprised')];
}
export const CONFRONTATION=[
 L('you','この写真は、23:14の霧山。透は、その時ここにいた。'),
 L('you','でも、23:15の急行は港を出る。霧山には停まらない。その列車で、23:36に温泉へは行けません。'),
 L('shiori','……カメラ、見つけたんですね。','surprised'),
 L('shiori','あなたも、透さんを追ってきた人ですか。あの人を、連れていくつもりで？','surprised')
];
export function trustLines(choice,openingChoice){
 const reply=choice==='ticket'?'この切符、透と半分ずつ持っています。帰りの約束をしたんです。':'ただ、無事か知りたい。一緒に帰ると、約束したから。';
 return [
  L('you',reply),
  L('shiori','……透さんも、もう半分を持っていました。さっき、「相棒を待ってる」って。','relieved'),
  L('shiori','知らない人が、透さんを探しに来たんです。怖がっていたので、閉鎖ホームに隠れてもらいました。'),
  L('shiori','あなたも追ってきた人かと思って、行き先を偽りました。ごめんなさい。'),
  L('shiori',openingChoice==='promise'?'約束の相手だったんですね。この鍵で、奥の扉を開けてください。':'あの人、今度は遅れないつもりだったんですね。鍵を渡します。どうか、迎えに行って。','relieved')
 ];
}
export function reunionLines(hasFragment){
 return [
  L('narrator','23:21。閉鎖ホームの階段で、足音が止まった。'),
  L('toru','……来てくれた。ごめん、心配かけた。','surprised'),
  L('toru',hasFragment?'その半券、拾ってくれたんだ。やっぱり、目印になったな。':'最後の一枚、一緒に撮るんだったな。ちゃんと、待ってた。','relieved')
 ];
}
export function endingLines(choice){
 return [
  L('you',choice==='warm'?'無事でよかった。それだけ、先に言わせて。':'港の映像を見た。急行のところにいたのは、誰なんだ。'),
  L('toru',choice==='warm'?'……うん。ありがとう。見つけてくれて。':'俺じゃない。ずっと、この駅にいた。','relieved'),
  L('toru','港の映像、見せて。……あの青い傘。昼に、港でなくしたやつだ。','surprised'),
  L('toru','俺の傘を持った、別の誰かが……俺の代わりに、あの列車へ？','surprised'),
  L('narrator','相棒は見つかった。けれど、あの映像の人物は誰なのか。23:47の約束まで、まだ時間がある。')
 ];
}

Object.assign(CHARACTERS,NEXT_CHARACTERS);
Object.assign(EVIDENCE,CONTINUATION_EVIDENCE);
