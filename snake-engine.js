const vectors = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
const sameCell = (a, b) => a.x === b.x && a.y === b.y;

function placeFood(snake, size, random) {
  const free = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!snake.some(cell => cell.x === x && cell.y === y)) free.push({ x, y });
    }
  }
  return free.length ? free[Math.floor(random() * free.length)] : null;
}

export function createGame(size = 20, random = Math.random) {
  if (!Number.isInteger(size) || size < 6 || size > 64) throw new RangeError('Board size must be between 6 and 64.');
  const middle = Math.floor(size / 2);
  const snake = [0, 1, 2].map(offset => ({ x: middle - offset, y: middle }));
  return { size, snake, direction: 'right', turns: [], food: placeFood(snake, size, random), score: 0, status: 'running' };
}

export function queueTurn(state, direction) {
  if (!Object.hasOwn(vectors, direction) || state.status !== 'running' || state.turns.length === 2) return state;
  const previous = state.turns.at(-1) ?? state.direction;
  const [dx, dy] = vectors[direction];
  const [px, py] = vectors[previous];
  if (direction === previous || (dx === -px && dy === -py)) return state;
  return { ...state, turns: [...state.turns, direction] };
}

export function step(state, random = Math.random) {
  if (state.status !== 'running') return state;
  const direction = state.turns[0] ?? state.direction;
  const [dx, dy] = vectors[direction];
  const head = { x: state.snake[0].x + dx, y: state.snake[0].y + dy };
  const eating = sameCell(head, state.food);
  const body = eating ? state.snake : state.snake.slice(0, -1);
  const next = { ...state, direction, turns: state.turns.slice(1) };
  if (head.x < 0 || head.y < 0 || head.x >= state.size || head.y >= state.size || body.some(cell => sameCell(cell, head))) {
    return { ...next, status: 'lost' };
  }
  const snake = [head, ...body];
  const food = eating ? placeFood(snake, state.size, random) : state.food;
  return { ...next, snake, food, score: state.score + Number(eating), status: food ? 'running' : 'won' };
}

export const tickDelay = score => Math.max(70, 165 - Math.floor(score / 3) * 10);
