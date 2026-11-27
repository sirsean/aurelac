import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { ATTACHMENTS, BOARD, SEAM, TUNING, layoutFor, offset, seamPoint } from '../src/geometry.js';
import { STONE } from '../src/blade.js';
import { CASE_CENTER, COATING_PATCHES, PEARL_CENTER, RUPTURE_DURATION, blisterFold, createHarvest, openBlisters } from '../src/harvest.js';
import { COMMON_NODE, NODES, nodeCode } from '../src/nodes.js';
import { beginGesture, createSpecimen, moveGesture, peelFront, peelHandle } from '../src/specimen.js';

const baseUrl = process.env.AURELAC_TEST_URL ?? 'http://127.0.0.1:3000';
const executablePath = process.env.AURELAC_CHROMIUM
  ?? (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const browser = await chromium.launch({
  executablePath,
  proxy: process.env.AURELAC_BROWSER_PROXY
    ? { server: process.env.AURELAC_BROWSER_PROXY, bypass: '127.0.0.1,localhost' }
    : undefined,
});

async function boardPoint(page, { x, y }) {
  const board = await page.locator('#specimen').boundingBox();
  return { x: board.x + x / BOARD.width * board.width, y: board.y + y / BOARD.height * board.height };
}

async function selectTool(page, name, input = 'mouse') {
  const button = page.getByRole('button', { name, exact: true });
  if (input === 'touch') {
    await button.tap();
    await page.locator(`[data-tool="${name.toLowerCase()}"][aria-pressed="true"]`).waitFor({ timeout: 1500 });
  } else {
    await button.click();
  }
  assert.equal(await button.getAttribute('aria-pressed'), 'true');
}

async function trace(page, from, to, sampleAt = seamPoint) {
  const start = await boardPoint(page, sampleAt(from));
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  const steps = 24;
  for (let index = 1; index <= steps; index++) {
    const cursor = await boardPoint(page, sampleAt(from + (to - from) * index / steps));
    await page.mouse.move(cursor.x, cursor.y);
  }
  await page.mouse.up();
}

function pinkSurface(t) {
  const { x, y } = seamPoint(t);
  return { x: x - 7, y: y + 20 };
}

async function expectSplash(page, location = pinkSurface(0.5), name = 'diffuser') {
  const contact = await boardPoint(page, location);
  await page.mouse.move(contact.x, contact.y);
  await page.mouse.down();
  try {
    const changed = await page.evaluate(async ({ location, board }) => {
      const canvas = document.querySelector('#specimen');
      const ctx = canvas.getContext('2d');
      const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      const capture = () => ctx.getImageData(canvas.width * (location.x - 36) / board.width,
        canvas.height * (location.y - 36) / board.height, canvas.width * 72 / board.width,
        canvas.height * 72 / board.height).data;
      await frame();
      const first = capture();
      await frame();
      await frame();
      return capture().some((value, index) => value !== first[index]);
    }, { location, board: BOARD });
    assert.ok(changed, `${name} should splash while held still`);
    await screenshot(page, `desktop-${name}-splash`);
  } finally {
    await page.mouse.up();
  }
}

async function expectCleanLobe(page) {
  // The detached curl should leave the work surface after the release animation.
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#specimen');
    const frame = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    for (let index = 0; index < frame.length; index += 4) {
      const red = frame[index];
      const green = frame[index + 1];
      const blue = frame[index + 2];
      if (red > 140 && red - green > 36 && Math.abs(green - blue) < 13) return false;
    }
    return true;
  }, undefined, { timeout: 2000 });
}

function handle(index = 0) {
  const anchor = ATTACHMENTS[index];
  return { x: anchor.x + 26 * anchor.direction.x, y: anchor.y + 26 * anchor.direction.y };
}

function target(distance, index = 0) {
  const start = handle(index);
  const { direction } = ATTACHMENTS[index];
  return { x: start.x + distance * direction.x, y: start.y + distance * direction.y };
}

async function startPeel(page, distance, index = 0, steps = 18) {
  const from = await boardPoint(page, handle(index));
  const to = await boardPoint(page, target(distance, index));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
}

async function screenshot(page, name) {
  await page.screenshot({ path: `playtest-results/${name}.png` });
}

async function originalAnatomy(page) {
  // These scripted regressions replay gestures on saves from the original bench.
  await page.evaluate((specimen) => {
    const key = 'aurelac.workbench.v1';
    const saved = JSON.parse(localStorage.getItem(key));
    saved.specimen = specimen;
    localStorage.setItem(key, JSON.stringify(saved));
  }, createSpecimen());
  await page.reload();
}

async function setUp(page, route = '/', generated = false) {
  const problems = [];
  page.on('pageerror', (error) => problems.push(error.message));
  assert.equal((await page.goto(new URL(route, baseUrl).href)).status(), 200);
  await page.getByRole('heading', { name: 'Harvest bench' }).waitFor();
  if (!generated) await originalAnatomy(page);
  return problems;
}

async function touchPath(page, send, positions, result) {
  const samples = await Promise.all(positions.map((position) => boardPoint(page, position)));
  await send('touchStart', [samples[0]]);
  for (const sample of samples.slice(1)) await send('touchMove', [sample]);
  if (result) await expectStatus(page, result);
  await send('touchEnd', []);
}

async function checkFit(page) {
  const viewport = page.viewportSize();
  const tray = await page.locator('.tool-tray').boundingBox();
  assert.ok(tray.y + tray.height <= viewport.height);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), viewport.width);
  for (const tool of await page.locator('[data-tool]:visible').all()) {
    const box = await tool.boundingBox();
    assert.ok(box.height >= 44 && box.width >= 44);
  }
}

async function expectStatus(page, text, timeout = 1600) {
  await page.waitForFunction((needle) => document.querySelector('#feedback').textContent.includes(needle),
    text, { timeout });
}

async function expectIntact(page) {
  assert.equal(await page.getByRole('button', { name: 'Blade' }).getAttribute('aria-pressed'), 'true');
  await expectStatus(page, 'specimen is intact');
  await expectCleanLobe(page);
}

async function expectCollection(page, count) {
  await page.getByRole('button', { name: 'Collection', exact: true }).click();
  assert.equal(await page.locator('#collection-list li').count(), count);
  assert.equal(await page.locator('#collection-list li canvas').count(), count);
  await page.locator('#collection').getByRole('button', { name: 'Close' }).click();
}

const finishedSection = (index) => index + TUNING.attachmentsPerSection === ATTACHMENTS.length
  ? 'membrane is free'
  : 'One section came free';

function blistersFor(strokes) {
  const specimen = createSpecimen();
  for (const [from, to] of strokes) {
    const gesture = beginGesture(specimen, 'blade', seamPoint(from));
    for (let index = 1; index <= 24; index++) {
      moveGesture(specimen, gesture, seamPoint(from + (to - from) * index / 24));
    }
  }
  const harvest = createHarvest();
  openBlisters(harvest, specimen, 0);
  return harvest;
}

async function drag(page, start, end, steps = 9) {
  const from = await boardPoint(page, start);
  const to = await boardPoint(page, end);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

async function settled(page, opened, index, timing = COMMON_NODE.timing) {
  await page.waitForFunction(({ opened, index, cycle, slack, stagger }) =>
    (performance.now() - opened + stagger * index) % cycle < slack * 0.42,
  { opened, index, ...timing }, { timeout: timing.cycle + 1300 });
}

function tissuePoint(blister, travel) {
  const { center, axis } = blister;
  return { x: center.x + axis.x * travel, y: center.y + axis.y * travel };
}

function pearlPoint(x, y) {
  return { x: PEARL_CENTER.x + x, y: PEARL_CENTER.y + y };
}

async function holdSpray(page, location, duration = 580) {
  const contact = await boardPoint(page, location);
  await page.mouse.move(contact.x, contact.y);
  await page.mouse.down();
  await page.waitForTimeout(duration);
  await page.mouse.up();
}

function savedCoating(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('aurelac.workbench.v1')).harvest.pearl.coating);
}

async function harvestPearl(page, strokes, opened, outcome) {
  const { blisters, pocket } = blistersFor(strokes);
  for (const blister of blisters) {
    await selectTool(page, 'Blade');
    if (outcome === 'Flawed' && blister.index === 1) {
      await drag(page, tissuePoint(blister, -12), tissuePoint(blister, 5));
      await expectStatus(page, 'Acid leaked');
    }
    await settled(page, opened, blister.index);
    if (blister.index === 0) {
      await drag(page, blisterFold(blister, 0), blisterFold(blister, 0.44));
      await expectStatus(page, 'The cut holds');
      await settled(page, opened, blister.index);
    }
    await drag(page, blisterFold(blister, 0), blisterFold(blister, 1));
    await expectStatus(page, 'The fold is free');
    await selectTool(page, 'Grip');
    const outside = { x: blister.center.x, y: blister.center.y < pocket.y ? 67 : 309 };
    if (blister.index === 0) {
      const center = await boardPoint(page, blister.center);
      await page.mouse.click(center.x, center.y);
      await expectStatus(page, 'The fold is free');
      await drag(page, blister.center, { x: blister.center.x + 7, y: blister.center.y + 14 });
      await expectStatus(page, 'clear of the opening');

      const drop = await boardPoint(page, outside);
      await page.mouse.move(center.x, center.y);
      await page.mouse.down();
      await page.mouse.move(drop.x, drop.y, { steps: 12 });
      await expectStatus(page, 'clear of the opening');
      await screenshot(page, `${outcome.toLowerCase()}-blister-drag`);
      await page.mouse.up();
      await expectStatus(page, 'The pearl is showing through');
      await screenshot(page, `${outcome.toLowerCase()}-pearl-in-husk`);
    } else {
      await drag(page, blister.center, outside);
      await expectStatus(page, blister === blisters.at(-1) ? 'The root pearl is exposed' : 'The blister is out');
    }
  }

  const layeredIndex = outcome === 'Flawed' ? 9 : -1;
  await page.evaluate((layeredIndex) => {
    const key = 'aurelac.workbench.v1';
    const saved = JSON.parse(localStorage.getItem(key));
    saved.harvest.pearl.coating.forEach((patch, index) => { patch.undercoat = index === layeredIndex ? 0.38 : 0; });
    localStorage.setItem(key, JSON.stringify(saved));
  }, layeredIndex);
  await page.reload();
  await screenshot(page, `${outcome.toLowerCase()}-coated-pearl`);
  await selectTool(page, 'Wipe');
  await drag(page, pearlPoint(-24, 0), pearlPoint(24, 0));
  await expectStatus(page, 'still sticky');
  await selectTool(page, 'Fazer');
  const topPatch = pearlPoint(-16, -17);
  const tap = await boardPoint(page, topPatch);
  await page.mouse.click(tap.x, tap.y);
  assert.ok((await savedCoating(page)).every(({ treatment }) => treatment < 1));
  if (outcome === 'Pristine') await expectSplash(page, topPatch, 'fazer');
  await holdSpray(page, topPatch);
  assert.equal((await savedCoating(page))[0].treatment, 1);
  await selectTool(page, 'Wipe');
  await drag(page, pearlPoint(-24, -16), pearlPoint(24, -16));
  assert.ok((await savedCoating(page))[0].amount < 1);
  await page.getByRole('button', { name: 'Work light' }).click();
  await expectStatus(page, 'coating still');
  await selectTool(page, 'Fazer');
  for (const y of [-18, 0, 20]) await drag(page, pearlPoint(-22, y), pearlPoint(22, y), 60);
  await screenshot(page, `${outcome.toLowerCase()}-treated-pearl`);
  await selectTool(page, 'Wipe');
  for (let turn = 0; turn < 3; turn++) {
    for (const y of [-21, -9, 5, 18, 24]) {
      await drag(page, pearlPoint(-24, y), pearlPoint(24, y), 6);
    }
    if (await page.getByRole('button', { name: 'Roll', exact: true }).isVisible()) break;
  }
  if (layeredIndex >= 0) {
    const patch = (await savedCoating(page))[layeredIndex];
    assert.equal(patch.amount, 0.38);
    assert.equal(patch.treatment, 0);
    await screenshot(page, 'flawed-amber-undercoat');
    await selectTool(page, 'Fazer');
    const { x, y } = COATING_PATCHES[layeredIndex];
    await holdSpray(page, pearlPoint(x, y));
    await selectTool(page, 'Wipe');
    await drag(page, pearlPoint(-24, y), pearlPoint(26, y));
  }
  await expectStatus(page, 'The pearl is clean');
  await screenshot(page, `${outcome.toLowerCase()}-wiped-pearl`);
  await selectTool(page, 'Case');
  await drag(page, PEARL_CENTER, CASE_CENTER);
  await expectStatus(page, 'sits flat');
  await page.getByRole('button', { name: 'Close case' }).click();
  assert.equal(await page.locator('#appraisal-outcome').textContent(), outcome);
  assert.equal(await page.locator('#appraisal-color').textContent(), 'Honey amber');
  if (outcome === 'Flawed') assert.match(await page.locator('#appraisal-observation').textContent(), /Acid clouding/);
}

try {
  await mkdir('playtest-results', { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const desktopErrors = await setUp(page);
  await checkFit(page);
  await expectIntact(page);
  await screenshot(page, 'desktop-intact');
  await page.getByRole('button', { name: 'Field guide' }).click();
  assert.ok(await page.getByRole('dialog').isVisible());
  await page.getByRole('button', { name: 'Close' }).click();
  assert.ok(await page.getByRole('dialog').isHidden());

  await trace(page, 0.34, 0.68);
  await selectTool(page, 'Diffuser');
  await expectSplash(page);
  await trace(page, 0.36, 0.68, pinkSurface);
  await expectStatus(page, 'fold is glossy');
  await screenshot(page, 'desktop-wet');
  await selectTool(page, 'Grip');
  await startPeel(page, 53);
  await expectStatus(page, 'caught on the husk');
  await page.mouse.up();
  await selectTool(page, 'Blade');
  await trace(page, 0.63, 0.91);

  for (let index = 0; index < ATTACHMENTS.length; index += TUNING.attachmentsPerSection) {
    await selectTool(page, 'Diffuser');
    await trace(page, 0.33, 0.69, pinkSurface);
    await expectStatus(page, 'fold is glossy');
    await selectTool(page, 'Grip');
    if (index <= TUNING.attachmentsPerSection) {
      await screenshot(page, `desktop-raised-fold-${index}`);
      await startPeel(page, -48, index);
      await expectStatus(page, 'bunches');
      await screenshot(page, `desktop-bunched-fold-${index}`);
      const corrected = await boardPoint(page, target(53, index));
      await page.mouse.move(corrected.x, corrected.y, { steps: 18 });
    } else {
      await startPeel(page, 53, index);
    }
    await expectStatus(page, finishedSection(index));
    await page.mouse.up();
  }
  const desktopOpening = await page.evaluate(() => performance.now());
  await expectCleanLobe(page);
  await screenshot(page, 'desktop-clean-peel');
  await harvestPearl(page, [[0.34, 0.68], [0.63, 0.91]], desktopOpening, 'Pristine');
  await screenshot(page, 'desktop-pristine');
  await page.reload();
  assert.equal(await page.locator('#appraisal-outcome').textContent(), 'Pristine');
  await expectCollection(page, 1);

  await page.setViewportSize({ width: 320, height: 640 });
  await page.getByRole('button', { name: 'Reset node' }).click();
  await originalAnatomy(page);
  await checkFit(page);
  await expectIntact(page);
  await screenshot(page, 'narrow-intact');
  await trace(page, 0.2, 0.84);
  await selectTool(page, 'Diffuser');
  await trace(page, 0.34, 0.69, pinkSurface);
  await expectStatus(page, 'fold is glossy');
  await screenshot(page, 'narrow-wet-fold');
  await expectStatus(page, 'sheen has faded', TUNING.dryingTime + 500);
  await screenshot(page, 'narrow-dry-fold');
  await selectTool(page, 'Grip');
  await startPeel(page, 50);
  await expectStatus(page, 'dry section tears');
  await page.mouse.up();
  await screenshot(page, 'narrow-dry-tear');
  await page.reload();
  await expectStatus(page, 'Harvest resumed');

  const middle = TUNING.attachmentsPerSection;
  await selectTool(page, 'Diffuser');
  await trace(page, 0.33, 0.69, pinkSurface);
  await expectStatus(page, 'fold is glossy');
  await selectTool(page, 'Grip');
  await startPeel(page, -92, middle);
  await expectStatus(page, 'bunched fold tears');
  await page.mouse.up();

  await selectTool(page, 'Diffuser');
  await trace(page, 0.33, 0.69, pinkSurface);
  await expectStatus(page, 'fold is glossy');
  await selectTool(page, 'Grip');
  await startPeel(page, 53, middle * 2);
  await expectStatus(page, 'Ragged remnants remain');
  await page.mouse.up();
  const narrowOpening = await page.evaluate(() => performance.now());
  await screenshot(page, 'narrow-recovered-peel');
  await harvestPearl(page, [[0.2, 0.84]], narrowOpening, 'Flawed');
  await screenshot(page, 'narrow-flawed');
  await page.reload();
  await expectCollection(page, 2);
  assert.deepEqual(desktopErrors, []);

  const touch = await browser.newPage({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3,
  });
  const touchErrors = await setUp(touch, '/?playtest=starter');
  await checkFit(touch);
  await expectIntact(touch);
  assert.ok(await touch.getByRole('button', { name: 'Field guide' }).isHidden());
  const cdp = await touch.context().newCDPSession(touch);
  const send = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  const swipe = (positions, result) => touchPath(touch, send, positions, result);

  await swipe([0.34, 0.4, 0.47, 0.54, 0.61, 0.68].map(seamPoint));
  await selectTool(touch, 'Diffuser', 'touch');
  const wetSweep = [0.33, 0.4, 0.47, 0.54, 0.61, 0.69].map(pinkSurface);
  await swipe(wetSweep);
  await expectStatus(touch, 'fold is glossy');
  await selectTool(touch, 'Grip', 'touch');

  const first = await boardPoint(touch, handle());
  const second = await boardPoint(touch, { x: 256, y: 259 });
  const safePull = await boardPoint(touch, target(53));
  await send('touchStart', [{ ...first, id: 1 }]);
  await send('touchStart', [{ ...first, id: 1 }, { ...second, id: 2 }]);
  await send('touchMove', [{ ...safePull, id: 1 }, { ...second, id: 2 }]);
  await expectStatus(touch, 'caught on the husk');
  await send('touchCancel', []);

  // Resize while the blade is down. The stroke should end without extending the slit.
  await selectTool(touch, 'Blade');
  const bladeStart = await boardPoint(touch, seamPoint(0.65));
  await touch.mouse.move(bladeStart.x, bladeStart.y);
  await touch.mouse.down();
  await touch.setViewportSize({ width: 375, height: 800 });
  await touch.waitForFunction(() =>
    Math.abs(document.querySelector('#specimen').width / devicePixelRatio
      - document.querySelector('#specimen').clientWidth) < 1);
  const bladeEnd = await boardPoint(touch, seamPoint(0.99));
  await touch.mouse.move(bladeEnd.x, bladeEnd.y);
  await touch.mouse.up();
  await expectStatus(touch, 'caught on the husk');
  await swipe([0.63, 0.7, 0.77, 0.84, 0.91].map(seamPoint));

  for (let index = 0; index < ATTACHMENTS.length; index += TUNING.attachmentsPerSection) {
    await selectTool(touch, 'Diffuser', 'touch');
    await swipe(wetSweep);
    await expectStatus(touch, 'fold is glossy');
    await selectTool(touch, 'Grip', 'touch');
    await swipe([handle(index), target(24, index), target(53, index)], finishedSection(index));
  }
  const touchOpening = await touch.evaluate(() => performance.now());
  await expectCleanLobe(touch);
  await screenshot(touch, 'touch-clean-peel');
  const [firstBlister, blister] = blistersFor([[0.34, 0.68], [0.63, 0.91]]).blisters;
  await selectTool(touch, 'Blade', 'touch');
  await settled(touch, touchOpening, firstBlister.index);
  await swipe([0, 0.22, 0.48, 0.74, 1].map((value) => blisterFold(firstBlister, value)), 'The fold is free');
  await selectTool(touch, 'Grip', 'touch');
  await swipe([firstBlister.center, { x: firstBlister.center.x, y: 117 }, { x: firstBlister.center.x, y: 65 }]);
  await expectStatus(touch, 'The pearl is showing through');
  await selectTool(touch, 'Blade', 'touch');
  const failureCanvas = touch.locator('#specimen');
  const shellPatch = () => failureCanvas.evaluate((canvas, board) => {
    const pixels = canvas.getContext('2d').getImageData(138 * canvas.width / board.width,
      85 * canvas.height / board.height, 8, 8).data;
    return [...pixels];
  }, BOARD);
  const shellBefore = await shellPatch();
  await swipe([
    tissuePoint(blister, -12), tissuePoint(blister, 12), tissuePoint(blister, -12),
  ], 'Gas escapes into the opening');
  assert.ok(await touch.getByRole('button', { name: 'Blade' }).isDisabled());
  assert.deepEqual(await shellPatch(), shellBefore);
  const recordLoss = touch.getByRole('button', { name: 'Record loss' });
  assert.ok(await recordLoss.isHidden());
  await touch.waitForTimeout(1600);
  assert.ok(await recordLoss.isHidden());
  const gasFrame = await failureCanvas.evaluate((canvas) => canvas.toDataURL());
  await screenshot(touch, 'touch-rupture-gas');
  await expectStatus(touch, 'The root pearl is gone', RUPTURE_DURATION + 900);
  assert.deepEqual(await shellPatch(), shellBefore);
  const residueFrame = await failureCanvas.evaluate((canvas) => canvas.toDataURL());
  assert.notEqual(residueFrame, gasFrame);
  await screenshot(touch, 'touch-ruined');
  await recordLoss.tap();
  await touch.locator('#appraisal').waitFor({ timeout: 1600 });
  assert.equal(await touch.locator('#appraisal-outcome').textContent(), 'Ruined');
  assert.equal(await failureCanvas.evaluate((canvas) => canvas.toDataURL()), residueFrame);
  await touch.reload();
  assert.equal(await touch.locator('#appraisal-outcome').textContent(), 'Ruined');
  await touch.waitForFunction((residueFrame) => document.querySelector('#specimen').toDataURL() === residueFrame, residueFrame);
  await touch.getByRole('button', { name: 'Reset node' }).click();
  await expectIntact(touch);
  const canvases = [];
  for (const node of NODES) {
    await touch.getByLabel('Start a specimen').selectOption(String(node.seed));
    await expectIntact(touch);
    assert.equal(await touch.locator('#node-id').textContent(), nodeCode(node.seed));
    await touch.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    canvases.push(await touch.locator('#specimen').evaluate((canvas) => canvas.toDataURL()));
    await screenshot(touch, `touch-specimen-${node.seed}`);
  }
  assert.equal(new Set(canvases).size, NODES.length);
  assert.deepEqual(touchErrors, []);

  const savedBench = await browser.newPage({ viewport: { width: 380, height: 780 } });
  const saveErrors = await setUp(savedBench);
  await trace(savedBench, 0.31, 0.69);
  await trace(savedBench, 0.43, 0.54, (t) => offset(SEAM[Math.round(t * TUNING.seamSegments)], 17));
  const key = 'aurelac.workbench.v1';
  const before = await savedBench.evaluate((key) => {
    const saved = JSON.parse(localStorage.getItem(key));
    saved.blade.wear = 0.96;
    localStorage.setItem(key, JSON.stringify(saved));
    return saved;
  }, key);
  assert.ok(before.specimen.nicks.length);
  await savedBench.reload();
  await expectStatus(savedBench, 'Harvest resumed');
  assert.ok(Number(await savedBench.locator('#blade-flat').getAttribute('opacity')) > 0.7);
  await drag(savedBench, seamPoint(0.69), seamPoint(0.74), 4);
  await expectStatus(savedBench, 'bunches under the blade');
  await selectTool(savedBench, 'Stone');
  const y = (STONE.top + STONE.bottom) / 2;
  await drag(savedBench, { x: 105, y }, { x: 263, y });
  await drag(savedBench, { x: 263, y }, { x: 105, y });
  await drag(savedBench, { x: 105, y }, { x: 263, y });
  await expectStatus(savedBench, 'draws cleanly again');
  const after = await savedBench.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
  assert.equal(after.blade.wear, 0);
  assert.deepEqual(after.specimen.nicks, before.specimen.nicks);
  assert.deepEqual(after.specimen.cut, before.specimen.cut);
  await selectTool(savedBench, 'Blade');
  await trace(savedBench, 0.63, 0.92);
  await expectStatus(savedBench, 'Pink tissue is exposed');
  assert.deepEqual(saveErrors, []);

  const feedbackBench = await browser.newPage({ viewport: { width: 375, height: 780 } });
  await feedbackBench.addInitScript(() => {
    window.feedbackCalls = { sound: 0, haptics: 0 };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      window.feedbackCalls.sound++;
      return Reflect.apply(start, this, args);
    };
    Object.defineProperty(navigator, 'vibrate', { value: () => { window.feedbackCalls.haptics++; } });
  });
  const feedbackErrors = await setUp(feedbackBench);
  assert.deepEqual(await feedbackBench.evaluate(() => window.feedbackCalls), { sound: 0, haptics: 0 });
  await feedbackBench.getByRole('button', { name: 'Field guide' }).click();
  assert.equal(await feedbackBench.getByRole('checkbox', { name: 'Sound' }).isChecked(), true);
  assert.equal(await feedbackBench.getByRole('checkbox', { name: 'Haptics' }).isChecked(), true);
  await feedbackBench.locator('#guide').getByRole('button', { name: 'Close' }).click();
  await trace(feedbackBench, 0.34, 0.68);
  await expectStatus(feedbackBench, 'Pink tissue is exposed');
  await feedbackBench.waitForFunction(() => window.feedbackCalls.sound > 0 && window.feedbackCalls.haptics > 0);
  await feedbackBench.getByRole('button', { name: 'Field guide' }).click();
  for (const name of ['Sound', 'Haptics']) {
    await feedbackBench.getByRole('checkbox', { name }).uncheck();
  }
  await feedbackBench.locator('#guide').getByRole('button', { name: 'Close' }).click();
  const beforeMute = await feedbackBench.evaluate(() => window.feedbackCalls);
  await trace(feedbackBench, 0.63, 0.9);
  assert.deepEqual(await feedbackBench.evaluate(() => window.feedbackCalls), beforeMute);
  await feedbackBench.reload();
  await feedbackBench.getByRole('button', { name: 'Field guide' }).click();
  assert.equal(await feedbackBench.getByRole('checkbox', { name: 'Sound' }).isChecked(), false);
  assert.equal(await feedbackBench.getByRole('checkbox', { name: 'Haptics' }).isChecked(), false);
  assert.deepEqual(feedbackErrors, []);

  const replay = await browser.newPage({ viewport: { width: 375, height: 800 }, isMobile: true, hasTouch: true });
  const replayErrors = await setUp(replay, '/', true);
  const savedSpecimen = () => replay.evaluate(() => JSON.parse(localStorage.getItem('aurelac.workbench.v1')).specimen);
  const session = await replay.context().newCDPSession(replay);
  const touchReplay = (positions, result) => touchPath(replay,
    (type, touchPoints) => session.send('Input.dispatchTouchEvent', { type, touchPoints }), positions, result);
  const fresh = await savedSpecimen();
  const { seam, anchors } = layoutFor(fresh);
  assert.ok(Number.isInteger(fresh.layoutSeed));
  await expectIntact(replay);
  await screenshot(replay, 'touch-generated-crease');
  await touchReplay(seam.slice(12, 55), 'Pink tissue is exposed');
  const cut = await savedSpecimen();
  await replay.reload();
  assert.equal((await savedSpecimen()).layoutSeed, fresh.layoutSeed);
  assert.deepEqual((await savedSpecimen()).cut, cut.cut);

  for (let front = 0; front < anchors.length; front = anchors[front].end) {
    const { end, direction } = anchors[front];
    await selectTool(replay, 'Diffuser', 'touch');
    await touchReplay(seam.slice(19, 47), 'fold is glossy');
    await selectTool(replay, 'Grip', 'touch');
    const wetted = await savedSpecimen();
    assert.equal(peelFront(wetted), front);
    const handle = peelHandle(wetted);
    const pulls = Array.from({ length: 16 }, (_, index) => ({
      x: handle.x + direction.x * 64 * index / 15, y: handle.y + direction.y * 64 * index / 15,
    }));
    await screenshot(replay, `touch-generated-fold-${front}`);
    await touchReplay(pulls, end === anchors.length ? 'membrane is free' : 'One section came free');
  }
  await expectCleanLobe(replay);
  await replay.getByRole('button', { name: 'Reset node' }).click();
  await expectIntact(replay);
  const next = await savedSpecimen();
  assert.notDeepEqual(layoutFor(next).seam, seam);
  assert.notDeepEqual(layoutFor(next).anchors, anchors);
  await screenshot(replay, 'touch-generated-next-crease');
  assert.deepEqual(replayErrors, []);
  console.log(`Passed generated touch anatomy, original harvest regressions, reload, collection, sharpening and feedback in Chromium ${browser.version()}.`);
} finally {
  await browser.close();
}
