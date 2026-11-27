import { SEAM, between, clamp, closestSeam, distance, layoutFor, offset, openingAt, openingHalfWidth, point } from './geometry.js';
import { COMMON_NODE, nodeFor } from './nodes.js';
import { wearBlade } from './blade.js';

export const PEARL_CENTER = point(144, 182);
export const CASE_CENTER = point(291, 215);
export const RUPTURE_DURATION = 5500;

const nickAt = 10;
const ruptureAt = 29;
const foldLength = 24;
const foldRadius = 5.6;
const closingGrace = 110;
const sprayDuration = 450;

export const COATING_PATCHES = [
  { x: -16, y: -17, radius: 14 }, { x: 0, y: -20, radius: 13 }, { x: 17, y: -15, radius: 13 },
  { x: -22, y: 0, radius: 12 }, { x: -7, y: -5, radius: 15 }, { x: 10, y: 0, radius: 14 },
  { x: 24, y: 4, radius: 10 }, { x: -17, y: 16, radius: 13 }, { x: 0, y: 17, radius: 14 },
  { x: 16, y: 16, radius: 12 }, { x: -1, y: 27, radius: 10 },
];

export function createHarvest(seed = COMMON_NODE.seed, { undercoatPatch = -1, pattern = seed } = {}) {
  const node = nodeFor(seed);
  return {
    seed: node.seed,
    stage: 'membrane',
    opening: null,
    pocket: null,
    blisters: [],
    intrinsic: node.pearl,
    damage: { membrane: 0, scars: [], chipped: false },
    pearl: {
      rotation: 0, position: PEARL_CENTER, scale: node.pearl.scale, pattern,
      coating: COATING_PATCHES.map((_, index) => ({
        treatment: 0, amount: 1, undercoat: index === undercoatPatch ? 0.38 : 0,
      })),
    },
    light: false,
    placement: 'tray',
    rupture: null,
    appraisal: null,
  };
}

export function openBlisters(harvest, specimen, time) {
  if (harvest.stage !== 'membrane') return;
  const opening = openingAt(specimen.cut, 0.51);
  if (!opening) return;
  const node = nodeFor(specimen.seed);
  const { seam } = layoutFor(specimen);
  harvest.layoutSeed = specimen.layoutSeed;
  harvest.opening = opening;
  harvest.pocket = offset(seam[Math.round((opening.start + opening.end) / 2)], 5);
  harvest.damage.incisionNicks = specimen.nicks.length;
  harvest.damage.peelTears = specimen.attachments.filter(({ state }) => state === 'torn').length;
  harvest.damage.membrane = harvest.damage.incisionNicks * 2 + harvest.damage.peelTears * 4;
  harvest.blisters = node.blisters.map(({ along, across, angle }, index) => {
    const segment = Math.round(opening.start + along * (opening.end - opening.start));
    const sample = seam[segment];
    const center = offset(sample, openingHalfWidth(opening, segment) * across);
    const original = SEAM[segment].normal;
    const tilt = Math.atan2(sample.normal.y, sample.normal.x) - Math.atan2(original.y, original.x);
    return {
      center, index, axis: point(Math.cos(angle + tilt), Math.sin(angle + tilt)),
      cut: Array(5).fill(false), acid: 0, removed: false, started: time,
      timing: node.timing, foldContrast: node.foldContrast,
    };
  });
  harvest.stage = 'blisters';
}

export function blisterPose(blister, time) {
  const { cycle, slack, stagger } = blister.timing;
  const phase = (Math.max(0, time - blister.started) + stagger * blister.index) % cycle;
  const settled = phase < slack;
  const swell = settled ? 0 : Math.sin((phase - slack) * Math.PI / (cycle - slack));
  return { settled, swell, slackLeft: settled ? slack - phase : 0 };
}

export function blisterFold(blister, progress) {
  const { center, axis } = blister;
  const along = (progress - 0.5) * foldLength;
  return point(center.x + axis.x * along + axis.y * 7, center.y + axis.y * along - axis.x * 7);
}

export function readyToLift(blister) {
  return blister.cut.every(Boolean);
}

function foldProgress(blister, location) {
  const { center, axis } = blister;
  const along = (location.x - center.x) * axis.x + (location.y - center.y) * axis.y;
  return clamp(along / foldLength + 0.5);
}

function findBlister(harvest, location, tool) {
  let closest = null;
  let gap = 23;
  for (const blister of harvest.blisters) {
    if (blister.removed) continue;
    const centerGap = distance(blister.center, location);
    const next = tool === 'blade' && !readyToLift(blister)
      ? Math.min(centerGap, distance(blisterFold(blister, foldProgress(blister, location)), location))
      : centerGap;
    if (next < gap) {
      closest = blister;
      gap = next;
    }
  }
  return closest;
}

export function dragClearsOpening(harvest, location) {
  const { opening } = harvest;
  const { seam } = layoutFor(harvest);
  const index = clamp(closestSeam(seam, location).index, opening.start, opening.end);
  return distance(location, seam[index]) > openingHalfWidth(opening, index) + 10;
}

function sprayPearl(pearl, gesture, location, time) {
  const elapsed = clamp(time - gesture.sprayTime, 0, 80);
  gesture.sprayTime = Math.max(time, gesture.sprayTime);
  gesture.sprayContact = distance(location, pearl.position) <= 35 * pearl.scale ? location : null;
  if (elapsed > 0) {
    const samples = Math.max(1, Math.ceil(distance(gesture.last, location) / 4));
    for (let sample = 0; sample < samples; sample++) {
      const contact = between(gesture.last, location, (sample + 0.5) / samples);
      if (distance(contact, pearl.position) > 35 * pearl.scale) continue;
      for (const [index, patch] of COATING_PATCHES.entries()) {
        const coating = pearl.coating[index];
        if (!coating.amount || coating.treatment === 1) continue;
        const center = point(pearl.position.x + patch.x * pearl.scale, pearl.position.y + patch.y * pearl.scale);
        const reach = (21 + patch.radius * 0.35) * pearl.scale;
        const coverage = Math.max(0, 1 - (distance(contact, center) / reach) ** 2);
        coating.treatment = clamp(coating.treatment + coverage * elapsed / (samples * sprayDuration));
      }
    }
  }
  return gesture.sprayContact ? 'fazer' : null;
}

function wipePearl(pearl, from, to) {
  const travel = distance(from, to);
  const samples = Math.ceil(travel / 3);
  let wiped = false;
  let sticky = false;
  let revealed = false;
  for (let index = 1; index <= samples; index++) {
    const contact = between(from, to, index / samples);
    if (distance(contact, pearl.position) > 35 * pearl.scale) continue;
    for (const [index, patch] of COATING_PATCHES.entries()) {
      const coating = pearl.coating[index];
      const center = point(pearl.position.x + patch.x * pearl.scale, pearl.position.y + patch.y * pearl.scale);
      const reach = (patch.radius + 10) * pearl.scale;
      const gap = distance(contact, center);
      if (gap >= reach || coating.amount === 0) continue;
      if (coating.treatment === 1) {
        const removed = (travel / samples) * (1 - gap / reach) / (14 * pearl.scale);
        coating.amount = Math.max(coating.undercoat, coating.amount - removed);
        if (coating.undercoat > 0 && coating.amount === coating.undercoat) {
          coating.undercoat = 0;
          coating.treatment = 0;
          revealed = true;
        }
        wiped = true;
      } else {
        sticky = true;
      }
    }
  }
  if (revealed) return 'coating-undercoat';
  return wiped ? 'coating-wiped' : sticky ? 'coating-sticky' : null;
}

export function pearlIsClean(harvest) {
  return harvest.pearl.coating.every(({ amount }) => amount === 0);
}

export function casePlacement(location) {
  const gap = distance(CASE_CENTER, location);
  if (gap <= 16) return 'seated';
  return gap <= 43 ? 'rim' : 'tray';
}

export function beginHarvestGesture(harvest, tool, location, blade, time = 0) {
  if (harvest.stage === 'blisters') {
    if (tool !== 'blade' && tool !== 'grip') return null;
    const blister = findBlister(harvest, location, tool);
    if (!blister) return null;
    return { tool, blister, start: location, last: location, finished: false, blade };
  }
  if (harvest.stage !== 'pearl' || distance(location, harvest.pearl.position) > Math.max(34, 38 * harvest.pearl.scale)) return null;
  if (tool === 'fazer') {
    const sprayContact = distance(location, harvest.pearl.position) <= 35 * harvest.pearl.scale ? location : null;
    return { tool, last: location, finished: false, sprayContact, sprayTime: time };
  }
  if (tool === 'case') {
    const { x, y } = harvest.pearl.position;
    return { tool, last: location, finished: false, gripOffset: point(x - location.x, y - location.y) };
  }
  if (tool === 'wipe') {
    return { tool, last: location, finished: false, roll: pearlIsClean(harvest) };
  }
  return null;
}

function cutBlister(harvest, gesture, location, travel, time) {
  const { blister, blade } = gesture;
  if (readyToLift(blister)) return null;
  const { center } = blister;
  const progress = foldProgress(blister, location);
  const gap = distance(blisterFold(blister, progress), location);
  const onFold = gap < foldRadius;
  const intoTissue = distance(center, location) < 12;
  const { settled, slackLeft } = blisterPose(blister, time);
  if (!onFold) gesture.cutUntil = undefined;
  else if (settled) gesture.cutUntil = time + slackLeft + closingGrace;
  // A blade already following the fold has a moment to finish as it tightens.
  if (onFold && time <= (gesture.cutUntil ?? -Infinity)) {
    const index = Math.min(blister.cut.length - 1, Math.floor(progress * blister.cut.length));
    const newCut = !blister.cut[index];
    blister.cut[index] = true;
    if (newCut) wearBlade(blade, foldLength / blister.cut.length);
    if (readyToLift(blister)) return 'blister-cut';
    return newCut ? 'cut-part' : null;
  }
  if (!intoTissue && !onFold) return null;
  wearBlade(blade, travel);

  const injury = blister.acid;
  blister.acid += travel * (intoTissue ? 1 : 0.68);
  if (blister.acid >= ruptureAt) {
    harvest.rupture = { at: time, blister: blister.index, wound: location };
    harvest.stage = 'ruined';
    return 'rupture';
  }
  if (injury < nickAt && blister.acid >= nickAt) {
    harvest.damage.scars.push({
      blister: blister.index,
      angle: Math.atan2(center.y - harvest.pocket.y, center.x - harvest.pocket.x) + (progress - 0.5) * 0.6,
    });
    return 'acid-nick';
  }
  return onFold ? 'swollen' : null;
}

export function moveHarvestGesture(harvest, gesture, location, time) {
  if (!gesture || gesture.finished) return null;
  if (harvest.stage === 'blisters') {
    const blister = gesture.blister;
    if (gesture.tool === 'grip') {
      if (!readyToLift(blister)) return distance(gesture.start, location) >= 14 ? 'blister-attached' : null;
      gesture.preview = point(location.x + (blister.center.x - gesture.start.x),
        location.y + (blister.center.y - gesture.start.y));
      return null;
    }
    const travel = distance(gesture.last, location);
    const samples = Math.ceil(travel / 2.2);
    let result = null;
    for (let index = 1; index <= samples; index++) {
      const event = cutBlister(harvest, gesture, between(gesture.last, location, index / samples), travel / samples, time);
      if (event && (event !== 'swollen' || !result)) result = event;
      if (event === 'rupture') {
        gesture.finished = true;
        break;
      }
    }
    gesture.last = location;
    return result;
  }

  if (harvest.stage !== 'pearl') return null;
  const pearl = harvest.pearl;
  let result = null;
  if (gesture.tool === 'case') {
    gesture.preview = point(location.x + gesture.gripOffset.x, location.y + gesture.gripOffset.y);
  } else if (gesture.tool === 'fazer') {
    result = sprayPearl(pearl, gesture, location, time);
  } else if (gesture.roll) {
    pearl.rotation += (location.x - gesture.last.x) / 33 + (location.y - gesture.last.y) / 80;
  } else {
    result = wipePearl(pearl, gesture.last, location);
    if (result === 'coating-wiped' && pearlIsClean(harvest)) result = 'pearl-clean';
  }
  gesture.last = location;
  return result;
}

export function finishHarvestGesture(harvest, gesture) {
  if (gesture?.finished) return null;
  if (harvest.stage === 'blisters' && gesture?.tool === 'grip' && gesture.preview) {
    gesture.finished = true;
    if (distance(gesture.blister.center, gesture.preview) < 15 || !dragClearsOpening(harvest, gesture.preview)) {
      return 'blister-in-husk';
    }
    gesture.blister.removed = true;
    gesture.blister.drop = gesture.preview;
    if (harvest.blisters.every(({ removed }) => removed)) {
      harvest.stage = 'pearl';
      return 'pearl-revealed';
    }
    return 'blister-lifted';
  }
  if (harvest.stage !== 'pearl' || gesture?.tool !== 'case' || !gesture.preview) return null;
  const placement = casePlacement(gesture.preview);
  harvest.pearl.position = placement === 'seated' ? CASE_CENTER
    : placement === 'rim' ? gesture.preview : PEARL_CENTER;
  harvest.placement = placement;
  return placement;
}

export function storeHarvest(harvest) {
  if (harvest.appraisal) return harvest.appraisal;
  const ruined = harvest.stage === 'ruined';
  if (!ruined && (harvest.stage !== 'pearl' || harvest.placement === 'tray')) return null;

  const residue = harvest.pearl.coating.reduce((total, { amount }) => total + amount, 0) / COATING_PATCHES.length;
  harvest.damage.chipped = harvest.placement === 'rim';
  const { intrinsic, damage } = harvest;
  const clarity = ruined ? 0 : Math.max(0, Math.round(intrinsic.clarity - damage.membrane
    - damage.scars.length * 18 - residue * 23 - (damage.chipped ? 14 : 0)));
  const pristine = clarity === intrinsic.clarity && residue === 0;
  const outcome = ruined ? 'Ruined' : pristine ? 'Pristine' : 'Flawed';
  const observations = [];
  if (ruined) observations.push('Poison gas dissolved the root pearl.');
  if (damage.scars.length && !ruined) observations.push('Acid clouding along the edge.');
  if (damage.membrane && !ruined) {
    if (damage.incisionNicks) observations.push('Handling marks from blade nicks in the membrane.');
    if (damage.peelTears) observations.push('Handling marks from torn membrane.');
    if (damage.incisionNicks === undefined) observations.push('Handling marks from the peel.');
  }
  if (residue && !ruined) observations.push('Coating remains on the surface.');
  if (damage.chipped) observations.push('Chipped at the case rim.');

  harvest.appraisal = {
    outcome, size: intrinsic.size, diameter: intrinsic.diameter, amberDepth: intrinsic.amberDepth, clarity,
    pattern: harvest.pearl.pattern,
    observation: observations.join(' ') || 'Clear under the work light.',
  };
  harvest.stage = 'stored';
  return harvest.appraisal;
}
