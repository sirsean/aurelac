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
  minimumWetness: 0.46,
  dryingTime: 10500,
  attachmentsPerSection: 4,
  peelAlignment: 0.72,
  peelThreshold: 18,
  peelPerAttachment: 8,
  peelRate: 0.28,
  elasticLimit: 74,
  wetRecovery: 13,
  tearInput: 120,
  dryTearInput: 29,
  wetYankInput: 57,
  wrongWayTearInput: 76,
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

function seamSample(pointAt, t) {
  const before = pointAt(t - 0.001);
  const after = pointAt(t + 0.001);
  const length = distance(before, after);
  const normal = point((before.y - after.y) / length, (after.x - before.x) / length);
  return { ...pointAt(t), normal, t };
}

export function offset(sample, amount) {
  return point(sample.x + sample.normal.x * amount, sample.y + sample.normal.y * amount);
}

function sampleSeam(pointAt) {
  return Array.from({ length: TUNING.seamSegments + 1 },
    (_, index) => seamSample(pointAt, index / TUNING.seamSegments));
}

const right = point(0.94, 0.342);
const left = point(-0.94, 0.342);

function makeAttachments(pointAt, pieces, first, last) {
  const total = pieces.reduce((sum, { size }) => sum + size, 0);
  let start = 0;
  return pieces.flatMap(({ size, direction }) => {
    const end = start + size;
    const anchors = Array.from({ length: size }, (_, index) => {
      const sample = seamSample(pointAt, mix(first, last, (start + index) / (total - 1)));
      return { ...offset(sample, -6), seamT: sample.t, direction, end, size };
    });
    start = end;
    return anchors;
  });
}

export const SEAM = sampleSeam(seamPoint);
export const ATTACHMENTS = makeAttachments(seamPoint,
  [right, left, right].map((direction) => ({ size: TUNING.attachmentsPerSection, direction })), 0.65, 0.37);

const layouts = new WeakMap();
const originalLayout = { seam: SEAM, anchors: ATTACHMENTS };

function generateLayout(seed) {
  const random = randomFrom(seed);
  const startX = mix(96, 102, random());
  const endX = mix(299, 304, random());
  const startY = mix(146, 214, random());
  const endY = mix(158, 228, random());
  const bow = (random() < 0.5 ? -1 : 1) * mix(17, 40, random());
  const skew = mix(-12, 12, random());
  // Sweep smoothly from left to right so the lips stay traceable even when the curve reverses.
  const pointAt = (t) => point(mix(startX, endX, t),
    mix(startY, endY, t) + 4 * t * (1 - t) * (bow + skew * (2 * t - 1)));

  const count = 2 + Math.floor(random() * 3);
  const firstFacing = random() < 0.5 ? -1 : 1;
  const reverse = 1 + Math.floor(random() * (count - 1));
  const pieces = Array.from({ length: count }, (_, index) => {
    const facing = index === 0 ? firstFacing : index === reverse ? -firstFacing : random() < 0.5 ? -1 : 1;
    const angle = mix(-0.32, 0.62, random());
    return { size: 3 + Math.floor(random() * 3), direction: point(facing * Math.cos(angle), Math.sin(angle)) };
  });
  return {
    seam: sampleSeam(pointAt),
    anchors: makeAttachments(pointAt, pieces, mix(0.63, 0.72, random()), mix(0.30, 0.40, random())),
  };
}

// Saved runs carry just the seed. Runs made before generated layouts keep the original geometry.
export function layoutFor(state) {
  if (state.layoutSeed === undefined) return originalLayout;
  if (!layouts.has(state)) layouts.set(state, generateLayout(state.layoutSeed));
  return layouts.get(state);
}

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

export function openingLip(seam, range, index, side) {
  return offset(seam[index], side * openingHalfWidth(range, index));
}

export function closestSeam(seam, location) {
  let best;
  for (let index = 0; index < seam.length; index++) {
    const sample = seam[index];
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
