import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassic, classicView, validView, validAction, applyClassic, tickClassic, nextClassic, leaveClassic } from '../doodle-classic-engine.js';

const roster = count => Array.from({ length: count }, (_, index) => ({ id: index ? `guest${index}` : 'host', name: `Player ${index}` }));
const drawing = [{ color: '#252b3b', width: 4, points: [[10, 10], [50, 30]] }];
const action = (state, type, fields) => ({ type, gameId: state.gameId, turn: state.turn, ...fields });
const choose = (state, now = 0) => applyClassic(state, state.drawerId, action(state, 'choose', { word: classicView(state, state.drawerId).choices[0] }), now);

test('2–6 players each draw once; correct answers count once and stay secret until the full timer expires', () => {
  for (let count = 2; count <= 6; count++) {
    const state = createClassic(roster(count), `match-${count}`, 30, 0, () => 0);
    const words = new Set();
    let now = 0;
    for (let turn = 0; turn < count; turn++) {
      assert.equal(state.drawerId, state.players[turn].id);
      for (const player of state.players) {
        const view = classicView(state, player.id);
        assert.ok(validView(view));
        assert.equal(view.choices.length, player.id === state.drawerId ? 3 : 0);
        for (const field of ['deadline', 'words', 'guessTimes']) assert.equal(field in view, false);
        assert.equal(view.word, null);
      }
      for (const word of classicView(state, state.drawerId).choices) { assert.equal(words.has(word), false); words.add(word); }
      assert.ok(choose(state, now));
      const answer = classicView(state, state.drawerId).word;
      assert.ok(applyClassic(state, state.drawerId, action(state, 'drawing', { revision: 1, strokes: drawing }), now));
      let correct = 0;
      for (const player of state.players) {
        const guess = action(state, 'guess', { text: `  ${answer.toUpperCase()}!  ` });
        if (player.id === state.drawerId) { assert.equal(applyClassic(state, player.id, guess, now), false); continue; }
        assert.ok(applyClassic(state, player.id, guess, now));
        assert.equal(applyClassic(state, player.id, guess, now), false);
        const view = classicView(state, player.id);
        assert.ok(validView(view)); assert.equal(view.correctCount, ++correct);
        assert.equal(view.word, null); assert.deepEqual(view.strokes, drawing);
        assert.equal(view.guesses.at(-1).text, 'guessed correctly');
        assert.equal(view.phase, 'draw');
      }
      assert.equal(nextClassic(state, now), false);
      assert.ok(tickClassic(state, now + 29999));
      assert.equal(classicView(state, state.players[(turn + 1) % count].id).word, null);
      assert.equal(state.phase, 'draw');
      assert.ok(tickClassic(state, now + 30000));
      for (const player of state.players) {
        const view = classicView(state, player.id); assert.ok(validView(view)); assert.equal(view.word, answer);
      }
      now += 31000;
      assert.ok(nextClassic(state, now, () => 0));
      if (turn < count - 1) {
        const view = classicView(state, state.drawerId);
        assert.equal(view.correctCount, 0); assert.deepEqual(view.strokes, []); assert.deepEqual(view.guesses, []);
      }
    }
    assert.equal(state.phase, 'finished');
    assert.ok(validView(classicView(state, 'host')));
    assert.ok(state.players.every(player => player.score === count - 1));
    assert.equal(nextClassic(state, now), false);
    const rematch = createClassic(roster(count), 'fresh-match', 60, now, () => 0);
    assert.equal(applyClassic(rematch, 'host', action(state, 'choose', { word: 'apple' }), now), false);
    assert.ok(rematch.players.every(player => player.score === 0));
  }
});

test('absolute deadlines auto-select words, catch up after a hidden host, and reject exactly-expired guesses', () => {
  const state = createClassic(roster(2), 'deadlines', 30, 1000, () => 0);
  assert.equal(applyClassic(state, 'guest1', action(state, 'choose', { word: 'apple' }), 1000), false);
  tickClassic(state, 15999); assert.equal(state.phase, 'choose'); assert.equal(state.timeLeft, 1);
  tickClassic(state, 16000); assert.equal(state.phase, 'draw'); assert.equal(classicView(state, 'host').word, 'apple');
  assert.equal(state.deadline, 46000);
  assert.ok(applyClassic(state, 'guest1', action(state, 'guess', { text: 'apple' }), 46000));
  assert.equal(state.phase, 'reveal'); assert.equal(state.players[1].score, 0); assert.equal(state.guesses.length, 0);
  const hidden = createClassic(roster(2), 'hidden', 90, 1000, () => 0);
  tickClassic(hidden, 200000); assert.equal(hidden.phase, 'reveal'); assert.equal(hidden.timeLeft, 0);
  assert.ok(validView(classicView(hidden, 'guest1')));
});

test('only the drawer changes the live drawing; stale revisions and guessed answers cannot leak or mutate state', () => {
  const state = createClassic(roster(3), 'live', 60, 0, () => 0); choose(state);
  assert.equal(applyClassic(state, 'guest1', action(state, 'drawing', { revision: 1, strokes: drawing }), 0), false);
  const payload = structuredClone(drawing);
  assert.ok(applyClassic(state, 'host', action(state, 'drawing', { revision: 1, strokes: payload }), 0));
  payload[0].points[0][0] = 999;
  assert.deepEqual(classicView(state, 'guest1').strokes, drawing);
  const view = classicView(state, 'guest1'); view.strokes[0].points[0][0] = 400;
  assert.deepEqual(classicView(state, 'guest2').strokes, drawing);
  assert.equal(applyClassic(state, 'host', action(state, 'drawing', { revision: 1, strokes: [] }), 0), false);
  assert.ok(applyClassic(state, 'host', action(state, 'drawing', { revision: 2, strokes: [] }), 0));
  assert.deepEqual(state.strokes, []);
  assert.ok(applyClassic(state, 'guest1', action(state, 'guess', { text: 'banana' }), 0));
  assert.equal(applyClassic(state, 'guest1', action(state, 'guess', { text: 'apple' }), 399), false);
  assert.ok(applyClassic(state, 'guest1', action(state, 'guess', { text: 'apple' }), 400));
  assert.equal(classicView(state, 'guest1').word, null);
  assert.equal(classicView(state, 'guest2').word, null);
  for (let index = 0; index < 25; index++) applyClassic(state, 'guest2', action(state, 'guess', { text: `Wrong ${index}` }), 1000 + index * 400);
  assert.equal(state.guesses.length, 20); assert.equal(classicView(state, 'guest1').correctCount, 1);
  assert.ok(validView(classicView(state, 'guest1')));
});

test('departed drawers reveal a reason, departed future turns are skipped and fewer than two ends play', () => {
  const state = createClassic(roster(4), 'leaving', 60, 0, () => 0);
  assert.ok(leaveClassic(state, 'host', 0)); assert.equal(state.phase, 'reveal');
  assert.equal(classicView(state, 'guest1').word, 'apple'); assert.match(state.notice, /left while drawing/);
  assert.ok(leaveClassic(state, 'guest2', 0)); assert.equal(leaveClassic(state, 'guest2', 0), false);
  assert.ok(nextClassic(state, 0, () => 0)); assert.equal(state.drawerId, 'guest1');
  choose(state); tickClassic(state, 60000); assert.ok(nextClassic(state, 60000, () => 0));
  assert.equal(state.drawerId, 'guest3'); assert.ok(validView(classicView(state, 'guest3')));
  assert.equal(applyClassic(state, 'guest2', action(state, 'guess', { text: 'bread' }), 60000), false);
  assert.ok(leaveClassic(state, 'guest1', 60000)); assert.equal(state.phase, 'ended');
  assert.ok(validView(classicView(state, 'guest3'))); assert.equal(classicView(state, 'guest3').word, null);
  assert.equal(nextClassic(state, 60000), false);
});

test('strict action and view limits reject unknown fields, malformed players and unbounded drawings', () => {
  const state = createClassic(roster(2), 'limits', 60, 0, () => 0);
  const good = action(state, 'guess', { text: 'apple' });
  assert.ok(validAction(good));
  for (const bad of [null, [], { ...good, text: '' }, { ...good, text: '!!!' }, { ...good, text: 'a'.repeat(61) }, { ...good, text: 'bad\ntext' },
    { ...good, gameId: '' }, { ...good, turn: 6 }, { ...good, extra: 'data' }, { ...good, type: 'pause' },
    action(state, 'drawing', { revision: 0, strokes: drawing }), action(state, 'drawing', { revision: 1, strokes: [{ ...drawing[0], points: [[NaN, 2]] }] }),
    action(state, 'drawing', { revision: 1, strokes: Array(121).fill(drawing[0]) }), action(state, 'choose', { word: 'unknown choice' })]) assert.equal(validAction(bad), false);
  const view = classicView(state, 'host'); assert.ok(validView(view));
  for (const bad of [{ ...view, deadline: 15000 }, { ...view, word: 'apple' }, { ...view, correctCount: 1 }, { ...view, solvedIds: ['host'] },
    { ...view, choices: ['apple', 'apple', 'apple'] }, { ...view, totalTurns: 7 }, { ...view, timeLeft: 16 }, { ...view, drawerId: 'intruder' },
    { ...view, players: [view.players[0], view.players[0]] }, { ...view, players: [{ ...view.players[0], score: 99 }, view.players[1]] },
    { ...view, guesses: [{ id: 'guest1', name: 'Player 1', text: 'apple', correct: true }] }, { ...view, notice: 'x'.repeat(201) }]) assert.equal(validView(bad), false);
  assert.throws(() => createClassic(roster(7), 'too-many'));
  assert.throws(() => createClassic(roster(1), 'too-few'));
  assert.throws(() => createClassic([roster(2)[0], roster(2)[0]], 'duplicate'));
  assert.throws(() => createClassic(roster(2), 'timer', 0));
  assert.throws(() => createClassic(roster(2), 'clock', 60, NaN));
  assert.equal(applyClassic(state, 'host', action(state, 'choose', { word: 'apple' }), NaN), false);
});
