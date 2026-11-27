import assert from 'node:assert/strict';
import test from 'node:test';
import { point, seamPoint } from '../src/geometry.js';
import { beginSharpening, bladeDrag, createBlade, sharpenBlade, STONE } from '../src/blade.js';
import { beginHarvestGesture, blisterFold, blisterPose, createHarvest, moveHarvestGesture, openBlisters } from '../src/harvest.js';
import { collectedPearls, loadWorkbench, recordPearl, saveWorkbench } from '../src/save.js';
import { beginGesture, createSpecimen, moveGesture } from '../src/specimen.js';

class MemoryStorage {
  values = new Map();
  get length() { return this.values.size; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
  key(index) { return [...this.values.keys()][index] ?? null; }
}

function cutHusk(specimen, blade, start = 0.2, end = 0.84) {
  const gesture = beginGesture(specimen, 'blade', seamPoint(start), 0, blade);
  for (let index = 1; index <= 34; index++) {
    moveGesture(specimen, gesture, seamPoint(start + (end - start) * index / 34), index * 8);
  }
}

function wearFromOrdinaryHarvest(blade) {
  const specimen = createSpecimen();
  cutHusk(specimen, blade);
  const harvest = createHarvest();
  openBlisters(harvest, specimen, 500);
  for (const blister of harvest.blisters) {
    const gesture = beginHarvestGesture(harvest, 'blade', blisterFold(blister, 0), blade);
    const time = 500 + blister.timing.cycle - blister.timing.stagger * blister.index + 100;
    assert.equal(moveHarvestGesture(harvest, gesture, blisterFold(blister, 1), time), 'blister-cut');
  }
}

test('ordinary cuts build drag and a few stone strokes restore the blade on the same node', () => {
  const blade = createBlade();
  for (let run = 0; run < 10; run++) wearFromOrdinaryHarvest(blade);
  assert.equal(bladeDrag(blade), 0);
  for (let run = 0; run < 4; run++) wearFromOrdinaryHarvest(blade);
  assert.ok(bladeDrag(blade) > 0);

  const specimen = createSpecimen();
  cutHusk(specimen, blade, 0.25, 0.59);
  specimen.nicks.push(point(180, 190));
  const before = [...specimen.cut];
  const nick = specimen.nicks[0];
  const y = (STONE.top + STONE.bottom) / 2;
  const stone = beginSharpening(point(100, y));
  for (const x of [220, 100, 220]) sharpenBlade(blade, stone, point(x, y));
  assert.equal(blade.wear, 0);
  assert.deepEqual(specimen.cut, before);
  assert.equal(specimen.nicks[0], nick);
  cutHusk(specimen, blade, 0.55, 0.9);
  assert.ok(specimen.cut.filter(Boolean).length > before.filter(Boolean).length);
});

test('a versioned save restores the selected node, damage, tool wear and phase on a new clock', () => {
  const storage = new MemoryStorage();
  const specimen = createSpecimen({ seed: 391 });
  cutHusk(specimen, createBlade());
  specimen.attachments[0].wetness = 1;
  specimen.attachments[1].tearAt = point(180, 190);
  specimen.attachments[1].state = 'torn';
  specimen.nicks.push(point(175, 145));
  const harvest = createHarvest(391, { pattern: 31175 });
  openBlisters(harvest, specimen, 430);
  harvest.blisters[0].cut[0] = true;
  harvest.blisters[0].acid = 12;
  harvest.damage.scars.push({ angle: 2, blister: 0 });
  harvest.pearl.coating[0] = { amount: 0.5, treated: true };
  harvest.pearl.coating[1] = { amount: 1, treatment: 0.4, undercoat: 0.38 };
  const blade = { wear: 0.71 };

  assert.equal(saveWorkbench(storage, { id: 'rare-run', specimen, harvest, blade }, 500, 10000), true);
  const resumed = loadWorkbench(storage, 50, 11000);
  assert.equal(resumed.id, 'rare-run');
  assert.equal(resumed.specimen.seed, 391);
  assert.deepEqual(resumed.specimen.cut, specimen.cut);
  assert.ok(resumed.specimen.attachments[0].wetness < 1);
  assert.deepEqual(resumed.specimen.attachments[1].tearAt, specimen.attachments[1].tearAt);
  assert.deepEqual(resumed.specimen.nicks, specimen.nicks);
  assert.equal(resumed.harvest.blisters[0].cut[0], true);
  assert.equal(resumed.harvest.blisters[0].acid, 12);
  assert.deepEqual(resumed.harvest.damage.scars, harvest.damage.scars);
  assert.deepEqual(resumed.harvest.pearl.coating[0], { amount: 0.5, treatment: 1, undercoat: 0 });
  assert.deepEqual(resumed.harvest.pearl.coating[1], harvest.pearl.coating[1]);
  assert.equal(resumed.harvest.pearl.pattern, 31175);
  assert.deepEqual(blisterPose(resumed.harvest.blisters[0], 50), blisterPose(harvest.blisters[0], 1500));
  assert.equal(resumed.blade.wear, 0.71);
});

test('records are unique by harvest and ruined pearls stay out of the physical collection', () => {
  const storage = new MemoryStorage();
  const appraisal = { outcome: 'Pristine', size: 'Large', diameter: 25, clarity: 96, amberDepth: 74 };
  const first = recordPearl(storage, 'first', 107, appraisal, 200);
  recordPearl(storage, 'ruined', 107, { outcome: 'Ruined' }, 230);
  recordPearl(storage, 'later', 154, { ...appraisal, diameter: 17, outcome: 'Flawed' }, 270);
  assert.deepEqual(recordPearl(storage, 'first', 107, { ...appraisal, clarity: 20 }, 290), first);

  const entries = collectedPearls(storage);
  assert.deepEqual(entries.map(({ id, seed }) => [id, seed]), [['later', 154], ['first', 107]]);
  assert.equal(entries[1].appraisal.clarity, 96);
});
