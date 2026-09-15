import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../levels.js';
import { createState, step, echoPositions, isGateOpen } from '../engine.js';

const solutions = [
  { par: 12, actions: 'down down rewind right right right right down down up up right right'.split(' ') },
  { par: 16, actions: 'down down down rewind right right down down right right right left up up right right right'.split(' ') },
  { par: 24, actions: 'down down rewind right right right right down down down rewind right right right right down down down down up up up up right right right'.split(' ') },
  { par: 28, actions: 'down down rewind down down down down right right right rewind down down down down up up up up right right right right right right down down down down right'.split(' ') },
  { par: 42, actions: 'down down rewind right right right right down down down down rewind down down down down right right left left up up up up right right right right down down left left right right up up right right right down down down down down'.split(' ') },
];

const play = (state, actions) => actions.reduce(step, state);
const progress = ({ message, ...state }) => state;
function freeze(value) {
  Object.freeze(value);
  for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child);
  return value;
}

test('every chamber is rectangular and its supplied solution wins at its stated par', () => {
  for (const [index, level] of LEVELS.entries()) {
    assert.ok(level.grid.every(row => row.length === level.grid[0].length), level.id);
    assert.match(level.grid.join(''), /^[#.SXoABab]+$/);
    assert.equal(level.grid.join('').split('S').length - 1, 1);
    assert.equal(level.grid.join('').split('X').length - 1, 1);
    let state = freeze(createState(index));
    for (const action of solutions[index].actions) {
      const next = step(state, action);
      assert.ok(action === 'rewind' ? next.rewinds === state.rewinds + 1 : next.moves === state.moves + 1, `${level.id}: blocked ${action} at ${state.player.x},${state.player.y}`);
      state = freeze(next);
    }
    assert.equal(state.won, true, level.id);
    assert.equal(state.moves, solutions[index].par, level.id);
    assert.ok(state.echoes.length >= (index >= 2 ? 2 : 1), level.id);
  }
});

test('every chamber requires an echo: its exit is unreachable with all gates shut', () => {
  for (const [index, level] of LEVELS.entries()) {
    const start = createState(index).player;
    const queue = [start];
    const visited = new Set([`${start.x},${start.y}`]);
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const { x, y } = queue[cursor];
      assert.notEqual(level.grid[y][x], 'X', level.id);
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const symbol = level.grid[y + dy]?.[x + dx];
        const key = `${x + dx},${y + dy}`;
        if (symbol && !'#ab'.includes(symbol) && !visited.has(key)) {
          visited.add(key);
          queue.push({ x: x + dx, y: y + dy });
        }
      }
    }
    // A player alone cannot step directly from a switch onto its gate.
    for (let y = 0; y < level.grid.length; y++) for (let x = 0; x < level.grid[y].length; x++) {
      const symbol = level.grid[y][x];
      if ('AB'.includes(symbol)) for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        assert.notEqual(level.grid[y + dy]?.[x + dx], symbol.toLowerCase(), level.id);
      }
    }
  }
});

test('walls, closed gates, unknown actions and empty recordings preserve progress', () => {
  const state = freeze(createState());
  for (const action of ['up', 'left', 'rewind', 'teleport', '__proto__', null, undefined]) {
    const next = step(state, action);
    assert.deepEqual(progress(next), progress(state));
    assert.ok(next.message);
  }
  const waiting = step(state, 'wait');
  assert.deepEqual(progress(step(waiting, 'rewind')), progress(waiting));
  const gate = play(state, ['right', 'right']);
  assert.deepEqual(progress(step(gate, 'right')), progress(gate));
  assert.throws(() => createState(-1), RangeError);
  assert.throws(() => createState(0.5), RangeError);
  assert.throws(() => echoPositions(state, -1), RangeError);
});

test('a successful wait advances echoes; gate entry sees their next position; completed echoes hold', () => {
  const recorded = play(createState(), ['wait', 'wait', 'down', 'down', 'rewind']);
  assert.equal(recorded.tick, 0);
  assert.deepEqual(echoPositions(recorded), [{ x: 1, y: 1, index: 0 }]);
  const approach = play(recorded, ['right', 'right']);
  const blocked = step(approach, 'right');
  assert.deepEqual(progress(blocked), progress(approach));
  const ready = step(blocked, 'wait');
  assert.equal(isGateOpen(ready, 'a'), false);
  const through = step(ready, 'right');
  assert.deepEqual(through.player, { x: 4, y: 1 });
  assert.equal(through.tick, 4);
  assert.equal(isGateOpen(through, 'a'), true);
  assert.deepEqual(echoPositions(through, 100), [{ x: 1, y: 3, index: 0 }]);
  assert.equal(isGateOpen(play(createState(), ['down', 'down']), 'a'), true);
  assert.equal(isGateOpen(through, 'x'), false);
});

test('an echo leaving a switch blocks entry on that tick but never traps a player already inside the gate', () => {
  const recorded = play(createState(), ['down', 'down', 'wait', 'up', 'rewind']);
  const approach = play(recorded, ['right', 'right']);
  const tooLate = step(approach, 'wait');
  assert.equal(isGateOpen(tooLate, 'a'), true);
  assert.deepEqual(progress(step(tooLate, 'right')), progress(tooLate));
  const inside = step(approach, 'right');
  const closed = step(inside, 'wait');
  assert.equal(isGateOpen(closed, 'a'), false);
  assert.deepEqual(closed.player, { x: 4, y: 1 });
  assert.equal(closed.tick, inside.tick + 1);
  assert.deepEqual(step(closed, 'right').player, { x: 5, y: 1 });
});

test('rewinding clears crystals, and replaying echoes never collect them', () => {
  const original = play(createState(1), ['right', 'right']);
  assert.deepEqual(original.collected, ['3,1']);
  const rewind = step(original, 'rewind');
  assert.deepEqual(rewind.collected, []);
  assert.equal(rewind.moves, 2);
  const replayed = play(rewind, ['wait', 'wait']);
  assert.deepEqual(echoPositions(replayed), [{ x: 3, y: 1, index: 0 }]);
  assert.deepEqual(replayed.collected, []);
  const collected = play(replayed, ['right', 'right']);
  assert.deepEqual(collected.collected, ['3,1']);
  assert.deepEqual(play(collected, ['left', 'right']).collected, ['3,1']);
});

test('a third recording replaces only the oldest echo; reset clears the chamber', () => {
  const first = play(createState(), ['down', 'down', 'rewind']);
  const second = play(first, ['right', 'rewind']);
  const third = play(second, ['right', 'right', 'rewind']);
  assert.equal(third.echoes.length, 2);
  assert.deepEqual(third.echoes[0], second.echoes[1]);
  assert.deepEqual(third.echoes[1].at(-1), { x: 3, y: 1 });
  assert.equal(third.moves, 5);
  assert.equal(third.rewinds, 3);
  assert.match(third.message, /replaced/);
  assert.deepEqual(progress(step(third, 'reset')), progress(createState()));
});

test('replayed echoes overlap freely and cross gates even after the supporting echo is replaced', () => {
  const first = play(createState(2), ['down', 'down', 'rewind']);
  const second = play(first, ['right', 'right', 'right', 'right', 'down', 'down', 'down', 'rewind']);
  const replaced = play(second, ['right', 'rewind']);
  assert.deepEqual(echoPositions(replaced), [{ x: 1, y: 1, index: 0 }, { x: 1, y: 1, index: 1 }]);
  const replayed = play(replaced, ['wait', 'wait', 'wait']);
  assert.equal(isGateOpen(replayed, 'a'), false);
  assert.deepEqual(echoPositions(replayed)[0], { x: 4, y: 1, index: 0 });
  assert.deepEqual(replayed.player, { x: 1, y: 1 });
});

test('the exit needs every crystal and completion freezes play until reset', () => {
  const premature = play(createState(), ['down', 'down', 'rewind', 'right', 'right', 'right', 'right', 'right', 'right']);
  assert.equal(premature.won, false);
  assert.match(premature.message, /missing/);
  const won = freeze(play(createState(), solutions[0].actions));
  for (const action of ['left', 'wait', 'rewind', 'unknown']) assert.deepEqual(step(won, action), won);
  assert.deepEqual(progress(step(won, 'reset')), progress(createState()));
});
