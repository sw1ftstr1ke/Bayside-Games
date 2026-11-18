// Coordinate and race-rule helpers kept free of Three.js so they can be
// regression-tested in Node as well as used by the browser game.
export function steeringAngleFromInput(axis, maxAngle) {
  // In a Three.js scene viewed forward along +Z, screen-right is world -X.
  // A/left is axis -1 and therefore needs positive world yaw (+X).
  const angle = -Math.max(-1, Math.min(1, axis)) * Math.max(0, maxAngle);
  return Math.abs(angle) < 1e-12 ? 0 : angle;
}

export function cameraRightFromForward(forwardX, forwardZ) {
  // Camera local +X is the right-hand direction when local -Z faces forward.
  return { x: -forwardZ, z: forwardX };
}

export function shouldJudgeExcursion(excursion, now, crossedLine = false) {
  // Guard the object itself. Optional chaining alone is not enough here:
  // undefined !== null is true and can lead to a null dereference.
  return !!excursion && (crossedLine || (excursion.pendingAt !== null && now >= excursion.pendingAt));
}

export function evaluateExcursion(excursion, now) {
  const end = Number.isFinite(excursion.endedAt) ? excursion.endedAt : now;
  const duration = Math.max(.001, end - excursion.startedAt) / 1000;
  const gain = excursion.progress - excursion.distance;
  const meaningfulRun = excursion.distance >= 4.5 && duration >= .35 && excursion.distance / duration >= 9;
  return {
    duration,
    gain,
    penalizedShortcut: meaningfulRun && gain > .5,
    dirtyShortcut: meaningfulRun && gain > 1.5
  };
}
