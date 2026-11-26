import { SEAM, between, clamp, closestSeam, distance, offset, openingAt, openingHalfWidth, point } from './geometry.js';

export const PEARL_CENTER = point(144, 182);
export const CASE_CENTER = point(291, 215);
export const COMMON_PEARL = Object.freeze({ size: 'Standard', amberDepth: 74, clarity: 96 });
export const BLISTER_TIMING = Object.freeze({ cycle: 2700, slack: 1200, stagger: 280 });

const nickAt = 10;
const ruptureAt = 29;
const foldLength = 24;
const blisterLayout = [
  { along: 0.20, across: -0.12, angle: 0.52 },
  { along: 0.35, across: 0.45, angle: 1.95 },
  { along: 0.50, across: -0.48, angle: 0.19 },
  { along: 0.64, across: 0.47, angle: -0.68 },
  { along: 0.80, across: -0.22, angle: 1.17 },
];

export const COATING_PATCHES = [
  { x: -16, y: -17, radius: 14 }, { x: 0, y: -20, radius: 13 }, { x: 17, y: -15, radius: 13 },
  { x: -22, y: 0, radius: 12 }, { x: -7, y: -5, radius: 15 }, { x: 10, y: 0, radius: 14 },
  { x: 24, y: 4, radius: 10 }, { x: -17, y: 16, radius: 13 }, { x: 0, y: 17, radius: 14 },
  { x: 16, y: 16, radius: 12 }, { x: -1, y: 27, radius: 10 },
];

export function createHarvest() {
  return {
    stage: 'membrane',
    opening: null,
    pocket: null,
    blisters: [],
    intrinsic: COMMON_PEARL,
    damage: { membrane: 0, scars: [], chipped: false },
    pearl: {
      rotation: 0, position: PEARL_CENTER,
      coating: COATING_PATCHES.map(() => ({ treated: false, amount: 1 })),
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
  harvest.opening = opening;
  harvest.pocket = offset(SEAM[Math.round((opening.start + opening.end) / 2)], 5);
  harvest.damage.membrane = specimen.nicks.length * 2
    + specimen.attachments.filter(({ state }) => state === 'torn').length * 4;
  harvest.blisters = blisterLayout.map(({ along, across, angle }, index) => {
    const segment = Math.round(opening.start + along * (opening.end - opening.start));
    const seam = SEAM[segment];
    const center = offset(seam, openingHalfWidth(opening, segment) * across);
    return {
      center, index, axis: point(Math.cos(angle), Math.sin(angle)),
      cut: Array(5).fill(false), acid: 0, removed: false, started: time,
    };
  });
  harvest.stage = 'blisters';
}

export function blisterPose(blister, time) {
  const { cycle, slack, stagger } = BLISTER_TIMING;
  const phase = (Math.max(0, time - blister.started) + stagger * blister.index) % cycle;
  const settled = phase < slack;
  const swell = settled ? 0 : Math.sin((phase - slack) * Math.PI / (cycle - slack));
  return { settled, swell };
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
  const index = clamp(closestSeam(location).index, opening.start, opening.end);
  return distance(location, SEAM[index]) > openingHalfWidth(opening, index) + 10;
}

function sprayPearl(pearl, location) {
  if (distance(location, pearl.position) > 35) return false;
  for (const [index, patch] of COATING_PATCHES.entries()) {
    const center = point(pearl.position.x + patch.x, pearl.position.y + patch.y);
    if (distance(location, center) < 23 + patch.radius * 0.45) pearl.coating[index].treated = true;
  }
  return true;
}

function wipePearl(pearl, from, to) {
  const travel = distance(from, to);
  const samples = Math.ceil(travel / 3);
  let wiped = false;
  let sticky = false;
  for (let index = 1; index <= samples; index++) {
    const contact = between(from, to, index / samples);
    if (distance(contact, pearl.position) > 35) continue;
    for (const [index, patch] of COATING_PATCHES.entries()) {
      const coating = pearl.coating[index];
      const center = point(pearl.position.x + patch.x, pearl.position.y + patch.y);
      const reach = patch.radius + 10;
      const gap = distance(contact, center);
      if (gap >= reach || coating.amount === 0) continue;
      if (coating.treated) {
        coating.amount = Math.max(0, coating.amount - (travel / samples) * (1 - gap / reach) / 14);
        wiped = true;
      } else {
        sticky = true;
      }
    }
  }
  return wiped ? 'coating-wiped' : sticky ? 'coating-sticky' : null;
}

export function pearlIsClean(harvest) {
  return harvest.pearl.coating.every(({ amount }) => amount === 0);
}

export function beginHarvestGesture(harvest, tool, location) {
  if (harvest.stage === 'blisters') {
    if (tool !== 'blade' && tool !== 'grip') return null;
    const blister = findBlister(harvest, location, tool);
    if (!blister) return null;
    return { tool, blister, start: location, last: location, finished: false };
  }
  if (harvest.stage !== 'pearl' || distance(location, harvest.pearl.position) > 38) return null;
  if (tool === 'fazer') {
    if (!sprayPearl(harvest.pearl, location)) return null;
    return { tool, last: location, finished: false, sprayContact: location };
  }
  if (tool === 'wipe' || tool === 'case') {
    return { tool, last: location, finished: false, roll: pearlIsClean(harvest) };
  }
  return null;
}

function cutBlister(harvest, blister, location, travel, time) {
  if (readyToLift(blister)) return null;
  const { center } = blister;
  const progress = foldProgress(blister, location);
  const gap = distance(blisterFold(blister, progress), location);
  const onFold = gap < 5.6;
  const intoTissue = distance(center, location) < 12;
  if (onFold && blisterPose(blister, time).settled) {
    const index = Math.min(blister.cut.length - 1, Math.floor(progress * blister.cut.length));
    const newCut = !blister.cut[index];
    blister.cut[index] = true;
    if (readyToLift(blister)) return 'blister-cut';
    return newCut ? 'cut-part' : null;
  }
  if (!intoTissue && !onFold) return null;

  const injury = blister.acid;
  blister.acid += travel * (intoTissue ? 1 : 0.68);
  if (blister.acid >= ruptureAt) {
    harvest.rupture = { at: time, blister: blister.index };
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
      gesture.preview = point(blister.center.x + location.x - gesture.start.x, blister.center.y + location.y - gesture.start.y);
      return null;
    }
    const travel = distance(gesture.last, location);
    const samples = Math.ceil(travel / 2.2);
    let result = null;
    for (let index = 1; index <= samples; index++) {
      const event = cutBlister(harvest, blister, between(gesture.last, location, index / samples), travel / samples, time);
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
    gesture.preview = location;
  } else if (gesture.tool === 'fazer') {
    const samples = Math.ceil(distance(gesture.last, location) / 6);
    for (let index = 1; index <= samples; index++) {
      const contact = between(gesture.last, location, index / samples);
      if (sprayPearl(pearl, contact)) {
        gesture.sprayContact = contact;
        result = 'fazer';
      }
    }
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
  const gap = distance(CASE_CENTER, gesture.preview);
  if (gap <= 13) {
    harvest.pearl.position = CASE_CENTER;
    harvest.placement = 'seated';
    return 'seated';
  }
  if (gap <= 43) {
    harvest.pearl.position = gesture.preview;
    harvest.placement = 'rim';
    return 'rim';
  }
  harvest.pearl.position = PEARL_CENTER;
  harvest.placement = 'tray';
  return 'tray';
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
  if (damage.membrane && !ruined) observations.push('Handling marks from the peel.');
  if (residue && !ruined) observations.push('Coating remains on the surface.');
  if (damage.chipped) observations.push('Chipped at the case rim.');

  harvest.appraisal = {
    outcome, size: intrinsic.size, amberDepth: intrinsic.amberDepth, clarity,
    observation: observations.join(' ') || 'Clear under the work light.',
  };
  harvest.stage = 'stored';
  return harvest.appraisal;
}
