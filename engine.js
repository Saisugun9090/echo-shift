import { LEVELS } from './levels.js';

const DIRECTIONS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0], wait: [0, 0] };
const tile = (state, position) => LEVELS[state.levelIndex].grid[position.y]?.[position.x];

export function createState(levelIndex = 0) {
  if (!Number.isInteger(levelIndex) || !LEVELS[levelIndex]) throw new RangeError('Unknown chamber.');
  const grid = LEVELS[levelIndex].grid;
  const y = grid.findIndex(row => row.includes('S'));
  const player = { x: grid[y].indexOf('S'), y };
  return {
    levelIndex, player, echoes: [], route: [player], tick: 0, moves: 0,
    rewinds: 0, collected: [], won: false, message: 'Collect every crystal, then reach the exit.',
  };
}

export function echoPositions(state, tick = state.tick) {
  if (!Number.isInteger(tick) || tick < 0) throw new RangeError('Tick must be a non-negative integer.');
  return state.echoes.map((route, index) => ({ ...route[Math.min(tick, route.length - 1)], index }));
}

export function isGateOpen(state, symbol, tick = state.tick) {
  if (symbol !== 'a' && symbol !== 'b') return false;
  return [state.player, ...echoPositions(state, tick)].some(position => tile(state, position) === symbol.toUpperCase());
}

export function step(state, action) {
  if (action === 'reset') return { ...createState(state.levelIndex), message: 'Chamber reset. Your echoes are cleared.' };
  if (state.won) return state;
  if (action === 'rewind') {
    const start = state.route[0];
    if (!state.route.some(position => position.x !== start.x || position.y !== start.y)) {
      return { ...state, message: 'Move before recording an echo.' };
    }
    const echoes = [...state.echoes.slice(-1), state.route];
    return {
      ...createState(state.levelIndex), echoes, moves: state.moves, rewinds: state.rewinds + 1,
      message: state.echoes.length === 2 ? 'Oldest echo replaced. Start a new loop.' : `Echo ${echoes.length} recorded. Start a new loop.`,
    };
  }
  if (!Object.hasOwn(DIRECTIONS, action)) return { ...state, message: 'Unknown action.' };
  const [dx, dy] = DIRECTIONS[action];
  const player = { x: state.player.x + dx, y: state.player.y + dy };
  const target = tile(state, player);
  if (!target || target === '#') return { ...state, message: 'A wall blocks the way.' };
  // Echoes advance before a gate entry; the player still holds their current switch.
  // Waiting on a gate already occupied remains legal, even after it closes.
  if (action !== 'wait' && (target === 'a' || target === 'b') && !isGateOpen(state, target, state.tick + 1)) {
    return { ...state, message: `Gate ${target.toUpperCase()} needs switch ${target.toUpperCase()} held on the next step.` };
  }
  const key = `${player.x},${player.y}`;
  const collected = target === 'o' && !state.collected.includes(key) ? [...state.collected, key] : state.collected;
  const crystalCount = LEVELS[state.levelIndex].grid.join('').split('o').length - 1;
  const remaining = crystalCount - collected.length;
  const won = target === 'X' && remaining === 0;
  const message = won ? 'Chamber complete.'
    : target === 'X' ? `${remaining} crystal${remaining === 1 ? '' : 's'} still missing.`
    : collected !== state.collected ? (remaining ? `${remaining} crystal${remaining === 1 ? '' : 's'} remaining.` : 'All crystals collected. Reach the exit.')
    : action === 'wait' ? 'Time advances. Your echoes take one step.'
    : target === 'A' || target === 'B' ? `Switch ${target} held. Rewind to leave an echo here.`
    : '';
  return { ...state, player, route: [...state.route, player], tick: state.tick + 1, moves: state.moves + 1, collected, won, message };
}
