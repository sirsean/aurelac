import assert from 'node:assert/strict';
import test from 'node:test';
import { ATTACHMENTS, PEEL_DIRECTION, SEAM, TUNING, between, offset, openingAt, openings, point, seamPoint } from '../src/geometry.js';
import {
  beginGesture, continuePeel, createSpecimen, dryMembrane, exposed, moveGesture, peelFront, peelHandle, peelIsWet,
} from '../src/specimen.js';

function draw(specimen, tool, locations) {
  const time = specimen.wetnessTime;
  const gesture = beginGesture(specimen, tool, locations[0], time);
  assert.ok(gesture, `could not begin ${tool}`);
  let result;
  for (const [index, location] of locations.slice(1).entries()) {
    result = moveGesture(specimen, gesture, location, time + (index + 1) * 16) ?? result;
  }
  if (gesture.pull?.settling) {
    result = continuePeel(specimen, gesture, time + locations.length * 16 + 220) ?? result;
  }
  return { gesture, result };
}

function trace(specimen, tool, start, end, steps = 25) {
  return draw(specimen, tool, Array.from({ length: steps + 1 }, (_, index) => seamPoint(start + (end - start) * index / steps)));
}

function pull(specimen, length = 53, direction = PEEL_DIRECTION) {
  const handle = peelHandle(specimen);
  return draw(specimen, 'grip', [handle, point(handle.x + length * direction.x, handle.y + length * direction.y)]);
}

function openSpecimen(start = 0.2, end = 0.85) {
  const specimen = createSpecimen();
  trace(specimen, 'blade', start, end);
  return specimen;
}

function wetFold(specimen) {
  return trace(specimen, 'diffuser', 0.32, 0.69);
}

test('the specimen starts closed and only the blade can open it', () => {
  const specimen = createSpecimen();
  assert.deepEqual(openings(specimen.cut), []);
  assert.equal(beginGesture(specimen, 'grip', peelHandle(specimen)), null);
  const sweep = SEAM.slice(22, 44).map((sample) => offset(sample, 22));
  assert.equal(draw(specimen, 'diffuser', sweep).result, undefined);
  assert.ok(specimen.attachments.every(({ wetness }) => wetness === 0));
  assert.equal(trace(specimen, 'blade', 0.2, 0.82).result, 'cut');
  assert.ok(openingAt(specimen.cut, 0.5));
  assert.equal(draw(specimen, 'diffuser', sweep).result, 'wet');
  assert.ok(peelIsWet(specimen));
});

test('a short slit catches at the lip and extending either end preserves the damp fold', () => {
  for (const [start, end] of [[0.4, 0.01], [0.64, 0.99]]) {
    const specimen = openSpecimen(0.34, 0.68);
    const [short] = openings(specimen.cut);
    assert.ok(short.fraction > 0.28 && short.fraction < 0.42);
    wetFold(specimen);
    const { gesture } = pull(specimen, 55);
    assert.equal(gesture.pull.catch, 'husk');
    assert.ok(gesture.pull.load > 0.35);
    assert.equal(peelFront(specimen), 0);
    assert.ok(specimen.attachments.every(({ tearAt }) => !tearAt));

    trace(specimen, 'blade', start, end);
    assert.ok(openingAt(specimen.cut, 0.5).fraction >= TUNING.usefulOpening);
    assert.ok(peelIsWet(specimen));
    assert.equal(pull(specimen).result, 'piece');
  }
});

test('three clean sections require separate grips and fresh diffuser on each new fold', () => {
  const specimen = openSpecimen();
  const dryTip = peelHandle(specimen);
  const sections = ATTACHMENTS.length / TUNING.attachmentsPerSection;

  for (let section = 0; section < sections; section++) {
    const front = section * TUNING.attachmentsPerSection;
    assert.equal(peelFront(specimen), front);
    assert.equal(peelIsWet(specimen), false);
    wetFold(specimen);
    assert.ok(peelIsWet(specimen));
    if (section === 0) assert.ok(peelHandle(specimen).x > dryTip.x);

    const last = section === sections - 1;
    const { gesture, result } = pull(specimen);
    assert.equal(result, last ? 'peeled' : 'piece');
    assert.equal(gesture.finished, true);
    assert.equal(exposed(specimen), last);
    assert.equal(moveGesture(specimen, gesture, point(395, 280), specimen.wetnessTime + 100), null);
  }

  assert.ok(specimen.attachments.every(({ state, tearAt }) => state === 'released' && !tearAt));
});

test('a short flick stretches the wet fold and a hard yank tears it', () => {
  const specimen = openSpecimen();
  wetFold(specimen);
  const tip = peelHandle(specimen);
  const time = specimen.wetnessTime;
  const gesture = beginGesture(specimen, 'grip', tip, time);
  const target = (travel) => point(tip.x + travel * PEEL_DIRECTION.x, tip.y + travel * PEEL_DIRECTION.y);
  assert.equal(moveGesture(specimen, gesture, target(24), time + 12), null);
  assert.equal(moveGesture(specimen, gesture, target(50), time + 26), null);
  assert.equal(peelFront(specimen), 0);
  assert.equal(moveGesture(specimen, gesture, target(83), time + 37), 'tear');
  assert.equal(peelFront(specimen), TUNING.attachmentsPerSection);
  assert.ok(specimen.attachments[0].tearAt);
});

test('wetness fades with time and can be refreshed before a gentle peel', () => {
  const specimen = openSpecimen();
  wetFold(specimen);
  const wetness = specimen.attachments[0].wetness;
  const time = specimen.wetnessTime;
  assert.equal(dryMembrane(specimen, time + 1500), true);
  assert.ok(specimen.attachments[0].wetness < wetness);
  dryMembrane(specimen, time + TUNING.dryingTime + 1);
  assert.equal(specimen.attachments[0].wetness, 0);
  assert.equal(peelIsWet(specimen), false);
  assert.equal(dryMembrane(specimen, time + 300), false);

  wetFold(specimen);
  assert.ok(peelIsWet(specimen));
  assert.equal(pull(specimen).result, 'piece');
});

test('a moderate pull on a dried fold tears that section and leaves a remnant', () => {
  const specimen = openSpecimen();
  wetFold(specimen);
  dryMembrane(specimen, specimen.wetnessTime + TUNING.dryingTime);
  const handle = peelHandle(specimen);
  const { gesture, result } = pull(specimen, 39);
  assert.equal(result, 'dry-tear');
  assert.deepEqual(specimen.attachments[0].tearAt, ATTACHMENTS[0]);
  assert.equal(peelFront(specimen), TUNING.attachmentsPerSection);
  assert.equal(moveGesture(specimen, gesture, handle, specimen.wetnessTime + 100), null);

  wetFold(specimen);
  assert.equal(pull(specimen).result, 'piece');
  wetFold(specimen);
  assert.equal(pull(specimen).result, 'peeled');
  assert.equal(specimen.attachments.filter(({ tearAt }) => tearAt).length, 1);
});

test('pulling inward bunches the wet fold and easing off is safe', () => {
  const specimen = openSpecimen();
  wetFold(specimen);
  const handle = peelHandle(specimen);
  const { gesture } = pull(specimen, 55, point(-1, 0));
  assert.equal(gesture.pull.catch, 'angle');
  assert.equal(peelFront(specimen), 0);
  moveGesture(specimen, gesture, handle, specimen.wetnessTime + 16);
  assert.equal(gesture.pull.load, 0);
  assert.equal(specimen.attachments[0].state, 'attached');
});

test('forcing a short opening tears a section and caps the visible stretch', () => {
  const specimen = openSpecimen(0.34, 0.68);
  const { gesture, result } = pull(specimen, 145);
  assert.equal(result, 'tear');
  assert.deepEqual(specimen.attachments[0].tearAt, gesture.pull.anchor);
  assert.ok(Math.hypot(gesture.pull.target.x - gesture.handle.x, gesture.pull.target.y - gesture.handle.y) <= 74.01);
  assert.equal(peelFront(specimen), TUNING.attachmentsPerSection);
});

test('cutting pink leaves a nick, while a tap or travel in empty space leaves the anatomy intact', () => {
  const specimen = createSpecimen();
  beginGesture(specimen, 'blade', seamPoint(0.5));
  draw(specimen, 'blade', [point(17, 30), point(36, 33), point(30, 50)]);
  assert.deepEqual(openings(specimen.cut), []);
  assert.deepEqual(specimen.nicks, []);
  trace(specimen, 'blade', 0.1, 0.92);
  const locations = SEAM.slice(26, 39).map((sample) => offset(sample, 17));
  assert.equal(draw(specimen, 'blade', locations).result, 'nick');
  assert.ok(specimen.nicks.length > 0);
});

test('the same stroke traverses the same cut with sparse or dense pointer samples', () => {
  const start = seamPoint(0.36);
  const end = seamPoint(0.68);
  const sparse = createSpecimen();
  const dense = createSpecimen();
  draw(sparse, 'blade', [start, end]);
  draw(dense, 'blade', Array.from({ length: 61 }, (_, index) => between(start, end, index / 60)));
  assert.deepEqual(sparse.cut, dense.cut);
});
