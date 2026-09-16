export const ARENA = { width: 1200, height: 760, rim: 42, radius: 23 };
export const COLORS = ['#ff816d', '#86e3c5', '#ffcf70', '#baabff', '#79cbff', '#f9a4d1'];
export const ROUND_SECONDS = 90;
export const neutralAction = () => ({ x: 0, y: 0 });
export const validAction = action => !!action && Number.isFinite(action.x) && Math.abs(action.x) <= 1 && Number.isFinite(action.y) && Math.abs(action.y) <= 1;
const validName = name => typeof name === 'string' && name.trim().length > 0 && name.trim().length <= 18 && !/[\u0000-\u001f\u007f]/.test(name);
const validId = id => typeof id === 'string' && id.length > 0 && id.length <= 100;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const finiteIn = (value, low, high) => Number.isFinite(value) && value >= low && value <= high;

function random(state) {
  state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0;
  return state.seed / 4294967296;
}

function placeStar(state, id) {
  let star;
  for (let attempt = 0; attempt < 24; attempt++) {
    star = { id, x: 95 + random(state) * 1010, y: 95 + random(state) * 570 };
    if (state.cars.every(car => Math.hypot(car.x - star.x, car.y - star.y) > 70) && state.stars.every(other => other.id === id || Math.hypot(other.x - star.x, other.y - star.y) > 65)) break;
  }
  return star;
}

export function createBash(players) {
  if (!Array.isArray(players) || players.length < 1 || players.length > 6 || players.some(player => !player || !validId(player.id) || !validName(player.name)) || new Set(players.map(player => player.id)).size !== players.length) throw new Error('Choose one to six players with valid names.');
  const state = { phase: 'countdown', time: -3, paused: false, seed: 19770615, stars: [], cars: players.map((player, index) => {
    const angle = index * Math.PI / 3 - Math.PI / 2;
    return { id: player.id, name: player.name.trim(), color: index, x: 600 + Math.cos(angle) * 170, y: 380 + Math.sin(angle) * 170, vx: 0, vy: 0, angle, score: 0, connected: true };
  }) };
  for (let id = 0; id < 9; id++) state.stars.push(placeStar(state, id));
  return state;
}

// The host stamps arrivals. A dropped connection cannot leave its last direction held down.
export function stepBash(state, controls, dt = 1 / 60, nowMs = 0) {
  if (state.phase === 'finished' || state.paused || !finiteIn(dt, .00001, .05) || !Number.isFinite(nowMs)) return state;
  state.time = Math.min(ROUND_SECONDS, state.time + dt);
  if (state.time < 0) return state;
  if (state.time >= ROUND_SECONDS) { state.phase = 'finished'; return state; }
  state.phase = 'playing';
  const cars = state.cars.filter(car => car.connected);
  const boundary = ARENA.rim + ARENA.radius;
  for (const car of cars) {
    const received = controls?.[car.id];
    const fresh = received && finiteIn(nowMs - received.receivedAt, 0, 600) && validAction(received.action);
    const action = fresh ? received.action : neutralAction();
    const length = Math.max(1, Math.hypot(action.x, action.y));
    car.vx = (car.vx + action.x / length * 1000 * dt) * Math.exp(-3 * dt);
    car.vy = (car.vy + action.y / length * 1000 * dt) * Math.exp(-3 * dt);
    const speed = Math.hypot(car.vx, car.vy);
    if (speed > 520) { car.vx *= 520 / speed; car.vy *= 520 / speed; }
    if (speed > 12) car.angle = Math.atan2(car.vy, car.vx);
    car.x += car.vx * dt; car.y += car.vy * dt;
    if (car.x < boundary || car.x > ARENA.width - boundary) { car.x = clamp(car.x, boundary, ARENA.width - boundary); car.vx *= -.65; }
    if (car.y < boundary || car.y > ARENA.height - boundary) { car.y = clamp(car.y, boundary, ARENA.height - boundary); car.vy *= -.65; }
  }
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
    const a = cars[i], b = cars[j], dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy);
    if (distance >= ARENA.radius * 2) continue;
    const nx = distance > 0 ? dx / distance : 1, ny = distance > 0 ? dy / distance : 0;
    const overlap = (ARENA.radius * 2 - distance) / 2;
    a.x -= nx * overlap; a.y -= ny * overlap; b.x += nx * overlap; b.y += ny * overlap;
    const closingSpeed = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
    if (closingSpeed > 0) {
      const impulse = Math.min(520, closingSpeed * .95 + 45);
      a.vx -= impulse * nx; a.vy -= impulse * ny; b.vx += impulse * nx; b.vy += impulse * ny;
    }
  }
  for (const car of cars) {
    car.x = clamp(car.x, boundary, ARENA.width - boundary); car.y = clamp(car.y, boundary, ARENA.height - boundary);
    const speed = Math.hypot(car.vx, car.vy);
    if (speed > 520) { car.vx *= 520 / speed; car.vy *= 520 / speed; }
    for (let i = 0; i < state.stars.length; i++) if (Math.hypot(car.x - state.stars[i].x, car.y - state.stars[i].y) < ARENA.radius + 13) {
      car.score++; state.stars[i] = placeStar(state, state.stars[i].id);
    }
  }
  return state;
}

export const rankPlayers = state => [...state.cars].sort((a, b) => b.score - a.score || Number(b.connected) - Number(a.connected) || a.color - b.color);

export function validState(state) {
  return !!state && ['countdown', 'playing', 'finished'].includes(state.phase) && finiteIn(state.time, -3, ROUND_SECONDS) && typeof state.paused === 'boolean' && Number.isInteger(state.seed) && finiteIn(state.seed, 0, 4294967295)
    && Array.isArray(state.cars) && state.cars.length >= 1 && state.cars.length <= 6 && new Set(state.cars.map(car => car?.id)).size === state.cars.length
    && new Set(state.cars.map(car => car?.color)).size === state.cars.length
    && state.cars.every(car => car && validId(car.id) && validName(car.name) && Number.isInteger(car.color) && finiteIn(car.color, 0, 5) && finiteIn(car.x, 0, ARENA.width) && finiteIn(car.y, 0, ARENA.height) && finiteIn(car.vx, -520, 520) && finiteIn(car.vy, -520, 520) && finiteIn(car.angle, -Math.PI, Math.PI * 2) && Number.isInteger(car.score) && finiteIn(car.score, 0, 100000) && typeof car.connected === 'boolean')
    && Array.isArray(state.stars) && state.stars.length === 9 && new Set(state.stars.map(star => star?.id)).size === 9
    && state.stars.every(star => star && Number.isInteger(star.id) && finiteIn(star.id, 0, 8) && finiteIn(star.x, 95, 1105) && finiteIn(star.y, 95, 665));
}
