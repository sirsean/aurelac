import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { ATTACHMENTS, BOARD, TUNING, seamPoint } from '../src/geometry.js';
import { BLISTER_TIMING, CASE_CENTER, PEARL_CENTER, blisterFold, createHarvest, openBlisters } from '../src/harvest.js';
import { beginGesture, createSpecimen, moveGesture } from '../src/specimen.js';

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

async function expectSplash(page) {
  const contact = await boardPoint(page, pinkSurface(0.5));
  await page.mouse.move(contact.x, contact.y);
  await page.mouse.down();
  try {
    const changed = await page.evaluate(async () => {
      const canvas = document.querySelector('#specimen');
      const ctx = canvas.getContext('2d');
      const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      const capture = () => ctx.getImageData(canvas.width * 0.38, canvas.height * 0.42,
        canvas.width * 0.3, canvas.height * 0.24).data;
      await frame();
      const first = capture();
      await frame();
      await frame();
      return capture().some((value, index) => value !== first[index]);
    });
    assert.ok(changed, 'the diffuser should animate while held still on the membrane');
    await screenshot(page, 'desktop-diffuser-splash');
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

async function setUp(page, route = '/') {
  const problems = [];
  page.on('pageerror', (error) => problems.push(error.message));
  assert.equal((await page.goto(new URL(route, baseUrl).href)).status(), 200);
  await page.getByRole('heading', { name: 'Harvest bench' }).waitFor();
  return problems;
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
  return harvest.blisters;
}

async function drag(page, start, end, steps = 9) {
  const from = await boardPoint(page, start);
  const to = await boardPoint(page, end);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

async function settled(page, opened, index) {
  await page.waitForFunction(({ opened, index, cycle, slack, stagger }) =>
    (performance.now() - opened + stagger * index) % cycle < slack * 0.42,
  { opened, index, ...BLISTER_TIMING }, { timeout: BLISTER_TIMING.cycle + 1300 });
}

async function harvestPearl(page, strokes, opened, outcome) {
  const blisters = blistersFor(strokes);
  for (const blister of blisters) {
    await selectTool(page, 'Blade');
    if (outcome === 'Flawed' && blister.index === 1) {
      const { x, y } = blister.center;
      await drag(page, { x, y: y - 14 }, { x, y: y + 5 });
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
    await drag(page, blister.center, { x: blister.center.x, y: blister.center.y - 36 });
    await expectStatus(page, blister.index === 2 ? 'The root pearl is exposed' : 'The blister is free');
  }

  await selectTool(page, 'Fazer');
  const center = await boardPoint(page, PEARL_CENTER);
  await page.mouse.click(center.x, center.y);
  await selectTool(page, 'Grip');
  await drag(page, PEARL_CENTER, { x: PEARL_CENTER.x + 43, y: PEARL_CENTER.y });
  await page.getByRole('button', { name: 'Work light' }).click();
  await expectStatus(page, 'hazy patch');
  await selectTool(page, 'Fazer');
  await page.mouse.click(center.x, center.y);
  await selectTool(page, 'Grip');
  for (let turn = 0; turn < 3; turn++) {
    await drag(page, PEARL_CENTER, { x: PEARL_CENTER.x + 77, y: PEARL_CENTER.y });
  }
  await expectStatus(page, 'spread across the surface');
  await selectTool(page, 'Case');
  await drag(page, PEARL_CENTER, CASE_CENTER);
  await expectStatus(page, 'sits flat');
  await page.getByRole('button', { name: 'Close case' }).click();
  assert.equal(await page.locator('#appraisal-outcome').textContent(), outcome);
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

  await page.setViewportSize({ width: 320, height: 640 });
  await page.getByRole('button', { name: 'Reset node' }).click();
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

  async function swipe(positions, result) {
    const samples = await Promise.all(positions.map((position) => boardPoint(touch, position)));
    await send('touchStart', [samples[0]]);
    for (const sample of samples.slice(1)) await send('touchMove', [sample]);
    if (result) await expectStatus(touch, result);
    await send('touchEnd', []);
  }

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
  await expectCleanLobe(touch);
  await screenshot(touch, 'touch-clean-peel');
  const { center } = blistersFor([[0.34, 0.68], [0.63, 0.91]])[1];
  await selectTool(touch, 'Blade', 'touch');
  await swipe([
    { x: center.x, y: center.y - 13 },
    { x: center.x, y: center.y + 13 },
    { x: center.x, y: center.y - 13 },
  ], 'Poison gas dissolves');
  await screenshot(touch, 'touch-ruined');
  await touch.getByRole('button', { name: 'Record loss' }).click();
  assert.equal(await touch.locator('#appraisal-outcome').textContent(), 'Ruined');
  await touch.getByRole('button', { name: 'Reset node' }).click();
  await expectIntact(touch);
  assert.deepEqual(touchErrors, []);
  console.log(`Passed peel regressions and pristine, flawed, and ruined harvests in Chromium ${browser.version()}.`);
} finally {
  await browser.close();
}
