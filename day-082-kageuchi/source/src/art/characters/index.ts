// OWNER: chars-art
// 人物の入口。契約 src/contract/art.ts の createCharacter(kind) を満たす。
//   const c = createCharacter('ashigaru'); scene.add(c.root);  毎コマ c.update(dt, snap);  片付けは c.dispose()
// root は足もと（地面の高さ 0）に置かれ、rotation.y ＝ rotYFromYaw(snap.yaw)。モデルの正面は +Z。
import type { ArtCharacter } from '../../contract/art';
import type { CharacterKind } from '../../contract/snapshot';
import { createCharacter as create } from './character';

export function createCharacter(kind: CharacterKind): ArtCharacter {
  return create(kind);
}
