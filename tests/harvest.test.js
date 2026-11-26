import assert from 'node:assert/strict';
import test from 'node:test';
import { point } from '../src/geometry.js';
import {
  CASE_CENTER, COMMON_PEARL, PEARL_CENTER, beginHarvestGesture, blisterFold, blisterPose,
  createHarvest, moveHarvestGesture, openBlisters, placePearl, readyToLift, storeHarvest, wetCoverage,
} from '../src/harvest.js';
import { createSpecimen } from '../src/specimen.js';

const openedAt = 200;

function bench() {
  const specimen = createSpecimen();
  specimen.cut.fill(true, 12, 56);
  specimen.attachments.forEach((attachment) => { attachment.state = 'released'; });
  const harvest = createHarvest();
  openBlisters(harvest, specimen, openedAt);
  return harvest;
}

function stroke(harvest, tool, start, end, time = openedAt + 100) {
  const gesture = beginHarvestGesture(harvest, tool, start);
  assert.ok(gesture, `grip missing for ${tool}`);
  const event = moveHarvestGesture(harvest, gesture, end, time);
  return { event, gesture };
}

function freeBlister(harvest, blister) {
  assert.equal(stroke(harvest, 'blade', blisterFold(blister, 0), blisterFold(blister, 1)).event, 'blister-cut');
  assert.equal(readyToLift(blister), true);
  return stroke(harvest, 'grip', blister.center, point(blister.center.x, blister.center.y - 32)).event;
}

function coat(harvest) {
  assert.equal(beginHarvestGesture(harvest, 'fazer', PEARL_CENTER).placedDrop, true);
  assert.ok(wetCoverage(harvest) > 0 && wetCoverage(harvest) < 1);

  // Inspection can reveal an untreated side before a second drop and roll.
  stroke(harvest, 'grip', PEARL_CENTER, point(PEARL_CENTER.x + 46, PEARL_CENTER.y));
  assert.ok(wetCoverage(harvest) < 1);
  harvest.light = true;
  beginHarvestGesture(harvest, 'fazer', point(PEARL_CENTER.x - 10, PEARL_CENTER.y + 8));
  for (let turn = 0; turn < 3 && wetCoverage(harvest) < 1; turn++) {
    stroke(harvest, 'grip', PEARL_CENTER, point(PEARL_CENTER.x + 75, PEARL_CENTER.y));
  }
  assert.equal(wetCoverage(harvest), 1);
}

test('the same bench supports a pristine harvest with a paused cut and a second fazer pass', () => {
  const harvest = bench();
  const first = harvest.blisters[0];
  stroke(harvest, 'blade', blisterFold(first, 0), blisterFold(first, 0.4));
  assert.ok(first.cut.some(Boolean));
  assert.equal(readyToLift(first), false);
  assert.equal(stroke(harvest, 'grip', first.center, point(first.center.x, first.center.y - 31)).event,
    'blister-attached');
  assert.equal(blisterPose(first, openedAt + 1500).settled, false);
  assert.equal(blisterPose(first, openedAt + 2750).settled, true);
  assert.equal(stroke(harvest, 'blade', blisterFold(first, 0.38), blisterFold(first, 1), openedAt + 2750).event,
    'blister-cut');
  assert.equal(stroke(harvest, 'grip', first.center, point(first.center.x, first.center.y - 31)).event,
    'blister-lifted');
  assert.equal(freeBlister(harvest, harvest.blisters[1]), 'blister-lifted');
  assert.equal(freeBlister(harvest, harvest.blisters[2]), 'pearl-revealed');
  coat(harvest);
  assert.equal(storeHarvest(harvest), null);
  assert.equal(placePearl(harvest, stroke(harvest, 'case', PEARL_CENTER, CASE_CENTER).gesture), 'seated');
  const result = storeHarvest(harvest);
  assert.equal(result.outcome, 'Pristine');
  assert.equal(result.clarity, COMMON_PEARL.clarity);
  assert.deepEqual(harvest.intrinsic, COMMON_PEARL);
  assert.equal(storeHarvest(harvest), result);
});

test('an acid nick stays on its own side of a recovered pearl and reduces final clarity', () => {
  const harvest = bench();
  const { x, y } = harvest.blisters[1].center;
  assert.equal(stroke(harvest, 'blade', point(x, y - 13), point(x, y + 4)).event, 'acid-nick');
  for (const blister of harvest.blisters) freeBlister(harvest, blister);
  const scar = harvest.damage.scars[0];
  coat(harvest);
  assert.notEqual(harvest.pearl.rotation, 0);
  assert.equal(harvest.damage.scars[0], scar);
  assert.equal(scar.blister, 1);
  placePearl(harvest, stroke(harvest, 'case', PEARL_CENTER, CASE_CENTER).gesture);
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

test('the case can be re-seated or closed on the rim with a visible chip penalty', () => {
  const harvest = bench();
  for (const blister of harvest.blisters) freeBlister(harvest, blister);
  const rim = point(CASE_CENTER.x + 26, CASE_CENTER.y);
  assert.equal(placePearl(harvest, stroke(harvest, 'case', PEARL_CENTER, rim).gesture), 'rim');
  assert.equal(placePearl(harvest, stroke(harvest, 'case', rim, CASE_CENTER).gesture), 'seated');
  assert.equal(placePearl(harvest, stroke(harvest, 'case', CASE_CENTER, rim).gesture), 'rim');
  const result = storeHarvest(harvest);
  assert.match(result.observation, /Chipped/);
  assert.match(result.observation, /Untreated haze/);
});
