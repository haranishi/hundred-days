// OWNER: core
// タッチの補助（規則 src/sim は変えない）。2026-11-03 スマホ対応・体験評価の第1周で追加。
// 近接攻撃（F）は、カメラの向きで当てる（sim が攻撃の刻みに p.yaw = camYaw とする）。キーボードならマウスで向けるが、
// タッチは視点を回す指と攻撃の指が同じ右手なので、カメラを番兵へ向けてから押すのが難しく、間合いの中にいても空振りした。
// そこで、タッチのときだけ、攻撃の刻みの camYaw を「間合いの中の最も近い番兵の方角」に差し替える。
// 間合い（MELEE.range）の外は今まで通り（カメラの向き）。標的の条件は sim の meleeTarget と同じ（向きの制限だけ外す）。

export interface AssistGuard {
  x: number;
  z: number;
  role: string;
  down: boolean;
  mode: string;
}

/**
 * 攻撃の向き（camYaw と同じ座標：0＝東・π/2＝南。ラジアン）。間合いの中に番兵がいなければ null（カメラの向きのまま）。
 * blocked は壁などで遮られているか（sim.q.blocked）。遮られた番兵へは向けない（meleeTarget も当てない）。
 */
export function meleeAssistYaw(
  player: { x: number; z: number },
  guards: readonly AssistGuard[],
  range: number,
  blocked: (x0: number, z0: number, x1: number, z1: number) => boolean,
): number | null {
  let best: AssistGuard | null = null;
  let bestD = range;
  for (const g of guards) {
    if (g.role !== 'guard' || g.down || g.mode === 'victim' || g.mode === 'strike') continue;
    const d = Math.hypot(g.x - player.x, g.z - player.z);
    if (d > bestD || blocked(player.x, player.z, g.x, g.z)) continue;
    best = g;
    bestD = d;
  }
  return best ? Math.atan2(best.z - player.z, best.x - player.x) : null;
}
