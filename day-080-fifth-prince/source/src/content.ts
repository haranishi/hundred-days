import type { Character, Enemy, EnemyId, Item, Brother, DialoguePage } from './types';
export const TITLE = '第五王子と、名もなき加護';
export const ITEMS: Record<Item,{name:string;buy:number;sell:number;symbol:string;description:string}> = {
 wheat:{name:'黄金麦',buy:8,sell:14,symbol:'麦',description:'王都のパン屋にも喜ばれる、香りのよい麦。'},
 herb:{name:'月しずく草',buy:12,sell:18,symbol:'葉',description:'森に自生する薬草。薬師ミラが探している。'},
 crystal:{name:'星晶石',buy:30,sell:44,symbol:'晶',description:'職人に人気の小さな結晶。大きな利益が出る。'},
 potion:{name:'癒やしの薬',buy:18,sell:0,symbol:'薬',description:'戦闘中にHPを65回復。宿では薬を無料で補充できる。'}
};
export const CHARACTERS:Record<string,Character> = {
 lyca:{id:'lyca',name:'リュカ',role:'第五王子',color:'#e2bb65',hair:'#9b623e',description:'まだ名前のない力を、心の奥に。',symbol:'◇'},
 flame:{id:'flame',name:'アレン',role:'火の第一王子',color:'#d46657',hair:'#b74e3c',description:'強さで全てを守ろうとする長兄。',symbol:'火'},
 tide:{id:'tide',name:'セイル',role:'水の第二王子',color:'#65a9c2',hair:'#507989',description:'冷静さの裏に、救えなかった後悔を隠す。',symbol:'水'},
 grove:{id:'grove',name:'ロアン',role:'木の第三王子',color:'#82a17c',hair:'#62724a',description:'森を愛し、人との距離を置く兄。',symbol:'木'},
 storm:{id:'storm',name:'ジーク',role:'雷の第四王子',color:'#ae91c8',hair:'#95819f',description:'才能を誇り、失敗を誰よりも恐れている。',symbol:'雷'},
 nora:{id:'nora',name:'ノラ',role:'パン職人',color:'#d89472',hair:'#914d3f',description:'小さな店から、王都に勇気を届ける。',symbol:'麦'},
 mira:{id:'mira',name:'ミラ',role:'見習い薬師',color:'#96b8a0',hair:'#667d67',description:'自信をなくした薬師。あなたの言葉で再び歩く。',symbol:'葉'},
 toma:{id:'toma',name:'トーマ',role:'旅の鍛冶師',color:'#7b99b6',hair:'#556274',description:'折れた剣も心も、打ち直せばいい。',symbol:'槌'},
 merchant:{id:'merchant',name:'オルン',role:'王都の商人',color:'#bd9a68',hair:'#665142',description:'王子でも商売は対等。',symbol:'金'},
 inn:{id:'inn',name:'エマ',role:'宿屋の主人',color:'#ac86a1',hair:'#6a495c',description:'疲れた人を、決して断らない。',symbol:'宿'},
 king:{id:'king',name:'国王レオニス',role:'アステリアの王',color:'#bfa066',hair:'#b5b2a7',description:'国を救う力とは何かを問い続ける。',symbol:'王'},
 sage:{id:'sage',name:'星詠みエルダ',role:'加護の記録者',color:'#b3a8d6',hair:'#ddd7d1',description:'消えた第五の加護を知る者。',symbol:'星'},
 citizen1:{id:'citizen1',name:'ピピ',role:'路地の配達見習い',color:'#d8aa77',hair:'#9c7449',description:'母と暮らす、町の小さな住人。',symbol:'便'},
 citizen2:{id:'citizen2',name:'オスカー',role:'路地の古老',color:'#bca786',hair:'#aaa295',description:'かつて通りの帳簿を預かった商人。',symbol:'帳'},
 guard:{id:'guard',name:'レナート',role:'街道の兵士',color:'#91a9bd',hair:'#5b5d6d',description:'町と街道を守り、足を痛めた兵士。',symbol:'盾'},
 demon:{id:'demon',name:'魔王ヴェイル',role:'孤絶の王',color:'#9877be',hair:'#443454',description:'人と人を隔てる、孤独の影。',symbol:'影'}
};
export const BROTHERS:Brother[]=['flame','tide','grove','storm'];
export const ENEMIES:Record<EnemyId,Enemy>={
 bramble:{id:'bramble',name:'いばらの番獣',subtitle:'霧の森を閉ざすもの',hp:92,attack:13,reward:55,xp:45,color:'#819d78',telegraph:'つるを振り上げている'},
 flame:{id:'flame',name:'炎の試練',subtitle:'アレンとの手合わせ',hp:128,attack:16,reward:20,xp:45,color:'#d46657',telegraph:'炎が剣先に集まる'},
 tide:{id:'tide',name:'水の試練',subtitle:'セイルとの手合わせ',hp:144,attack:18,reward:20,xp:50,color:'#65a9c2',telegraph:'大きな水の輪が揺れる'},
 grove:{id:'grove',name:'木の試練',subtitle:'ロアンとの手合わせ',hp:160,attack:19,reward:20,xp:55,color:'#82a17c',telegraph:'大地から根が伸びる'},
 storm:{id:'storm',name:'雷の試練',subtitle:'ジークとの手合わせ',hp:176,attack:21,reward:20,xp:60,color:'#ae91c8',telegraph:'雷光が頭上に集まる'},
 demon:{id:'demon',name:'魔王ヴェイル',subtitle:'孤絶の王',hp:540,attack:27,reward:0,xp:160,color:'#a38ac5',telegraph:'孤絶の闇が満ちていく'}
};
export const RECONCILIATION:Record<Brother,DialoguePage[]>={
 flame:[{speaker:'アレン',text:'一人では越えられない相手に、お前は仲間と向き合った。俺は力ばかり見ていたんだな。'},{speaker:'リュカ',text:'兄さんの火は、誰かを守るための火だよ。今度は僕も、その隣に立たせて。'}],
 tide:[{speaker:'セイル',text:'失うのが怖くて、誰にも頼れなかった。だが、お前たちは傷つくたびに支え合うのだな。'},{speaker:'リュカ',text:'頼っていいんだ。僕も、何度も助けてもらったから。'}],
 grove:[{speaker:'ロアン',text:'森を救うのは魔法だと思っていた。でも薬草を集めたのは、その小さな手だった。'},{speaker:'リュカ',text:'できることを少しずつ。兄さんの力も、きっと誰かを助けられる。'}],
 storm:[{speaker:'ジーク',text:'無能だなんて言って、ごめん。僕は……才能がなくなったら、誰も残らないと思っていた。'},{speaker:'リュカ',text:'加護があっても、なくても、君は僕の兄さんだ。それは、ずっと変わらないよ。'}]
};
export const AWAKENING:DialoguePage[]=[
 {speaker:'エルダ',text:'古い記録には、第五の加護がある。「共鳴」。他者の中にある勇気を呼び起こし、異なる力をつなぐ加護。'},
 {speaker:'リュカ',text:'じゃあ……ノラもミラも、僕の力に引き寄せられただけ？ あの約束も、僕のものじゃなかったの？'},
 {speaker:'ミラ',text:'違うよ。薬師を続けると決めたのは私。あなたは、できるって信じてくれただけ。'},
 {speaker:'ノラ',text:'麦を運んだ足も、赤字を取り戻した工夫も、あなた自身のもの。加護が約束を守ってくれたわけじゃない。'},
 {speaker:'アレン',text:'その手を差し出したのは、お前だ。リュカ。今度こそ、五人で行こう。'},
 {speaker:'リュカ',text:'僕の力は、みんなとつながる力……。もう下を向かない。僕たち全員で、魔王を倒す！'}
];
