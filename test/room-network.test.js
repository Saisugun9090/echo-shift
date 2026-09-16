import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRoom, validCode, validName } from '../room-network.js';
import { createClassic, classicView, validView as validClassicView, validAction as validClassicAction, applyClassic, tickClassic } from '../doodle-classic-engine.js';

class Connection extends EventEmitter {
  constructor(id) { super(); this.peer = id; this.open = true; this.sent = []; }
  send(message) { this.sent.push(structuredClone(message)); }
  close() { if (this.open) { this.open = false; this.emit('close'); } }
}
function fakePeer(t) {
  const original = globalThis.Peer;
  let peer;
  globalThis.Peer = class extends EventEmitter {
    constructor(id) { super(); peer = this; this.id = id ?? 'guest'; queueMicrotask(() => this.emit('open')); }
    connect(id) { this.server = new Connection(id); queueMicrotask(() => this.server.emit('open')); return this.server; }
    destroy() { this.destroyed = true; }
    reconnect() { this.emit('open'); }
  };
  t.after(() => { if (original === undefined) delete globalThis.Peer; else globalThis.Peer = original; });
  return () => peer;
}
const validState = state => !!state && typeof state.for === 'string' && typeof state.task === 'string';
const validAction = action => !!action && Number.isInteger(action.turn) && action.turn >= 0 && action.turn < 7;

test('six-player room protects private views, rejects overflow, replayed actions and late joins', async t => {
  const getPeer = fakePeer(t);
  let roster, ownState;
  const actions = [], departed = [], errors = [];
  const room = createRoom({ game: 'doodle', host: true, name: 'Host', validState, validAction,
    onReady: () => {}, onRoster: value => { roster = value; }, onStart: value => { ownState = value; }, onState: () => {},
    onAction: (...args) => actions.push(args), onLeave: id => departed.push(id), onError: error => errors.push(error) });
  t.after(() => room.close());
  await Promise.resolve();
  const peer = getPeer();
  assert.ok(peer.id.startsWith('sugun-doodle-v1-'));
  assert.ok(validCode(room.code));
  const join = id => { const connection = new Connection(id); peer.emit('connection', connection); if (connection.open) connection.emit('data', { type: 'hello', name: id }); return connection; };
  const guests = ['A', 'B', 'C', 'D', 'E'].map(join);
  assert.equal(roster.length, 6);
  assert.equal(join('F').sent[0].reason, 'This room is full.');
  assert.equal(join('A').open, false);
  assert.equal(join('host').open, false);
  const privateView = id => ({ for: id, task: `Secret for ${id}` });
  room.start(privateView);
  assert.deepEqual(ownState, privateView('host'));
  guests.forEach(connection => assert.deepEqual(connection.sent.find(message => message.type === 'start').state, privateView(connection.peer)));
  room.broadcastState(id => ({ for: id, task: 'Next private task' }));
  assert.equal(guests[4].sent.at(-1).state.for, 'E');
  guests[0].emit('data', { type: 'action', sequence: 1, action: { turn: 99 } });
  guests[0].emit('data', { type: 'action', sequence: 1, action: { turn: 1 } });
  guests[0].emit('data', { type: 'action', sequence: 1, action: { turn: 2 } });
  room.sendAction({ turn: 2 });
  assert.deepEqual(actions, [['A', { turn: 1 }], ['host', { turn: 2 }]]);
  guests[4].close(); assert.deepEqual(departed, ['E']);
  assert.equal(join('G').sent[0].reason, 'This game has already started.');
  peer.emit('disconnected');
  assert.deepEqual(errors, []);
  room.close(); assert.equal(peer.destroyed, true); assert.ok(guests.every(connection => !connection.open));
});

test('guest accepts six-person roster and ordered validated views, sends actions, and reports host departure', async t => {
  const getPeer = fakePeer(t), states = [], starts = [], errors = [];
  const room = createRoom({ game: 'bumper', host: false, name: 'Guest', code: 'ABC234', validState, validAction,
    onReady: () => {}, onRoster: () => {}, onStart: value => starts.push(value), onState: value => states.push(value), onAction: () => {}, onError: value => errors.push(value) });
  t.after(() => room.close());
  await Promise.resolve(); await Promise.resolve();
  const peer = getPeer(), server = peer.server;
  assert.equal(server.peer, 'sugun-bumper-v1-ABC234');
  assert.deepEqual(server.sent[0], { type: 'hello', name: 'Guest' });
  server.emit('data', { type: 'welcome', id: 'guest', roster: ['host', 'guest', 'B', 'C', 'D', 'E'].map(id => ({ id, name: id })) });
  server.emit('data', { type: 'state', sequence: 1, state: { for: 'guest', task: 'Premature' } });
  server.emit('data', { type: 'start', sequence: 2, state: { for: 'guest', task: 'Start' } });
  server.emit('data', { type: 'state', sequence: 3, state: { for: 'guest', task: 99 } });
  server.emit('data', { type: 'state', sequence: 3, state: { for: 'guest', task: 'Next' } });
  server.emit('data', { type: 'state', sequence: 2, state: { for: 'guest', task: 'Stale' } });
  assert.equal(starts.length, 1); assert.deepEqual(states, [{ for: 'guest', task: 'Next' }]);
  room.sendAction({ turn: 0 }); room.sendAction({ turn: -1 });
  assert.deepEqual(server.sent.at(-1), { type: 'action', action: { turn: 0 }, sequence: 1 });
  server.emit('data', { type: 'ping' }); assert.equal(server.sent.at(-1).type, 'pong');
  server.close(); assert.match(errors[0], /host left/); assert.equal(peer.destroyed, true);
});

test('room names, codes and game namespaces are bounded', () => {
  for (const name of ['', 'x'.repeat(19), '\u0000hello', null]) assert.equal(validName(name), false);
  for (const code of ['ABCD', 'ABC2345', 'abc234', 'AB0123', null]) assert.equal(validCode(code), false);
  assert.throws(() => createRoom({ game: 'other', host: true, name: 'Host' }), /Unknown game/);
});

test('bowling rooms use their own namespace and accept six players but reject a seventh', async t => {
  const getPeer = fakePeer(t);
  let roster, started;
  const room = createRoom({ game: 'bowling', host: true, name: 'Host', validState, validAction,
    onReady: () => {}, onRoster: value => { roster = value; }, onStart: value => { started = value; },
    onState: () => {}, onAction: () => {}, onError: assert.fail });
  t.after(() => room.close());
  await Promise.resolve();
  assert.equal(getPeer().id, `sugun-bowling-v1-${room.code}`);
  const guests = Array.from({ length: 6 }, (_, index) => {
    const connection = new Connection(`Bowler ${index + 2}`);
    getPeer().emit('connection', connection);
    connection.emit('data', { type: 'hello', name: connection.peer });
    return connection;
  });
  assert.equal(roster.length, 6);
  assert.ok(guests.slice(0, 5).every(connection => connection.sent[0].type === 'welcome'));
  assert.deepEqual(guests[5].sent, [{ type: 'rejected', reason: 'This room is full.' }]);
  const state = { for: 'all', task: 'Host bowls first' };
  room.start(state);
  assert.deepEqual(started, state);
  assert.ok(guests.slice(0, 5).every(connection => connection.sent.at(-1).type === 'start'));
  assert.equal(guests[5].sent.length, 1);
});

test('old rejected connections cannot close replacements and a closed lobby cannot start', async t => {
  const getPeer = fakePeer(t);
  let roster, starts = 0;
  const room = createRoom({ game: 'bumper', host: true, name: 'Host', validState, validAction,
    onReady: () => {}, onRoster: value => { roster = value; }, onStart: () => starts++, onState: () => {}, onAction: () => {}, onError: assert.fail });
  t.after(() => room.close());
  await Promise.resolve();
  const join = id => { const connection = new Connection(id); getPeer().emit('connection', connection); connection.emit('data', { type: 'hello', name: id }); return connection; };
  const guests = ['A', 'B', 'C', 'D', 'E'].map(join), rejected = join('F');
  rejected.close(); guests[4].close();
  const replacement = join('F');
  rejected.emit('error', new Error('Late error'));
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(replacement.open, true); assert.equal(roster.length, 6);
  assert.ok(roster.some(player => player.id === 'F'));
  room.close(); room.start({ for: 'host', task: 'Closed' });
  assert.equal(starts, 0);
});

test('Classic rooms keep the word private while streaming drawings and unique correct counts to six players', async t => {
  const getPeer = fakePeer(t);
  let roster, state, ownView, now = 1000;
  const room = createRoom({ game: 'doodle-classic', host: true, name: 'Host', validState: validClassicView, validAction: validClassicAction,
    onReady: () => {}, onRoster: value => { roster = value; }, onStart: value => { ownView = value; }, onState: () => {}, onError: assert.fail,
    onAction: (id, action) => { if (applyClassic(state, id, action, now)) room.broadcastState(id => classicView(state, id)); } });
  t.after(() => room.close());
  await Promise.resolve();
  assert.equal(getPeer().id, `sugun-doodle-classic-v1-${room.code}`);
  const guests = Array.from({ length: 5 }, (_, index) => {
    const connection = new Connection(`Artist${index + 2}`);
    getPeer().emit('connection', connection); connection.emit('data', { type: 'hello', name: connection.peer }); return connection;
  });
  state = createClassic(roster, 'classic-network-test', 30, now, () => .1);
  room.start(id => classicView(state, id));
  const word = ownView.choices[0];
  assert.equal(ownView.choices.length, 3);
  for (const guest of guests) assert.deepEqual(guest.sent.at(-1).state.choices, []);
  room.sendAction({ type: 'choose', gameId: state.gameId, turn: 0, word });
  room.sendAction({ type: 'drawing', gameId: state.gameId, turn: 0, revision: 1, strokes: [{ color: '#252b3b', width: 9, points: [[30, 40], [50, 60]] }] });
  for (const guest of guests) {
    assert.equal(guest.sent.at(-1).state.word, null);
    assert.equal(guest.sent.at(-1).state.strokes[0].points.length, 2);
    guest.emit('data', { type: 'action', sequence: 1, action: { type: 'guess', gameId: state.gameId, turn: 0, text: word } });
    guest.emit('data', { type: 'action', sequence: 2, action: { type: 'guess', gameId: state.gameId, turn: 0, text: word } });
  }
  const pending = guests[4].sent.at(-1).state;
  assert.equal(pending.correctCount, 5); assert.equal(pending.phase, 'draw'); assert.equal(pending.word, null);
  assert.equal(pending.players.filter(player => player.score === 1).length, 5);
  assert.ok(pending.guesses.every(guess => guess.text !== word));
  tickClassic(state, now + 30000); room.broadcastState(id => classicView(state, id));
  assert.equal(guests[4].sent.at(-1).state.phase, 'reveal');
  assert.equal(guests[4].sent.at(-1).state.word, word);
});
