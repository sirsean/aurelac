import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { ATTACHMENTS, BOARD, PEEL_DIRECTION, seamPoint } from '../src/geometry.js';

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

async function selectTool(page, name) {
  const button = page.getByRole('button', { name, exact: true });
  await button.click();
  assert.equal(await button.getAttribute('aria-pressed'), 'true');
}

async function trace(page, from, to, steps = 24) {
  const start = await boardPoint(page, seamPoint(from));
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let index = 1; index <= steps; index++) {
    const cursor = await boardPoint(page, seamPoint(from + (to - from) * index / steps));
    await page.mouse.move(cursor.x, cursor.y);
  }
  await page.mouse.up();
}

function handle(index = 0) {
  return { x: ATTACHMENTS[index].x - 8, y: ATTACHMENTS[index].y + 10 };
}

function target(distance, index = 0) {
  const start = handle(index);
  return { x: start.x + distance * PEEL_DIRECTION.x, y: start.y + distance * PEEL_DIRECTION.y };
}

async function startPeel(page, distance, index = 0) {
  const from = await boardPoint(page, handle(index));
  const to = await boardPoint(page, target(distance, index));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 18 });
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
  for (const tool of await page.locator('[data-tool]').all()) {
    const box = await tool.boundingBox();
    assert.ok(box.height >= 44 && box.width >= 44);
  }
}

try {
  await mkdir('playtest-results', { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const desktopErrors = await setUp(page);
  await checkFit(page);
  await screenshot(page, 'desktop-intact');
  await page.getByRole('button', { name: 'Field guide' }).click();
  assert.ok(await page.getByRole('dialog').isVisible());
  await page.getByRole('button', { name: 'Close' }).click();
  assert.ok(await page.getByRole('dialog').isHidden());

  await trace(page, 0.34, 0.68);
  await selectTool(page, 'Diffuser');
  await trace(page, 0.37, 0.67);
  await selectTool(page, 'Grip');
  await startPeel(page, 57);
  await screenshot(page, 'desktop-caught');
  assert.match(await page.getByRole('status').textContent(), /shines/);
  await page.mouse.up();
  await selectTool(page, 'Blade');
  await trace(page, 0.64, 0.99);
  await selectTool(page, 'Grip');
  await startPeel(page, 85);
  await page.mouse.up();
  assert.match(await page.locator('#bench-note').textContent(), /came free/);
  await screenshot(page, 'desktop-clean-peel');

  await page.setViewportSize({ width: 320, height: 640 });
  await page.getByRole('button', { name: 'Reset node' }).click();
  await checkFit(page);
  await screenshot(page, 'narrow-intact');
  assert.deepEqual(desktopErrors, []);

  const touch = await browser.newPage({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3,
  });
  const touchErrors = await setUp(touch, '/?playtest=starter');
  await checkFit(touch);
  assert.equal(await touch.getByRole('button', { name: 'Grip' }).getAttribute('aria-pressed'), 'true');
  assert.ok(await touch.getByRole('button', { name: 'Field guide' }).isHidden());
  const cdp = await touch.context().newCDPSession(touch);
  const first = await boardPoint(touch, handle());
  const second = await boardPoint(touch, { x: 256, y: 259 });
  const safePull = await boardPoint(touch, target(56));
  const forcedPull = await boardPoint(touch, target(143));
  const send = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  await send('touchStart', [{ ...first, id: 1 }]);
  await send('touchStart', [{ ...first, id: 1 }, { ...second, id: 2 }]);
  await send('touchMove', [{ ...safePull, id: 1 }, { ...second, id: 2 }]);
  await screenshot(touch, 'touch-caught');
  await send('touchCancel', []);
  assert.match(await touch.getByRole('status').textContent(), /Starter slit restored/);

  await send('touchStart', [{ ...first, id: 3 }]);
  await send('touchMove', [{ ...forcedPull, id: 3 }]);
  await send('touchEnd', []);
  assert.match(await touch.getByRole('status').textContent(), /tears/);
  await screenshot(touch, 'touch-tear');

  // Reproduce the recovery on the same specimen after resizing while the blade is down.
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
  assert.match(await touch.getByRole('status').textContent(), /tears/);
  await trace(touch, 0.63, 0.99);
  await selectTool(touch, 'Diffuser');
  await trace(touch, 0.34, 0.69);
  await selectTool(touch, 'Grip');
  await startPeel(touch, 86, 1);
  await touch.mouse.up();
  assert.match(await touch.locator('#bench-note').textContent(), /remnant remains/);
  await screenshot(touch, 'touch-exposed-with-remnant');
  await touch.getByRole('button', { name: 'Reset node' }).click();
  assert.match(await touch.getByRole('status').textContent(), /Starter slit restored/);
  assert.deepEqual(touchErrors, []);
  console.log(`Passed desktop pointer, 320px layout, mobile touch and two-finger interruption in Chromium ${browser.version()}.`);
} finally {
  await browser.close();
}
