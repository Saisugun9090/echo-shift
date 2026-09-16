import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { advanceCheckpoint, COLORS, createRace, MAX_PLAYERS, neutralInput, rankCars, stepRace, TAU, trackPoint, trackPosition, validInput, validSnapshot } from '../race-engine.js';
import { createRaceRoom, validCode } from '../race-network.js';

class Connection extends EventEmitter {
  constructor(id) { super(); this.peer = id; this.open = true; this.sent = []; }
  send(message) { this.sent.push(message); }
  close() { if (this.open) { this.open = false; this.emit('close'); } }
}

test('race validates players and ignores non-finite or unbounded controls', () => {
  assert.throws(() => createRace([]));
  assert.throws(() => createRace([{ id: 'a', name: 'A' }, { id: 'a', name: 'B' }]));
  assert.equal(validInput({ steer: NaN, throttle: 1, brake: 0 }), false);
  assert.equal(validInput({ steer: 0, throttle: 2, brake: 0 }), false);
  const state = createRace([{ id: 'a', name: 'Driver' }]);
  assert.equal(validSnapshot(state), true);
  for (let i = 0; i < 240; i++) stepRace(state, { a: { steer: Infinity, throttle: 99, brake: 0 } });
  assert.equal(state.cars[0].speed, 0);
  for (let i = 0; i < 60; i++) stepRace(state, { a: { ...neutralInput(), throttle: 1 } });
  assert.ok(state.cars[0].speed > 0);
  assert.equal(validSnapshot(state), true);
  assert.equal(validSnapshot({ ...state, cars: [{ ...state.cars[0], x: NaN }] }), false);
});

test('six drivers have distinct colours and separated road positions; seven-driver snapshots are rejected', () => {
  assert.equal(MAX_PLAYERS, 6);
  const drivers = Array.from({ length: MAX_PLAYERS }, (_, index) => ({ id: `driver-${index}`, name: `Driver ${index + 1}` }));
  const state = createRace(drivers);
  assert.equal(validSnapshot(state), true);
  assert.equal(new Set(state.cars.map(car => COLORS[car.color])).size, MAX_PLAYERS);
  for (const [index, car] of state.cars.entries()) {
    assert.equal(trackPosition(car.x, car.y).onRoad, true);
    for (const other of state.cars.slice(index + 1)) assert.ok(Math.abs(car.x - other.x) >= 32 || Math.abs(car.y - other.y) >= 44, 'grid car bodies must not overlap');
  }
  assert.throws(() => createRace([...drivers, { id: 'extra', name: 'Extra' }]));
  assert.equal(validSnapshot({ ...state, cars: [...state.cars, { ...state.cars[0], id: 'extra' }] }), false);
  assert.equal(validSnapshot({ ...state, cars: state.cars.map((car, index) => index === 5 ? { ...car, color: MAX_PLAYERS } : car) }), false);
});

test('three laps require twelve forward road gates in order; reverse, grass and skipped gates do not count', () => {
  const car = createRace([{ id: 'a', name: 'A' }]).cars[0];
  const cross = (gate, onRoad = true, forward = true) => {
    const angle = gate * Math.PI / 2;
    car.lastAngle = (angle + (forward ? -.01 : .01) + TAU) % TAU;
    advanceCheckpoint(car, { angle: (angle + (forward ? .01 : -.01) + TAU) % TAU, onRoad }, 10 + car.gates);
  };
  cross(0); cross(2); cross(1, false); cross(1, true, false);
  assert.equal(car.gates, 0);
  for (let lap = 0; lap < 3; lap++) for (const gate of [1, 2, 3, 0]) cross(gate);
  assert.equal(car.laps, 3);
  assert.equal(car.gates, 12);
  assert.equal(car.finishedAt, 21);
});

test('grass slows a car, disconnects cannot block completion, finishers rank by time', () => {
  const state = createRace([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
  state.time = 1;
  state.cars[0].x = 640; state.cars[0].y = 400; state.cars[0].speed = 300;
  stepRace(state, { a: { ...neutralInput(), throttle: 1 } });
  assert.ok(state.cars[0].speed <= 85);
  assert.equal(trackPosition(640, 400).onRoad, false);
  const point = trackPoint(.8);
  assert.equal(trackPosition(point.x, point.y).onRoad, true);
  state.cars[0].finishedAt = 1;
  state.cars[1].connected = false;
  stepRace(state, {});
  assert.equal(state.phase, 'finished');
  assert.equal(rankCars(state)[0].id, 'a');
});

test('six drivers can complete three laps through the actual steering and physics loop', () => {
  const state = createRace(Array.from({ length: MAX_PLAYERS }, (_, index) => ({ id: String(index), name: `Driver ${index + 1}` })));
  for (let frame = 0; frame < 6000 && state.phase !== 'finished'; frame++) {
    const controls = Object.fromEntries(state.cars.map(car => {
      const position = trackPosition(car.x, car.y), target = trackPoint(position.angle + .2);
      const desired = Math.atan2(target.y - car.y, target.x - car.x);
      const turn = Math.atan2(Math.sin(desired - car.angle), Math.cos(desired - car.angle));
      return [car.id, { steer: Math.max(-1, Math.min(1, turn * 3)), throttle: car.speed < 170 ? 1 : 0, brake: car.speed > 185 ? 1 : 0 }];
    }));
    stepRace(state, controls);
  }
  assert.equal(state.phase, 'finished');
  for (const car of state.cars) {
    assert.equal(car.laps, 3);
    assert.equal(car.gates, 12);
    assert.ok(car.finishedAt > 30);
  }
  assert.equal(validSnapshot(state), true);
  assert.equal(rankCars(state).length, MAX_PLAYERS);
});

test('room protocol admits six drivers, rejects seventh, duplicate and late joins, bounds inputs and cleans up disconnects', async t => {
  let peer;
  const originalPeer = globalThis.Peer;
  globalThis.Peer = class extends EventEmitter {
    constructor(id) { super(); peer = this; this.id = id; queueMicrotask(() => this.emit('open')); }
    destroy() { this.destroyed = true; }
    reconnect() { this.emit('open'); }
  };
  let roster = [], starts = 0, ready = 0;
  const inputs = [], left = [], errors = [];
  const room = createRaceRoom({ host: true, name: 'Host', onReady: () => ready++, onRoster: drivers => { roster = drivers; }, onStart: () => starts++, onInput: (...args) => inputs.push(args), onLeave: id => left.push(id), onError: error => errors.push(error), onStatus: () => {} });
  t.after(() => { room.close(); if (originalPeer === undefined) delete globalThis.Peer; else globalThis.Peer = originalPeer; });
  await Promise.resolve();
  assert.equal(validCode(room.code), true);
  assert.equal(peer.id, `sugun-formula-v2-${room.code}`);
  assert.equal(ready, 1);
  const join = (id, name = id) => { const connection = new Connection(id); peer.emit('connection', connection); if (connection.open) connection.emit('data', { type: 'hello', name }); return connection; };
  assert.equal(join('A'.repeat(101), 'Guest').open, false);
  const a = join('A');
  assert.equal(roster.length, 2);
  assert.equal(a.sent[0].type, 'welcome');
  assert.equal(join('A').open, false);
  assert.equal(join('host').open, false);
  const guests = [a, join('B'), join('C'), join('D'), join('E')];
  assert.equal(roster.length, MAX_PLAYERS);
  for (const guest of guests) assert.equal(guest.sent[0].type, 'welcome');
  assert.equal(join('F').sent[0].reason, 'This room is full.');
  const state = createRace(roster);
  room.start(state);
  assert.equal(starts, 1);
  room.broadcastState(state);
  for (const guest of guests) {
    assert.equal(guest.sent.find(message => message.type === 'start').state.cars.length, MAX_PLAYERS);
    assert.equal(guest.sent.find(message => message.type === 'state').state.cars.length, MAX_PLAYERS);
  }
  a.emit('data', { type: 'input', sequence: 1, input: { steer: 99, throttle: 1, brake: 0 } });
  a.emit('data', { type: 'input', sequence: 1, input: { steer: .5, throttle: 1, brake: 0 } });
  a.emit('data', { type: 'input', sequence: 1, input: { steer: -1, throttle: 0, brake: 0 } });
  assert.deepEqual(inputs, [['A', { steer: .5, throttle: 1, brake: 0 }]]);
  for (const guest of guests.slice(1)) guest.emit('data', { type: 'input', sequence: 1, input: neutralInput() });
  assert.deepEqual(inputs.map(([id]) => id), ['A', 'B', 'C', 'D', 'E']);
  guests[4].close(); assert.deepEqual(left, ['E']);
  assert.equal(join('G').sent[0].reason, 'This race has already started.');
  peer.emit('disconnected'); assert.equal(ready, 1);
  assert.deepEqual(errors, []);
  room.close(); assert.equal(peer.destroyed, true); assert.equal(a.open, false);
});

test('stale or rejected connections cannot affect replacements; closed rooms cannot start', async t => {
  let peer, roster = [], starts = 0;
  const inputs = [], errors = [], rooms = [], originalPeer = globalThis.Peer;
  globalThis.Peer = class extends EventEmitter {
    constructor(id) { super(); peer = this; this.id = id; queueMicrotask(() => this.emit('open')); }
    destroy() {}
  };
  t.after(() => { rooms.forEach(room => room.close()); if (originalPeer === undefined) delete globalThis.Peer; else globalThis.Peer = originalPeer; });
  const makeRoom = () => {
    const room = createRaceRoom({ host: true, name: 'Host', onReady: () => {}, onRoster: value => { roster = value; }, onStart: () => starts++, onInput: (...args) => inputs.push(args), onLeave: () => {}, onError: error => errors.push(error), onStatus: () => {} });
    rooms.push(room); return room;
  };
  const join = id => { const connection = new Connection(id); peer.emit('connection', connection); connection.emit('data', { type: 'hello', name: id }); return connection; };
  const room = makeRoom(); await Promise.resolve();
  const guests = ['A', 'B', 'C', 'D', 'E'].map(join), rejected = join('F');
  assert.equal(rejected.sent[0].reason, 'This room is full.');
  guests[4].close();
  rejected.emit('data', { type: 'hello', name: 'F' });
  assert.equal(roster.some(driver => driver.id === 'F'), false);
  rejected.close(); const replacement = join('F');
  rejected.emit('close'); rejected.emit('error', new Error('Late close'));
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(replacement.open, true); assert.equal(roster.length, MAX_PLAYERS);
  room.start(createRace(roster));
  guests[4].emit('data', { type: 'input', sequence: 1, input: neutralInput() });
  replacement.emit('data', { type: 'input', sequence: 1, input: neutralInput() });
  assert.deepEqual(inputs, [['F', neutralInput()]]);
  assert.equal(starts, 1); assert.deepEqual(errors, []); room.close();
  const closedRoom = makeRoom(); await Promise.resolve(); join('A');
  const state = createRace(roster); closedRoom.close(); closedRoom.start(state);
  assert.equal(starts, 1);
});

test('guest accepts six-driver welcome, start and state packets but rejects seven-driver rosters and snapshots', async t => {
  const server = new EventEmitter();
  server.open = true; server.sent = [];
  server.send = message => server.sent.push(message);
  server.close = () => { server.open = false; server.emit('close'); };
  const originalPeer = globalThis.Peer;
  globalThis.Peer = class extends EventEmitter {
    constructor() { super(); this.id = 'E'; queueMicrotask(() => this.emit('open')); }
    connect(id) { assert.equal(id, 'sugun-formula-v2-ABC234'); queueMicrotask(() => server.emit('open')); return server; }
    destroy() {}
  };
  const rosters = [], starts = [], states = [], ready = [], errors = [];
  const room = createRaceRoom({ host: false, name: 'Guest', code: 'ABC234', onReady: value => ready.push(value), onRoster: value => rosters.push(value), onStart: value => starts.push(value), onState: value => states.push(value), onError: value => errors.push(value), onStatus: () => {} });
  t.after(() => { room.close(); if (originalPeer === undefined) delete globalThis.Peer; else globalThis.Peer = originalPeer; });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(server.sent[0].type, 'hello');
  const roster = ['host', 'A', 'B', 'C', 'D', 'E'].map(id => ({ id, name: id }));
  const oversized = [...roster, { id: 'F', name: 'F' }];
  server.emit('data', { type: 'welcome', id: 'E', roster: oversized });
  assert.equal(ready.length, 0);
  server.emit('data', { type: 'welcome', id: 'E', roster });
  assert.equal(ready.length, 1); assert.equal(rosters[0].length, MAX_PLAYERS);
  server.emit('data', { type: 'roster', roster: oversized });
  assert.equal(rosters.length, 1);
  const state = createRace(roster), invalid = { ...state, cars: [...state.cars, { ...state.cars[0], id: 'F' }] };
  server.emit('data', { type: 'start', state: invalid });
  assert.equal(starts.length, 0);
  server.emit('data', { type: 'start', state });
  assert.equal(starts.length, 1);
  server.emit('data', { type: 'state', state: invalid });
  assert.equal(states.length, 0);
  server.emit('data', { type: 'state', state });
  assert.equal(states.length, 1);
  room.sendInput({ steer: -.5, throttle: 1, brake: 0 });
  assert.deepEqual(server.sent.at(-1), { type: 'input', input: { steer: -.5, throttle: 1, brake: 0 }, sequence: 1 });
  assert.deepEqual(errors, []);
});
