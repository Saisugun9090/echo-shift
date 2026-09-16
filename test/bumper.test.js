import test from 'node:test';
import assert from 'node:assert/strict';
import { ARENA, COLORS, ROUND_SECONDS, createBash, stepBash, validAction, validState, rankPlayers } from '../bumper-engine.js';

const players = Array.from({ length: 6 }, (_, index) => ({ id: `player-${index}`, name: `Friend ${index + 1}` }));

test('six bumper cars spawn separately, with unique colours and a valid deterministic arena', () => {
  const state = createBash(players);
  assert.equal(validState(state), true); assert.deepEqual(state, createBash(players));
  assert.equal(new Set(state.cars.map(car => `${car.x},${car.y}`)).size, 6);
  assert.equal(new Set(state.cars.map(car => COLORS[car.color])).size, 6);
  assert.throws(() => createBash([...players, { id: 'seventh', name: 'Extra' }]));
  assert.throws(() => createBash([players[0], players[0]]));
  assert.throws(() => createBash([{ id: '', name: 'Empty ID' }]));
});

test('invalid inputs and snapshots are rejected; stale controls cannot accelerate a car', () => {
  for (const action of [null, {}, { x: NaN, y: 0 }, { x: 1.1, y: 0 }, { x: 0, y: Infinity }]) assert.equal(validAction(action), false);
  assert.equal(validAction({ x: 1, y: -1 }), true);
  const state = createBash([players[0]]); state.time = 0;
  const originalX = state.cars[0].x;
  stepBash(state, { 'player-0': { action: { x: 1, y: 0 }, receivedAt: 0 } }, .05, 601);
  assert.equal(state.cars[0].x, originalX);
  stepBash(state, { 'player-0': { action: { x: 1, y: 0 }, receivedAt: 700 } }, .05, 700);
  assert.ok(state.cars[0].x > originalX);
  for (const change of [s => { s.cars[0].x = Infinity; }, s => { s.cars[0].score = -1; }, s => { s.cars[0].color = 6; }, s => { s.stars[0].id = s.stars[1].id; }, s => { s.paused = 'yes'; }]) {
    const invalid = structuredClone(state); change(invalid); assert.equal(validState(invalid), false);
  }
});

test('head-on bumper collisions separate cars and transfer momentum', () => {
  const state = createBash(players.slice(0, 2)); state.time = 0;
  const [a, b] = state.cars; Object.assign(a, { x: 550, y: 380, vx: 220, vy: 0 }); Object.assign(b, { x: 590, y: 380, vx: -220, vy: 0 });
  stepBash(state, {}, 1 / 60, 0);
  assert.ok(b.x - a.x >= ARENA.radius * 2 - .001); assert.ok(a.vx < 0); assert.ok(b.vx > 0); assert.equal(validState(state), true);
  Object.assign(a, { x: b.x, y: b.y }); stepBash(state, {}, 1 / 60, 0); assert.equal(validState(state), true);
});

test('stars score once, refill, walls contain cars and disconnected players stop collecting', () => {
  const state = createBash(players.slice(0, 2)); state.time = 0;
  const car = state.cars[0], star = state.stars[0]; car.x = star.x; car.y = star.y;
  stepBash(state, {}, 1 / 60, 0); assert.equal(car.score, 1); assert.notDeepEqual(state.stars[0], star); assert.equal(state.stars.length, 9);
  car.connected = false; car.x = state.stars[0].x; car.y = state.stars[0].y;
  stepBash(state, {}, 1 / 60, 0); assert.equal(car.score, 1);
  Object.assign(state.cars[1], { x: ARENA.width - 60, y: 380, vx: 500 });
  stepBash(state, {}, .05, 0); assert.ok(state.cars[1].x <= ARENA.width - ARENA.rim - ARENA.radius); assert.ok(state.cars[1].vx < 0);
  assert.equal(rankPlayers(state)[0].id, car.id);
});

test('countdown, pause and ninety-second finish prevent scores changing after the round', () => {
  const state = createBash(players); const initial = structuredClone(state);
  stepBash(state, {}, .05, 0); assert.equal(state.phase, 'countdown'); assert.deepEqual(state.cars, initial.cars);
  state.paused = true; const pausedTime = state.time; stepBash(state, {}, .05, 0); assert.equal(state.time, pausedTime);
  state.paused = false; state.time = ROUND_SECONDS - .01; stepBash(state, {}, .05, 0); assert.equal(state.phase, 'finished'); assert.equal(state.time, ROUND_SECONDS);
  const finished = structuredClone(state); stepBash(state, {}, .05, 0); assert.deepEqual(state, finished); assert.equal(validState(state), true);
});
