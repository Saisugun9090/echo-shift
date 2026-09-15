import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, queueTurn, step, tickDelay } from '../snake-engine.js';

test('food grows the snake, adds one point and respawns on a free cell', () => {
  const initial = createGame(6, () => 0);
  initial.food = { x: 4, y: 3 };
  const next = step(initial, () => 0);
  assert.equal(next.snake.length, 4);
  assert.equal(next.score, 1);
  assert.ok(!next.snake.some(cell => cell.x === next.food.x && cell.y === next.food.y));
  assert.equal(initial.snake.length, 3);
});

test('queued turns reject reversals and consume at most one turn per tick', () => {
  const initial = createGame(6, () => 0);
  assert.equal(queueTurn(initial, 'left'), initial);
  let next = queueTurn(queueTurn(initial, 'up'), 'left');
  assert.deepEqual(queueTurn(next, 'down').turns, ['up', 'left']);
  next = step(next);
  assert.equal(next.direction, 'up');
  assert.deepEqual(next.snake[0], { x: 3, y: 2 });
  next = step(next);
  assert.equal(next.direction, 'left');
  assert.deepEqual(next.snake[0], { x: 2, y: 2 });
  assert.equal(queueTurn(queueTurn(initial, 'up'), 'down').turns.length, 1);
  assert.equal(queueTurn(initial, 'constructor'), initial);
});

test('walls and body collisions stop the game; moving into the departing tail is legal', () => {
  let state = createGame(6, () => 0);
  state = step(step(step(state)));
  assert.equal(state.status, 'lost');
  assert.equal(step(state), state);
  const loop = { ...createGame(6), snake: [{ x: 2, y: 2 }, { x: 2, y: 3 }, { x: 1, y: 3 }, { x: 1, y: 2 }], direction: 'up', turns: ['left'], food: { x: 5, y: 5 } };
  assert.equal(step(loop).status, 'running');
  const bodyHit = { ...loop, snake: [...loop.snake, { x: 0, y: 2 }] };
  assert.equal(step(bodyHit).status, 'lost');
});

test('filling the board wins without attempting to place another food', () => {
  const cells = [];
  for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) cells.push({ x, y });
  const state = { ...createGame(6), snake: [cells[1], ...cells.slice(2)], direction: 'left', food: cells[0], score: 32 };
  const next = step(state);
  assert.equal(next.status, 'won');
  assert.equal(next.snake.length, 36);
  assert.equal(next.food, null);
  assert.equal(next.score, 33);
  assert.equal(step(next), next);
  assert.equal(tickDelay(0), 165);
  assert.equal(tickDelay(3), 155);
  assert.equal(tickDelay(300), 70);
});
