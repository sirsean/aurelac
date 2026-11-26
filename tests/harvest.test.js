import assert from 'node:assert/strict';
import test from 'node:test';
import { point } from '../src/geometry.js';
import {
  CASE_CENTER, PEARL_CENTER, beginHarvestGesture, blisterFold, blisterPose,
  createHarvest, dragClearsOpening, finishHarvestGesture, moveHarvestGesture, openBlisters, pearlIsClean,
  readyToLift, storeHarvest,
} from '../src/harvest.js';
import { COMMON_NODE, NODES } from '../src/nodes.js';
import { createSpecimen } from '../src/specimen.js';

const openedAt = 200;
const COMMON_PEARL = COMMON_NODE.pearl;

function bench(seed = COMMON_NODE.seed) {
  const specimen = createSpecimen({ seed });
  specimen.cut.fill(true, 12, 56);
  specimen.attachments.forEach((attachment) => { attachment.state = 'released'; });
  const harvest = createHarvest(seed);
  openBlisters(harvest, specimen, openedAt);
  return harvest;
}

function stroke(harvest, tool, start, end, time = openedAt + 100) {
  const gesture = beginHarvestGesture(harvest, tool, start);
  assert.ok(gesture, `grip missing for ${tool}`);
  const event = moveHarvestGesture(harvest, gesture, end, time);
  return { event, gesture };
}

function relaxedTime(blister, cycles = 1) {
  return openedAt + blister.timing.cycle * cycles - blister.timing.stagger * blister.index + 140;
}

function liftBlister(harvest, blister) {
  const outside = point(blister.center.x, blister.center.y < harvest.pocket.y ? 67 : 309);
  assert.equal(dragClearsOpening(harvest, outside), true);
  const { gesture } = stroke(harvest, 'grip', blister.center, outside);
  assert.deepEqual(gesture.preview, outside);
  assert.equal(blister.removed, false);
  return finishHarvestGesture(harvest, gesture);
}

function freeBlister(harvest, blister) {
  const { event, gesture } = stroke(harvest, 'blade', blisterFold(blister, 0), blisterFold(blister, 1),
    relaxedTime(blister));
  assert.equal(gesture.blister, blister);
  assert.equal(event, 'blister-cut');
  assert.equal(readyToLift(blister), true);
  return liftBlister(harvest, blister);
}

function pearlPoint(x, y, scale = 1) {
  return point(PEARL_CENTER.x + x * scale, PEARL_CENTER.y + y * scale);
}

function wipeRow(harvest, y) {
  const { scale } = harvest.pearl;
  return stroke(harvest, 'wipe', pearlPoint(-24, y, scale), pearlPoint(24, y, scale));
}

function cleanPearl(harvest) {
  const { scale } = harvest.pearl;
  assert.equal(wipeRow(harvest, 0).event, 'coating-sticky');
  assert.ok(harvest.pearl.coating.every(({ amount }) => amount === 1));

  const first = beginHarvestGesture(harvest, 'fazer', pearlPoint(-15, -16, scale));
  assert.deepEqual(first.sprayContact, pearlPoint(-15, -16, scale));
  assert.ok(harvest.pearl.coating.some(({ treated }) => treated));
  assert.ok(harvest.pearl.coating.some(({ treated }) => !treated));

  wipeRow(harvest, -16);
  assert.ok(harvest.pearl.coating.some(({ amount }) => amount < 1));
  assert.equal(pearlIsClean(harvest), false);

  for (const y of [-18, 0, 20]) stroke(harvest, 'fazer', pearlPoint(-21, y, scale), pearlPoint(21, y, scale));
  assert.ok(harvest.pearl.coating.every(({ treated }) => treated));
  assert.equal(pearlIsClean(harvest), false);
  for (let pass = 0; pass < 3 && !pearlIsClean(harvest); pass++) {
    for (const y of [-21, -9, 5, 18, 24]) wipeRow(harvest, y);
  }
  assert.equal(pearlIsClean(harvest), true);
}

function place(harvest, start, end) {
  return finishHarvestGesture(harvest, stroke(harvest, 'case', start, end).gesture);
}

test('five blisters have different fold angles and the first cut can pause and resume', () => {
  const harvest = bench();
  assert.equal(harvest.blisters.length, 5);
  assert.equal(new Set(harvest.blisters.map(({ axis }) => Math.atan2(axis.y, axis.x))).size, 5);

  const first = harvest.blisters[0];
  stroke(harvest, 'blade', blisterFold(first, 0), blisterFold(first, 0.4));
  assert.ok(first.cut.some(Boolean));
  assert.equal(readyToLift(first), false);
  assert.equal(stroke(harvest, 'grip', first.center, point(first.center.x, first.center.y - 31)).event,
    'blister-attached');
  assert.equal(blisterPose(first, openedAt + 1500).settled, false);
  assert.equal(stroke(harvest, 'blade', blisterFold(first, 0.38), blisterFold(first, 1),
    relaxedTime(first)).event, 'blister-cut');
});

test('all three nodes have workable blisters and retain independent pearl and timing properties', () => {
  for (const node of NODES) {
    const harvest = bench(node.seed);
    const first = harvest.blisters[0];
    assert.equal(first.timing.slack, node.timing.slack);
    assert.equal(blisterPose(first, openedAt + node.timing.slack - 1).settled, true);
    assert.equal(blisterPose(first, openedAt + node.timing.slack + 1).settled, false);
    for (const blister of harvest.blisters) freeBlister(harvest, blister);
    cleanPearl(harvest);
    assert.equal(place(harvest, PEARL_CENTER, CASE_CENTER), 'seated');
    const appraisal = storeHarvest(harvest);
    assert.equal(appraisal.outcome, 'Pristine');
    assert.equal(appraisal.diameter, node.pearl.diameter);
    assert.equal(appraisal.amberDepth, node.pearl.amberDepth);
    assert.equal(appraisal.clarity, node.pearl.clarity);
  }
  assert.equal(new Set(NODES.map(({ pearl }) => pearl.diameter)).size, 3);
  assert.ok(NODES.at(-1).timing.slack < COMMON_NODE.timing.slack);
});
test('a freed blister follows Grip and is removed only on release outside the opening', () => {
  const harvest = bench();
  const first = harvest.blisters[0];
  stroke(harvest, 'blade', blisterFold(first, 0), blisterFold(first, 1));
  assert.equal(readyToLift(first), true);

  const tap = beginHarvestGesture(harvest, 'grip', first.center);
  assert.equal(finishHarvestGesture(harvest, tap), null);
  const inside = point(first.center.x + 7, first.center.y + 14);
  const { gesture } = stroke(harvest, 'grip', first.center, inside);
  assert.deepEqual(gesture.preview, inside);
  assert.equal(finishHarvestGesture(harvest, gesture), 'blister-in-husk');
  assert.equal(first.removed, false);

  const out = point(first.center.x, first.center.y - 101);
  const canceled = stroke(harvest, 'grip', first.center, out).gesture;
  assert.deepEqual(canceled.preview, out);
  assert.equal(first.removed, false);
  assert.equal(liftBlister(harvest, first), 'blister-lifted');
  for (const blister of harvest.blisters.slice(1, -1)) assert.equal(freeBlister(harvest, blister), 'blister-lifted');
  assert.equal(harvest.stage, 'blisters');
  assert.equal(freeBlister(harvest, harvest.blisters.at(-1)), 'pearl-revealed');
});

test('a pristine appraisal requires both spraying and rubbing off the coating', () => {
  const harvest = bench();
  for (const blister of harvest.blisters) freeBlister(harvest, blister);
  cleanPearl(harvest);
  assert.equal(storeHarvest(harvest), null);
  assert.equal(place(harvest, PEARL_CENTER, CASE_CENTER), 'seated');
  const result = storeHarvest(harvest);
  assert.equal(result.outcome, 'Pristine');
  assert.equal(result.clarity, COMMON_PEARL.clarity);
  assert.deepEqual(harvest.intrinsic, COMMON_PEARL);
  assert.equal(storeHarvest(harvest), result);
});

test('acid clouding stays on its side and can be inspected once the coating is clean', () => {
  const harvest = bench();
  const { center, axis } = harvest.blisters[1];
  const tissue = (travel) => point(center.x + axis.x * travel, center.y + axis.y * travel);
  assert.equal(stroke(harvest, 'blade', tissue(-12), tissue(5)).event, 'acid-nick');
  for (const blister of harvest.blisters) freeBlister(harvest, blister);
  const scar = harvest.damage.scars[0];
  cleanPearl(harvest);
  stroke(harvest, 'wipe', PEARL_CENTER, pearlPoint(37, 0));
  assert.notEqual(harvest.pearl.rotation, 0);
  assert.equal(harvest.damage.scars[0], scar);
  assert.equal(scar.blister, 1);
  place(harvest, PEARL_CENTER, CASE_CENTER);
  const result = storeHarvest(harvest);
  assert.equal(result.outcome, 'Flawed');
  assert.equal(result.amberDepth, COMMON_PEARL.amberDepth);
  assert.ok(result.clarity < COMMON_PEARL.clarity);
  assert.match(result.observation, /Acid clouding/);
});

test('forcing a swollen seam can ruin the root pearl and records the tray loss', () => {
  const harvest = bench();
  const blister = harvest.blisters[0];
  const time = openedAt + 1650;
  assert.equal(blisterPose(blister, time).settled, false);
  const start = blisterFold(blister, 0);
  const end = blisterFold(blister, 1);
  const { gesture, event } = stroke(harvest, 'blade', start, end, time);
  assert.equal(event, 'acid-nick');
  assert.equal(blister.cut.some(Boolean), false);
  assert.equal(moveHarvestGesture(harvest, gesture, start, time + 50), 'rupture');
  assert.equal(harvest.stage, 'ruined');
  assert.equal(harvest.rupture.blister, 0);
  assert.equal(storeHarvest(harvest).outcome, 'Ruined');
  assert.equal(harvest.appraisal.clarity, 0);
});

test('the case can be re-seated or closed on the rim with a chip penalty', () => {
  const harvest = bench();
  for (const blister of harvest.blisters) freeBlister(harvest, blister);
  const rim = point(CASE_CENTER.x + 26, CASE_CENTER.y);
  assert.equal(place(harvest, PEARL_CENTER, rim), 'rim');
  assert.equal(place(harvest, rim, CASE_CENTER), 'seated');
  assert.equal(place(harvest, CASE_CENTER, rim), 'rim');
  const result = storeHarvest(harvest);
  assert.match(result.observation, /Chipped/);
  assert.match(result.observation, /Coating remains/);
});
