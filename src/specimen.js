import {
  ATTACHMENTS, LOBE_WIDTH, PEEL_DIRECTION, SEAM, TUNING,
  between, clamp, closestSeam, distance, mix, offset, openingAt, openingHalfWidth, openingLip, point,
} from './geometry.js';

export const TOOLS = ['blade', 'diffuser', 'grip'];
export const COMMON_NODE = { seed: 107, name: 'Common node', origin: 'Bakhroma Green' };

export function createSpecimen({ starter = false, seed = COMMON_NODE.seed } = {}) {
  return {
    seed,
    cut: Array(TUNING.seamSegments).fill(false).map((_, index) =>
      starter && index >= TUNING.starterCut[0] && index < TUNING.starterCut[1]),
    attachments: ATTACHMENTS.map((_, index) => ({
      wetness: starter && index < 4 ? 0.88 : 0,
      state: 'attached',
    })),
    nicks: [],
  };
}

export function exposed(specimen) {
  return specimen.attachments.every((attachment) => attachment.state !== 'attached');
}

export function peelFront(specimen) {
  return specimen.attachments.findIndex((attachment) => attachment.state === 'attached');
}

export function peelHandle(specimen, index = peelFront(specimen)) {
  if (index < 0) return null;
  const base = ATTACHMENTS[index];
  const lift = mix(11, 26, specimen.attachments[index].wetness);
  return point(base.x + lift * PEEL_DIRECTION.x, base.y + lift * PEEL_DIRECTION.y);
}

export function canGrip(specimen, location) {
  const index = peelFront(specimen);
  const handle = peelHandle(specimen, index);
  if (!handle || distance(location, handle) > TUNING.gripRadius) return false;
  return Boolean(openingAt(specimen.cut, ATTACHMENTS[index].seamT));
}

export function peelIsWet(specimen) {
  return specimen.attachments.every(({ state, wetness }) =>
    state !== 'attached' || wetness >= TUNING.minimumWetness);
}

export function beginGesture(specimen, tool, location, time = 0) {
  if (exposed(specimen)) return null;
  if (tool === 'grip' && !canGrip(specimen, location)) return null;
  const diffusing = tool === 'diffuser' && diffuserContact(specimen, location, TUNING.diffuserFirstContact);
  return {
    tool,
    start: location,
    last: location,
    contact: location,
    diffusing,
    wetContact: diffusing ? location : null,
    handle: tool === 'grip' ? peelHandle(specimen) : null,
    travelUntilContact: tool === 'blade' ? TUNING.bladeTravel : TUNING.contactStep,
    pinned: false,
    recovery: 0,
    peelTravel: 0,
    pullDrive: 0,
    pullTime: time,
    previousLoad: 0,
    torn: false,
    pull: null,
  };
}

function bladeContact(specimen, location) {
  const { index, sample, gap } = closestSeam(location);
  if (gap <= TUNING.bladeRadius) {
    const seamIndex = Math.min(index, SEAM.length - 2);
    const added = !specimen.cut[seamIndex];
    specimen.cut[seamIndex] = true;
    return added ? 'cut' : null;
  }

  const opening = openingAt(specimen.cut, sample.t);
  const pinkDepth = opening ? openingHalfWidth(opening, index) : 0;
  if (gap <= Math.min(TUNING.nickRadius, pinkDepth - 1)
      && specimen.nicks.length < 6
      && specimen.nicks.every((nick) => distance(nick, location) > 14)) {
    specimen.nicks.push(location);
    return 'nick';
  }
  return null;
}

function diffuserContact(specimen, location, travel) {
  const { index: seamIndex, sample, gap } = closestSeam(location);
  const range = openingAt(specimen.cut, sample.t);
  if (!range || gap > openingHalfWidth(range, seamIndex) + TUNING.diffuserEdgeTolerance) return false;

  let touched = false;
  for (const [index, base] of ATTACHMENTS.entries()) {
    const attachment = specimen.attachments[index];
    const segment = base.seamT * specimen.cut.length;
    if (attachment.state !== 'attached' || segment < range.start || segment > range.end) continue;
    // Measure along the exposed fold so sweeping through its wider pink area still wets the edge.
    const alongFold = distance(sample, base);
    if (alongFold >= TUNING.diffuserRadius) continue;
    attachment.wetness = clamp(attachment.wetness + travel * (1 - alongFold / TUNING.diffuserRadius) / 12);
    touched = true;
  }
  return touched;
}

function catchAt(specimen, index, aligned) {
  const base = ATTACHMENTS[index];
  const range = openingAt(specimen.cut, base.seamT);
  if (!range || range.width < LOBE_WIDTH - 0.01) {
    const lip = range
      ? Math.round(range.start + 0.18 * (range.end - range.start))
      : Math.round(base.seamT * TUNING.seamSegments);
    return { cause: 'husk', point: range ? openingLip(range, lip, 1) : offset(SEAM[lip], 3) };
  }
  if (specimen.attachments[index].wetness < TUNING.minimumWetness) {
    return { cause: 'dry', point: base };
  }
  if (!aligned) return { cause: 'angle', point: base };
  return null;
}

export function continuePeel(specimen, gesture, time) {
  const dx = gesture.contact.x - gesture.start.x;
  const dy = gesture.contact.y - gesture.start.y;
  const rawLoad = Math.hypot(dx, dy);
  const projected = dx * PEEL_DIRECTION.x + dy * PEEL_DIRECTION.y;
  const aligned = projected >= rawLoad * TUNING.peelAlignment;
  const slip = gesture.pinned ? 0 : 0.07;
  const load = rawLoad * (1 - slip);
  const drive = aligned ? projected * (1 - slip) : 0;
  // Tissue needs a little time to give under load. Travel alone can stretch the flap,
  // but neither waiting before a flick nor a single big pointer sample can free it.
  const elapsed = Math.max(0, time - gesture.pullTime);
  gesture.peelTravel = Math.min(drive, gesture.pullDrive, gesture.peelTravel + elapsed * TUNING.peelRate);
  gesture.pullDrive = drive;
  gesture.pullTime = Math.max(time, gesture.pullTime);
  let index = peelFront(specimen);
  let released = 0;

  while (index >= 0 && !catchAt(specimen, index, aligned)
      && gesture.peelTravel >= TUNING.peelThreshold + gesture.recovery) {
    specimen.attachments[index].state = 'released';
    gesture.recovery += TUNING.peelPerAttachment;
    released++;
    index = peelFront(specimen);
  }

  const catchPoint = index >= 0 ? catchAt(specimen, index, aligned) : null;
  const safeSlack = TUNING.wetRecovery + gesture.recovery;
  const tension = clamp((load - safeSlack) / (TUNING.elasticLimit - TUNING.wetRecovery));
  const blockedTravel = Math.max(0, load - gesture.recovery);
  const nicked = catchPoint && specimen.nicks.some((nick) => distance(nick, catchPoint.point) < 35);
  const alreadyTorn = catchPoint && specimen.attachments.some(({ tearAt }) =>
    tearAt && distance(tearAt, catchPoint.point) < TUNING.tearSeparation);
  let event = released ? (index < 0 ? 'peeled' : 'release') : null;

  if (catchPoint && !alreadyTorn && blockedTravel > TUNING.tearInput - (nicked ? 18 : 0)
      && load > gesture.previousLoad) {
    specimen.attachments[index].state = 'torn';
    specimen.attachments[index].tearAt = catchPoint.point;
    gesture.torn = true;
    event = 'tear';
  }

  const elastic = Math.min(load, aligned ? TUNING.elasticLimit + gesture.recovery : 24);
  const ratio = rawLoad ? elastic / rawLoad : 0;
  gesture.pull = {
    target: point(gesture.handle.x + dx * ratio, gesture.handle.y + dy * ratio),
    anchor: catchPoint?.point ?? ATTACHMENTS[Math.max(0, index)],
    load: tension,
    catch: catchPoint?.cause ?? null,
    settling: index >= 0 && !catchPoint && drive > gesture.peelTravel,
    pinned: gesture.pinned,
    torn: gesture.torn,
  };
  gesture.previousLoad = load;
  return event;
}

export function moveGesture(specimen, gesture, location, time = 0) {
  if (!gesture || gesture.torn || exposed(specimen)) return null;
  gesture.contact = location;
  if (gesture.tool === 'grip') return continuePeel(specimen, gesture, time);

  const start = gesture.last;
  const travel = distance(start, location);
  if (travel === 0) return null;
  let nextContact = gesture.travelUntilContact;
  let event = null;
  while (nextContact <= travel) {
    const sample = between(start, location, nextContact / travel);
    if (gesture.tool === 'blade') {
      const feedback = bladeContact(specimen, sample);
      if (feedback === 'nick' || !event) event = feedback;
    } else {
      gesture.diffusing = diffuserContact(specimen, sample, TUNING.contactStep);
      if (gesture.diffusing) {
        gesture.wetContact = sample;
        event = 'wet';
      }
    }
    nextContact += TUNING.contactStep;
  }
  gesture.travelUntilContact = nextContact - travel;
  gesture.last = location;
  return event;
}
