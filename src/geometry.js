// The tray uses a fixed local coordinate system, independent of screen size and DPR.
export const BOARD = { width: 400, height: 374 };

export const TUNING = {
  seamSegments: 64,
  bladeRadius: 12,
  nickRadius: 20,
  diffuserRadius: 40,
  diffuserEdgeTolerance: 5,
  diffuserFirstContact: 5,
  gripRadius: 46,
  pinRadius: 128,
  contactStep: 3,
  bladeTravel: 4,
  usefulOpening: 0.53,
  starterCut: [22, 43],
  minimumWetness: 0.46,
  peelAlignment: 0.72,
  peelThreshold: 17,
  peelPerAttachment: 3.9,
  peelRate: 0.32,
  elasticLimit: 74,
  wetRecovery: 13,
  tearInput: 120,
  tearSeparation: 24,
};

export function point(x, y) {
  return { x, y };
}

export function mix(start, end, t) {
  return start + (end - start) * t;
}

export function between(a, b, t) {
  return point(mix(a.x, b.x, t), mix(a.y, b.y, t));
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function clamp(value, low = 0, high = 1) {
  return Math.min(high, Math.max(low, value));
}

export function seamPoint(t) {
  const left = between(point(86, 146), point(143, 123), t);
  const middle = between(point(143, 123), point(242, 211), t);
  const right = between(point(242, 211), point(319, 231), t);
  return between(between(left, middle, t), between(middle, right, t), t);
}

function seamSample(t) {
  const before = seamPoint(t - 0.001);
  const after = seamPoint(t + 0.001);
  const length = distance(before, after);
  const normal = point((before.y - after.y) / length, (after.x - before.x) / length);
  return { ...seamPoint(t), normal, t };
}

export function offset(sample, amount) {
  return point(sample.x + sample.normal.x * amount, sample.y + sample.normal.y * amount);
}

export const SEAM = Array.from(
  { length: TUNING.seamSegments + 1 },
  (_, index) => seamSample(index / TUNING.seamSegments),
);

export const ATTACHMENTS = Array.from({ length: 12 }, (_, index) => {
  const sample = seamSample(mix(0.65, 0.37, index / 11));
  return { ...offset(sample, -6), seamT: sample.t };
});

export const PEEL_DIRECTION = point(0.94, 0.342);
export const LOBE_WIDTH = 102;

export function openings(cut) {
  const ranges = [];
  let start = -1;
  for (let index = 0; index <= cut.length; index++) {
    if (cut[index] && start < 0) start = index;
    if (!cut[index] && start >= 0) {
      const fraction = (index - start) / cut.length;
      ranges.push({ start, end: index, fraction, width: fraction * LOBE_WIDTH / TUNING.usefulOpening });
      start = -1;
    }
  }
  return ranges;
}

export function openingAt(cut, seamT) {
  const segment = seamT * cut.length;
  return openings(cut).find(({ start, end }) => start <= segment && segment <= end);
}

export function openingHalfWidth(range, index) {
  const progress = (index - range.start) / (range.end - range.start);
  const taper = Math.sin(progress * Math.PI) ** 0.72;
  return Math.min(range.width / 2, 75) * taper;
}

export function openingLip(range, index, side) {
  return offset(SEAM[index], side * openingHalfWidth(range, index));
}

export function closestSeam(location) {
  let best;
  for (let index = 0; index < SEAM.length; index++) {
    const sample = SEAM[index];
    const gap = distance(sample, location);
    if (!best || gap < best.gap) best = { index, sample, gap };
  }
  return best;
}

export function randomFrom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
