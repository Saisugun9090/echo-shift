export const COURSE = { width: 900, height: 600, limit: 90 };
export const CHECKPOINTS = [
  { x: 735, y: 475 }, { x: 790, y: 300 }, { x: 735, y: 125 }, { x: 450, y: 90 },
  { x: 165, y: 125 }, { x: 110, y: 300 }, { x: 165, y: 475 }, { x: 450, y: 510 },
];
export const OPTIONS = {
  body: ['roadster', 'buggy', 'truck'], roof: ['open', 'canopy', 'wing'],
  wheels: ['street', 'offroad'], paint: ['coral', 'blue', 'yellow', 'mint'],
};
export function carConfig(value) {
  return Object.fromEntries(Object.entries(OPTIONS).map(([key, values]) => [key, values.includes(value?.[key]) ? value[key] : values[0]]));
}
export function newDrive(config) {
  return { x: 450, y: 510, angle: 0, speed: 0, elapsed: 0, checkpoint: 0, status: 'running', config: carConfig(config) };
}
export function onRoad(x, y) {
  const inside = (left, top, right, bottom, radius) => {
    const dx = x - Math.max(left + radius, Math.min(right - radius, x));
    const dy = y - Math.max(top + radius, Math.min(bottom - radius, y));
    return Math.hypot(dx, dy) <= radius;
  };
  return inside(56, 44, 844, 556, 125) && !inside(206, 194, 694, 406, 55);
}
export function drive(state, controls, seconds) {
  if (state.status !== 'running' || !Number.isFinite(seconds) || seconds <= 0) return state;
  const dt = Math.min(seconds, 1 / 30);
  const throttle = Math.max(-1, Math.min(1, Number(controls.throttle) || 0));
  const steer = Math.max(-1, Math.min(1, Number(controls.steer) || 0));
  const road = onRoad(state.x, state.y);
  const topSpeed = state.config.body === 'truck' ? 185 : state.config.body === 'buggy' ? 210 : 235;
  const grip = state.config.wheels === 'offroad' ? 0.78 : 0.48;
  let speed = state.speed + throttle * 170 * dt;
  speed *= Math.exp(-(throttle ? 0.45 : 1.35) * dt);
  speed = Math.max(-85, Math.min(topSpeed * (road ? 1 : grip), speed));
  const angle = state.angle + steer * 2.5 * Math.min(1, Math.abs(speed) / 75) * Math.sign(speed) * dt;
  let x = state.x + Math.cos(angle) * speed * dt;
  let y = state.y + Math.sin(angle) * speed * dt;
  if (x < 24 || x > COURSE.width - 24 || y < 24 || y > COURSE.height - 24) {
    x = Math.max(24, Math.min(COURSE.width - 24, x));
    y = Math.max(24, Math.min(COURSE.height - 24, y));
    speed *= -0.3;
  }
  // The toy village is one solid island; the surrounding grass stays driveable.
  if (x > 260 && x < 640 && y > 245 && y < 355) { x = state.x; y = state.y; speed *= -0.3; }
  const elapsed = state.elapsed + dt;
  const target = CHECKPOINTS[state.checkpoint];
  const checkpoint = state.checkpoint + Number(elapsed <= COURSE.limit && Math.hypot(x - target.x, y - target.y) < 48);
  const status = checkpoint === CHECKPOINTS.length ? 'won' : elapsed >= COURSE.limit ? 'lost' : 'running';
  return { ...state, x, y, angle, speed, elapsed, checkpoint, status };
}
