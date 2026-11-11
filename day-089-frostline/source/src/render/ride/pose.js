import { solveSkiPose } from './ski-pose.js';
import { makeSpring, springTo, springAngleTo, kick, wrapAngle } from './springs.js';
import { solveTwoBone } from './ik.js';

/** Metres except binding angles (radians). Initial visual tuning: I4. */
export const BODY = Object.freeze({ height: 1.75, hipWidth: 0.20, thigh: 0.44, shin: 0.43,
  ankleHeight: 0.11, pelvisToChest: 0.30, chestToNeck: 0.24, neck: 0.09,
  headRadius: 0.11, shoulderWidth: 0.40, shoulderRise: 0.19, upperArm: 0.29, forearm: 0.27,
  footOffset: 0.26, frontBinding: Math.PI / 12, rearBinding: -Math.PI / 20 });
const JOINTS = ['pelvis', 'chest', 'neck', 'head', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR',
  'handL', 'handR', 'hipL', 'hipR', 'kneeL', 'kneeR', 'ankleL', 'ankleR'];
const DRIVES = ['lean', 'crouch', 'height', 'px', 'py', 'pz', 'opening', 'chest', 'head', 'headPitch',
  'bend', 'tailFold', 'sway', 'roll', 'lx', 'ly', 'lz', 'rx', 'ry', 'rz'];
const v = () => ({ x: 0, y: 0, z: 0 });
function set(a, x, y, z) { a.x = x; a.y = y; a.z = z; return a; }
function copy(a, b) { return set(b, a.x, a.y, a.z); }
function cross(a, b, o) { return set(o, a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x); }
function unit(a) {
  const n = Math.hypot(a.x, a.y, a.z);
  if (n < 1e-12) return set(a, 0, 1, 0);
  return set(a, a.x / n, a.y / n, a.z / n);
}
function offset(a, d, n, o) { return set(o, a.x + d.x * n, a.y + d.y * n, a.z + d.z * n); }
function rotate(a, axis, angle) {
  const c = Math.cos(angle), s = Math.sin(angle), dot = (a.x * axis.x + a.y * axis.y + a.z * axis.z) * (1 - c);
  return set(a, a.x * c + (axis.y * a.z - axis.z * a.y) * s + axis.x * dot,
    a.y * c + (axis.z * a.x - axis.x * a.z) * s + axis.y * dot,
    a.z * c + (axis.x * a.y - axis.y * a.x) * s + axis.z * dot);
}
// A local vector uses board right/up/back; no heading is needed at vertical pitch.
function fromBoard(x, y, z, b, out) {
  return set(out, b.right.x*x + b.up.x*y - b.fwd.x*z,
    b.right.y*x + b.up.y*y - b.fwd.y*z, b.right.z*x + b.up.z*y - b.fwd.z*z);
}
function dot(a, b) { return a.x*b.x + a.y*b.y + a.z*b.z; }
function changeFrame(m, b, airborne, heading) {
  if (m.initialized && m.airborne !== airborne) {
    for (const prop of ['x', 'v']) {
      const x=m.springs.px[prop], y=m.springs.py[prop], z=m.springs.pz[prop];
      if (airborne) {
        set(m.end, x, y, z);
        m.springs.px[prop]=dot(m.end,b.right); m.springs.py[prop]=dot(m.end,b.up); m.springs.pz[prop]=-dot(m.end,b.fwd);
      } else {
        fromBoard(x,y,z,m.lastBoard,m.end);
        m.springs.px[prop]=m.end.x; m.springs.py[prop]=m.end.y; m.springs.pz[prop]=m.end.z;
      }
    }
    for (const key of ['opening','chest','head']) m.springs[key].x += airborne ? -heading : heading;
  }
  m.airborne=airborne;
  copy(b.fwd,m.lastBoard.fwd); copy(b.up,m.lastBoard.up); copy(b.right,m.lastBoard.right);
}
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
function drive(m, key, target, omega, dt, reset, angle = false) {
  const s = m.springs[key];
  if (reset) { s.x = target; s.v = 0; return target; }
  return angle ? springAngleTo(s, target, omega, dt) : springTo(s, target, omega, dt);
}
export function createPose() {
  const joints = {}; for (const name of JOINTS) joints[name] = v();
  return { board: { pos: v(), fwd: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 }, right: { x: 1, y: 0, z: 0 } },
    joints, chestFwd: { x: 1, y: 0, z: 0 }, chestUp: { x: 0, y: 1, z: 0 }, headFwd: { x: 0, y: 0, z: -1 }, lean: 0, crouch: 0 };
}
export function createPoseMemory() {
  const springs = {}; for (const key of DRIVES) springs[key] = makeSpring();
  return { springs, initialized: false, candidate: createPose(), baseUp: v(), baseRight: v(),
    hipSide: v(), shoulderSide: v(), axis: v(), pole: v(), end: v(),
    lastBoard: { fwd: v(), up: v(), right: v() }, airborne: false, crashPhase: 0, recoverTime: 1 };
}
function finiteVector(a) { return Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.z); }
function valid(p) {
  for (const key of JOINTS) if (!finiteVector(p.joints[key])) return false;
  return finiteVector(p.board.pos) && finiteVector(p.board.fwd) && finiteVector(p.board.up) && finiteVector(p.board.right)
    && finiteVector(p.chestFwd) && finiteVector(p.chestUp) && finiteVector(p.headFwd) && Number.isFinite(p.lean) && Number.isFinite(p.crouch);
}
function commit(a, b) {
  for (const key of JOINTS) copy(a.joints[key], b.joints[key]);
  copy(a.board.pos, b.board.pos); copy(a.board.fwd, b.board.fwd); copy(a.board.up, b.board.up); copy(a.board.right, b.board.right);
  copy(a.chestFwd, b.chestFwd); copy(a.chestUp, b.chestUp); copy(a.headFwd, b.headFwd); b.lean = a.lean; b.crouch = a.crouch;
}
// Project the mitten capsule (including its tip) out of trouser capsules and
// binding-aligned boot boxes. Alternating with the reach sphere preserves IK.
export const HAND_CLEARANCE = Object.freeze({radius:.055,margin:.01,thigh:.138,shin:.134,reach:.534});
function clearHand(hand,shoulder,elbow,p,stance){
 const j=p.joints,b=p.board,C=HAND_CLEARANCE;
 for(let iteration=0;iteration<12;iteration++){
  const beforeX=hand.x,beforeY=hand.y,beforeZ=hand.z;
  const dx=hand.x-elbow.x,dy=hand.y-elbow.y,dz=hand.z-elbow.z,n=Math.hypot(dx,dy,dz)||1;
  for(const tip of [0,.04,.08,.12]){
   let x=hand.x+dx/n*tip,y=hand.y+dy/n*tip,z=hand.z+dz/n*tip;
   for(const side of ['L','R']){
    for(const [start,end,radius] of [['hip','knee',C.thigh],['knee','ankle',C.shin]]){
     const a=j[start+side],c=j[end+side],vx=c.x-a.x,vy=c.y-a.y,vz=c.z-a.z;
     const t=clamp(((x-a.x)*vx+(y-a.y)*vy+(z-a.z)*vz)/(vx*vx+vy*vy+vz*vz),0,1);
     const qx=x-a.x-vx*t,qy=y-a.y-vy*t,qz=z-a.z-vz*t,d=Math.hypot(qx,qy,qz),r=radius+C.radius+C.margin;
     if(d<r&&d>1e-9){const k=r/d-1;hand.x+=qx*k;hand.y+=qy*k;hand.z+=qz*k;x+=qx*k;y+=qy*k;z+=qz*k;}
    }
    const a=j['ankle'+side],front=(side==='L'?stance:-stance)>0,angle=(front?BODY.frontBinding:BODY.rearBinding)*stance;
    const co=Math.cos(angle),si=Math.sin(angle),tx=b.right.x*stance,ty=b.right.y*stance,tz=b.right.z*stance;
    const vx=tx*co+(b.up.y*tz-b.up.z*ty)*si,vy=ty*co+(b.up.z*tx-b.up.x*tz)*si,vz=tz*co+(b.up.x*ty-b.up.y*tx)*si;
    const rx=vy*b.up.z-vz*b.up.y,ry=vz*b.up.x-vx*b.up.z,rz=vx*b.up.y-vy*b.up.x;
    const qx=x-a.x,qy=y-a.y,qz=z-a.z;
    const local=[qx*rx+qy*ry+qz*rz,qx*b.up.x+qy*b.up.y+qz*b.up.z+.015,qx*vx+qy*vy+qz*vz-.025],half=[.077,.125,.17];
    const delta=local.map((v,k)=>v-clamp(v,-half[k],half[k]));let d=Math.hypot(...delta),r=C.radius+C.margin;
    if(d<r){
     if(d<1e-9){let k=0;for(let i=1;i<3;i++)if(half[i]-Math.abs(local[i])<half[k]-Math.abs(local[k]))k=i;delta[k]=(local[k]<0?-1:1)*(r+half[k]-Math.abs(local[k]));}
     else for(let k=0;k<3;k++)delta[k]*=r/d-1;
     hand.x+=rx*delta[0]+b.up.x*delta[1]+vx*delta[2];hand.y+=ry*delta[0]+b.up.y*delta[1]+vy*delta[2];hand.z+=rz*delta[0]+b.up.z*delta[1]+vz*delta[2];
    }
   }
  }
  const x=hand.x-shoulder.x,y=hand.y-shoulder.y,z=hand.z-shoulder.z,d=Math.hypot(x,y,z);
  if(d>C.reach)set(hand,shoulder.x+x*C.reach/d,shoulder.y+y*C.reach/d,shoulder.z+z*C.reach/d);
  if(Math.hypot(hand.x-beforeX,hand.y-beforeY,hand.z-beforeZ)<1e-7)break;
 }
}
/** State is read-only. All scratch storage is owned by memory, all output identities are stable. */
export function solvePose(input, memory, out) {
  if (input.state.gear === 'ski') return solveSkiPose(input, memory, out);
  if (memory.gear === 'ski') memory.initialized = false;
  memory.gear = 'board'; delete out.gear; delete out.poleDirs;
  const s = input.state, m = memory, p = m.candidate, j = p.joints, b = p.board;
  const dt = Math.max(0, input.dt), reset = !m.initialized || (input.jumped && s.mode !== 'air');
  if (reset) { m.crashPhase = 0; m.recoverTime = 1; }
  for (let i = 0; i < input.events.length; i++) {
    const e = input.events[i];
    if (e.type === 'recover') m.recoverTime = 0;
    if (e.type === 'land' && !reset) { kick(m.springs.height, -clamp(e.efh, 0, 4) * 0.6); kick(m.springs.sway, clamp(e.efh, 0, 4) * 0.8); }
  }
  m.recoverTime = Math.min(1, m.recoverTime + dt / 0.4);
  const recovering = m.recoverTime < 1;
  const airborne = s.mode === 'air', grounded = !airborne, stance = s.stance === -1 ? -1 : 1, travel = s.switch ? -1 : 1;
  copy(s.pos, b.pos); copy(s.fwd, b.fwd); unit(b.fwd);
  if (grounded) {
    const h = Math.hypot(b.fwd.x, b.fwd.z);
    if (h > 1e-9) {
      const fx = b.fwd.x / h, fz = b.fwd.z / h;
      const front = input.heightAt(s.pos.x + fx * 0.6, s.pos.z + fz * 0.6);
      const back = input.heightAt(s.pos.x - fx * 0.6, s.pos.z - fz * 0.6);
      set(b.fwd, fx * 1.2, front - back, fz * 1.2); unit(b.fwd);
    }
  }
  // Orthogonalize before edging; the neutral frame also keeps torso lean absolute.
  const d = s.up.x * b.fwd.x + s.up.y * b.fwd.y + s.up.z * b.fwd.z;
  set(m.baseUp, s.up.x - d * b.fwd.x, s.up.y - d * b.fwd.y, s.up.z - d * b.fwd.z); unit(m.baseUp);
  cross(b.fwd, m.baseUp, m.baseRight); unit(m.baseRight);
  // Physics already supplies the actual airborne board frame, including flip.
  const ec = airborne ? 1 : Math.cos(s.edge), es = airborne ? 0 : Math.sin(s.edge);
  set(b.up, m.baseUp.x * ec + m.baseRight.x * es, m.baseUp.y * ec + m.baseRight.y * es, m.baseUp.z * ec + m.baseRight.z * es);
  cross(b.fwd, b.up, b.right); unit(b.right);
  const worldHeading = Math.atan2(b.fwd.x, -b.fwd.z);
  changeFrame(m, b, airborne, worldHeading);
  offset(b.pos, b.fwd, BODY.footOffset * stance, j.ankleL); offset(j.ankleL, b.up, BODY.ankleHeight, j.ankleL);
  offset(b.pos, b.fwd, -BODY.footOffset * stance, j.ankleR); offset(j.ankleR, b.up, BODY.ankleHeight, j.ankleR);

  p.lean = drive(m, 'lean', 0.9 * s.edge, 16, dt, reset);
  p.crouch = clamp(drive(m, 'crouch', clamp(s.crouch, 0, 1), 18, dt, reset), 0, 1);
  let tuck = p.crouch;
  // 手を伸ばす先は「いま押している間」の値（reach）で決める。成立したつかみ（grab）を待つと、手が動き出すのが 0.3 秒遅れ、
  // 離した後も手が板に残った（滑走者の採点 1 周目）。reach を持たない古い状態では grab を使う。
  const grab = airborne ? (s.air?.reach ?? s.air?.grab ?? 0) : 0;
  const grabTime = Math.max(0, s.air?.reachTime ?? s.air?.grabTime ?? 0);
  if (s.mode === 'air') {
    // Predict clearance with the unflipped board below COM, not the rotating tip.
    const cx=s.pos.x+b.up.x*s.leg, cz=s.pos.z+b.up.z*s.leg;
    const clearance = s.pos.y+b.up.y*s.leg-s.leg-input.heightAt(cx,cz);
    // Solve the falling intersection, including acceleration near the apex.
    const fall = -s.vel.y;
    const remaining = (Math.sqrt(Math.max(0, fall * fall + 19.62 * Math.max(0, clearance))) - fall) / 9.81;
    tuck *= remaining < 0.25 && fall > 0 && !(grab > 0) ? clamp(remaining / 0.25, 0, 1) : 2.3;
  }
  // R1: a timed target ramp followed by three springs delayed recovery past 0.4s.
  // The springs themselves now perform the get-up transition towards the normal pose.
  const foldTarget = s.mode === 'crash' || s.mode === 'rest' ? 1 : 0;
  // Athletic stance: knees stay flexed about 50° when idle and sink further as the board is edged.
  const hTarget = clamp(s.leg * 0.86, 0, 0.78) * (1 - 0.30 * tuck - 0.085 * clamp(s.gLoad - 1, -1, 2.5) - 0.09 * Math.abs(Math.sin(p.lean))) * (1 - foldTarget) + 0.30 * foldTarget;
  const height = drive(m, 'height', hTarget, 22, dt, reset);
  const toe = Math.max(0, p.lean * stance), heel = Math.max(0, -p.lean * stance);
  // Use the neutral frame: adding board roll again would double the requested lean.
  const lateral = height * Math.sin(p.lean) - stance * heel * 0.08;
  const vertical = height * Math.cos(p.lean);
  const front = 0.035 * travel - (grab === 3 ? 0.48 * p.crouch : 0);
  const px = m.baseRight.x * lateral + m.baseUp.x * vertical + b.fwd.x * front + b.up.x * BODY.ankleHeight;
  const py = m.baseRight.y * lateral + m.baseUp.y * vertical + b.fwd.y * front + b.up.y * BODY.ankleHeight;
  const pz = m.baseRight.z * lateral + m.baseUp.z * vertical + b.fwd.z * front + b.up.z * BODY.ankleHeight;
  // Airborne springs live in the board frame, so rotation never lags the feet.
  if (airborne) {
    fromBoard(drive(m,'px',0,24,dt,reset), drive(m,'py',height + BODY.ankleHeight,24,dt,reset),
      drive(m,'pz',-front,24,dt,reset), b, j.pelvis);
    offset(b.pos,j.pelvis,1,j.pelvis);
  } else {
    set(j.pelvis, b.pos.x + drive(m, 'px', px, 24, dt, reset), b.pos.y + drive(m, 'py', py, 24, dt, reset), b.pos.z + drive(m, 'pz', pz, 24, dt, reset));
  }
  const heading = airborne ? 0 : worldHeading, chestHeading = heading + stance * Math.PI / 2;
  const velocityYaw = airborne ? (travel < 0 ? Math.PI : 0)
    : s.speed >= 1 && Math.hypot(s.vel.x, s.vel.z) > 1e-9 ? Math.atan2(s.vel.x, -s.vel.z) : heading + (travel < 0 ? Math.PI : 0);
  const towardTravel = wrapAngle(velocityYaw - chestHeading);
  const opening = drive(m, 'opening', chestHeading + clamp(towardTravel, -Math.PI / 6, Math.PI / 6), 16, dt, reset, true);
  const chestYaw = drive(m, 'chest', chestHeading + clamp(towardTravel, -Math.PI / 12, Math.PI / 12), 16, dt, reset, true);
  set(m.hipSide, Math.cos(opening), 0, Math.sin(opening));
  // Body right = chest forward × up (left hip is the front foot for regular stance).
  set(p.chestFwd, Math.sin(chestYaw), 0, -Math.cos(chestYaw));
  if (airborne) {
    fromBoard(Math.cos(opening),0,Math.sin(opening),b,m.hipSide);
    fromBoard(Math.sin(chestYaw),0,-Math.cos(chestYaw),b,p.chestFwd);
  }
  const grabFold = grab >= 1 && grab <= 3 ? 0.36 * p.crouch : 0;
  const bend = drive(m, 'bend', 0.15 + 0.10 * Math.abs(Math.sin(p.lean)) + 0.35 * tuck + grabFold + 0.035 * clamp(s.gLoad - 1, 0, 3) + foldTarget * 0.8, 18, dt, reset);
  set(p.chestUp, m.baseUp.x * Math.cos(p.lean * 0.4) + m.baseRight.x * Math.sin(p.lean * 0.4),
    m.baseUp.y * Math.cos(p.lean * 0.4) + m.baseRight.y * Math.sin(p.lean * 0.4), m.baseUp.z * Math.cos(p.lean * 0.4) + m.baseRight.z * Math.sin(p.lean * 0.4));
  if (airborne) copy(b.up,p.chestUp);
  // Tail grab folds toward the tail as well as across the board, without lengthening arms.
  copy(p.chestFwd,m.end);
  const tailFold=drive(m,'tailFold',grab===3?.55*p.crouch:0,24,dt,reset);
  if(airborne&&tailFold>0){offset(m.end,b.fwd,-tailFold,m.end);unit(m.end);}
  offset(p.chestUp, m.end, Math.tan(bend), p.chestUp); unit(p.chestUp);
  // I13f: additional uphill lean belongs to the upper body only.
  if (!airborne && (s.mode==='carve'||s.mode==='skid')) {
    const heelTilt=s.mode==='skid'?0:clamp(heel/.72,0,1)*11*Math.PI/180;
    const brakeTilt=s.mode==='skid'?10*Math.PI/180:0;
    const axis=m.pole;
    // Heel: outward toward the engaged heel edge; brake: opposite travel.
    const x=m.baseRight.x*(-stance*Math.tan(heelTilt))-b.fwd.x*travel*Math.tan(brakeTilt);
    const y=m.baseRight.y*(-stance*Math.tan(heelTilt))-b.fwd.y*travel*Math.tan(brakeTilt);
    const z=m.baseRight.z*(-stance*Math.tan(heelTilt))-b.fwd.z*travel*Math.tan(brakeTilt);
    set(axis,x,y,z);offset(p.chestUp,axis,1,p.chestUp);unit(p.chestUp);
  }
  if (s.mode === 'crash') m.crashPhase = wrapAngle(m.crashPhase + clamp(s.speed, 0, 40) * 0.18 * dt);
  else if (!recovering) m.crashPhase = 0;
  // R1: return through the nearest angle instead of unwinding all accumulated turns.
  const roll = drive(m, 'roll', s.mode === 'crash' ? m.crashPhase : 0, 12, dt, reset, true);
  set(m.axis, Math.cos(heading), 0, Math.sin(heading));
  if (airborne) copy(b.right,m.axis);
  rotate(p.chestUp, m.axis, roll); rotate(p.chestFwd, m.axis, roll); rotate(m.hipSide, m.axis, roll);
  const cu = p.chestFwd.x * p.chestUp.x + p.chestFwd.y * p.chestUp.y + p.chestFwd.z * p.chestUp.z;
  offset(p.chestFwd, p.chestUp, -cu, p.chestFwd); unit(p.chestFwd);
  cross(p.chestFwd, p.chestUp, m.shoulderSide); unit(m.shoulderSide);
  offset(j.pelvis, m.hipSide, -BODY.hipWidth / 2, j.hipL); offset(j.pelvis, m.hipSide, BODY.hipWidth / 2, j.hipR);
  for (let side = 0; side < 2; side++) {
    const ankle = side === 0 ? j.ankleL : j.ankleR, hip = side === 0 ? j.hipL : j.hipR, knee = side === 0 ? j.kneeL : j.kneeR;
    const binding = (side === 0 ? stance : -stance) > 0 ? BODY.frontBinding : BODY.rearBinding;
    set(m.pole, ankle.x + m.baseRight.x * stance * (0.6 + toe * 0.2) + b.fwd.x * Math.sin(binding) * 0.6,
      ankle.y + m.baseRight.y * stance * 0.6 + 0.1,
      ankle.z + m.baseRight.z * stance * (0.6 + toe * 0.2) + b.fwd.z * Math.sin(binding) * 0.6);
    if (airborne) {
      set(m.pole, ankle.x + b.right.x*stance*0.6 + b.fwd.x*Math.sin(binding)*0.6 + b.up.x*0.1,
        ankle.y + b.right.y*stance*0.6 + b.fwd.y*Math.sin(binding)*0.6 + b.up.y*0.1,
        ankle.z + b.right.z*stance*0.6 + b.fwd.z*Math.sin(binding)*0.6 + b.up.z*0.1);
    }
    solveTwoBone(hip, ankle, m.pole, BODY.thigh, BODY.shin, knee, m.end);
  }
  offset(j.pelvis, p.chestUp, BODY.pelvisToChest, j.chest);
  offset(j.chest, p.chestUp, BODY.chestToNeck, j.neck);
  offset(j.neck, p.chestUp, BODY.neck + BODY.headRadius, j.head);
  offset(j.chest, m.shoulderSide, -BODY.shoulderWidth / 2, j.shoulderL);
  offset(j.chest, m.shoulderSide, BODY.shoulderWidth / 2, j.shoulderR);
  offset(j.shoulderL, p.chestUp, BODY.shoulderRise, j.shoulderL);
  offset(j.shoulderR, p.chestUp, BODY.shoulderRise, j.shoulderR);
  const gaze = drive(m, 'head', velocityYaw + clamp(s.yawRate * 0.16, -0.35, 0.35), 16, dt, reset, true);
  const gazePitch = drive(m, 'headPitch', airborne ? Math.sin(s.air?.flip ?? 0)*0.35 : Math.atan2(s.vel.y, Math.max(1, Math.hypot(s.vel.x, s.vel.z))) * 0.3, 16, dt, reset);
  set(p.headFwd, Math.sin(gaze) * Math.cos(gazePitch), Math.sin(gazePitch), -Math.cos(gaze) * Math.cos(gazePitch)); rotate(p.headFwd, m.axis, roll);
  if (airborne) {
    // Look into the turn/flip in the chest frame; clamp the *3D* neck angle.
    const yaw = clamp(wrapAngle(gaze - chestYaw), -Math.PI/3, Math.PI/3);
    const pitch = clamp(gazePitch, -0.35, 0.35);
    set(p.headFwd, p.chestFwd.x*Math.cos(yaw)*Math.cos(pitch) + m.shoulderSide.x*Math.sin(yaw)*Math.cos(pitch) + p.chestUp.x*Math.sin(pitch),
      p.chestFwd.y*Math.cos(yaw)*Math.cos(pitch) + m.shoulderSide.y*Math.sin(yaw)*Math.cos(pitch) + p.chestUp.y*Math.sin(pitch),
      p.chestFwd.z*Math.cos(yaw)*Math.cos(pitch) + m.shoulderSide.z*Math.sin(yaw)*Math.cos(pitch) + p.chestUp.z*Math.sin(pitch));
    const cos = clamp(dot(p.headFwd,p.chestFwd),-1,1);
    if (cos < 0.5) {
      offset(p.headFwd,p.chestFwd,-cos,p.headFwd); unit(p.headFwd);
      set(p.headFwd,p.chestFwd.x*0.5+p.headFwd.x*Math.sqrt(0.75),p.chestFwd.y*0.5+p.headFwd.y*Math.sqrt(0.75),p.chestFwd.z*0.5+p.headFwd.z*Math.sqrt(0.75));
    }
  }
  const sway = drive(m, 'sway', clamp(s.yawRate * s.speed * 0.012, -0.20, 0.20), 10, dt, reset);
  for (let side = 0; side < 2; side++) {
    const shoulder = side === 0 ? j.shoulderL : j.shoulderR, hand = side === 0 ? j.handL : j.handR, elbow = side === 0 ? j.elbowL : j.elbowR;
    const airborne = s.mode === 'air', sign = (side === 0 ? 1 : -1) * stance, spread = airborne ? 0.42 : 0.18 + 0.30 * Math.abs(Math.sin(p.lean));
    // R1: spring arm offsets in the rotating chest frame. World-down poles flipped
    // the elbow when rolling through their singular bend plane.
    // Hands sit in front of the hips with the elbows out; in the air the arms open and lift for balance.
    // I13d: keep the leading hand toward the tip and the trailing hand outside the hip.
    // Raising the hands in a tuck keeps the forearm and mitten above the knees.
    const leading = sign * travel > 0;
    let sideOffset = (side === 0 ? -1 : 1) * spread, forwardOffset = (airborne ? 0.14 : leading ? 0.18 : -0.055) + sway, upRest = airborne ? -0.10 : -0.30 + 0.04 * p.crouch;
    let upOffset = upRest;
    if(s.mode==='skid')forwardOffset+=.10;
    if ((s.mode === 'carve' || s.mode === 'skid') && Math.abs(p.lean) > 40 * Math.PI / 180 && sign * p.lean > 0 && Math.abs(p.chestUp.y) > 0.1) {
      const handX = shoulder.x - p.chestUp.x * BODY.shoulderRise + m.shoulderSide.x * sideOffset + p.chestFwd.x * forwardOffset;
      const handZ = shoulder.z - p.chestUp.z * BODY.shoulderRise + m.shoulderSide.z * sideOffset + p.chestFwd.z * forwardOffset;
      upOffset = clamp((input.heightAt(handX, handZ) + 0.05 - (shoulder.y - p.chestUp.y * BODY.shoulderRise) - m.shoulderSide.y * sideOffset - p.chestFwd.y * forwardOffset) / p.chestUp.y, -0.5, upRest);
    }
    if (!airborne) {
      const oldReach = Math.hypot(sideOffset, upOffset, forwardOffset), oldScale = Math.min(1, .525 / oldReach);
      sideOffset *= oldScale; forwardOffset *= oldScale; upOffset = upOffset * oldScale - BODY.shoulderRise;
    }
    const grabbing = airborne && grab >= 1 && grab <= 3 && side === (grab === 2 ? (stance === 1 ? 0 : 1) : (stance === 1 ? 1 : 0));
    if (grabbing) {
      // 1: toe edge between bindings; 2: ahead of front foot; 3: rounded tail tip.
      const along = grab === 2 ? 0.40 : grab === 3 ? -0.76 : 0;
      const toeEdge = grab === 3 ? 0 : 0.124*stance;
      const tipRise = grab === 3 ? 0.046 : 0.006;
      set(m.end,b.pos.x+b.fwd.x*along+b.right.x*toeEdge+b.up.x*tipRise-shoulder.x,
        b.pos.y+b.fwd.y*along+b.right.y*toeEdge+b.up.y*tipRise-shoulder.y,
        b.pos.z+b.fwd.z*along+b.right.z*toeEdge+b.up.z*tipRise-shoulder.z);
      const t=clamp(grabTime/0.08,0,1), blend=t*t*(3-2*t)*p.crouch;
      sideOffset += (dot(m.end,m.shoulderSide)-sideOffset)*blend;
      upOffset += (dot(m.end,p.chestUp)-upOffset)*blend;
      forwardOffset += (dot(m.end,p.chestFwd)-forwardOffset)*blend;
      // Sweep around the toe side of both knees before descending between bindings.
      if(grab===1){const bow=.40*4*blend*(1-blend)*stance;sideOffset+=dot(b.right,m.shoulderSide)*bow;upOffset+=dot(b.right,p.chestUp)*bow;forwardOffset+=dot(b.right,p.chestFwd)*bow;}
    }
    const armOmega = grabbing ? 50 : 15;
    const hx = drive(m, side === 0 ? 'lx' : 'rx', sideOffset, armOmega, dt, reset);
    const hy = drive(m, side === 0 ? 'ly' : 'ry', upOffset, armOmega, dt, reset);
    const hz = drive(m, side === 0 ? 'lz' : 'rz', forwardOffset, armOmega, dt, reset);
    const reach = Math.hypot(hx, hy, hz), scale = Math.min(1, (airborne ? BODY.upperArm + BODY.forearm - 0.01 : 0.534) / Math.max(reach, 1e-9));
    set(hand, shoulder.x + (m.shoulderSide.x * hx + p.chestUp.x * hy + p.chestFwd.x * hz) * scale,
      shoulder.y + (m.shoulderSide.y * hx + p.chestUp.y * hy + p.chestFwd.y * hz) * scale,
      shoulder.z + (m.shoulderSide.z * hx + p.chestUp.z * hy + p.chestFwd.z * hz) * scale);
    const out = (side === 0 ? -1 : 1) * 0.5;
    set(m.pole, shoulder.x + m.shoulderSide.x * out - p.chestFwd.x * 0.2 - p.chestUp.x * 0.3,
      shoulder.y + m.shoulderSide.y * out - p.chestFwd.y * 0.2 - p.chestUp.y * 0.3,
      shoulder.z + m.shoulderSide.z * out - p.chestFwd.z * 0.2 - p.chestUp.z * 0.3);
    solveTwoBone(shoulder, hand, m.pole, BODY.upperArm, BODY.forearm, elbow, m.end);
    if(s.mode!=='crash'&&s.mode!=='rest'&&!recovering)clearHand(hand,shoulder,elbow,p,stance);
    solveTwoBone(shoulder, hand, m.pole, BODY.upperArm, BODY.forearm, elbow, m.end);
  }
  if (valid(p)) { commit(p, out); m.initialized = true; }
  else m.initialized = false;
  return out;
}
