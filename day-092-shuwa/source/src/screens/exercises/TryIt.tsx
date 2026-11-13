import type { ComponentType } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { getItem } from '../../content';
import { cameraSupported, cameraTargetSupported, loadCameraCheck } from '../../camera';
import type { CameraCheckProps } from '../../camera';
import type { Exercise } from '../../engine/lesson';
import type { ExerciseProps } from './types';
import { progress } from '../../app/state';
import { mirrorText } from '../../content/mirror';
import { ReadableText } from '../../ui/ReadableText';
import { Sign } from './Sign';
import { Button } from '../../ui/Button';
export function TryIt({ exercise, answered, onSuccess, onSkip }: ExerciseProps<Extract<Exercise, { kind: 'intro' | 'tryIt' }>> & { onSuccess(camera: boolean): void; onSkip(): void }) {
  const item = getItem(exercise.itemId)!;
  const [Camera, setCamera] = useState<ComponentType<CameraCheckProps> | null>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const cameraAvailable = progress.value.settings.camera && cameraSupported() && cameraTargetSupported(item);
  useEffect(() => {
    if (!cameraAvailable) { setCamera(null); setOpen(false); return; }
    let active = true;
    void loadCameraCheck().then(component => { if (active) setCamera(() => component); }).catch(() => {});
    return () => { active = false; };
  }, [cameraAvailable]);
  return <><p class="eyebrow"><ReadableText text="自分でやってみる" /></p><h1><ReadableText text={`「${item.label}」を作ってみよう`} /></h1>
    <div class="sign-detail-layout"><Sign item={item} perspective="self" /><div class="exercise-details"><div class="card description"><h2><ReadableText text="自分で作るときのコツ" /></h2><p><ReadableText text={mirrorText(item.describe.self, progress.value.settings.dominant)} /></p></div>
    {!answered && <>
      {cameraAvailable && Camera && !open && <Button secondary onClick={() => setOpen(true)}><ReadableText text="カメラで確かめる" /></Button>}
      {cameraAvailable && Camera && open && <Camera item={item} dominant={progress.value.settings.dominant} onSuccess={() => onSuccess(true)} onSelfJudge={() => onSuccess(false)} onSkip={onSkip} onUnavailable={message => { setOpen(false); setCamera(null); setReason(message); }} />}
      <p role="status" class="small"><ReadableText text={reason} /></p>
    </>}</div></div>
  </>;
}
