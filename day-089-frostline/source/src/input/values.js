export const emptyInput = () => ({ steer: 0, tuck: 0, brake: 0, jump: false, grab: 0 });
export const clamp = (value, min = 0, max = 1) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : 0;
export function normalizeInput(value = {}) {
  return { steer: clamp(value.steer, -1, 1), tuck: clamp(value.tuck), brake: clamp(value.brake), jump: value.jump === true, grab: 0 };
}
export function deadzone(value, inner = .12, outer = .95) {
  return Math.sign(value || 0) * clamp((Math.abs(value || 0) - inner) / (outer - inner));
}
export function smoothSteer(current, target, dt) {
  return current + (target - current) * (1 - Math.exp(-dt / (target === 0 ? .05 : .08)));
}
