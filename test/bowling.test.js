import test from 'node:test';
import assert from 'node:assert/strict';
import { COLORS, PIN_POSITIONS, ballPosition, createBowling, validAction, validState, bowl, settleRoll, leaveBowling, rankPlayers, scoreFrames, simulateRoll } from '../bowling-engine.js';

const players = Array.from({ length: 6 }, (_, index) => ({ id: `player-${index}`, name: `Friend ${index + 1}` }));
const frames = (regular, tenth = regular) => [...Array.from({ length: 9 }, () => [...regular]), [...tenth]];
const action = (state, aim = 0, power = 1, spin = 0) => ({ type: 'bowl', gameId: state.gameId, revision: state.revision, aim, power, spin });
const roll = (state, aim = 0, power = 1, spin = 0) => { assert.equal(bowl(state, state.players[state.turn].id, action(state, aim, power, spin)), true); assert.equal(validState(state), true); assert.equal(settleRoll(state), true); assert.equal(validState(state), true); };

test('official frame bonuses: perfect 300, all spares 150, open 90, tenth-frame marks and pending scores', () => {
  assert.equal(scoreFrames(frames([10], [10, 10, 10])).total, 300);
  assert.equal(scoreFrames(frames([5, 5], [5, 5, 5])).total, 150);
  assert.equal(scoreFrames(frames([9, 0])).total, 90);
  assert.equal(scoreFrames([[1, 4], [4, 5], [6, 4], [5, 5], [10], [0, 1], [7, 3], [6, 4], [10], [2, 8, 6]]).total, 133);
  assert.deepEqual(scoreFrames(frames([10], [10, 10, 10])).frames, Array.from({ length: 10 }, (_, index) => (index + 1) * 30));
  assert.deepEqual(scoreFrames(frames([0, 0], [10, 4, 6])).marks[9], ['X', '4', '/']);
  assert.deepEqual(scoreFrames(frames([0, 0], [7, 3, 10])).marks[9], ['7', '/', 'X']);
  assert.deepEqual(scoreFrames(frames([0, 10], [0, 10, 10])).marks[0], ['–', '/']);
  assert.deepEqual(scoreFrames(frames([0, 0], [10, 0, 10])).marks[9], ['X', '–', '/']);
  assert.deepEqual(scoreFrames(frames([0, 0], [0, 10, 10])).marks[9], ['–', '/', 'X']);
  const partial = Array.from({ length: 10 }, () => []); partial[0] = [10]; partial[1] = [7];
  assert.equal(scoreFrames(partial).total, 0); assert.equal(scoreFrames(partial).frames[0], null);
  partial[1].push(2); assert.equal(scoreFrames(partial).total, 28); assert.deepEqual(scoreFrames(partial).frames.slice(0, 3), [19, 28, null]);
  partial[0] = [8, 2]; partial[1] = [6]; assert.equal(scoreFrames(partial).total, 16);
});

test('one to six players play complete frames in room order; twelve strikes finish a 300 game', () => {
  assert.equal(COLORS.length, 6); assert.equal(PIN_POSITIONS.length, 10);
  assert.throws(() => createBowling([])); assert.throws(() => createBowling([...players, { id: 'seventh', name: 'Extra' }]));
  assert.throws(() => createBowling([players[0], players[0]])); assert.throws(() => createBowling([{ id: 'bad', name: '\n' }]));
  for (const size of [1, 6]) {
    const state = createBowling(players.slice(0, size), `test-${size}`); let shots = 0;
    for (let frame = 0; frame < 10; frame++) for (let player = 0; player < size; player++) {
      const count = frame === 9 ? 3 : 1;
      for (let shot = 0; shot < count; shot++) { assert.equal(state.turn, player); assert.equal(state.frame, frame); roll(state); shots++; }
    }
    assert.equal(shots, size * 12); assert.equal(state.phase, 'finished'); assert.equal(state.frame, 9);
    assert.deepEqual(rankPlayers(state).map(player => [player.score, player.position]), Array.from({ length: size }, () => [300, 1]));
    const done = structuredClone(state); assert.equal(bowl(state, players[0].id, action(state)), false); assert.equal(settleRoll(state), false); assert.deepEqual(state, done);
  }
});

test('first-ball misses preserve the rack and tenth-frame bonus rolls reset only earned racks', () => {
  const state = createBowling(players.slice(0, 2));
  roll(state, 1); assert.equal(state.turn, 0); assert.equal(state.frame, 0); assert.equal(state.pins.filter(Boolean).length, 10);
  roll(state); assert.equal(state.turn, 1); assert.equal(state.frame, 0); assert.deepEqual(state.players[0].frames[0], [0, 10]);
  const tenth = createBowling([players[0]]); tenth.frame = 9; tenth.players[0].frames = frames([0, 0], []);
  roll(tenth, 0, .2); const first = tenth.players[0].frames[9][0]; assert.ok(first > 0 && first < 10);
  assert.equal(tenth.pins.filter(Boolean).length, 10 - first);
  roll(tenth, 1); assert.equal(tenth.phase, 'finished'); assert.equal(tenth.players[0].frames[9].length, 2);
  const spare = createBowling([players[0]]); spare.frame = 9; spare.players[0].frames = frames([0, 0], []);
  roll(spare, 1); roll(spare); assert.equal(spare.phase, 'aiming'); assert.equal(spare.pins.filter(Boolean).length, 10);
  roll(spare); assert.equal(spare.phase, 'finished'); assert.deepEqual(spare.players[0].frames[9], [0, 10, 10]);
  const strike = createBowling([players[0]]); strike.frame = 9; strike.players[0].frames = frames([0, 0], []);
  roll(strike); roll(strike, 0, .2); const remaining = strike.pins.filter(Boolean).length; assert.ok(remaining > 0 && remaining < 10);
  roll(strike, 1); assert.equal(strike.phase, 'finished'); assert.equal(strike.players[0].frames[9].length, 3);
});

test('departures skip unfinished turns even during rolling and exclude departed winners', () => {
  const state = createBowling(players.slice(0, 3));
  assert.equal(bowl(state, players[0].id, action(state)), true);
  assert.equal(leaveBowling(state, players[0].id), true); assert.equal(state.phase, 'aiming'); assert.equal(state.turn, 1); assert.equal(validState(state), true);
  assert.equal(leaveBowling(state, players[0].id), false); assert.equal(leaveBowling(state, 'missing'), false);
  assert.equal(leaveBowling(state, players[2].id), true);
  let count = 0; while (state.phase !== 'finished' && count++ < 30) roll(state, 1);
  assert.equal(state.phase, 'finished'); assert.deepEqual(rankPlayers(state).map(player => player.id), [players[1].id]);
  const empty = createBowling([players[0]]); leaveBowling(empty, players[0].id); assert.equal(empty.phase, 'finished'); assert.deepEqual(rankPlayers(empty), []); assert.equal(validState(empty), true);
  const between = createBowling(players.slice(0, 2)); roll(between, 1); leaveBowling(between, players[0].id); assert.equal(between.turn, 1); assert.equal(validState(between), true);
});

test('only the current player can bowl; stale, replayed, malformed actions and inconsistent snapshots fail', () => {
  const state = createBowling(players.slice(0, 2)), original = structuredClone(state), first = action(state);
  for (const bad of [null, {}, { ...first, extra: true }, { ...first, aim: NaN }, { ...first, power: .19 }, { ...first, spin: Infinity }, { ...first, revision: 1.2 }, { ...first, gameId: '' }]) {
    assert.equal(validAction(bad), false); assert.equal(bowl(state, players[0].id, bad), false);
  }
  assert.equal(bowl(state, players[1].id, first), false); assert.equal(bowl(state, players[0].id, { ...first, gameId: 'old-game' }), false); assert.deepEqual(state, original);
  assert.equal(bowl(state, players[0].id, first), true); assert.equal(bowl(state, players[0].id, first), false); settleRoll(state);
  assert.equal(bowl(state, players[1].id, { ...first, gameId: state.gameId }), false);
  for (const mutate of [s => { s.extra = true; }, s => { s.players.push(...s.players, ...s.players, ...s.players); }, s => { s.players[1].id = s.players[0].id; }, s => { s.players[0].frames[0] = [10, 1]; }, s => { s.players[0].frames[9] = [10, 4, 7]; }, s => { s.pins[0] = 1; }, s => { s.lastShot.knocked = 11; }, s => { s.lastShot.after[0] = true; }, s => { s.turn = 3; }, s => { s.phase = 'finished'; }, s => { s.frame = 1; }]) {
    const invalid = structuredClone(state); mutate(invalid); assert.equal(validState(invalid), false);
  }
});

test('arcade trajectories are repeatable, power and spin matter, and downed pins never reappear', () => {
  const rack = Array(10).fill(true), results = new Set();
  assert.deepEqual(simulateRoll(rack, 0, 1, 0), Array(10).fill(false)); assert.deepEqual(simulateRoll(rack, 1, 1, 0), rack);
  assert.equal(simulateRoll(rack, 0, .8, 0).filter(Boolean).length, 2, 'default centre shot leaves a split');
  assert.equal(simulateRoll(rack, .11, .8, 0).filter(Boolean).length, 0, 'a slight pocket aim turns the same power into a strike');
  for (const aim of [-1, -.4, 0, .4, 1]) for (const power of [.2, .6, 1]) for (const spin of [-1, 0, 1]) {
    const after = simulateRoll(rack, aim, power, spin); results.add(after.filter(Boolean).length);
    assert.deepEqual(after, simulateRoll(rack, aim, power, spin)); assert.ok(after.every(pin => typeof pin === 'boolean'));
    const second = simulateRoll(after, -aim, power, -spin); assert.ok(second.every((pin, index) => !pin || after[index]));
    for (let step = 0; step <= 10; step++) { const ball = ballPosition(step / 10, aim, power, spin); assert.ok(Number.isFinite(ball.x) && Number.isFinite(ball.y)); }
  }
  assert.ok(results.size >= 4); assert.deepEqual(rack, Array(10).fill(true));
  assert.notDeepEqual(simulateRoll(rack, 0, 1, 0), simulateRoll(rack, 0, 1, 1));
  assert.throws(() => simulateRoll(rack, 0, NaN, 0));
});
