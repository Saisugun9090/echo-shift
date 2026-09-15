import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { advanceCheckpoint, createRace, neutralInput, rankCars, stepRace, TAU, trackPoint, trackPosition, validInput, validSnapshot } from '../race-engine.js';
import { createRaceRoom, validCode } from '../race-network.js';

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

test('a driver can complete three laps through the actual steering and physics loop', () => {
  const state = createRace([{ id: 'a', name: 'A' }]);
  for (let frame = 0; frame < 6000 && state.phase !== 'finished'; frame++) {
    const car = state.cars[0], position = trackPosition(car.x, car.y), target = trackPoint(position.angle + .2);
    const desired = Math.atan2(target.y - car.y, target.x - car.x);
    const turn = Math.atan2(Math.sin(desired - car.angle), Math.cos(desired - car.angle));
    stepRace(state, { a: { steer: Math.max(-1, Math.min(1, turn * 3)), throttle: car.speed < 170 ? 1 : 0, brake: car.speed > 185 ? 1 : 0 } });
  }
  assert.equal(state.phase, 'finished');
  assert.equal(state.cars[0].laps, 3);
  assert.equal(state.cars[0].gates, 12);
  assert.ok(state.cars[0].finishedAt > 30);
});

test('room protocol admits four drivers, rejects duplicate and late joins, bounds inputs and cleans up disconnects', async t => {
  class Connection extends EventEmitter {
    constructor(id) { super(); this.peer = id; this.open = true; this.sent = []; }
    send(message) { this.sent.push(message); }
    close() { if (this.open) { this.open = false; this.emit('close'); } }
  }
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
  assert.equal(ready, 1);
  const join = (id, name = id) => { const connection = new Connection(id); peer.emit('connection', connection); if (connection.open) connection.emit('data', { type: 'hello', name }); return connection; };
  assert.equal(join('A'.repeat(101), 'Guest').open, false);
  const a = join('A');
  assert.equal(roster.length, 2);
  assert.equal(a.sent[0].type, 'welcome');
  assert.equal(join('A').open, false);
  assert.equal(join('host').open, false);
  join('B'); const c = join('C');
  assert.equal(roster.length, 4);
  assert.equal(join('D').sent[0].reason, 'This room is full.');
  room.start(createRace(roster));
  assert.equal(starts, 1);
  assert.ok(a.sent.some(message => message.type === 'start'));
  a.emit('data', { type: 'input', sequence: 1, input: { steer: 99, throttle: 1, brake: 0 } });
  a.emit('data', { type: 'input', sequence: 1, input: { steer: .5, throttle: 1, brake: 0 } });
  a.emit('data', { type: 'input', sequence: 1, input: { steer: -1, throttle: 0, brake: 0 } });
  assert.deepEqual(inputs, [['A', { steer: .5, throttle: 1, brake: 0 }]]);
  c.close(); assert.deepEqual(left, ['C']);
  assert.equal(join('E').sent[0].reason, 'This race has already started.');
  peer.emit('disconnected'); assert.equal(ready, 1);
  assert.deepEqual(errors, []);
  room.close(); assert.equal(peer.destroyed, true); assert.equal(a.open, false);
});
