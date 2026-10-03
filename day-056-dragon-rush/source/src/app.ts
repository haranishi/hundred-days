// OWNER: core
// 全体の組み立て：レンダラー・大気・太陽と影・街・空・水面・竜・環境マップ・後処理。
// 遊び（操作・破壊・炎）は stage.ts が、この上に組み立てる。ここは描画の土台と、撮影・計測から呼ぶ口だけを持つ。
// r03-roster：操作する怪獣（dragon）は3体のうち1体。始めの1体だけを読んで起動し、残りは遊べるようになってから裏で読んでおく
// （preloadCreatures）。札で選び直したら setCreature で差し替える（読み終えていれば一瞬で替わる）。
import { PerspectiveCamera, Scene, Vector2, Vector3, type Object3D, type WebGLRenderer } from 'three';
import { CITY_CONFIG, type CityConfig } from './config/city';
import { CREATURE_CONFIG, CREATURE_IDS, type CreatureId } from './config/creatures';
import { QUALITY_PRESETS, type QualityPreset } from './config/quality';
import { AMBIENT, CAMERA } from './config/render';
import { loadPrefs } from './core/prefs';
import { waitForLoadingStage } from './core/loadingStage';
import type { Settings } from './core/settings';
import { CityView } from './city/cityView';
import { initialCreature } from './creatures/params';
import { Dragon } from './dragon/dragon';
import { Atmosphere } from './render/atmosphereGpu';
import { bakeCityEnvironment, bakeSkyEnvironment } from './render/envmap';
import { SunLight } from './render/lighting';
import { MaterialKit } from './render/materials';
import { PlanarMirror } from './render/planarMirror';
import { PostChain } from './render/post';
import { createRenderer, gpuName } from './render/renderer';
import { SkyDome } from './render/sky';
import { Water } from './render/water';
import { generateCity } from './world/city';
import { CityIndex } from './world/query';
import { generateScenery } from './world/scenery';
import type { CityData } from './world/types';

export class App {
  readonly quality: QualityPreset;
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly atmosphere = new Atmosphere();
  readonly sun: SunLight;
  readonly kit: MaterialKit;
  readonly cityConfig: CityConfig;
  readonly city: CityData;
  readonly index: CityIndex;
  readonly cityView: CityView;
  readonly sky: SkyDome;
  readonly water: Water;
  readonly mirror: PlanarMirror | null;
  /** いま操作している怪獣の表示（setCreature で差し替わる） */
  dragon: Dragon;
  readonly post: PostChain;
  readonly gpu: string;
  /** 水面の鏡像に映さない物（小物・粒子）。描画を軽くする */
  readonly mirrorHidden: Object3D[];
  simTime = 0;
  lastCalls = 0;
  lastTriangles = 0;
  private width = 1;
  private height = 1;
  /** 読んだ怪獣の表示（札で選び直すとき、読み直さずに差し替える） */
  private readonly views = new Map<CreatureId, Dragon>();

  constructor(
    private readonly container: HTMLElement,
    readonly settings: Settings,
  ) {
    this.quality = QUALITY_PRESETS[settings.quality];
    const canvas = document.createElement('canvas');
    container.appendChild(canvas);
    this.renderer = createRenderer(canvas, this.quality);
    this.gpu = gpuName(this.renderer);
    this.camera = new PerspectiveCamera(CAMERA.fov, 16 / 9, CAMERA.near, CAMERA.far);
    this.scene.add(this.camera);

    this.sun = new SunLight(this.scene, this.camera, this.atmosphere, this.quality);
    this.kit = new MaterialKit(this.atmosphere, this.sun.csm);

    this.cityConfig = settings.seedOverride !== null ? { ...CITY_CONFIG, seed: settings.seedOverride } : CITY_CONFIG;
    this.city = generateCity(this.cityConfig);
    this.index = new CityIndex(this.city);
    this.cityView = new CityView(this.city, generateScenery(this.cityConfig), this.kit, this.quality);
    this.scene.add(this.cityView.root);

    this.sky = new SkyDome(this.atmosphere, 100);
    this.scene.add(this.sky.mesh);
    const coast = this.cityConfig.coast.x;
    this.water = new Water(this.atmosphere, this.cityConfig.waterLevel, -30000, coast, 30000);
    this.scene.add(this.water.mesh);
    this.mirror = this.quality.waterMirrorScale > 0 ? new PlanarMirror(this.cityConfig.waterLevel, this.quality.waterMirrorScale, this.quality.waterMirrorSamples) : null;
    if (this.mirror) this.water.setMirror(this.mirror.target.texture, this.mirror.textureMatrix);

    // 撮影・計測・自動プレイは保存に左右されない（?creature= が無ければ紅竜）。人が遊ぶときは最後に選んだ怪獣で始める
    const human = settings.mode === 'play' && settings.playtest === null;
    const creature = initialCreature(window.location.search, human, human ? loadPrefs().creature : null);
    this.dragon = new Dragon(this.kit, CREATURE_CONFIG[creature]);
    this.views.set(creature, this.dragon);
    this.scene.add(this.dragon.root);

    this.post = new PostChain(this.renderer, this.scene, this.camera, this.quality);
    this.mirrorHidden = [this.water.mesh, this.cityView.props.group];
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** 環境マップを焼き、シェーダーを前もってコンパイルする。 */
  async init(onStage?: (phase: 'model' | 'render', name: string) => void | Promise<void>): Promise<void> {
    // r00c-竜：竜の GLB を読み終えてから焼き・コンパイルする（撮影と遊びが同じ姿勢の竜で始まる）
    await waitForLoadingStage(this.dragon.ready, () => onStage?.('model', this.dragon.creature.name));
    await onStage?.('render', this.dragon.creature.name);
    const probe = new Vector3(-150, AMBIENT.envProbeHeight, 0);
    const size = this.quality.envMapSize;
    this.scene.environment = bakeSkyEnvironment(this.renderer, this.sky, { position: probe, size, hidden: [] });
    await this.renderer.compileAsync(this.scene, this.camera);
    const skyEnv = this.scene.environment;
    this.scene.environment = bakeCityEnvironment(this.renderer, this.scene, this.sky, {
      position: probe,
      size,
      hidden: [this.water.mesh, this.dragon.root, this.cityView.props.group],
    });
    skyEnv?.dispose();
  }

  /** 表示を読む（読んだものは覚えておく）。 */
  private view(id: CreatureId): Dragon {
    let v = this.views.get(id);
    if (!v) {
      v = new Dragon(this.kit, CREATURE_CONFIG[id]);
      this.views.set(id, v);
    }
    return v;
  }

  /** 残りの怪獣を裏で読み、材質のシェーダーを先に作っておく（札で選び直した瞬間に止まらないように）。 */
  async preloadCreatures(): Promise<void> {
    for (const id of CREATURE_IDS) {
      if (this.views.has(id)) continue;
      const v = this.view(id);
      await v.ready;
      await this.renderer.compileAsync(v.root, this.camera, this.scene);
    }
  }

  /** 操作する怪獣の表示を差し替える（読み終えるまで待つ）。 */
  async setCreature(id: CreatureId, onStage?: (phase: 'model' | 'render') => void | Promise<void>): Promise<void> {
    if (this.dragon.creature.id === id) return;
    const next = this.view(id);
    await waitForLoadingStage(next.ready, () => onStage?.('model'));
    await onStage?.('render');
    // コンパイルが失敗しても、表示と規則が別の怪獣にならないよう差し替え前に待つ。
    await this.renderer.compileAsync(next.root, this.camera, this.scene);
    this.scene.remove(this.dragon.root);
    this.scene.add(next.root);
    this.dragon = next;
  }

  resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.width = w;
    this.height = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.post.setSize(w, h);
    const buffer = this.renderer.getDrawingBufferSize(new Vector2());
    this.mirror?.setSize(buffer.x, buffer.y);
    this.sun.updateFrustums();
  }

  get size(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  /** カメラの画角を変えたら呼ぶ（影の段も合わせる）。 */
  cameraChanged(): void {
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
    this.sun.updateFrustums();
  }

  /** 1コマ描く。描画命令数と三角形数を、このコマの全パスの合計で記録する。 */
  renderFrame(dt: number): void {
    this.renderer.info.reset();
    this.sky.time = this.simTime;
    this.water.time = this.simTime;
    this.camera.updateMatrixWorld();
    this.cityView.props.update(this.camera.position);
    this.sun.update();
    // 鏡像には大物だけを映す（小物は映さず、描画を軽くする）
    this.mirror?.render(this.renderer, this.scene, this.camera, this.mirrorHidden);
    this.post.render(dt);
    this.lastCalls = this.renderer.info.render.calls;
    this.lastTriangles = this.renderer.info.render.triangles;
  }
}
