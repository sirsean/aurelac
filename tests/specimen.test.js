import assert from 'node:assert/strict';
import test from 'node:test';
import { ATTACHMENTS, PEEL_DIRECTION, between, offset, openingAt, openings, point, seamPoint, SEAM } from '../src/geometry.js';
import { beginGesture, createSpecimen, exposed, moveGesture, peelFront, peelHandle } from '../src/specimen.js';

function draw(specimen, tool, locations) {
  const gesture = beginGesture(specimen, tool, locations[0]);
  assert.ok(gesture, `could not begin ${tool}`);
  let result;
  for (const location of locations.slice(1)) {
    result = moveGesture(specimen, gesture, location) ?? result;
  }
  return { gesture, result };
}

function trace(specimen, tool, start, end, steps = 25) {
  return draw(specimen, tool, Array.from({ length: steps + 1 }, (_, index) => seamPoint(start + (end - start) * index / steps)));
}

function pull(specimen, length, direction = PEEL_DIRECTION) {
  const handle = peelHandle(specimen);
  return draw(specimen, 'grip', [handle, point(handle.x + length * direction.x, handle.y + length * direction.y)]);
}

test('a short slit catches at the lip, and extending the same incision keeps wetness', () => {
  const specimen = createSpecimen();
  trace(specimen, 'blade', 0.34, 0.68);
  const [short] = openings(specimen.cut);
  assert.ok(short.fraction > 0.28 && short.fraction < 0.42);
  trace(specimen, 'diffuser', 0.37, 0.67);
  const { gesture } = pull(specimen, 55);
  assert.equal(gesture.pull.catch, 'husk');
  assert.ok(gesture.pull.load > 0.35);
  assert.equal(peelFront(specimen), 0);
  assert.equal(specimen.attachments.some((attachment) => attachment.tearAt), false);

  const wetness = specimen.attachments.map((attachment) => attachment.wetness);
  trace(specimen, 'blade', 0.64, 0.99);
  assert.ok(openingAt(specimen.cut, 0.5).fraction >= 0.64);
  assert.deepEqual(specimen.attachments.map((attachment) => attachment.wetness), wetness);
  assert.equal(pull(specimen, 84).result, 'peeled');
  assert.equal(exposed(specimen), true);
});

test('the short starter opening can be extended from either end', () => {
  for (const [start, end] of [[0.4, 0.01], [0.61, 0.99]]) {
    const specimen = createSpecimen({ starter: true });
    trace(specimen, 'blade', start, end);
    trace(specimen, 'diffuser', 0.36, 0.66);
    assert.equal(pull(specimen, 85).result, 'peeled');
  }
});

test('a dry attachment holds a wide slit open until a local sweep reaches it', () => {
  const specimen = createSpecimen({ starter: true });
  trace(specimen, 'blade', 0.64, 1);
  const { gesture } = pull(specimen, 64);
  const dry = peelFront(specimen);
  assert.ok(dry > 0 && dry < ATTACHMENTS.length);
  assert.equal(gesture.pull.catch, 'dry');
  assert.deepEqual(gesture.pull.anchor, ATTACHMENTS[dry]);

  trace(specimen, 'diffuser', ATTACHMENTS[dry].seamT - 0.06, 0.68);
  assert.equal(pull(specimen, 86).result, 'peeled');
});

test('an outward tug creates tension, and relaxing it does not tear the flap', () => {
  const specimen = createSpecimen({ starter: true });
  trace(specimen, 'blade', 0.64, 1);
  trace(specimen, 'diffuser', 0.33, 0.68);
  const handle = peelHandle(specimen);
  const { gesture } = pull(specimen, 55, point(0, 1));
  assert.equal(gesture.pull.catch, 'angle');
  assert.equal(peelFront(specimen), 0);
  moveGesture(specimen, gesture, handle);
  assert.equal(gesture.pull.load, 0);
  assert.equal(specimen.attachments[0].state, 'attached');
});

test('forcing a caught flap caps stretch and leaves one localized remnant', () => {
  const specimen = createSpecimen({ starter: true });
  const { gesture, result } = pull(specimen, 145);
  assert.equal(result, 'tear');
  assert.deepEqual(specimen.attachments[0].tearAt, gesture.pull.anchor);
  assert.ok(Math.hypot(gesture.pull.target.x - gesture.handle.x, gesture.pull.target.y - gesture.handle.y) <= 74.01);
  moveGesture(specimen, gesture, point(0, 0));
  assert.equal(specimen.attachments.filter(({ state }) => state === 'torn').length, 1);

  trace(specimen, 'blade', 0.64, 1);
  trace(specimen, 'diffuser', 0.34, 0.69);
  assert.equal(pull(specimen, 84).result, 'peeled');
  assert.ok(specimen.attachments[0].tearAt);
  assert.notDeepEqual(specimen, createSpecimen({ starter: true }));
});

test('cutting pink leaves a nick, while a tap or travel in empty space has no effect', () => {
  const specimen = createSpecimen();
  beginGesture(specimen, 'blade', seamPoint(0.5));
  draw(specimen, 'blade', [point(17, 30), point(36, 33), point(30, 50)]);
  assert.deepEqual(specimen, createSpecimen());
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

  draw(sparse, 'diffuser', [start, end]);
  draw(dense, 'diffuser', Array.from({ length: 61 }, (_, index) => between(start, end, index / 60)));
  for (const [index, attachment] of sparse.attachments.entries()) {
    assert.ok(Math.abs(attachment.wetness - dense.attachments[index].wetness) < 0.06);
  }
});
