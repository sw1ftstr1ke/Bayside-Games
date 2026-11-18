import assert from 'node:assert/strict';
import {
  steeringAngleFromInput,
  cameraRightFromForward,
  shouldJudgeExcursion,
  evaluateExcursion
} from '../src/race-math.mjs';

assert.deepEqual(cameraRightFromForward(0, 1), { x: -1, z: 0 });
assert.ok(steeringAngleFromInput(-1, .5) > 0, 'A/left should produce positive world yaw');
assert.ok(steeringAngleFromInput(1, .5) < 0, 'D/right should produce negative world yaw');
assert.equal(steeringAngleFromInput(0, .5), 0);

assert.equal(shouldJudgeExcursion(null, 5000), false);
assert.equal(shouldJudgeExcursion(undefined, 5000), false);
const waiting = { startedAt: 0, pendingAt: 3000 };
assert.equal(shouldJudgeExcursion(waiting, 2999), false);
assert.equal(shouldJudgeExcursion(waiting, 3000), true);
assert.equal(shouldJudgeExcursion({ startedAt: 0, pendingAt: null }, 1000, true), true);

const minor = evaluateExcursion({ distance: 5, progress: 5.6, startedAt: 0, endedAt: 500 }, 1000);
assert.equal(minor.penalizedShortcut, true);
assert.equal(minor.dirtyShortcut, false);
const major = evaluateExcursion({ distance: 6, progress: 8, startedAt: 0, endedAt: 500 }, 1000);
assert.equal(major.penalizedShortcut, true);
assert.equal(major.dirtyShortcut, true);
const brush = evaluateExcursion({ distance: 1, progress: 4, startedAt: 0, endedAt: 1000 }, 1000);
assert.equal(brush.penalizedShortcut, false);
assert.equal(brush.dirtyShortcut, false);
console.log('race-math regression tests passed');
