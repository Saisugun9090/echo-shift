export const TRACK = { width: 1280, height: 800, cx: 640, cy: 400, rx: 465, ry: 260, halfWidth: 58 };
export const COLORS = ['#ff705b', '#72daca', '#ffd568', '#b7a2ff'];
export const LAPS = 3;
export const TAU = Math.PI * 2;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const angleDelta = value => Math.atan2(Math.sin(value), Math.cos(value));
export const neutralInput = () => ({ steer: 0, throttle: 0, brake: 0 });
export const validName = name => typeof name === 'string' && name.trim().length > 0 && name.trim().length <= 18 && !/[\u0000-\u001f\u007f]/.test(name);
export const validInput = input => !!input && typeof input === 'object' && Number.isFinite(input.steer) && Math.abs(input.steer) <= 1 && Number.isFinite(input.throttle) && input.throttle >= 0 && input.throttle <= 1 && Number.isFinite(input.brake) && input.brake >= 0 && input.brake <= 1;

export function trackPoint(angle, offset = 0) {
  return { x: TRACK.cx + (TRACK.rx + offset) * Math.cos(angle), y: TRACK.cy + (TRACK.ry + offset) * Math.sin(angle) };
}

export function trackPosition(x, y) {
  const angle = Math.atan2((y - TRACK.cy) / TRACK.ry, (x - TRACK.cx) / TRACK.rx);
  const point = trackPoint(angle);
  return { angle: (angle + TAU) % TAU, onRoad: Math.hypot(x - point.x, y - point.y) <= TRACK.halfWidth };
}

export function createRace(drivers) {
  if (!Array.isArray(drivers) || drivers.length < 1 || drivers.length > 4 || new Set(drivers.map(driver => driver.id)).size !== drivers.length || drivers.some(driver => typeof driver.id !== 'string' || driver.id.length > 100 || !validName(driver.name))) throw new Error('Choose one to four drivers with valid names.');
  return {
    phase: 'countdown', time: -3,
    cars: drivers.map((driver, index) => {
      const angle = -.09 - Math.floor(index / 2) * .1;
      return { id: driver.id, name: driver.name.trim(), color: index, ...trackPoint(angle, index % 2 === 0 ? -19 : 19), angle: Math.PI / 2, speed: 0, laps: 0, nextCheckpoint: 1, gates: 0, lastAngle: (angle + TAU) % TAU, finishedAt: null, connected: true };
    }),
  };
}

export function advanceCheckpoint(car, position, time) {
  const delta = angleDelta(position.angle - car.lastAngle);
  const gate = car.nextCheckpoint * Math.PI / 2;
  const distance = (gate - car.lastAngle + TAU) % TAU;
  if (position.onRoad && delta > 0 && delta < .2 && distance <= delta + 1e-8 && distance > 1e-8) {
    car.gates++;
    if (car.nextCheckpoint === 0) {
      car.laps++;
      if (car.laps === LAPS) car.finishedAt = time;
    }
    car.nextCheckpoint = (car.nextCheckpoint + 1) % 4;
  }
  car.lastAngle = position.angle;
}

// Cars are ghosts: close racing stays playable on ordinary peer-to-peer connections.
export function stepRace(state, controls, dt = 1 / 60) {
  if (state.phase === 'finished' || !Number.isFinite(dt) || dt <= 0 || dt > .05) return state;
  state.time += dt;
  if (state.time < 0) return state;
  state.phase = 'racing';
  for (const car of state.cars) {
    if (!car.connected || car.finishedAt !== null) continue;
    const candidate = controls?.[car.id];
    const input = validInput(candidate) ? candidate : neutralInput();
    const road = trackPosition(car.x, car.y).onRoad;
    const maxSpeed = road ? 335 : 85;
    car.speed += (input.throttle * 175 - input.brake * 350 - 24 - (road ? .07 : 1.4) * car.speed) * dt;
    car.speed = clamp(car.speed, 0, maxSpeed);
    car.angle = angleDelta(car.angle + input.steer * (1.75 - .6 * car.speed / 335) * Math.min(1, car.speed / 35) * dt);
    car.x = clamp(car.x + Math.cos(car.angle) * car.speed * dt, 18, TRACK.width - 18);
    car.y = clamp(car.y + Math.sin(car.angle) * car.speed * dt, 18, TRACK.height - 18);
    advanceCheckpoint(car, trackPosition(car.x, car.y), state.time);
  }
  if (state.cars.every(car => car.finishedAt !== null || !car.connected)) state.phase = 'finished';
  return state;
}

export function rankCars(state) {
  const progress = car => car.gates + clamp(angleDelta(car.lastAngle - ((car.nextCheckpoint + 3) % 4) * Math.PI / 2) / (Math.PI / 2), -.25, .999);
  return [...state.cars].sort((a, b) => {
    if (a.finishedAt !== null || b.finishedAt !== null) return (a.finishedAt ?? Infinity) - (b.finishedAt ?? Infinity);
    if (a.connected !== b.connected) return Number(b.connected) - Number(a.connected);
    return progress(b) - progress(a);
  });
}

export function validSnapshot(state) {
  return !!state && ['countdown', 'racing', 'finished'].includes(state.phase) && Number.isFinite(state.time) && state.time >= -3 && state.time < 86400 && Array.isArray(state.cars) && state.cars.length >= 1 && state.cars.length <= 4 && new Set(state.cars.map(car => car?.id)).size === state.cars.length && state.cars.every(car => car && typeof car.id === 'string' && car.id.length <= 100 && validName(car.name) && Number.isInteger(car.color) && car.color >= 0 && car.color < 4 && Number.isFinite(car.x) && car.x >= 0 && car.x <= TRACK.width && Number.isFinite(car.y) && car.y >= 0 && car.y <= TRACK.height && Number.isFinite(car.angle) && Math.abs(car.angle) <= Math.PI && Number.isFinite(car.speed) && car.speed >= 0 && car.speed <= 335 && Number.isInteger(car.laps) && car.laps >= 0 && car.laps <= LAPS && Number.isInteger(car.gates) && car.gates >= 0 && car.gates <= LAPS * 4 && Number.isInteger(car.nextCheckpoint) && car.nextCheckpoint >= 0 && car.nextCheckpoint <= 3 && Number.isFinite(car.lastAngle) && car.lastAngle >= 0 && car.lastAngle <= TAU && typeof car.connected === 'boolean' && (car.finishedAt === null || Number.isFinite(car.finishedAt) && car.finishedAt >= 0 && car.finishedAt <= state.time));
}
