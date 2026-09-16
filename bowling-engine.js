export const COLORS = ['#ff816d', '#86e3c5', '#ffcf70', '#baabff', '#79cbff', '#f9a4d1'];
export const PIN_POSITIONS = Array.from({ length: 4 }, (_, row) => Array.from({ length: row + 1 }, (_, column) => ({ x: (column - row / 2) * .36, y: .78 + row * .05333333333333334 }))).flat();
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const finiteIn = (value, low, high) => Number.isFinite(value) && value >= low && value <= high;
const integerIn = (value, low, high) => Number.isInteger(value) && finiteIn(value, low, high);
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 100 && !/[\u0000-\u001f\u007f]/.test(value);
const validName = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 18 && !/[\u0000-\u001f\u007f]/.test(value);
const keys = (value, names) => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
const rack = () => Array(10).fill(true);
const validPins = pins => Array.isArray(pins) && pins.length === 10 && pins.every(pin => typeof pin === 'boolean');
const standing = pins => pins.filter(Boolean).length;
const complete = (rolls, frame) => frame < 9 ? rolls.length === 2 || rolls[0] === 10 : rolls.length === 3 || rolls.length === 2 && rolls[0] + rolls[1] < 10;
const available = rolls => !rolls.length || rolls.at(-1) === 10 || rolls.length === 2 && rolls[0] + rolls[1] === 10 ? 10 : 10 - rolls.at(-1);

function validFrames(frames) {
  if (!Array.isArray(frames) || frames.length !== 10) return false;
  let unfinished = false;
  return frames.every((rolls, frame) => {
    if (!Array.isArray(rolls) || rolls.length > (frame === 9 ? 3 : 2) || !rolls.every(roll => integerIn(roll, 0, 10)) || unfinished && rolls.length) return false;
    if (rolls.length > 1 && (frame < 9 && rolls[0] === 10 || rolls[0] < 10 && rolls[0] + rolls[1] > 10)) return false;
    if (rolls.length === 3 && (rolls[0] < 10 && rolls[0] + rolls[1] !== 10 || rolls[0] === 10 && rolls[1] < 10 && rolls[1] + rolls[2] > 10)) return false;
    unfinished = !complete(rolls, frame);
    return true;
  });
}

export function scoreFrames(frames) {
  const cumulative = [], marks = [];
  let total = 0, pending = false;
  for (let frame = 0; frame < 10; frame++) {
    const rolls = frames[frame] || [], next = frames.slice(frame + 1).flat();
    let pins = 10, fresh = true;
    marks.push(rolls.map(roll => { const mark = roll === 10 && fresh ? 'X' : roll === pins ? '/' : roll === 0 ? '–' : String(roll); pins -= roll; fresh = !pins; if (fresh) pins = 10; return mark; }));
    let score = null;
    if (complete(rolls, frame)) {
      if (frame === 9) score = rolls.reduce((sum, roll) => sum + roll, 0);
      else if (rolls[0] === 10) { if (next.length >= 2) score = 10 + next[0] + next[1]; }
      else if (rolls[0] + rolls[1] === 10) { if (next.length) score = 10 + next[0]; }
      else score = rolls[0] + rolls[1];
    }
    if (score === null) pending = true;
    else total += score;
    cumulative.push(pending ? null : total);
  }
  return { total, frames: cumulative, marks };
}

export function ballPosition(t, aim, power, spin) {
  const progress = clamp(t, 0, 1);
  return { x: aim * 1.15 * progress + spin * .5 * progress ** 3, y: progress * (.82 + .18 * power) };
}

export function simulateRoll(pins, aim, power, spin) {
  if (!validPins(pins) || !finiteIn(aim, -1, 1) || !finiteIn(power, .2, 1) || !finiteIn(spin, -1, 1)) throw new Error('Invalid bowling shot.');
  const after = [...pins], energy = Array(10).fill(0), reach = .82 + .18 * power;
  let gutterAt = 1.01;
  for (let step = 0; step <= 100; step++) if (Math.abs(ballPosition(step / 100, aim, power, spin).x) >= .94) { gutterAt = step / 100; break; }
  // ponytail: deterministic forward pin impacts keep arcade play tiny; use rigid-body physics if realistic pin ricochets become a requirement.
  for (let index = 0; index < 10; index++) {
    if (!pins[index]) continue;
    const pin = PIN_POSITIONS[index], progress = pin.y / reach;
    const distance = Math.abs(ballPosition(progress, aim, power, spin).x - pin.x);
    // A pocket hit transfers more energy through the head pin than a straight centre hit.
    const transfer = index === 0 ? .6 + .55 * Math.max(0, 1 - Math.abs(distance - .1) / .1) : 1 - .55 * distance / .15;
    if (progress <= 1 && progress < gutterAt && distance < .15) energy[index] = Math.max(energy[index], power * transfer);
    if (energy[index] < .12) continue;
    after[index] = false;
    for (let next = index + 1; next < 10; next++) {
      const target = PIN_POSITIONS[next];
      if (pins[next] && target.y > pin.y && target.y - pin.y < .06 && Math.abs(target.x - pin.x) < .181) {
        const impact = energy[index] * .72;
        if (impact >= .2) energy[next] = Math.max(energy[next], impact);
      }
    }
  }
  return after;
}

export function createBowling(players, gameId = 'bowling-v1') {
  if (!Array.isArray(players) || players.length < 1 || players.length > 6 || !validId(gameId) || new Set(players.map(player => player?.id)).size !== players.length
      || !players.every(player => player && validId(player.id) && validName(player.name))) throw new Error('Bowling needs one to six players with valid names.');
  return { gameId, revision: 0, phase: 'aiming', players: players.map(player => ({ id: player.id, name: player.name.trim(), connected: true, frames: Array.from({ length: 10 }, () => []) })), turn: 0, frame: 0, pins: rack(), lastShot: null };
}

export const validAction = action => keys(action, ['type', 'gameId', 'revision', 'aim', 'power', 'spin']) && action.type === 'bowl' && validId(action.gameId)
  && integerIn(action.revision, 0, 1000000) && finiteIn(action.aim, -1, 1) && finiteIn(action.power, .2, 1) && finiteIn(action.spin, -1, 1);

export function bowl(state, id, action) {
  if (state.phase !== 'aiming' || !validAction(action) || action.gameId !== state.gameId || action.revision !== state.revision || state.players[state.turn].id !== id || !state.players[state.turn].connected) return false;
  const before = [...state.pins], after = simulateRoll(before, action.aim, action.power, action.spin), knocked = standing(before) - standing(after);
  state.players[state.turn].frames[state.frame].push(knocked);
  state.revision++;
  state.lastShot = { id: state.revision, playerId: id, aim: action.aim, power: action.power, spin: action.spin, before, after, knocked };
  state.pins = [...after]; state.phase = 'rolling';
  return true;
}

function advanceTurn(state) {
  while (state.frame < 10) {
    for (let offset = 1; offset <= state.players.length; offset++) {
      const index = (state.turn + offset) % state.players.length, player = state.players[index];
      if (player.connected && !complete(player.frames[state.frame], state.frame)) {
        state.turn = index; state.phase = 'aiming'; state.pins = rack(); return;
      }
    }
    state.frame++;
    // Every new frame starts at the first connected player, retaining the room's order.
    state.turn = state.players.length - 1;
  }
  state.frame = 9; state.phase = 'finished';
}

export function settleRoll(state) {
  if (state.phase !== 'rolling') return false;
  state.revision++;
  if (!state.players[state.turn].connected || complete(state.players[state.turn].frames[state.frame], state.frame)) advanceTurn(state);
  else { if (!standing(state.pins)) state.pins = rack(); state.phase = 'aiming'; }
  return true;
}

export function leaveBowling(state, id) {
  const index = state.players.findIndex(player => player.id === id);
  if (index < 0 || !state.players[index].connected) return false;
  state.players[index].connected = false; state.revision++;
  if (state.phase !== 'finished' && index === state.turn) advanceTurn(state);
  return true;
}

export function rankPlayers(state) {
  const players = state.players.filter(player => player.connected).map(player => ({ ...player, score: scoreFrames(player.frames).total })).sort((a, b) => b.score - a.score);
  return players.map((player, index) => ({ ...player, position: index && players[index - 1].score === player.score ? players.findIndex(other => other.score === player.score) + 1 : index + 1 }));
}

export function validState(state) {
  if (!keys(state, ['gameId', 'revision', 'phase', 'players', 'turn', 'frame', 'pins', 'lastShot']) || !validId(state.gameId) || !integerIn(state.revision, 0, 1000000)
      || !['aiming', 'rolling', 'finished'].includes(state.phase) || !Array.isArray(state.players) || state.players.length < 1 || state.players.length > 6
      || new Set(state.players.map(player => player?.id)).size !== state.players.length
      || !state.players.every(player => keys(player, ['id', 'name', 'connected', 'frames']) && validId(player.id) && validName(player.name) && typeof player.connected === 'boolean' && validFrames(player.frames))
      || !integerIn(state.turn, 0, state.players.length - 1) || !integerIn(state.frame, 0, 9) || !validPins(state.pins)) return false;
  const shot = state.lastShot;
  if (shot !== null && (!keys(shot, ['id', 'playerId', 'aim', 'power', 'spin', 'before', 'after', 'knocked']) || !integerIn(shot.id, 1, state.revision)
      || !state.players.some(player => player.id === shot.playerId) || !finiteIn(shot.aim, -1, 1) || !finiteIn(shot.power, .2, 1) || !finiteIn(shot.spin, -1, 1)
      || !validPins(shot.before) || !validPins(shot.after) || !standing(shot.before) || !integerIn(shot.knocked, 0, 10)
      || shot.after.some((pin, index) => pin && !shot.before[index]) || standing(shot.before) - standing(shot.after) !== shot.knocked)) return false;
  if (state.phase === 'finished') return state.frame === 9 && state.players.filter(player => player.connected).every(player => player.frames.every(complete));
  const current = state.players[state.turn], rolls = current.frames[state.frame];
  if (!current.connected || state.players.some(player => player.frames.slice(state.frame + 1).some(frame => frame.length)
      || player.connected && player.frames.slice(0, state.frame).some((frame, index) => !complete(frame, index)))) return false;
  if (state.phase === 'aiming') return !complete(rolls, state.frame) && standing(state.pins) === available(rolls);
  return shot !== null && shot.playerId === current.id && rolls.length > 0 && rolls.at(-1) === shot.knocked
    && standing(shot.before) === available(rolls.slice(0, -1)) && state.pins.every((pin, index) => pin === shot.after[index]);
}
