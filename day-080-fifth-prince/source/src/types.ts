export type Zone = 'town' | 'forest' | 'palace' | 'abyss';
export type Item = 'wheat' | 'herb' | 'crystal' | 'potion';
export type Ally = 'nora' | 'mira' | 'toma';
export type Brother = 'flame' | 'tide' | 'grove' | 'storm';
export type EnemyId = 'bramble' | Brother | 'demon';
export type StoryEpisode = 'bread'|'mira'|'forge'|'forest'|'family'|'citadel';
export type StoryEvent = 'bread.pack'|'bread.child'|'bread.elder'|'bread.finish'|'mira.start'|'mira.case'|'mira.water'|'mira.heal'|'forge.start'|'forge.inspect'|'forge.parts'|'forge.light'|'forest.start'|'forest.observe'|'forest.pick'|'forest.deliver'|'family.supper'|'citadel.voices'|'citadel.power';
export type StoryChoice = 'share'|'order'|'trust'|'review'|'reuse'|'crystal'|'steady'|'force'|'leaf'|'root'|'forgive'|'time'|'together'|'alone';
export interface SceneActor {id:string;x:number;y:number;facing:number;fromY?:number}
export type EndingCue='release'|'royal'|'welcome'|'serve';
export interface SceneStaging {zone:Zone;focus:{x:number;y:number};actors:SceneActor[];lights?:boolean;table?:{x:number;y:number};ending?:'release'|'royal'|'welcome'|'supper'}
export type CombatCommand = 'attack' | 'guard' | 'potion' | 'support' | 'resonate';
export interface CombatEvent {kind:'player-hit'|'enemy-hit'|'heal'|'guard'|'support'|'resonate'|'drain'|'enemy-heal'|'victory'|'defeat';amount:number;text:string}
export interface Battle {events?:CombatEvent[]; enemy: EnemyId; hp: number; enemyHp: number; turn: number; energy: number; cooldown: number; log: string[]; result: 'active' | 'won' | 'lost' }
export interface GameState { version: 1; zone: Zone; position: {x:number;y:number}; gold: number; xp: number; trust: number; profit: number; inventory: Record<Item,number>; flags: string[]; party: Ally[]; brothers: Brother[]; weapon: boolean; battle: Battle | null; playSeconds: number }
export type Action = {type:'story';event:StoryEvent;choice?:StoryChoice} | {type:'focusStory';episode:StoryEpisode} | {type:'trade';item:Item;direction:'buy'|'sell';quantity:number} | {type:'gather';id:string} | {type:'deliver';quest:'bread'|'medicine'} | {type:'audience'} | {type:'awaken'} | {type:'equip'} | {type:'discover';id:string} | {type:'work'} | {type:'heal'} | {type:'startBattle';enemy:EnemyId} | {type:'combat';command:CombatCommand} | {type:'leaveBattle'} | {type:'travel';zone:Zone} | {type:'finishEnding'} | {type:'flag';flag:'intro'};
export interface Result { state: GameState; message: string; ok: boolean }
export interface Character { id: string; name: string; role: string; color: string; hair: string; description: string; symbol: string }
export interface Enemy { id:EnemyId; name:string; subtitle:string; hp:number; attack:number; reward:number; xp:number; color:string; telegraph:string }
export interface Point { id:string; x:number; y:number; label:string; kind:'npc'|'gate'|'herb'|'enemy'|'chest'|'lore'|'story'; target?:Zone; character?:string }
export interface WorldObstacle {id:string;x:number;y:number;w:number;h:number}
export interface MapData { zone:Zone; name:string; subtitle:string; width:number; height:number; tiles:number[][]; points:Point[]; spawn:{x:number;y:number}; buildings:Building[]; obstacles:WorldObstacle[] }
export interface Building {x:number;y:number;w:number;h:number;style:'house'|'shop'|'palace'|'ruin';label?:string}
export interface Objective { title:string; hint:string; zone:Zone; target:string; chapter:string; progress:number }
export interface DialoguePage { speaker:string; text:string; stage?:SceneStaging; heading?:string; cue?:EndingCue }
