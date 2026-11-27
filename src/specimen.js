import {
  LOBE_WIDTH, TUNING,
  between, clamp, closestSeam, distance, layoutFor, mix, offset, openingAt, openingHalfWidth, openingLip, point,
} from './geometry.js';
import { COMMON_NODE } from './nodes.js';
import { bladeDrag, wearBlade } from './blade.js';

export function createSpecimen({ seed = COMMON_NODE.seed, layoutSeed } = {}) {
  const specimen = {
    seed, layoutSeed,
    cut: Array(TUNING.seamSegments).fill(false),
    attachments: [],
    wetnessTime: 0,
    nicks: [],
  };
  specimen.attachments = layoutFor(specimen).anchors.map(() => ({ wetness: 0, state: 'attached' }));
  return specimen;
}

export function exposed(specimen) {
  return specimen.attachments.every((attachment) => attachment.state !== 'attached');
}

export function peelFront(specimen) {
  return specimen.attachments.findIndex((attachment) => attachment.state === 'attached');
}

export function dryMembrane(specimen, time) {
  const elapsed = Math.max(0, time - specimen.wetnessTime);
  specimen.wetnessTime = Math.max(time, specimen.wetnessTime);
  let wet = false;
  for (const attachment of specimen.attachments) {
    if (attachment.state !== 'attached' || attachment.wetness === 0) continue;
    attachment.wetness = Math.max(0, attachment.wetness - elapsed / TUNING.dryingTime);
    wet ||= attachment.wetness > 0;
  }
  return wet;
}

export function peelHandle(specimen, index = peelFront(specimen)) {
  if (index < 0) return null;
  const base = layoutFor(specimen).anchors[index];
  const lift = mix(11, 18 + base.size * 2, specimen.attachments[index].wetness);
  return point(base.x + lift * base.direction.x, base.y + lift * base.direction.y);
}

export function canGrip(specimen, location) {
  const index = peelFront(specimen);
  const handle = peelHandle(specimen, index);
  if (!handle || distance(location, handle) > TUNING.gripRadius) return false;
  return Boolean(openingAt(specimen.cut, layoutFor(specimen).anchors[index].seamT));
}

export function peelIsWet(specimen) {
  const front = peelFront(specimen);
  return front >= 0 && specimen.attachments.slice(front, layoutFor(specimen).anchors[front].end)
    .every(({ wetness }) => wetness >= TUNING.minimumWetness);
}

export function beginGesture(specimen, tool, location, time = 0, blade) {
  if (exposed(specimen)) return null;
  dryMembrane(specimen, time);
  if (tool === 'grip' && !canGrip(specimen, location)) return null;
  const diffusing = tool === 'diffuser' && diffuserContact(specimen, location, TUNING.diffuserFirstContact);
  const front = tool === 'grip' ? peelFront(specimen) : -1;
  const drag = tool === 'blade' ? bladeDrag(blade) : 0;
  return {
    tool,
    start: location,
    last: location,
    contact: location,
    diffusing,
    wetContact: diffusing ? location : null,
    handle: peelHandle(specimen, front),
    direction: layoutFor(specimen).anchors[front]?.direction,
    travelUntilContact: tool === 'blade' ? TUNING.bladeTravel + drag * 21 : TUNING.contactStep,
    blade, drag, bunch: 0,
    pinned: false,
    recovery: 0,
    peelTravel: 0,
    pullDrive: 0,
    pullTime: time,
    previousLoad: 0,
    finished: false,
    pull: null,
  };
}

function bladeContact(specimen, location) {
  const { seam } = layoutFor(specimen);
  const { index, sample, gap } = closestSeam(seam, location);
  if (gap <= TUNING.bladeRadius) {
    const seamIndex = Math.min(index, seam.length - 2);
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
  const { seam, anchors } = layoutFor(specimen);
  const { index: seamIndex, sample, gap } = closestSeam(seam, location);
  const range = openingAt(specimen.cut, sample.t);
  if (!range || gap > openingHalfWidth(range, seamIndex) + TUNING.diffuserEdgeTolerance) return false;

  let touched = false;
  // The next section's bonding surface stays under the overlapping membrane.
  const front = peelFront(specimen);
  for (let index = front; index < anchors[front].end; index++) {
    const base = anchors[index];
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
  const { seam, anchors } = layoutFor(specimen);
  const base = anchors[index];
  if (!aligned) return { cause: 'angle', point: base };
  const range = openingAt(specimen.cut, base.seamT);
  if (!range || range.width < LOBE_WIDTH - 0.01) {
    const blockedEnd = base.direction.x > 0 ? 0.18 : 0.82;
    const lip = range
      ? Math.round(range.start + blockedEnd * (range.end - range.start))
      : Math.round(base.seamT * TUNING.seamSegments);
    return { cause: 'husk', point: range ? openingLip(seam, range, lip, 1) : offset(seam[lip], 3) };
  }
  if (specimen.attachments[index].wetness < TUNING.minimumWetness) {
    return { cause: 'dry', point: base };
  }
  return null;
}

export function continuePeel(specimen, gesture, time) {
  if (gesture.finished || exposed(specimen)) return null;
  dryMembrane(specimen, time);
  const dx = gesture.contact.x - gesture.start.x;
  const dy = gesture.contact.y - gesture.start.y;
  const rawLoad = Math.hypot(dx, dy);
  const direction = gesture.direction;
  const projected = dx * direction.x + dy * direction.y;
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
  const { anchors } = layoutFor(specimen);
  let index = peelFront(specimen);
  const end = anchors[index].end;

  while (index < end && !catchAt(specimen, index, aligned)
      && gesture.peelTravel >= TUNING.peelThreshold + gesture.recovery) {
    specimen.attachments[index].state = 'released';
    gesture.recovery += TUNING.peelPerAttachment;
    index++;
  }

  const catchPoint = index < end ? catchAt(specimen, index, aligned) : null;
  const safeSlack = TUNING.wetRecovery + gesture.recovery;
  const tension = clamp((load - safeSlack) / (TUNING.elasticLimit - TUNING.wetRecovery));
  const blockedTravel = Math.max(0, load - gesture.recovery);
  const nicked = catchPoint && specimen.nicks.some((nick) => distance(nick, catchPoint.point) < 35);
  const overstretched = catchPoint && blockedTravel > TUNING.tearInput - (nicked ? 18 : 0);
  const dryPull = catchPoint?.cause === 'dry' && drive >= TUNING.dryTearInput;
  const yank = index < end && !catchPoint && drive - gesture.peelTravel >= TUNING.wetYankInput;
  const reversePull = -projected * (1 - slip) >= TUNING.wrongWayTearInput - (nicked ? 12 : 0);
  let event = null;

  if ((dryPull || overstretched || yank || reversePull) && load >= gesture.previousLoad) {
    for (let remainder = index; remainder < end; remainder++) {
      specimen.attachments[remainder].state = 'released';
    }
    specimen.attachments[index].state = 'torn';
    specimen.attachments[index].tearAt = catchPoint?.point ?? anchors[index];
    gesture.finished = true;
    if (dryPull) event = 'dry-tear';
    else if (reversePull) event = 'reverse-tear';
    else event = 'tear';
  } else if (index === end) {
    gesture.finished = true;
    event = exposed(specimen) ? 'peeled' : 'piece';
  }

  const elastic = Math.min(load, aligned ? TUNING.elasticLimit + gesture.recovery : 24);
  const ratio = rawLoad ? elastic / rawLoad : 0;
  gesture.pull = {
    target: point(gesture.handle.x + dx * ratio, gesture.handle.y + dy * ratio),
    direction: aligned ? direction : point(dx / rawLoad, dy / rawLoad),
    anchor: catchPoint?.point ?? anchors[Math.min(index, end - 1)],
    load: tension,
    catch: catchPoint?.cause ?? null,
    settling: !gesture.finished && !catchPoint && drive > gesture.peelTravel,
    pinned: gesture.pinned,
  };
  gesture.previousLoad = load;
  return event;
}

export function moveGesture(specimen, gesture, location, time = 0) {
  if (!gesture || gesture.finished || exposed(specimen)) return null;
  gesture.contact = location;
  if (gesture.tool === 'grip') return continuePeel(specimen, gesture, time);
  dryMembrane(specimen, time);

  const start = gesture.last;
  const travel = distance(start, location);
  if (travel === 0) return null;
  let nextContact = gesture.travelUntilContact;
  gesture.bunch = gesture.tool === 'blade' && gesture.drag > 0 && nextContact > Math.max(travel, TUNING.contactStep)
    && closestSeam(layoutFor(specimen).seam, location).gap < TUNING.bladeRadius ? gesture.drag : 0;
  let event = null;
  while (nextContact <= travel) {
    const sample = between(start, location, nextContact / travel);
    if (gesture.tool === 'blade') {
      const feedback = bladeContact(specimen, sample);
      if (feedback) wearBlade(gesture.blade, TUNING.contactStep);
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
  return event ?? (gesture.bunch > 0.06 ? 'blade-drag' : null);
}
