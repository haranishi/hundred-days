import { filterByKinds, inBounds, parseCameras, pickRandom, rankForList, searchCameras } from './lib/data.js';
import { CameraMap } from './lib/map.js';
import { createState, readView, toggleGroup, writeView } from './lib/state.js';
import { createUI } from './lib/ui.js';

const SEARCH_LIMIT=20;
const state=createState();
let cameraMap=null;let mapReady=false;let mapFailed=false;let hashOpened=false;let windyTimer=null;let windyRequest=0;let skipNextViewSave=false;
const themeMedia=matchMedia('(prefers-color-scheme: dark)');
let theme=null;
const isDark=()=>theme?theme==='dark':themeMedia.matches;

const ui=createUI({
  toggleKind(group,button){ui.setKindButton(button,toggleGroup(state,group));redraw();},
  toggleWindy(button){state.windyEnabled=!state.windyEnabled;ui.setKindButton(button,state.windyEnabled);redraw();},
  /* 候補は20件まで。1件多く数えて、打ち切ったかどうかを件数の言い方に反映する（「20件」と言い切ると嘘になる）。 */
  search(query){const found=searchCameras(state.cameras,query,state.countries,SEARCH_LIMIT+1);ui.showCandidates(found.slice(0,SEARCH_LIMIT),state.countries,(id,trigger)=>selectCamera(id,trigger,13),{more:found.length>SEARCH_LIMIT});},
  random(trigger){const camera=pickRandom(state.cameras,state.enabledKinds);if(camera)selectCamera(camera.id,trigger,12);else ui.showToast('選べるカメラがありません。種別をオンにしてください。');},
  locate(){locate();},close(){closeDetail();},theme(){switchTheme();},
});

function applyTheme(){
  if(theme)document.documentElement.dataset.theme=theme;else delete document.documentElement.dataset.theme;
  ui.setTheme(isDark());
}
function switchTheme(){theme=isDark()?'light':'dark';applyTheme();cameraMap?.setTheme(isDark());}
themeMedia.addEventListener?.('change',()=>{if(!theme){applyTheme();cameraMap?.setTheme(isDark());}});
applyTheme();ui.setLoading();

try {
  cameraMap=new CameraMap(document.querySelector('#map'),{
    dark:isDark(),view:readView(globalThis.localStorage),panel:document.querySelector('#panel'),
    onReady(){mapReady=true;redraw();openHashCamera();},
    onMove(view){if(skipNextViewSave)skipNextViewSave=false;else writeView(globalThis.localStorage,view.center,view.zoom);if(!state.selected)renderList();},
    onIdle(){scheduleWindy();},
    onSelect(id,trigger){selectCamera(id,trigger);},onWindySelect(id,trigger){selectWindy(id,trigger);},
  });
} catch {
  mapFailed=true;
  document.querySelector('#map').replaceChildren(Object.assign(document.createElement('p'),{className:'map-unavailable',textContent:'地図を読み込めませんでした。カメラ一覧は利用できます。'}));
}

function enabledCameras(){return filterByKinds(state.cameras,state.enabledKinds);}
function redraw(){
  if(state.loading)return;
  const enabled=enabledCameras();ui.updateCount(enabled.length,state.cameras.length);
  if(mapReady)cameraMap.setCameras(enabled);
  if(state.selected?.kind!=='windy' && state.selected && !state.enabledKinds.has(state.selected.kind))closeDetail();
  else if(!state.selected)renderList();
  if(mapReady)cameraMap.setWindy(state.windyConfigured&&state.windyEnabled?state.windyCameras:[]);
}
/* 世界全体が入る zoom では、bounds で数えると端の数点が漏れて「9,162」のような
   総数と食い違う数になる。世界が見えているなら絞らずに全件を母数にする。 */
const WORLD_ZOOM=2;
function renderList(){
  const current=enabledCameras();
  if(!mapReady){ui.renderList(current.slice(0,50),current.length,state.countries,selectCamera,{worldwide:true});return;}
  const {center,zoom}=cameraMap.view();const worldwide=zoom<WORLD_ZOOM;
  const pool=worldwide?current:inBounds(current,cameraMap.bounds());
  const result=rankForList(pool,{lat:center.lat,lon:center.lng},50);
  ui.renderList(result.items,result.total,state.countries,selectCamera,{worldwide});
}
function selectCamera(id,trigger,zoom=null,{viaUserAction=true}={}){
  const camera=state.cameras.find((item)=>item.id===id);if(!camera)return;
  state.selected=camera;ui.hideCandidates();cameraMap?.select(id);
  /* 共有リンクで開いた初回はまだ誰も何も押していない＝自動再生しない（YouTubeの規約）。 */
  history.replaceState(null,'',`#cam=${encodeURIComponent(id)}`);ui.renderDetail(camera,state.countries,trigger,{autoplay:viaUserAction,focusHeading:viaUserAction});
  /* 寄せるのは詳細を描いた後。パネルは詳細で広がるので、先に動かすと古い幅で余白を測ってしまう。
     ズーム指定が無い（一覧や地図から選んだ）ときは縮尺は変えず、位置だけパネルの外へ出す。 */
  focusSelected(camera,zoom);
}
function focusSelected(camera,zoom=null){
  if(!mapReady)return;
  cameraMap.move([camera.lon,camera.lat],zoom===null?cameraMap.view().zoom:zoom);
}
async function selectWindy(id,trigger){
  const base=state.windyCameras.find((item)=>String(item.id)===String(id));if(!base)return;
  const camera={id:String(base.id),name:base.title||'Windyカメラ',lat:base.lat,lon:base.lon,kind:'windy'};
  state.selected=camera;cameraMap?.select(camera.id);history.replaceState(null,'',`#cam=windy-${encodeURIComponent(camera.id)}`);ui.renderWindyLoading(camera,trigger);focusSelected(camera);
  try{const response=await fetch(`/api/day-030/windy?id=${encodeURIComponent(camera.id)}`);if(!response.ok)throw new Error();const detail=await response.json();if(state.selected?.id===camera.id)ui.renderWindy(camera,detail);}catch{if(state.selected?.id===camera.id)ui.setError('Windyのカメラを読み込めませんでした。少し待って再度お試しください。');}
}
function closeDetail(){if(!state.selected)return;state.selected=null;cameraMap?.select('');history.replaceState(null,'',`${location.pathname}${location.search}`);renderList();ui.closeDetail();}
/* 地図の準備とデータ読込はどちらが先に終わるか決まらない。両方そろうまで待って一度だけ開く
   （二重に呼ぶと詳細が2回描かれ、提供元へ画像を2回取りに行っていた）。 */
function openHashCamera(){
  if(hashOpened||state.loading||!(mapReady||mapFailed))return;
  const match=/^#cam=([^&]+)/.exec(location.hash);if(!match)return;
  hashOpened=true;const id=decodeURIComponent(match[1]);
  const camera=state.cameras.find((item)=>item.id===id);if(camera)selectCamera(id,null,12,{viaUserAction:false});
}
function locate(){
  if(!navigator.geolocation){ui.showToast('このブラウザでは現在地を利用できません。');return;}
  navigator.geolocation.getCurrentPosition(({coords})=>{skipNextViewSave=true;cameraMap?.move([coords.longitude,coords.latitude],9);},()=>ui.showToast('現在地を取得できませんでした。端末の設定を確認してください。'),{enableHighAccuracy:false,timeout:10_000,maximumAge:0});
}

async function loadData(){
  try{
    const [cameraResponse,countryResponse]=await Promise.all([fetch('./data/cameras.json'),fetch('./data/countries.json')]);
    if(!cameraResponse.ok||!countryResponse.ok)throw new Error();const parsed=parseCameras(await cameraResponse.json());
    state.cameras=parsed.cameras;state.meta=parsed.meta;state.countries=await countryResponse.json();state.loading=false;redraw();ui.setLoaded();openHashCamera();
  }catch{state.loading=false;ui.updateCount(0,0);ui.setError('カメラのデータを読み込めませんでした。通信状況を確認して再読み込みしてください。');}
}
async function checkWindy(){
  try{const response=await fetch('/api/day-030/windy?status=1');const body=response.ok?await response.json():{configured:false};state.windyConfigured=body.configured===true;}catch{state.windyConfigured=false;}
  ui.configureWindy(state.windyConfigured);if(state.windyConfigured)scheduleWindy();
}
function scheduleWindy(){
  if(!state.windyConfigured||!mapReady)return;clearTimeout(windyTimer);const zoom=cameraMap.view().zoom;
  if(zoom<5){state.windyCameras=[];cameraMap.setWindy([]);ui.setWindyHint('拡大すると出ます');return;}
  ui.setWindyHint('');windyTimer=setTimeout(loadWindy,600);
}
async function loadWindy(){
  const token=++windyRequest;const bounds=cameraMap.bounds();const zoom=Math.max(5,Math.min(18,Math.round(cameraMap.view().zoom)));
  const bbox=[bounds.north,bounds.east,bounds.south,bounds.west].map((value)=>Number(value.toFixed(5))).join(',');
  try{const response=await fetch(`/api/day-030/windy?bbox=${encodeURIComponent(bbox)}&zoom=${zoom}`);if(!response.ok)throw new Error();const body=await response.json();if(token!==windyRequest)return;state.windyCameras=Array.isArray(body.webcams)?body.webcams:[];cameraMap.setWindy(state.windyEnabled?state.windyCameras:[]);}catch{if(token===windyRequest){state.windyCameras=[];cameraMap.setWindy([]);}}
}

loadData();checkWindy();
