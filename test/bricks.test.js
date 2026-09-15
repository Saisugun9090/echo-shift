import test from 'node:test';
import assert from 'node:assert/strict';
import { carConfig, newDrive, drive, CHECKPOINTS, COURSE } from '../bricks-engine.js';

test('saved car choices are bounded and different builds change road and grass speed', () => {
  assert.deepEqual(carConfig({ body: '<script>', wheels: 'offroad', paint: 'constructor' }), { body: 'roadster', roof: 'open', wheels: 'offroad', paint: 'coral' });
  assert.deepEqual(carConfig(null), carConfig({}));
  const street = { ...newDrive({}), x: 100, y: 300, speed: 300 };
  assert.ok(drive(street, { throttle: 1 }, 1 / 60).speed > drive({ ...street, config: carConfig({ body: 'truck' }) }, { throttle: 1 }, 1 / 60).speed);
  const grass = { ...street, x: 230, y: 300 };
  assert.ok(drive(grass, { throttle: 1 }, 1 / 60).speed < drive({ ...grass, config: carConfig({ wheels: 'offroad' }) }, { throttle: 1 }, 1 / 60).speed);
});

test('driving steers while moving and safely bounces at the course and village boundaries', () => {
  const car = newDrive({});
  const moved = drive(car, { throttle: 1, steer: 1 }, 1 / 60);
  assert.ok(moved.x > car.x); assert.ok(moved.angle > 0); assert.equal(car.x, 450);
  const bounced = drive({ ...car, x: 876, speed: 200 }, { throttle: 1 }, 1 / 30);
  assert.equal(bounced.x, 876); assert.ok(bounced.speed < 0);
  const island = drive({ ...car, x: 258, y: 300, speed: 200 }, { throttle: 1 }, 1 / 30);
  assert.equal(island.x, 258); assert.ok(island.speed < 0);
  assert.equal(drive(car, {}, Number.NaN), car);
  assert.ok(drive(car, {}, 200).elapsed <= 1 / 30);
});

test('checkpoints must be collected in order and the eighth completes the course', () => {
  let car = newDrive({});
  const skipped = drive({ ...car, ...CHECKPOINTS[1] }, {}, 1 / 60);
  assert.equal(skipped.checkpoint, 0);
  for (const checkpoint of CHECKPOINTS) car = drive({ ...car, ...checkpoint, speed: 0 }, {}, 1 / 60);
  assert.equal(car.checkpoint, 8); assert.equal(car.status, 'won');
  assert.equal(drive(car, { throttle: 1 }, 1 / 60), car);
});

test('timeout stops the car and cannot award a checkpoint after the deadline; pause freezes the clock', () => {
  const car = { ...newDrive({}), ...CHECKPOINTS[0], elapsed: COURSE.limit - 0.001 };
  const expired = drive(car, {}, 1 / 60);
  assert.equal(expired.status, 'lost'); assert.equal(expired.checkpoint, 0);
  assert.equal(drive(expired, {}, 1 / 60), expired);
  const paused = { ...car, status: 'paused' }; assert.equal(drive(paused, { throttle: 1 }, 1 / 60), paused);
});

test('each chassis can complete the course using only throttle and steering', () => {
  for (const body of ['roadster', 'buggy', 'truck']) {
    let state = newDrive({ body });
    while (state.status === 'running') {
      const target = CHECKPOINTS[state.checkpoint];
      const angle = Math.atan2(target.y - state.y, target.x - state.x) - state.angle;
      state = drive(state, { throttle: 1, steer: Math.atan2(Math.sin(angle), Math.cos(angle)) * 2 }, 1 / 60);
    }
    assert.equal(state.status, 'won', `${body} can finish`);
  }
});
