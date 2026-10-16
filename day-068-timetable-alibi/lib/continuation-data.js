import {formatTime} from './logic.js';
const m=s=>{const[h,n]=s.split(':').map(Number);return h*60+n;};
const stop=(station,arrive,depart=arrive)=>({station,arrive:m(arrive),depart:m(depart)});
export const EDITOR_RECORD={station:'ridge',time:1396};
export const EXTRA_TRAINS=[
 {id:'R504',name:'山手線 504',color:'#7ebdb3',stops:[stop('ridge','23:27'),stop('central','23:37')]},
 {id:'E404',name:'海岸線 404',color:'#e5bd7d',stops:[stop('central','23:38'),stop('harbor','23:45')]},
 {id:'E405',name:'海岸線 405',color:'#e5bd7d',stops:[stop('central','23:40'),stop('harbor','23:46')]}
];
export const NEXT_CHARACTERS={
 akari:{name:'三好 灯',role:'パン屋の配達員 / 駅の写真を撮った人',image:'./assets/akari-expressions.webp'},
 takase:{name:'高瀬 玲',role:'駅の写真展の編集者',image:'./assets/complete/takase-expressions.webp'}
};
export const CONTINUATION_EVIDENCE={
 'photo-memory':{title:'消した写真のメモ',kind:'写真は削除済み',summary:'23:14、透は霧山にいた。すでに確かめた足取りだけを記録。',detail:'本人との約束で、カメラの写真を削除した。写真そのものや複製は持っていない。赤い封筒には、別の人の実名が写っていた。'},
 'toru-note':{title:'透の目撃記録',kind:'同行で得た証言',summary:'23:16、霧山。写真展の編集者・高瀬が透に原板を渡すよう迫った。',detail:'港で灯が男の名前を確認した。透が閉鎖ホームに隠れる直前、男は霧山にいた。灯も原板の件で高瀬に会ったことがある。'},
 'akari-story':{title:'青い傘の持ち主',kind:'港での聞き込み',summary:'港の映像にいたのは灯。拾った透の傘を借り、急行には乗らず港に残った。',detail:'灯は昼、透に自分の写真の原板を預けた。本人の名を出さずに作者を確かめる約束だった。映像は列車に近づくところまでで、乗車を確認できない。'},
 'station-log':{title:'霧山の入構記録',kind:'駅務室の記録',summary:'23:16、高瀬 玲。「写真展・原板確認」の用件で霧山駅に入構。',detail:'栞と調べた駅務室の帳簿。港にいたという高瀬の話とは別に、霧山へ来た事実と時刻が残っている。'},
 'archive-note':{title:'封筒の受領控え',kind:'駅務室の記録',summary:'三好 灯の駅の写真。昼に朝倉透へ原板確認を依頼。本人の了承まで実名は伏せる。',detail:'机の赤い封筒は受領控えを入れたもの。原板そのものは透が持っている。高瀬からは、その原板を回収したいと問い合わせがあった。'},
 'return-table':{title:'霧山から港への運行表',kind:'乗車・停車の記録',summary:'直通502は霧山23:22 → 中央23:32/23:34 → 灯台港23:43。',detail:'23:16の霧山から港へは、直通502が最も早い。同じ列車なので中央で乗り換える必要はない。後発504と405の乗換えでは23:46着。'},
 'editor-claim':{title:'高瀬の港での証言',kind:'最後の証言',summary:'「23:34には、私は港にいました。霧山へ原板を回収になど行っていません」',detail:'高瀬は自分が霧山へ来たことを否定し、透に原板を渡すよう求めている。証言が成立するか、実際の移動時間で確かめよう。'},
 'original-returned':{title:'作者へ戻った原板',kind:'事件の決着',summary:'透から灯へ、赤い封筒の原板が戻った。高瀬は写真展の作者名を訂正すると約束した。',detail:'灯は自分の名で写真を出すことを選んだ。匿名を守る約束は、その本人の選択で終わった。'},
 'last-photo':{title:'23:47、最後の一枚',kind:'あなたが撮った写真',summary:'最終列車の前で、約束どおりシャッターを切った。',detail:'一緒に帰るという小さな約束が、この夜をつないだ。写真の構図と、ここまでの選択を記録している。'}
};
export const FINAL_REASONS=[
 {id:'arrival',text:'霧山23:16から、港への最速到着は23:43。23:34には着けない'},
 {id:'umbrella',text:'青い傘を持つ人物は、必ず透である'},
 {id:'transfer',text:'同じ直通列車でも、中央で必ず2分の乗換えが必要'}
];
const L=(speaker,text,mood='neutral')=>({speaker,text,mood});
export const REQUEST_LINES=[
 L('narrator','透はあなたの手の中のカメラを見て、言葉をのみ込んだ。'),
 L('toru','助かった。……でも、もう一つだけ頼みがある。'),
 L('toru','最後の写真だけ、消してくれないか。','surprised'),
 L('you','あなたがここにいたと証明できた、一枚を？'),
 L('toru','端に、赤い封筒が写ってる。そこにある名前を、まだ誰にも出さないって約束したんだ。'),
 L('toru','中身は、昼に預かった写真の原板。本人の知らないところで、別の人の作品にされそうで。'),
 L('toru','23:10、高瀬さんから「急行で帰ったことにして、取材は終わりにしよう」と電話が来た。だから、あの伝言を送った。'),
 L('toru','相棒にまで黙ってるつもりじゃなかった。ごめん。今は、どうしたらいいと思う。','relieved')
];
export const PHOTO_QUESTION=[
 L('you','消す前に、誰を守ろうとしているか、聞かせて。'),
 L('toru','三好灯さん。写真を撮った本人だ。実名を出すかは、彼女が自分で決めたいと言っていた。'),
 L('toru','昼に封筒を預かった。23:14に霧山にいたのは俺だけ。彼女が写真に写っているわけじゃない。')
];
export function photoReply(choice){return choice==='erase'?[
 L('you','消した。写真はなくなっても、あなたがここにいた事実は変わらない。'),
 L('toru','……ありがとう。今度は、知っていることを全部話す。','relieved')
]:[
 L('you','公開せずに残す。あなたを守る記録でもあるから。名前のことは、本人と話そう。'),
 L('toru','わかった。消さない理由も、ちゃんと聞けてよかった。彼女の了承だけは、必ず。','relieved')
];}
export const CROSSROADS_LINES=[
 L('toru','港で、灯さんが待ってる。青い傘のことも、直接聞けるはずだ。'),
 L('shiori','私は、あの男が来た記録を調べます。駅務室に、用件を書いてもらったので。'),
 L('narrator','透と港へ向かうか、栞と駅に残るか。選んだ道で、この夜の違う一面が見える。')
];
export function routeIntro(route){return route==='escort'?[
 L('toru','一緒に来てくれるんだな。港へ行く列車を選ぼう。','relieved'),
 L('toru','23:22の直通なら、中央で降りずに港まで行ける。後発の普通列車なら、中央で乗換えだ。')
]:[
 L('shiori','透さんは23:22の直通で先に港へ。こちらが駅務室です。入構の帳簿と、赤い封筒の受領控えが残っています。'),
 L('shiori','調べたら23:25。23:22の直通には乗れませんが、23:27発で中央へ出れば、まだ帰れます。')
];}
export function rideLines(state){
 const leg=state.activeLeg,train=state.journey.length?'乗り継いだ列車':'窓際の車両';
 const lines=[L('narrator',formatTime(leg.depart)+'。'+train+'が、雨のホームを離れた。')];
 if(leg.to==='central')lines.push(L(state.route==='escort'?'toru':'you',state.route==='escort'?'この便は中央止まり。23:37に着く。港への便は、乗換えの2分も見て選ぼう。':'透は先に港へ行った。栞の記録を持って、中央で乗り継ごう。'));
 else if(state.route==='escort')lines.push(L('toru','23:16、霧山に編集者の高瀬さんが来た。灯さんの原板を渡せと言われて、怖くなった。'),L('toru','だから隠れた。でも、もう相棒にまで隠すのは、やめる。','relieved'));
 else lines.push(L('you','港の映像も、高瀬の話も、記録と結び付けて確かめよう。'));
 lines.push(L('narrator',formatTime(leg.arrive)+'、'+(leg.to==='central'?'汐見中央。港への乗継列車を選ぶ。':'灯台港。潮の匂いが、開いた扉から流れ込んだ。')));
 return lines;
}
export function harborIntro(route){return route==='escort'?[
 L('narrator','青い傘をたたんだ女性が、ベンチから立ち上がった。'),
 L('akari','透さん。……一人じゃないんですね。'),
 L('toru','俺の相棒。ここまで、見つけてくれた人だ。','relieved')
]:[
 L('narrator','港のホームに、透が待っていた。栞から連絡を受け、あなたを出迎えた。'),
 L('toru','間に合った。調べてくれて、ありがとう。','relieved'),
 L('narrator','開いた扉のそばで、黒いコートの男がこちらを見ている。')
];}
export function akariLines(photoChoice){return [
 L('akari','その傘、透さんのですよね。昼に港のベンチで拾って……雨が強くて、借りました。'),
 L('you','23:14の映像に写っていたのは、あなた？'),
 L('akari','はい。でも、急行には乗っていません。駅員さんに傘の持ち主を聞いて、ここで待っていました。'),
 L('akari','駅の写真展。あの写真、私が撮ったんです。なのに、高瀬さんの名前で準備が進んでいて。'),
 L('toru','昼に預かった原板で確かめようとしたら、23:16に霧山まで取りに来た。'),
 L('akari','あの黒いコートの人です。高瀬さん。私も、同じことを言われました。'),
 L('you',photoChoice==='erase'?'名前が写った写真は消しました。今からどうするかは、あなたが決めてほしい。':'名前が写った写真は、非公開で残しています。誰に見せるかは、あなたと決めたい。'),
 L('akari','……自分の名前で、出したいです。怖かったけど、それは、もう決めました。','relieved')
];}
export const EDITOR_LINES=[
 L('takase','朝倉くん。その封筒は、写真展の資料だ。こちらへ渡してくれ。'),
 L('you','あなたが、霧山へ透を探しに来たんですか。'),
 L('takase','違う。23:34には、私は港にいました。霧山へ回収になど行っていません。'),
 L('takase','港の映像が透くんだというのも、傘を見てそう思っただけです。'),
 L('narrator','相手の言葉と、あなたが選んだ道で手に入れた記録。照らし合わせられる。')
];
export function confessionLines(state,answer){return [
 L('you',state.route==='escort'?'透は23:16、霧山であなたに原板を渡すよう迫られた。灯さんも、あなたを知っています。':'栞と調べた入構記録です。23:16、霧山。あなたの名前と「原板確認」の用件が残っています。'),
 L('you','そこから港へは、最も早い直通でも'+formatTime(answer.arrival)+'。23:34には着けません。'),
 L('takase','……その記録まで、調べたんですか。','surprised'),
 L('toru','灯さんの原板を、勝手に持ち主の違うものにしないでください。'),
 L('takase','写真展を間に合わせたかった。自分の企画だからと、作品まで自分のもののように扱った。'),
 L('takase','霧山へ行きました。原板を渡せと言いました。……作者の名前を、訂正します。','relieved'),
 L('akari',state.route==='escort'?'撮ったのは、私です。自分の名前で出したい。今、ここで言います。':'その原板、私のです。青い傘を借りて、ずっと港で待っていました。私も、自分の言葉で伝えます。'),
 L('toru','預かっていた原板を返す。もう、君が選んだ名前を隠さなくていい。','relieved'),
 L('narrator','赤い封筒が、撮った本人の手に戻った。青い傘の人物も、追ってきた理由も、わかった。')
];}
export function cameraLines(state){return [
 L('narrator','23:47。最終列車の灯りが、港を照らしている。'),
 L('toru',state.openingChoice==='tease'?'今度は、遅れなかっただろ。最後の一枚、まだ撮ってない。':'最後の一枚は、一緒に。……約束、覚えてる。','relieved'),
 L('toru',state.photoChoice==='erase'?'消してくれた一枚の代わりに、今度は残したいものを撮ろう。':'守ってくれた一枚も、これから撮る一枚も。誰のための写真か、一緒に考えたい。','relieved'),
 L('akari','私も、写っていいです。今度は、自分でそう決めました。','relieved'),
 L('narrator','構図を選び、シャッターを切ろう。これは、あなたが残す一枚。')
];}
export function epilogueLines(state){return [
 L('narrator',state.framing==='tickets'?'二つの半券を合わせた手元と、港の灯り。小さな約束が、一枚に収まった。':'透と灯が、カメラの向こうで笑った。雨の夜に、初めて肩の力が抜けた。'),
 L('toru','帰ろう。今度は、同じ列車で。','relieved'),
 L('narrator','数日後、写真展の案内に「撮影・三好 灯」の名前が戻った。あなたの手元には、23:47の一枚が残った。')
];}
