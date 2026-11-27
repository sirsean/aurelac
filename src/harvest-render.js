import { gradient, oval, stroke } from './canvas.js';
import { BOARD, clamp, point } from './geometry.js';
import { CASE_CENTER, PEARL_CENTER, blisterFold, blisterPose, readyToLift } from './harvest.js';
import { drawPearl } from './pearl-render.js';

const circle = 2 * Math.PI;

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
