// 部品の変位は盤の座標、刃・手・ラベル・焦点は魚の座標（cm）。
// 完了済みの手順は作成時に畳む。再生中は指定された手順の窓だけを評価する。
import {
  ALL_PIECE_IDS, ANCHOR_OWNER, CURVE_INFO, LOCK_MIN_MOVE_CM, PIECE_IDS, POSE_LOCK_ROOTS,
  curveOwner, poseTransform, resolveText, validateProcedure,
} from './contract.js';
import {
  clamp01, cross, dot, easeInOut, easeOut, lerp, measurePolyline, mixVector, pointOnPath, slerpQuat, unit, windowT,
} from './easing.js';

export { poseTransform, resolveText };
const AXIS = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
const FULL = [0, 1];
const PADDING = 0.1;
const radians = deg => deg * Math.PI / 180;
const times = (v, factor) => v.map(x => x * factor);
const difference = (a, b) => a.map((x, k) => x - b[k]);

// 盤の寸法は手順の移動量と、描画する板で共有します。単位は cm です。
export function boardSizeFor(totalLength) {
  return { width: Math.min(42 * 1.6, Math.max(42, 2 * totalLength)),
    depth: Math.min(28 * 1.6, Math.max(28, 1.25 * totalLength)) };
}

function perpendicular(v, tangent, fallback) {
  const project = n => difference(n, times(tangent, dot(n, tangent)));
  let projected = project(v);
  if (Math.hypot(...projected) < 1e-8) projected = project(fallback);
  if (Math.hypot(...projected) < 1e-8) {
    const axis = Math.abs(tangent[0]) < 0.8 ? AXIS.x : AXIS.y;
    projected = project(axis);
  }
  return unit(projected);
}

// 列ベクトルが刃の局所軸である回転行列を、最大の成分から四元数に変換する。
function basisQuat(x, y, z) {
  const columns = [x, y, z];
  const trace = x[0] + y[1] + z[2];
  if (trace > 0) {
    const s = 2 * Math.sqrt(1 + trace);
    return [(y[2] - z[1]) / s, (z[0] - x[2]) / s, (x[1] - y[0]) / s, s / 4];
  }
  const i = x[0] >= y[1] && x[0] >= z[2] ? 0 : y[1] >= z[2] ? 1 : 2;
  const j = (i + 1) % 3, k = (i + 2) % 3;
  const s = 2 * Math.sqrt(1 + columns[i][i] - columns[j][j] - columns[k][k]);
  const q = [0, 0, 0, (columns[j][k] - columns[k][j]) / s];
  q[i] = s / 4;
  q[j] = (columns[i][j] + columns[j][i]) / s;
  q[k] = (columns[i][k] + columns[k][i]) / s;
  return q;
}

function surfaceNormal(anatomy, pos, side) {
  if (anatomy.profile && anatomy.surface) {
    const s = clamp01(pos[0] / anatomy.SL);
    const profile = anatomy.profile(s);
    const height = pos[1] - profile.axisY;
    const depth = height >= 0 ? profile.top : profile.bottom;
    const exponent = (height >= 0 ? profile.nTop : profile.nBottom) / 2;
    if (depth > 0 && profile.half > 0 && Number.isFinite(exponent)) {
      const sin = Math.sign(height) * Math.pow(Math.abs(height) / depth, exponent);
      const cos = Math.sign(pos[2]) * Math.pow(Math.abs(pos[2]) / profile.half, exponent);
      return anatomy.surface(s, Math.atan2(sin, cos)).n;
    }
  }
  // 点と線だけを渡す解剖では、断面の中心から接触点に向かう半径を使う。
  const center = anatomy.point('bodyCenter');
  const radial = [0, pos[1] - center[1], pos[2] - center[2]];
  return Math.hypot(...radial) > 1e-8 ? radial : [0, 0, side];
}

const defaultLead = motion => motion === 'pull' ? 'heel' : motion === 'push' ? 'tip' : 'mid';

function bladeFrame(anatomy, path, cut, t) {
  const pos = pointOnPath(path, t);
  // 弧長の両側から接線を取ると、折れ線の頂点でも刃が一瞬で回転しない。
  let tangent = unit(difference(pointOnPath(path, t + 0.005), pointOnPath(path, t - 0.005)));
  if (!Math.hypot(...tangent)) tangent = path.segments[0].dir;
  const side = cut.side === 'R' ? -1 : 1;
  const inner = CURVE_INFO[cut.curve].inner;
  const exposed = [0, 0, -side];
  const normal = perpendicular(inner ? exposed : surfaceNormal(anatomy, pos, side), tangent, [0, 0, side]);
  const angle = radians(cut.angleDeg ?? (inner ? 8 : 0));
  const bank = (base, toward) => base.map((v, k) => v * Math.cos(angle) + toward[k] * Math.sin(angle));
  let x, y;
  if (cut.motion === 'pluck') {
    // 先端から柄へ（局所の−x）、頭寄りかつ身の切り口から外に向かって抜く。
    x = [Math.cos(angle), 0, side * Math.sin(angle)];
    y = AXIS.y;
  } else if (cut.motion === 'scrape') {
    x = unit(cross(tangent, normal));
    y = bank(tangent, normal);
  } else if (inner) {
    x = tangent;
    const back = unit(cross(AXIS.z, x));
    const edge = cut.curve === 'ribStrip' ? times(back, -1) : back;
    y = bank(perpendicular(times(edge, -1), x, AXIS.y), normal);
  } else {
    const lead = cut.lead ?? defaultLead(cut.motion);
    const heelFirst = lead === 'heel' || (lead === 'mid' && cut.motion === 'pull');
    x = times(tangent, heelFirst ? -1 : 1);
    const lateral = times(cross(tangent, normal), side);
    y = cut.motion === 'peel' ? bank(lateral, normal) : bank(normal, lateral);
  }
  const z = unit(cross(x, y));
  return { pos, normal, quat: basisQuat(x, unit(cross(z, x)), z) };
}

// 切りの向きは、カーブの向き（頭→尾が基本）か、その逆（reverse:true＝尾→頭）。
const curvePoints = (anatomy, cut) => {
  const points = anatomy.curve(cut.curve, cut.side ?? null).points;
  return cut.reverse ? [...points].reverse() : points;
};

// knife.js もこの関数を公開する。中心線の両端で刃を浮かす量だけを盤上の演出から渡せる。
export function knifePose(anatomy, cut, fraction, opts = {}) {
  const path = opts.path ?? measurePolyline(curvePoints(anatomy, cut));
  const t = clamp01(fraction);
  const frame = bladeFrame(anatomy, path, cut, t);
  const reference = opts.reference ?? bladeFrame(anatomy, path, cut, 0.5).quat;
  const quat = dot(frame.quat, reference) < 0 ? times(frame.quat, -1) : frame.quat;
  const pos = opts.liftCm ? frame.pos.map((x, k) => x + opts.liftCm * frame.normal[k]) : frame.pos;
  return { pos, quat };
}

const copyRot = rot => ({
  axis: [...rot.axis], deg: rot.deg, pivot: Array.isArray(rot.pivot) ? [...rot.pivot] : rot.pivot,
});
const axisQuat = ({ axis, deg }) => [...times(axis, Math.sin(radians(deg) / 2)), Math.cos(radians(deg) / 2)];

function rotationAt(a, b, t) {
  if (t === 0) return copyRot(a);
  if (t === 1) return copyRot(b);
  if (!a.deg || !b.deg || dot(a.axis, b.axis) > 0.999999) {
    return { ...copyRot(b), axis: [...(b.deg ? b.axis : a.axis)], deg: lerp(a.deg, b.deg, t) };
  }
  const q = slerpQuat(axisQuat(a), axisQuat(b), t);
  const vector = q.slice(0, 3);
  const sin = Math.hypot(...vector);
  return { ...copyRot(b), axis: sin > 1e-9 ? unit(vector) : [...b.axis], deg: 360 / Math.PI * Math.atan2(sin, q[3]) };
}

function initialState() {
  const pieces = Object.fromEntries(ALL_PIECE_IDS.map(id => [id, {
    visible: PIECE_IDS.includes(id), opacity: 1, move: [0, 0, 0], rot: { axis: [...AXIS.y], deg: 0, pivot: 'pivot' },
    poseLock: null,
  }]));
  return { pieces, uniforms: { scale: 1, scutes: 1, slitOpen: 0, xray: 0 }, incisions: [] };
}

function pieceAt(base, tracks, u) {
  const result = { ...base, move: [...base.move], rot: copyRot(base.rot) };
  let lastVisibility = -1;
  for (const track of tracks) {
    const { from, window: [a, b] } = track;
    if (u < a) break;
    const t = easeInOut(windowT(u, track.window));
    if (track.move) {
      result.move = mixVector(from.move, track.move, t);
      // 次の移動窓が重なると、先の窓はその時点で終わります。窓の始点までに入った固定を引き継ぎます。
      result.poseLock = from.poseLock ?? (track.lockPose && Math.hypot(...result.move) >= LOCK_MIN_MOVE_CM
        ? track.lockPose : null);
    }
    if (track.rot) result.rot = rotationAt(from.rot, track.rot, t);
    if (track.opacity !== undefined) result.opacity = lerp(from.opacity, track.opacity, t);
    const switchAt = track.visible ? a : b;
    if (track.visible !== undefined && switchAt <= u && switchAt >= lastVisibility) {
      result.visible = track.visible;
      lastVisibility = switchAt;
    }
  }
  if (result.poseLock) {
    const { head, dorsal, q, p } = result.poseLock;
    result.poseLock = { head, dorsal, q: [...q], p: [...p] };
  }
  return result;
}

function compileMoves(base, moves, endPose) {
  const byPiece = {};
  for (const move of [...moves].sort((a, b) => a.window[0] - b.window[0])) {
    const tracks = byPiece[move.piece] ??= [];
    const from = pieceAt(base.pieces[move.piece], tracks, move.window[0]);
    const rot = move.rot && { axis: AXIS[move.rot.axis], deg: move.rot.deg, pivot: move.rot.about ?? 'pivot' };
    tracks.push({ ...move, from, rot, lockPose: POSE_LOCK_ROOTS.includes(move.piece) ? endPose : null });
  }
  return byPiece;
}

function persistentAt(frame, u) {
  const { base, tracks, step } = frame;
  const pieces = Object.fromEntries(Object.entries(base.pieces).map(([id, p]) => [id, pieceAt(p, tracks[id] ?? [], u)]));
  const uniforms = { ...base.uniforms };
  for (const [key, change] of Object.entries(step.uniforms ?? {})) {
    const t = easeInOut(windowT(u, change.window ?? FULL));
    uniforms[key] = lerp(base.uniforms[key], change.to, t);
  }
  const incisions = base.incisions.map(c => ({ ...c }));
  for (const cut of step.cuts ?? []) {
    const progress = windowT(u, cut.window);
    if (progress === 0) continue;
    const side = cut.side ?? null;
    const reverse = !!cut.reverse;
    const existing = incisions.find(c => c.curve === cut.curve && c.side === side && c.reverse === reverse);
    if (existing) {
      existing.progress = Math.max(existing.progress, progress);
      existing.through ||= !!cut.through;
    } else incisions.push({ curve: cut.curve, side, progress, through: !!cut.through, reverse });
  }
  return { pieces, uniforms, incisions };
}

function attachment(anatomy, anchor, piece) {
  if (anchor.startsWith('piece:')) return { pos: [...anatomy.point('bodyCenter')], owner: piece ?? anchor.slice(6) };
  return { pos: [...anatomy.point(anchor)], owner: piece ?? ANCHOR_OWNER[anchor] };
}

function cameraFor(anatomy, camera, pathFor) {
  const { preset, focus = 'bodyCenter', zoom = 1 } = camera;
  let point = focus, owner = null;
  if (typeof focus === 'string') {
    ({ pos: point, owner } = attachment(anatomy, focus));
  } else if (!Array.isArray(focus)) {
    point = pointOnPath(pathFor(focus.curve, focus.side), 0.5);
    owner = curveOwner(focus.curve, focus.side);
  }
  return { preset, focusPoint: [...point], focusOwner: owner, zoom };
}

// 手順で使う長手方向の線を、指定された二つの目印の間で切り出します。交点は元の折れ線上に取ります。
function anatomyForProcedure(anatomy, limits) {
  if (!limits) return anatomy;
  return { ...anatomy, curve(name, side) {
    const curve = anatomy.curve(name, side);
    if (!Object.hasOwn(limits, name)) return curve;
    const [lo, hi] = limits[name].map(anchor => anatomy.point(anchor)[0]).sort((a, b) => a - b);
    const points = [];
    for (const [i, p] of curve.points.entries()) {
      const previous = curve.points[i - 1];
      if (previous) {
        for (const x of previous[0] < p[0] ? [lo, hi] : [hi, lo]) {
          if ((previous[0] - x) * (p[0] - x) < 0) points.push(mixVector(previous, p, (x - previous[0]) / (p[0] - previous[0])));
        }
      }
      if (lo <= p[0] && p[0] <= hi) points.push(p);
    }
    return { ...curve, points };
  } };
}

export function createProcedure(raw, sourceAnatomy) {
  const errors = validateProcedure(raw);
  if (errors.length) throw new Error(errors.join('\n'));
  const steps = structuredClone(raw.steps);
  const anatomy = anatomyForProcedure(sourceAnatomy, structuredClone(raw.curveLimits));
  const paths = new Map();
  const pathFor = (curve, side = null, reverse = false) => {
    const key = curve + '/' + (side ?? '') + (reverse ? '/r' : '');
    if (!paths.has(key)) paths.set(key, measurePolyline(curvePoints(anatomy, { curve, side, reverse })));
    return paths.get(key);
  };
  let base = initialState();
  const frames = steps.map((step, i) => {
    const cuts = (step.cuts ?? []).map(cut => {
      const path = pathFor(cut.curve, cut.side, !!cut.reverse);
      return { cut, path, reference: bladeFrame(anatomy, path, cut, 0.5).quat };
    });
    const marks = entries => (entries ?? []).map(m => ({ ...m, ...attachment(anatomy, m.anchor, m.piece) }));
    const previous = steps[Math.max(0, i - 1)].pose;
    const endPose = { head: step.pose.head, dorsal: step.pose.dorsal, ...poseTransform(step.pose) };
    const frame = {
      step, base, tracks: compileMoves(base, step.moves ?? [], endPose), cuts, previous,
      startPose: poseTransform(previous), endPose,
      camera: cameraFor(anatomy, step.camera, pathFor), hands: marks(step.hands), labels: marks(step.labels),
    };
    base = persistentAt(frame, 1);
    return frame;
  });
  return { steps, anatomy, frames };
}

function activeKnife(anatomy, cuts, u) {
  let nearest = null, gap = Infinity;
  for (const entry of cuts) {
    const [a, b] = entry.cut.window;
    const distance = Math.max(a - u, u - b, 0);
    if (distance < gap) {
      nearest = entry;
      gap = distance;
    }
  }
  if (!nearest || gap > PADDING + 1e-12) return null;
  const { cut, path, reference } = nearest;
  const { tool, curve, side = null, motion, lead = defaultLead(motion) } = cut;
  const angleDeg = cut.angleDeg ?? (CURVE_INFO[curve].inner ? 8 : 0);
  const t = windowT(u, cut.window);
  const liftCm = easeInOut(gap / PADDING) * Math.min(2, anatomy.SL * 0.08);
  return { tool, curve, side, owner: curveOwner(curve, side), motion, lead, angleDeg, t,
    ...knifePose(anatomy, cut, t, { path, reference, liftCm }) };
}

// 手の印の持ち主（'R.dorsal'・'skin.L' など）が右か左か。
const sideOfOwner = owner => /^([RL])\./u.exec(owner ?? '')?.[1] ?? /\.([RL])$/u.exec(owner ?? '')?.[1] ?? null;

/**
 * 同じ手・同じ文の印が複数あるとき（身が2枚あるなど）、いま包丁が働いている側の1つだけを残す。
 * 2つ出すと「どちらの身を押さえるのか」が分からない。包丁が無い間は先頭を残す。
 */
export function activeHands(hands, knife) {
  const groups = new Map();
  for (const hand of hands) {
    const key = hand.who + '|' + hand.text;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(hand);
  }
  const side = sideOfOwner(knife?.owner);
  // 組が最初に出た順に、各組から1つ。
  return [...groups.values()].map(group => (side && group.find(hand => sideOfOwner(hand.owner) === side)) || group[0]);
}

export const stepCount = proc => proc.steps.length;

/** 魚の置き直し（姿勢の補間）が終わる手順の進み具合。 */
export const POSE_WINDOW_END = 0.12;

export function stateAt(proc, i, progress, { leftHanded = false } = {}) {
  if (!Number.isInteger(i) || i < 0 || i >= stepCount(proc)) throw new RangeError('手順番号が範囲外です。');
  const u = clamp01(progress);
  const frame = proc.frames[i];
  const { step, startPose, endPose, camera } = frame;
  // 置き直しの動きは手順の最初の12%で終える（長いと、途中の斜めの絵が「置き方」の文と食い違って見える）。
  const t = easeInOut(windowT(u, [0, POSE_WINDOW_END]));
  const { head, dorsal } = t === 0 ? frame.previous : step.pose;
  const text = value => resolveText(value, leftHanded);
  const marks = entries => entries.map(m => ({ ...m, pos: [...m.pos], text: text(m.text) }));
  const highlights = (step.highlight ?? []).map(({ curve, side = null }) => ({
    curve, side, owner: curveOwner(curve, side), opacity: easeOut(windowT(u, [0, 0.1])),
  }));
  const knife = activeKnife(proc.anatomy, frame.cuts, u);
  const effects = (step.effects ?? []).filter(e => u >= e.window[0] && u <= e.window[1]).map(e => ({
    kind: e.kind, t: windowT(u, e.window), curve: e.curve, side: e.side ?? null,
  }));
  return {
    ...persistentAt(frame, u),
    pose: { head, dorsal, q: slerpQuat(startPose.q, endPose.q, t), p: mixVector(startPose.p, endPose.p, t), t },
    knife, highlights, hands: activeHands(marks(frame.hands), knife), labels: marks(frame.labels), effects,
    camera: { ...camera, focusPoint: [...camera.focusPoint] },
    title: text(step.title), summary: text(step.summary), how: step.how.map(text), tip: text(step.tip),
    mistake: text(step.mistake), done: text(step.done), place: text(step.place),
    ...(step.safety !== undefined && { safety: text(step.safety) }),
  };
}

export const endStateOf = (proc, i) => stateAt(proc, i, 1);
