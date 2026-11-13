// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, render } from 'preact';
import { act } from 'preact/test-utils';
import { ITEMS } from '../../../src/content';
import { points, world } from './fixtures';
import type { CameraCheckProps } from '../../../src/camera';
import { cameraSupported, loadCameraCheck } from '../../../src/camera';
import { CameraCheck } from '../../../src/camera/CameraCheck';

const sdk = vi.hoisted(() => ({ files: vi.fn(), create: vi.fn(), detect: vi.fn(), close: vi.fn() }));
vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: sdk.files }, HandLandmarker: { createFromOptions: sdk.create },
}));
vi.mock('../../../src/hand', async importOriginal => ({ ...await importOriginal<typeof import('../../../src/hand')>(), HandView: () => null }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
let root: HTMLDivElement, stop: ReturnType<typeof vi.fn>, media: ReturnType<typeof vi.fn>;
let props: CameraCheckProps, hidden: boolean, videoTime: number, frameId: number;
let frames: Map<number, FrameRequestCallback>;
let stream: MediaStream;
const detector = { detectForVideo: sdk.detect, close: sdk.close };
async function settle() { await act(async () => { await vi.dynamicImportSettled(); }); }
async function mount(overrides: Partial<CameraCheckProps> = {}) {
  props = { item: ITEMS[0]!, dominant: 'right', onSuccess: vi.fn(), onSelfJudge: vi.fn(), onSkip: vi.fn(), onUnavailable: vi.fn(), ...overrides };
  await act(() => render(createElement(CameraCheck, props), root));
}
async function click(text: string) {
  const button = Array.from(root.querySelectorAll('button')).find(b => b.textContent === text);
  expect(button, text).toBeDefined();
  await act(() => button!.click());
  await settle();
}
async function frame(time: number, fresh = true) {
  if (fresh) videoTime += 0.05;
  const [id, callback] = frames.entries().next().value!;
  frames.delete(id);
  await act(() => callback(time));
}
async function visibility(value: boolean) {
  hidden = value;
  await act(() => { document.dispatchEvent(new Event('visibilitychange')); });
}

beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks();
  hidden = false; videoTime = 0; frameId = 0; frames = new Map();
  localStorage.clear();
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.set(++frameId, cb); return frameId; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id); });
  stop = vi.fn(); stream = new MediaStream();
  Object.defineProperty(stream, 'getTracks', { value: () => [{ stop }], configurable: true });
  media = vi.fn().mockResolvedValue(stream);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: media } });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(2);
  vi.spyOn(HTMLMediaElement.prototype, 'currentTime', 'get').mockImplementation(() => videoTime);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  sdk.files.mockResolvedValue({}); sdk.create.mockResolvedValue(detector);
  sdk.detect.mockReturnValue({ worldLandmarks: [], landmarks: [] });
  root = document.createElement('div'); document.body.append(root);
});
afterEach(async () => {
  await act(() => render(null, root)); root.remove();
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('カメラの開始・終了と競合', () => {
  it('公開APIを保ち、説明と開始操作があるまで許可やSDKの読み込みをしない', async () => {
    expect(cameraSupported()).toBe(true);
    expect(await loadCameraCheck()).toBe(CameraCheck);
    await mount();
    expect(root.textContent).toContain('映像はこの端末の中で処理し、保存しません');
    expect(root.textContent).toContain('はじめに約10MBを読み込みます（2回目からは速くなります）');
    expect(media).not.toHaveBeenCalled(); expect(sdk.files).not.toHaveBeenCalled();
    await click('カメラを使う');
    expect(media).toHaveBeenCalledWith({ video: { facingMode: 'user' }, audio: false });
    expect(sdk.files).toHaveBeenCalledWith('./mediapipe/wasm');
    expect(sdk.create).toHaveBeenCalledWith({}, { baseOptions: { modelAssetPath: './mediapipe/hand_landmarker.task' }, runningMode: 'VIDEO', numHands: 1 });
    expect(root.textContent).toContain('手をカメラに写してください');
    await frame(0);
    expect(props.onSuccess).not.toHaveBeenCalled();
    await act(() => render(null, root));
    expect(stop).toHaveBeenCalledOnce(); expect(sdk.close).toHaveBeenCalledOnce(); expect(frames.size).toBe(0);
    await mount();
    expect(root.textContent).not.toContain('はじめに約10MB');
    expect(media).toHaveBeenCalledOnce();
  });

  it.each(['NotAllowedError', 'NotFoundError', 'NotReadableError'])('%sを日本語で通知する', async name => {
    media.mockRejectedValue(new DOMException('test', name));
    await mount(); await click('カメラを使う');
    expect(props.onUnavailable).toHaveBeenCalledOnce();
    expect(props.onUnavailable).toHaveBeenCalledWith(name === 'NotAllowedError' ? expect.stringContaining('許可されませんでした') : name === 'NotFoundError' ? expect.stringContaining('見つかりませんでした') : expect.stringContaining('起動できませんでした'));
    expect(sdk.files).not.toHaveBeenCalled();
  });

  it('安全な接続でない・APIがない場合、取得しない', async () => {
    vi.stubGlobal('isSecureContext', false); expect(cameraSupported()).toBe(false);
    await mount(); await click('カメラを使う');
    expect(media).not.toHaveBeenCalled(); expect(props.onUnavailable).toHaveBeenCalledOnce();
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    expect(cameraSupported()).toBe(false);
  });

  it('モデルの読み込みに失敗したらカメラを解放する', async () => {
    sdk.create.mockRejectedValue(new Error('model unavailable'));
    await mount(); await click('カメラを使う');
    expect(stop).toHaveBeenCalledOnce();
    expect(props.onUnavailable).toHaveBeenCalledWith(expect.stringContaining('読み込めませんでした'));
  });

  it('解放時にwasmが例外を出しても、トラックの停止と代替練習の通知を続ける', async () => {
    await mount(); await click('カメラを使う');
    sdk.close.mockImplementationOnce(() => { throw new Error('close'); });
    sdk.detect.mockImplementationOnce(() => { throw new Error('inference'); });
    await frame(0);
    expect(stop).toHaveBeenCalledOnce();
    expect(props.onUnavailable).toHaveBeenCalledOnce();
  });

  it.each(['unmount', 'hidden'] as const)('%s: 許可の結果が遅れて返ってもトラックを止める', async exit => {
    const pending = deferred<MediaStream>(); media.mockReturnValue(pending.promise);
    await mount(); await click('カメラを使う');
    if (exit === 'hidden') await visibility(true); else await act(() => render(null, root));
    pending.resolve(stream); await settle();
    expect(stop).toHaveBeenCalledOnce(); expect(sdk.files).not.toHaveBeenCalled();
    expect(props.onUnavailable).not.toHaveBeenCalled();
  });

  it('読み込み中に外れた部品の読み取り器も、後から必ず解放する', async () => {
    const pending = deferred<typeof detector>(); sdk.create.mockReturnValue(pending.promise);
    await mount(); await click('カメラを使う');
    await act(() => render(null, root));
    expect(stop).toHaveBeenCalledOnce();
    pending.resolve(detector); await settle();
    expect(sdk.close).toHaveBeenCalledOnce(); expect(frames.size).toBe(0);
  });

  it('タブを隠すと停止し、表示だけでは再開せず操作で再開する', async () => {
    await mount(); await click('カメラを使う'); await visibility(true);
    expect(stop).toHaveBeenCalledOnce(); expect(sdk.close).toHaveBeenCalledOnce(); expect(frames.size).toBe(0);
    await visibility(false); expect(media).toHaveBeenCalledOnce();
    await click('カメラを再開する'); expect(media).toHaveBeenCalledTimes(2);
  });

  it('問題/利き手が変わったら前のセッションを解放する', async () => {
    await mount(); await click('カメラを使う');
    await act(() => render(createElement(CameraCheck, { ...props, item: ITEMS[1]!, dominant: 'left' }), root));
    await settle();
    expect(stop).toHaveBeenCalledOnce(); expect(sdk.close).toHaveBeenCalledOnce(); expect(media).toHaveBeenCalledTimes(2);
  });

  it('動く形はカメラを起動せず対象外と通知する', async () => {
    await mount({ item: { ...ITEMS[0]!, dynamic: true } });
    expect(props.onUnavailable).toHaveBeenCalledWith(expect.stringContaining('判定の対象外'));
    expect(media).not.toHaveBeenCalled();
  });
});

describe('連続一致と自分で判断する導線', () => {
  it.each(['right', 'left'] as const)('%s: 0.5秒連続一致したら停止→成功表示→1回だけ通知する', async dominant => {
    const ps = points(ITEMS[0]!, dominant);
    // handednessは逆でも無視し、設定の利き手のみ使う。
    sdk.detect.mockReturnValue({ worldLandmarks: [world(ps)], landmarks: [], handedness: [[{ categoryName: dominant === 'right' ? 'Left' : 'Right' }]] });
    await mount({ dominant }); await click('カメラを使う');
    for (let t = 0; t <= 450; t += 50) await frame(t);
    expect(stop).not.toHaveBeenCalled(); expect(props.onSuccess).not.toHaveBeenCalled();
    await frame(500);
    expect(stop).toHaveBeenCalledOnce(); expect(root.textContent).toContain('形を確かめられました');
    expect(props.onSuccess).not.toHaveBeenCalled();
    await act(() => { vi.advanceTimersByTime(600); });
    expect(props.onSuccess).toHaveBeenCalledOnce(); expect(frames.size).toBe(0);
    await act(() => { vi.advanceTimersByTime(2000); }); expect(props.onSuccess).toHaveBeenCalledOnce();
  });

  it('手の消失/不一致があれば連続一致をやり直す', async () => {
    const matching = { worldLandmarks: [world(points(ITEMS[0]!))], landmarks: [] };
    sdk.detect.mockReturnValue(matching);
    await mount(); await click('カメラを使う');
    for (let t = 0; t <= 400; t += 50) await frame(t);
    sdk.detect.mockReturnValue({ worldLandmarks: [], landmarks: [] }); await frame(450);
    expect(root.textContent).toContain('手をカメラに写してください');
    sdk.detect.mockReturnValue({ worldLandmarks: [world(points(ITEMS[1]!))], landmarks: [] }); await frame(500);
    expect(root.textContent).toContain('小指を握りましょう');
    sdk.detect.mockReturnValue(matching);
    for (let t = 550; t <= 1000; t += 50) await frame(t);
    expect(stop).not.toHaveBeenCalled();
    await frame(1050); expect(stop).toHaveBeenCalledOnce();
  });

  it('同じ映像を繰り返し判定せず、止まっていた時間も一致に数えない', async () => {
    sdk.detect.mockReturnValue({ worldLandmarks: [world(points(ITEMS[0]!))], landmarks: [] });
    await mount(); await click('カメラを使う');
    await frame(0); await frame(600, false); expect(sdk.detect).toHaveBeenCalledOnce();
    await frame(700); expect(stop).not.toHaveBeenCalled();
    for (let t = 750; t <= 1150; t += 50) await frame(t);
    expect(stop).not.toHaveBeenCalled();
    await frame(1200); expect(stop).toHaveBeenCalledOnce();
  });

  it.each(['できた（自分で判断）', 'スキップ'])('15秒で%sを出し、選ぶと解放して1回だけ通知する', async choice => {
    await mount(); await click('カメラを使う');
    await act(() => { vi.advanceTimersByTime(14999); }); expect(root.textContent).not.toContain(choice);
    await act(() => { vi.advanceTimersByTime(1); }); await click(choice);
    expect(stop).toHaveBeenCalledOnce(); expect(sdk.close).toHaveBeenCalledOnce();
    expect(choice === 'スキップ' ? props.onSkip : props.onSelfJudge).toHaveBeenCalledOnce();
    expect(props.onSuccess).not.toHaveBeenCalled();
  });

  it('許可待ちの間にも15秒で進め、後で許可されても起動しない', async () => {
    const pending = deferred<MediaStream>(); media.mockReturnValue(pending.promise);
    await mount(); await click('カメラを使う');
    await act(() => { vi.advanceTimersByTime(15000); }); await click('スキップ');
    expect(props.onSkip).toHaveBeenCalledOnce();
    pending.resolve(stream); await settle();
    expect(stop).toHaveBeenCalledOnce(); expect(sdk.create).not.toHaveBeenCalled();
  });

  it('成功表示中に部品が外れたら遅延した通知を取り消す', async () => {
    sdk.detect.mockReturnValue({ worldLandmarks: [world(points(ITEMS[0]!))], landmarks: [] });
    await mount(); await click('カメラを使う');
    for (let t = 0; t <= 500; t += 50) await frame(t);
    await act(() => render(null, root)); await act(() => { vi.advanceTimersByTime(1000); });
    expect(props.onSuccess).not.toHaveBeenCalled();
  });

  it('推論の例外でも解放して代替練習へ通知する', async () => {
    await mount(); await click('カメラを使う'); sdk.detect.mockImplementation(() => { throw new Error('inference'); });
    await frame(0);
    expect(stop).toHaveBeenCalledOnce(); expect(sdk.close).toHaveBeenCalledOnce();
    expect(props.onUnavailable).toHaveBeenCalledWith(expect.stringContaining('読み取りを続けられませんでした'));
  });
});
