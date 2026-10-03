// OWNER: harness
// 固定ショットの構図を、街のデータの目印から具体的なカメラと竜の置き方に直す。
// r03-roster：?creature= で紅竜以外も撮れる。GLB に無いクリップ（焔角の glide・fly）は立ち姿・歩きに替え、
// 飛べない怪獣を空の構図（overview・aftermath）に置くときは、その下の地面に立たせる（overview はカメラをその怪獣へ向け直す）。
import { Vector3 } from 'three';
import { DRAGON_POSES, type DragonPose } from '../config/dragon';
import { SHOTS, SHOT_LAYOUT, type ShotName, type ShotSpec } from '../config/shots';
import { directionFromAngles } from '../camera/rig';
import type { DragonMeasure } from '../dragon/dragon';
import { sideNormal } from '../world/geom';
import type { CityIndex } from '../world/query';

export interface ResolvedShot {
  name: ShotName;
  spec: ShotSpec;
  camera: { position: Vector3; target: Vector3; fov: number };
  dragon: { position: Vector3; yaw: number; pitch: number; roll: number; pose: DragonPose };
  /** breath：炎を当てるビル */
  targetId?: number;
  /** aftermath：燃やす街区の中心（x, z） */
  district?: { x: number; z: number };
}

const ROAD_Y = 0;

/** 竜の姿勢の目印を測る口（r00c：本番の竜は GLB の骨で測る。app.dragon が満たす）。 */
export interface DragonMeasurer {
  measure(pose: DragonPose): DragonMeasure;
  /** r03-roster：その怪獣が飛べるか（省くと飛べる紅竜として扱う） */
  creature?: { motion: { canFly: boolean } };
}

/** 飛べない怪獣の、空の構図の代わりの姿勢（歩き・立ち姿） */
const GROUND_POSE: Partial<Record<string, DragonPose['clip']>> = { glide: 'walk', hover: 'idle' };

let measurer: DragonMeasurer | null = null;

function measured(pose: DragonPose): DragonMeasure {
  if (!measurer) throw new Error('resolveShot に竜（measure）が渡されていない');
  return measurer.measure(pose);
}

function standingY(pose: DragonPose, groundY: number): number {
  return groundY - measured(pose).lowestY;
}

/** 局所の点（竜の原点からの +x 左・+y 上・+z 前）をワールドへ。 */
function dragonLocalToWorld(origin: Vector3, yawDeg: number, local: [number, number, number]): Vector3 {
  const a = (yawDeg * Math.PI) / 180;
  const [x, y, z] = local;
  return new Vector3(origin.x + x * Math.cos(a) + z * Math.sin(a), origin.y + y, origin.z - x * Math.sin(a) + z * Math.cos(a));
}

/** 竜の頭の付け根（姿勢から計算）のワールド座標。 */
export function dragonHeadWorld(pose: DragonPose, origin: Vector3, yawDeg: number): Vector3 {
  return dragonLocalToWorld(origin, yawDeg, measured(pose).headBase.toArray() as [number, number, number]);
}

export function resolveShot(name: ShotName, index: CityIndex, dragon: DragonMeasurer): ResolvedShot {
  measurer = dragon;
  const spec = SHOTS[name];
  const grounded = dragon.creature !== undefined && !dragon.creature.motion.canFly;
  const groundClip = grounded ? GROUND_POSE[spec.pose] : undefined;
  const pose = groundClip ? { ...DRAGON_POSES[spec.pose], clip: groundClip, time: groundClip === 'walk' ? 0.45 : 1.0, wingFlap: 0 } : { ...DRAGON_POSES[spec.pose] };
  const city = index.city;
  const lines = city.roadLines;
  const avenueCross = index.intersectionNear(-150, 0, (_ix, ns, ew) => ns.cls === 'avenue' && ew.cls === 'avenue');
  const crossX = lines[avenueCross.nsLineId].pos;
  const crossZ = lines[avenueCross.ewLineId].pos;
  const at = (dx: number, dy: number, dz: number): Vector3 => new Vector3(crossX + dx, ROAD_Y + dy, crossZ + dz);

  switch (name) {
    case 'overview': {
      const L = SHOT_LAYOUT.overview;
      const position = new Vector3(...L.camera.from);
      const target = position.clone().add(directionFromAngles(L.camera.azimuthDeg, L.camera.pitchDeg).multiplyScalar(500));
      if (grounded) {
        // 飛べない怪獣：竜の空の位置の真下の地面に立たせ、カメラをその怪獣へ向け直す
        const at = new Vector3(L.dragon.at[0], 0, L.dragon.at[2]);
        at.y = standingY(pose, ROAD_Y);
        return { name, spec, camera: { position, target: at.clone().setY(at.y + 8), fov: spec.fov }, dragon: { position: at, yaw: L.dragon.headingDeg, pitch: 0, roll: 0, pose } };
      }
      return {
        name,
        spec,
        camera: { position, target, fov: spec.fov },
        dragon: { position: new Vector3(...L.dragon.at), yaw: L.dragon.headingDeg, pitch: L.dragon.pitchDeg, roll: L.dragon.rollDeg, pose },
      };
    }
    case 'street': {
      const L = SHOT_LAYOUT.street;
      const dragonPos = at(L.dragon.offset[0], 0, L.dragon.offset[2]);
      dragonPos.y = standingY(pose, ROAD_Y);
      const position = at(...L.camera.offset);
      const target = at(...L.camera.lookOffset);
      return { name, spec, camera: { position, target, fov: spec.fov }, dragon: { position: dragonPos, yaw: L.dragon.headingDeg, pitch: 0, roll: 0, pose } };
    }
    case 'breath': {
      const L = SHOT_LAYOUT.breath;
      // 西を向いた中層ビルを探す（夕日と同じ側から炎を当てる構図にする）
      const cx = crossX + L.searchOffset[0];
      const cz = crossZ + L.searchOffset[2];
      const candidates = city.buildings.filter((b) => b.kind === 'tileMidrise' && city.lots[b.lotId].front === 'w');
      const pool = candidates.length > 0 ? candidates : city.buildings.filter((b) => b.kind === 'tileMidrise');
      const dist = (b: (typeof pool)[number]): number => Math.hypot((b.footprint.x0 + b.footprint.x1) / 2 - cx, (b.footprint.z0 + b.footprint.z1) / 2 - cz);
      const target = pool.filter((b) => dist(b) < L.searchRadius).sort((a, b) => dist(a) - dist(b))[0] ?? pool[0];
      const n = sideNormal(city.lots[target.lotId].front);
      const f = target.footprint;
      const faceX = n.x > 0 ? f.x1 : n.x < 0 ? f.x0 : (f.x0 + f.x1) / 2;
      const faceZ = n.z > 0 ? f.z1 : n.z < 0 ? f.z0 : (f.z0 + f.z1) / 2;
      // 竜は道に沿って立ち、ビルを左に見る（前 = (n.z, -n.x)）。首を左へ振ってビルに向ける
      const fwd = new Vector3(n.z, 0, -n.x);
      const dragonPos = new Vector3(faceX + n.x * L.dragonStandoff, 0, faceZ + n.z * L.dragonStandoff).addScaledVector(fwd, -10);
      const breathPose = { ...pose, neckYaw: L.neckYaw };
      dragonPos.y = standingY(breathPose, ROAD_Y);
      const yaw = (Math.atan2(fwd.x, fwd.z) * 180) / Math.PI;
      const head = dragonHeadWorld(breathPose, dragonPos, yaw);
      const position = dragonPos.clone().addScaledVector(fwd, L.camera.along).add(new Vector3(n.x, 0, n.z).multiplyScalar(L.camera.toward));
      position.y = L.camera.up;
      const lookAt = new Vector3((head.x + faceX) / 2, Math.min(target.height * 0.5, head.y), (head.z + faceZ) / 2);
      return {
        name,
        spec,
        camera: { position, target: lookAt, fov: spec.fov },
        dragon: { position: dragonPos, yaw, pitch: 0, roll: 0, pose: breathPose },
        targetId: target.id,
      };
    }
    case 'landing': {
      const L = SHOT_LAYOUT.landing;
      const second = index.intersectionNear(crossX, -440, (_ix, ns, ew) => ns.cls === 'avenue' && ew.cls === 'avenue' && ew.id !== avenueCross.ewLineId);
      const sx = lines[second.nsLineId].pos;
      const sz = lines[second.ewLineId].pos;
      const dragonPos = new Vector3(sx + L.dragon.offset[0], 0, sz + L.dragon.offset[2]);
      dragonPos.y = standingY(pose, ROAD_Y) + L.dragon.offset[1];
      const position = new Vector3(sx + L.camera.offset[0], L.camera.offset[1], sz + L.camera.offset[2]);
      const target = new Vector3(sx + L.camera.lookOffset[0], L.camera.lookOffset[1], sz + L.camera.lookOffset[2]);
      return {
        name,
        spec,
        camera: { position, target, fov: spec.fov },
        dragon: { position: dragonPos, yaw: L.dragon.headingDeg, pitch: L.dragon.pitchDeg, roll: 0, pose },
      };
    }
    case 'closeup': {
      const L = SHOT_LAYOUT.closeup;
      const dragonPos = at(L.dragon.offset[0], 0, L.dragon.offset[2]);
      dragonPos.y = standingY(pose, ROAD_Y);
      const yaw = L.dragon.headingDeg;
      const m = measured(pose);
      const headCenter = m.headBase.clone().addScaledVector(m.headForward, L.camera.lookForward).toArray() as [number, number, number];
      const [lx, ly, lz] = L.camera.fromHeadLocal;
      const position = dragonLocalToWorld(dragonPos, yaw, [headCenter[0] + lx, headCenter[1] + ly, headCenter[2] + lz]);
      const target = dragonLocalToWorld(dragonPos, yaw, headCenter);
      return { name, spec, camera: { position, target, fov: spec.fov }, dragon: { position: dragonPos, yaw, pitch: 0, roll: 0, pose } };
    }
    case 'aftermath': {
      const L = SHOT_LAYOUT.aftermath;
      const look = at(...L.camera.lookOffset);
      const dragonAt = at(...L.dragon.offset);
      // 飛べない怪獣は、燃える街区の手前の地面に立つ
      if (grounded) dragonAt.y = standingY(pose, ROAD_Y);
      return {
        name,
        spec,
        camera: { position: at(...L.camera.offset), target: look, fov: spec.fov },
        dragon: grounded ? { position: dragonAt, yaw: L.dragon.headingDeg, pitch: 0, roll: 0, pose } : { position: dragonAt, yaw: L.dragon.headingDeg, pitch: L.dragon.pitchDeg, roll: L.dragon.rollDeg, pose },
        district: { x: look.x, z: look.z },
      };
    }
  }
}
