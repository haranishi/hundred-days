import type { Zone } from './types';
export interface Discovery {zone:Zone;x:number;y:number;kind:'chest'|'lore';name:string;text:string;gold:number;xp:number;herb:number;potion:number;character?:string}
const found=(zone:Zone,x:number,y:number,kind:Discovery['kind'],name:string,text:string,gold=0,xp=0,herb=0,potion=0,character?:string):Discovery=>({zone,x,y,kind,name,text,gold,xp,herb,potion,character});
export const DISCOVERIES:Record<string,Discovery>={
 'town:parcel':found('town',4,27,'chest','忘れられた旅支度','古い旅鞄に、よく手入れされた薬と銀貨が残っていた。「いつか旅に出る君へ」と小さく書かれている。',18,8,0,1),
 'town:harbor':found('town',43,28,'chest','橋守の贈り物','橋のたもとの小箱。「困ったときは、お互いさま」。あなたもいつか、誰かに返そう。',20,8),
 'town:child':found('town',17,28,'lore','街の子 ピピ','「ねえ、王子様。パン屋のお姉ちゃん、いつも閉店した後に一人で片づけてるんだ。今度、おいしいって言ってあげてね」',0,5,0,0,'citizen1'),
 'town:elder':found('town',31,18,'lore','路地の古老','「昔はな、火よりも水よりも、誰かの帰りを待つ灯りが大事だと言われておった。強いだけでは、国は続かんよ」',0,5,0,0,'citizen2'),
 'forest:well':found('forest',28,29,'chest','古井戸の小箱','苔むした小箱に薬草と古い地図が入っていた。地図には、五つの星が同じ輪で結ばれている。',15,12,2,1),
 'forest:shrine':found('forest',25,8,'lore','苔に覆われた碑文','「ひとつの火は消える。ひとつの水は涸れる。されど、結ばれた五つの願いは、夜を越える」。最後の紋章だけが、削り取られていた。',0,10),
 'palace:archive':found('palace',38,28,'chest','書庫の旅の記録','祖父の時代の使節が記した一冊。「商人は商品とともに、道の先の声を運ぶ」。折り目の間に銀貨が挟まっていた。',35,12,0,1),
 'palace:oath':found('palace',10,24,'lore','五つの席','石に刻まれた五人の王子の名。あなたの名の下には、まだ加護が記されていない。それでも、席は最初からここにあった。',0,10),
 'abyss:wish':found('abyss',14,23,'chest','名もなき祈り','崩れた壁の陰に、旅人たちの置いていった薬があった。みんな、ここまでつなげてくれたのだ。',0,12,0,2),
 'abyss:memory':found('abyss',34,15,'lore','ひび割れた王冠','「誰も失いたくなかった。だから、誰も近づけなくなった」。王冠の裏に刻まれた一文が、静かに闇を照らしている。',0,10)
};
