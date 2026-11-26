import { SEAM, between, clamp, distance, offset, openingAt, openingHalfWidth, point } from './geometry.js';

export const PEARL_CENTER = point(144, 182);
export const CASE_CENTER = point(291, 215);
export const COMMON_PEARL = Object.freeze({ size: 'Standard', amberDepth: 74, clarity: 96 });
export const BLISTER_TIMING = Object.freeze({ cycle: 2700, slack: 1200, stagger: 280 });

const nickAt = 10;
const ruptureAt = 29;
const sectors = 8;
const circle = Math.PI * 2;

export function createHarvest() {
  return {
    stage: 'membrane',
    blisters: [],
    intrinsic: COMMON_PEARL,
    damage: { membrane: 0, scars: [], chipped: false },
    pearl: { rotation: 0, wet: Array(sectors).fill(false), coating: false, position: PEARL_CENTER },
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
  harvest.damage.membrane = specimen.nicks.length * 2
    + specimen.attachments.filter(({ state }) => state === 'torn').length * 4;
  harvest.blisters = [0.25, 0.51, 0.76].map((fraction, index) => {
    const segment = Math.round(opening.start + fraction * (opening.end - opening.start));
    const seam = SEAM[segment];
    const center = offset(seam, Math.min(8, openingHalfWidth(opening, segment) * 0.2));
    return {
      center, index, cut: Array(5).fill(false), acid: 0, removed: false, started: time,
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
  const y = (progress - 0.5) * 27;
  return point(blister.center.x + 8 + 0.32 * y, blister.center.y + y);
}

export function readyToLift(blister) {
  return blister.cut.every(Boolean);
}

function findBlister(harvest, location) {
  let closest = null;
  let gap = 27;
  for (const blister of harvest.blisters) {
    if (blister.removed) continue;
    const next = Math.min(distance(blister.center, location), distance(blisterFold(blister, 0.5), location));
    if (next < gap) {
      closest = blister;
      gap = next;
    }
  }
  return closest;
}

function unitSector(angle) {
  const normalized = ((angle % circle) + circle) % circle;
  return Math.floor(normalized * sectors / circle);
}

function wetAtLight(pearl) {
  pearl.wet[unitSector(-Math.PI / 2 - pearl.rotation)] = true;
}

export function beginHarvestGesture(harvest, tool, location) {
  if (harvest.stage === 'blisters') {
    if (tool !== 'blade' && tool !== 'grip') return null;
    const blister = findBlister(harvest, location);
    if (!blister) return null;
    return { tool, blister, start: location, last: location, finished: false };
  }
  if (harvest.stage !== 'pearl' || distance(location, harvest.pearl.position) > 38) return null;
  if (tool === 'fazer') {
    const angle = Math.atan2(location.y - harvest.pearl.position.y, location.x - harvest.pearl.position.x);
    harvest.pearl.wet[unitSector(angle - harvest.pearl.rotation)] = true;
    harvest.pearl.coating = true;
    wetAtLight(harvest.pearl);
    return { tool, last: location, finished: false, placedDrop: true };
  }
  if (tool === 'grip' || tool === 'case') {
    return { tool, last: location, finished: false };
  }
  return null;
}

function cutBlister(harvest, blister, location, travel, time) {
  if (readyToLift(blister)) return null;
  const { center } = blister;
  const height = location.y - center.y;
  const progress = clamp(height / 27 + 0.5);
  const gap = distance(blisterFold(blister, progress), location);
  const onFold = Math.abs(height) <= 16 && gap < 6;
  const intoTissue = Math.abs(height) < 16 && distance(center, location) < 12;
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
      blister: blister.index, angle: -2.4 + blister.index * 1.43 + height * 0.035,
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
      if (distance(gesture.start, location) < 23) return null;
      if (!readyToLift(blister)) return 'blister-attached';
      blister.removed = true;
      gesture.finished = true;
      if (harvest.blisters.every(({ removed }) => removed)) {
        harvest.stage = 'pearl';
        return 'pearl-revealed';
      }
      return 'blister-lifted';
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
  if (gesture.tool === 'case') {
    gesture.preview = location;
  } else if (gesture.tool === 'grip') {
    const before = pearl.rotation;
    const change = (location.x - gesture.last.x) / 33 + (location.y - gesture.last.y) / 80;
    pearl.rotation += change;
    if (pearl.coating) {
      const steps = Math.ceil(Math.abs(change) / 0.35);
      for (let index = 1; index <= steps; index++) {
        pearl.wet[unitSector(-Math.PI / 2 - before - change * index / steps)] = true;
      }
    }
  }
  gesture.last = location;
  return null;
}

export function placePearl(harvest, gesture) {
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

export function wetCoverage(harvest) {
  return harvest.pearl.wet.filter(Boolean).length / sectors;
}

export function storeHarvest(harvest) {
  if (harvest.appraisal) return harvest.appraisal;
  const ruined = harvest.stage === 'ruined';
  if (!ruined && (harvest.stage !== 'pearl' || harvest.placement === 'tray')) return null;

  const coverage = wetCoverage(harvest);
  harvest.damage.chipped = harvest.placement === 'rim';
  const { intrinsic, damage } = harvest;
  const clarity = ruined ? 0 : Math.max(0, Math.round(intrinsic.clarity - damage.membrane
    - damage.scars.length * 18 - (1 - coverage) * 19 - (damage.chipped ? 14 : 0)));
  const pristine = clarity === intrinsic.clarity;
  const outcome = ruined ? 'Ruined' : pristine ? 'Pristine' : 'Flawed';
  const observations = [];
  if (ruined) observations.push('Poison gas dissolved the root pearl.');
  if (damage.scars.length && !ruined) observations.push('Acid clouding along the edge.');
  if (damage.membrane && !ruined) observations.push('Handling marks from the peel.');
  if (coverage < 1 && !ruined) observations.push('Untreated haze on the surface.');
  if (damage.chipped) observations.push('Chipped at the case rim.');

  harvest.appraisal = {
    outcome, size: intrinsic.size, amberDepth: intrinsic.amberDepth, clarity,
    observation: observations.join(' ') || 'Clear under the work light.',
  };
  harvest.stage = 'stored';
  return harvest.appraisal;
}
