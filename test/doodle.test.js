import test from 'node:test';
import assert from 'node:assert/strict';
import { createRelay, assignedBook, submitRelay, advanceRelay, tickRelay, leaveRelay, nextBook, relayView, validView, validAction, validDrawing } from '../doodle-engine.js';

const drawing = [{ color: '#252b3b', width: 4, points: [[10, 10], [50, 30]] }];
const players = count => Array.from({ length: count }, (_, index) => ({ id: index ? `guest${index}` : 'host', name: `Player ${index}` }));
const action = (state, text = 'A penguin on a skateboard') => ({ type: 'submit', gameId: state.gameId, round: state.round,
  ...(state.round % 2 ? { kind: 'drawing', strokes: drawing } : { kind: 'text', text }) });

test('2–6 player relays rotate privately, validate submissions and reveal complete books', () => {
  for (const count of [2, 3, 4, 5, 6]) {
    const state = createRelay(players(count), 'round-one');
    assert.equal(state.totalRounds, count % 2 ? count : count + 1);
    for (let round = 0; round < state.totalRounds; round++) {
      const seen = new Set();
      for (const player of state.players) {
        assert.ok(validView(relayView(state, player.id)));
        const book = assignedBook(state, player.id); seen.add(book.owner);
        const view = relayView(state, player.id);
        assert.equal(view.book, null); assert.ok(!('books' in view));
        assert.equal(view.task?.text ?? null, round > 0 && round % 2 ? `Secret ${book.owner} ${round - 1}` : null);
        assert.equal(submitRelay(state, player.id, { ...action(state), round: 99 }), false);
        assert.equal(submitRelay(state, player.id, { ...action(state), gameId: 'old-round' }), false);
        assert.equal(submitRelay(state, 'intruder', action(state)), false);
        assert.equal(submitRelay(state, player.id, action(state, `Secret ${book.owner} ${round}`)), true);
        assert.equal(submitRelay(state, player.id, action(state)), false);
      }
      assert.equal(seen.size, count);
      assert.equal(advanceRelay(state), true);
    }
    assert.equal(state.phase, 'reveal');
    for (let index = 0; index < count; index++) {
      const view = relayView(state, 'host'); assert.ok(validView(view));
      assert.equal(view.book.steps.length, state.totalRounds);
      assert.equal(new Set(view.book.steps.slice(0, count).map(step => step.author)).size, count);
      assert.equal(nextBook(state), index < count - 1);
    }
    assert.equal(submitRelay(state, 'host', action(state)), false);
  }
});

test('timeouts, paused host and departed players cannot block or forge a relay', () => {
  const state = createRelay(players(3), 'timer-test');
  assert.equal(advanceRelay(state), false);
  state.paused = true; tickRelay(state); assert.equal(state.timeLeft, 60);
  assert.equal(submitRelay(state, 'host', action(state)), false);
  state.paused = false;
  leaveRelay(state, 'guest2'); assert.equal(submitRelay(state, 'guest2', action(state)), false);
  for (let index = 0; index < 60; index++) tickRelay(state);
  assert.equal(state.timeLeft, 0); assert.equal(submitRelay(state, 'host', action(state)), false);
  assert.equal(advanceRelay(state), true);
  assert.ok(state.books.every(book => book.steps[0].skipped));
  assert.ok(validView(relayView(state, 'host')));
  leaveRelay(state, 'guest1'); assert.equal(state.phase, 'ended'); assert.ok(validView(relayView(state, 'host')));
});

test('drawing and text limits reject oversized or malformed network input', () => {
  assert.ok(validDrawing(drawing));
  for (const strokes of [null, [{ ...drawing[0], color: 'url(x)' }], [{ ...drawing[0], width: 500 }], [{ ...drawing[0], points: [[-1, 10]] }], [{ ...drawing[0], points: [[NaN, 3]] }], Array(121).fill(drawing[0]), Array(7).fill({ ...drawing[0], points: Array(400).fill([1, 1]) })]) assert.equal(validDrawing(strokes), false);
  const state = createRelay(players(2), 'limits');
  assert.equal(validAction(action(state, 'x'.repeat(121))), false);
  assert.equal(validAction(action(state, 'bad\ntext')), false);
  assert.equal(validAction({ ...action(state), strokes: drawing }), false);
  assert.equal(validAction({ ...action(state), extra: 'unbounded data' }), false);
  assert.equal(validDrawing([{ ...drawing[0], extra: 'unbounded data' }]), false);
  assert.throws(() => createRelay(players(7), 'too-many'));
  assert.throws(() => createRelay([players(2)[0], players(2)[0]], 'duplicate'));
});
