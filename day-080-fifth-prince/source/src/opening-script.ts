import type { SceneActor, SceneStaging } from './types';
export type OpeningScene='kingdom'|'ceremony'|'unlit'|'resolve'|'market';
export interface OpeningBeat {id:string;scene:OpeningScene;place:string;heading:string;speaker:string;character:string;text:string;lights:boolean}
export type OpeningStage=SceneStaging;
const royalLine:SceneActor[]=['flame','tide','grove','storm','lyca'].map((id,i)=>({id,x:316+i*30,y:248,facing:1}));
export function openingStage(scene:OpeningScene,lights=false):OpeningStage{
 if(scene==='kingdom')return {zone:'palace',focus:{x:376,y:200},actors:[{id:'king',x:376,y:128,facing:0},...royalLine]};
 if(scene==='ceremony'||scene==='unlit')return {zone:'palace',focus:{x:376,y:225},actors:[{id:'king',x:376,y:128,facing:0},...royalLine],lights};
 if(scene==='resolve')return {zone:'palace',focus:{x:376,y:185},actors:[{id:'king',x:376,y:128,facing:0},{id:'lyca',x:376,y:224,fromY:280,facing:1}]};
 return {zone:'town',focus:{x:224,y:292},actors:[{id:'nora',x:184,y:248,facing:0},{id:'lyca',x:216,y:280,fromY:345,facing:1},{id:'merchant',x:280,y:344,facing:0}]};
}
export const MARKET_START={x:216,y:280};
export const OPENING:OpeningBeat[]=[
 {id:'kingdom.crisis',scene:'kingdom',place:'白金の王宮・玉座の間',heading:'王国を守る、五人の王子',speaker:'国王レオニス',character:'king',text:'魔王ヴェイルの魔物が、国境の村や街道を襲っている。我が五人の息子たちよ。勇者として、この国の暮らしを守ってほしい。',lights:false},
 {id:'ritual.promise',scene:'ceremony',place:'王宮・加護の儀式',heading:'五人の王子、四つの光',speaker:'語り手',character:'',text:'国を守る力を授かる、加護の儀式。アレン、セイル、ロアン、ジーク。そして末弟のリュカが、祭壇に並んだ。',lights:false},
 {id:'ritual.four',scene:'ceremony',place:'王宮・加護の儀式',heading:'四人に宿った、炎・水・木・雷',speaker:'語り手',character:'',text:'火はアレンに。水はセイルに。木はロアンに。雷はジークに。四人の兄たちの紋章が、まばゆく光った。',lights:true},
 {id:'lyca.unlit',scene:'unlit',place:'王宮・加護の儀式',heading:'第五の紋章だけが、沈黙した',speaker:'リュカ',character:'lyca',text:'僕の紋章だけ、何も光らない。……僕には、加護がないの？',lights:true},
 {id:'storm.dismissal',scene:'unlit',place:'王宮・加護の儀式',heading:'無加護と呼ばれた、第五王子',speaker:'ジーク',character:'storm',text:'無加護の王子が、勇者になれるわけないだろ。危ないことは僕たちに任せて、城で待っていればいい。',lights:true},
 {id:'lyca.resolve',scene:'resolve',place:'儀式のあと・玉座の前',heading:'それでも、僕にできることを',speaker:'リュカ',character:'lyca',text:'魔法がなくても、僕もこの国を守りたい。城の外で、困っている人の声を聞きます。僕にできることを、自分で探したい。',lights:false},
 {id:'king.journey',scene:'resolve',place:'儀式のあと・玉座の前',heading:'銀貨60枚の、旅立ち',speaker:'国王レオニス',character:'king',text:'ならば、この60Gを持っていきなさい。王子の名ではなく、お前自身の行いで、民の信頼を得るのだ。',lights:false},
 {id:'market.arrival',scene:'market',place:'翌朝・アステリア王都の市場',heading:'王子としてではなく、一人の旅人として',speaker:'語り手',character:'',text:'翌朝。旅服と銀貨60枚を手に、リュカは初めて一人で市場へ向かった。パン屋の前で、困り果てた声が聞こえた。',lights:false},
 {id:'nora.shortage',scene:'market',place:'王都の市場・パン屋の前',heading:'小さな声が、冒険のはじまり',speaker:'パン職人 ノラ',character:'nora',text:'街道に魔物が出て、麦が届かなくて……。このままじゃ、明日のパンを焼けない。',lights:false},
 {id:'lyca.offer',scene:'market',place:'王都の市場・パン屋の前',heading:'最初の一歩は、目の前の誰かのために',speaker:'リュカ',character:'lyca',text:'僕が買ってきます。必要なのは、どんな麦ですか？',lights:false},
 {id:'nora.request',scene:'market',place:'王都の市場・パン屋の前',heading:'ノラとの、最初の約束',speaker:'パン職人 ノラ',character:'nora',text:'黄金麦を1つ、お願い！ パン屋の右下、広場の露店にいるオルンさんが8Gで売っているの。届けてくれたら、32Gでお礼をするね。',lights:false},
 {id:'lyca.promise',scene:'market',place:'王都の市場・パン屋の前',heading:'ここから、あなたの冒険が始まる',speaker:'リュカ',character:'lyca',text:'黄金麦を1つ、オルンさんから。わかった。まずはこの約束を、ちゃんと守ろう。',lights:false}
];
export const OPENING_RECAP=[['あなたは誰？','無加護と呼ばれた、第五王子リュカ。'],['なぜ町へ？','民の声を聞き、魔法以外で人を助ける道を探すため。'],['最初にすること','商人オルンから黄金麦1つを8Gで仕入れ、パン職人ノラへ届ける。']] as const;
