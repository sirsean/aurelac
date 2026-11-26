import { BOARD, clamp, point, randomFrom } from './geometry.js';
import { CASE_CENTER, COATING_PATCHES, PEARL_CENTER, blisterFold, blisterPose, pearlIsClean, readyToLift } from './harvest.js';

const circle = 2 * Math.PI;
const pearl = new Path2D('M-31-5C-33-19-17-32-2-31C12-34 26-23 29-10C34 5 25 25 11 28C-2 34-20 28-26 16C-31 9-33 4-31-5Z');
const goop = new Path2D('M-1 .1C-1.1-.36-.66-.4-.59-.75C-.33-1.16.17-.79.4-.91C.86-.94.77-.46 1-.23C1.08.07.76.26.76.52C.67.97.31.77.09.93C-.21 1.02-.38.63-.62.71C-.97.67-.84.32-1 .1Z');

function stroke(ctx, path, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke(path);
}

function gradient(ctx, x, y, radius, stops) {
  const color = ctx.createRadialGradient(x, y, 1, x, y, radius);
  for (const [offset, value] of stops) color.addColorStop(offset, value);
  return color;
}

function oval(ctx, x, y, width, height, color, angle = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, width, height, angle, 0, circle);
  ctx.fillStyle = color;
  ctx.fill();
}

function span(ctx, a, b, color, width) {
  const line = new Path2D();
  line.moveTo(a.x, a.y);
  line.lineTo(b.x, b.y);
  stroke(ctx, line, color, width);
}

function drawBlister(ctx, blister, time, reducedMotion, detached = false) {
  const { center, cut, acid, axis } = blister;
  const { settled, swell } = blisterPose(blister, time);
  const open = readyToLift(blister);
  const motion = reducedMotion || open ? 0 : swell * 3;
  const length = 17 + motion;
  const width = 12 + motion;
  const angle = Math.atan2(axis.y, axis.x);
  oval(ctx, center.x + (open ? 3 : 1), center.y + 3, length + 1, width + 1, '#352421aa', angle);
  const color = gradient(ctx, center.x - 5, center.y - 8, 27, [
    [0, settled || detached ? '#edac74' : '#d77d59'], [0.6, '#b36e47'], [1, '#6b3b32'],
  ]);
  oval(ctx, center.x, center.y, length, width, color, angle);
  const ridge = new Path2D();
  ridge.moveTo(center.x - 8, center.y - 3);
  ridge.quadraticCurveTo(center.x - 7, center.y - 11, center.x + 3, center.y - 9);
  stroke(ctx, ridge, '#ffe0a7a8', 1.4);

  for (let index = 0; index < cut.length && !detached; index++) {
    const start = blisterFold(blister, index / cut.length);
    const end = blisterFold(blister, (index + 1) / cut.length);
    if (!settled && !cut[index]) continue;
    span(ctx, start, end, '#412a26', cut[index] ? 4.1 : 1.7);
    const previousAlpha = ctx.globalAlpha;
    if (!cut[index]) ctx.globalAlpha *= blister.foldContrast;
    span(ctx, point(start.x + axis.y * 1.8, start.y - axis.x * 1.8),
      point(end.x + axis.y * 1.8, end.y - axis.x * 1.8), cut[index] ? '#efbc85' : '#f7dbac', 1.3);
    ctx.globalAlpha = previousAlpha;
  }
  if (acid >= 10) {
    oval(ctx, center.x + 2, center.y + 3, 7, 11,
      gradient(ctx, center.x + 2, center.y + 3, 12, [[0, '#d5d989cc'], [1, '#d5d98900']]), angle);
  }
}

export function drawBlisters(ctx, harvest, gesture, time, reducedMotion, debug) {
  const { x, y } = harvest.pocket;
  ctx.fillStyle = gradient(ctx, x - 6, y - 4, 117, [[0, '#85523c'], [0.54, '#644231'], [1, '#3c2a26']]);
  ctx.fillRect(0, 0, BOARD.width, BOARD.height);
  for (const direction of [-1, 1]) {
    for (let index = 0; index < 7; index++) {
      const seam = new Path2D();
      seam.moveTo(x - 65 + index * 20, y + direction * 65);
      seam.quadraticCurveTo(x - 46 + index * 13, y + direction * 32, x - 24 + index * 8, y + direction * 12);
      stroke(ctx, seam, '#d495704b', 1.45);
    }
  }

  const opened = harvest.blisters.filter(({ removed }) => removed).length;
  if (opened || gesture?.preview) {
    const amount = (opened + (gesture?.preview ? 0.44 : 0)) / harvest.blisters.length;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x + 7 * (1 - amount), y - 4, 12 + amount * 30, 10 + amount * 32, 0.28, 0, circle);
    ctx.clip();
    drawPearl(ctx, harvest, harvest.pocket, 0.82);
    ctx.restore();
  }
  for (const blister of harvest.blisters) {
    if (blister.removed || (gesture?.blister === blister && gesture.preview)) continue;
    drawBlister(ctx, blister, time, reducedMotion);
    if (debug) {
      ctx.font = '9px monospace';
      ctx.fillStyle = '#fff4d4';
      ctx.fillText(blisterPose(blister, time).settled ? 'slack' : 'swell', blister.center.x - 11, blister.center.y + 23);
    }
  }
  return harvest.blisters.some(({ removed, cut }) => !removed && cut.some((item) => !item));
}

export function drawLiftedBlisters(ctx, harvest, gesture, time, reducedMotion) {
  for (const blister of harvest.blisters) {
    const location = gesture?.blister === blister && !blister.removed ? gesture.preview : blister.drop;
    if (!location) continue;
    ctx.save();
    ctx.translate(location.x - blister.center.x, location.y - blister.center.y);
    drawBlister(ctx, blister, time, reducedMotion, true);
    ctx.restore();
  }
}

function drawCase(ctx, closed, scale) {
  const { x, y } = CASE_CENTER;
  ctx.save();
  ctx.translate(x, y);
  const body = new Path2D();
  body.roundRect(-51, -54, 102, 108, 14);
  ctx.translate(3, 5);
  ctx.fillStyle = '#29302765';
  ctx.fill(body);
  ctx.translate(-3, -5);
  ctx.fillStyle = '#34392d';
  ctx.fill(body);
  stroke(ctx, body, '#272a22', 2.4);

  const inset = new Path2D();
  inset.roundRect(-43, -46, 86, 92, 10);
  ctx.fillStyle = closed ? '#59624e' : '#55594b';
  ctx.fill(inset);
  stroke(ctx, inset, '#9a9b7a', 1.2);
  if (!closed) {
    const recess = Math.max(27, 32 * scale);
    oval(ctx, 0, 0, recess, recess, gradient(ctx, -3, -10, 55, [
      [0, '#242b25'], [0.6, '#323c31'], [1, '#82906d'],
    ]));
    const rim = new Path2D();
    rim.arc(0, 0, recess + 2, 0, circle);
    stroke(ctx, rim, '#a6a585ad', 2);
  }
  span(ctx, point(-8, 48), point(8, 48), '#b6a882', 3);
  ctx.restore();
}

function drawCoating(ctx, coating) {
  for (const [index, patch] of COATING_PATCHES.entries()) {
    const { amount, treated } = coating[index];
    if (!amount) continue;
    const radius = patch.radius * Math.sqrt(amount);
    ctx.save();
    ctx.translate(patch.x, patch.y);
    ctx.rotate(index * 0.94);
    ctx.scale(radius, radius);
    ctx.globalAlpha = Math.min(1, amount * 1.75);
    const fill = ctx.createLinearGradient(-0.5, -0.7, 0.4, 0.9);
    fill.addColorStop(0, treated ? '#a1e9cc' : '#be9a58');
    fill.addColorStop(0.52, treated ? '#619f8d' : '#907044');
    fill.addColorStop(1, treated ? '#3c6d63' : '#584132');
    ctx.fillStyle = fill;
    ctx.fill(goop);
    stroke(ctx, goop, treated ? '#466e63bb' : '#624d35aa', 0.055);
    const reflection = new Path2D('M-.68-.14C-.45-.55-.11-.39.27-.59');
    stroke(ctx, reflection, treated ? '#dcf7ddb0' : '#d5bd8289', 0.09);
    ctx.restore();
  }
}

function drawPearl(ctx, harvest, position, scale = 1) {
  scale *= harvest.pearl.scale;
  if (scale <= 0.02) return;
  const { rotation, coating } = harvest.pearl;
  const { light, damage } = harvest;
  const { x, y } = position;
  oval(ctx, x + 3, y + 12 * scale, 33 * scale, 25 * scale, '#242a246d', -0.12);

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.rotate(rotation);
  const amber = harvest.intrinsic.amberDepth;
  const litAmber = amber >= 85 ? '#b67c4d' : amber < 70 ? '#84634d' : '#986344';
  ctx.fillStyle = gradient(ctx, -8, -12, 49, [
    [0, light ? litAmber : '#655044'], [0.42, '#42302c'], [0.76, '#201c1b'], [1, '#110f12'],
  ]);
  ctx.fill(pearl);
  stroke(ctx, pearl, '#211816', 2.3);

  ctx.save();
  ctx.clip(pearl);
  const random = randomFrom(391);
  for (let index = 0; index < 82; index++) {
    const x = (random() - 0.5) * 66;
    const y = (random() - 0.5) * 66;
    oval(ctx, x, y, 0.6 + random(), 0.44, light ? '#d4945b55' : '#8d766245', random() * circle);
  }
  for (const { angle } of damage.scars) {
    const x = 21 * Math.cos(angle);
    const y = 21 * Math.sin(angle);
    oval(ctx, x, y, light ? 15 : 12, 8, gradient(ctx, x, y, 14, [
      [0, '#e3d2a7a9'], [0.68, '#b9a38b65'], [1, '#c1976800'],
    ]), angle + Math.PI / 2);
  }
  drawCoating(ctx, coating);
  ctx.restore();
  ctx.rotate(-rotation);
  ctx.globalAlpha = pearlIsClean(harvest) ? 1 : 0.24;
  oval(ctx, -10, -16, light ? 10 : 5.5, light ? 3.8 : 2.1, '#f8e0bfdf', -0.5);
  oval(ctx, 2, -19, 2.0, 1.2, '#f5e2d3aa', -0.4);
  ctx.restore();
}

function drawRupture(ctx, harvest, time, reducedMotion) {
  const elapsed = reducedMotion ? 1400 : time - harvest.rupture.at;
  const melt = clamp((elapsed - 280) / 1000);
  const { x, y } = PEARL_CENTER;
  drawPearl(ctx, harvest, PEARL_CENTER, 1 - melt);
  if (melt > 0) {
    oval(ctx, x + 1, y + 9, 17 * melt, 6 * melt, '#544238', -0.12);
    oval(ctx, x - 4, y + 7, 7 * melt, 2.2 * melt, '#9b7852', -0.15);
  }
  const mist = clamp(elapsed / 700);
  const glow = (1 - clamp((elapsed - 680) / 1150)) * 0.72;
  if (glow > 0) {
    for (let index = 0; index < 7; index++) {
      const radius = 13 + mist * (13 + index * 2);
      const px = x + Math.sin(index * 2.2) * (14 + mist * 30);
      const py = y + Math.cos(index * 1.7) * 19 - mist * (7 + index * 3);
      oval(ctx, px, py, radius, radius * 0.76,
        gradient(ctx, px, py, radius, [[0, `rgba(185,195,120,${glow})`], [1, '#a6ac6500']]));
    }
  }
  return !reducedMotion && elapsed < 1850;
}

export function drawPearlBench(ctx, harvest, gesture, time, reducedMotion) {
  if (harvest.light) {
    oval(ctx, PEARL_CENTER.x, PEARL_CENTER.y, 106, 90,
      gradient(ctx, PEARL_CENTER.x, PEARL_CENTER.y, 110, [[0, '#fff0b666'], [1, '#ffebaa00']]));
  }

  drawCase(ctx, harvest.stage === 'stored', harvest.pearl.scale);
  if (harvest.rupture) return drawRupture(ctx, harvest, time, reducedMotion);
  const location = harvest.stage === 'stored'
    ? PEARL_CENTER
    : gesture?.preview ?? harvest.pearl.position;
  drawPearl(ctx, harvest, location);

  if (harvest.stage === 'pearl' && harvest.placement === 'rim' && !gesture?.preview) {
    const { x, y } = location;
    span(ctx, point(x - 38, y + 10), point(x - 34, y + 16), '#d8c59eb4', 1.6);
    span(ctx, point(x + 34, y + 4), point(x + 39, y - 2), '#d8c59eb4', 1.6);
  }
  return false;
}
