import { BOARD, clamp, point, randomFrom } from './geometry.js';
import { CASE_CENTER, PEARL_CENTER, blisterFold, blisterPose, readyToLift } from './harvest.js';

const circle = 2 * Math.PI;
const pearl = new Path2D('M-31-5C-33-19-17-32-2-31C12-34 26-23 29-10C34 5 25 25 11 28C-2 34-20 28-26 16C-31 9-33 4-31-5Z');

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

export function drawBlisters(ctx, harvest, time, reducedMotion, debug) {
  ctx.fillStyle = '#4d332b';
  ctx.fillRect(0, 0, BOARD.width, BOARD.height);
  for (const blister of harvest.blisters) {
    if (blister.removed) continue;
    const { center, cut, acid } = blister;
    const { settled, swell } = blisterPose(blister, time);
    const open = readyToLift(blister);
    const width = 18 + (reducedMotion ? 0 : swell * 3);
    const height = 24 + (reducedMotion ? 0 : swell * 3);
    oval(ctx, center.x + (open ? 4 : 1), center.y + 4, width + 2, height, '#352421aa', -0.25);
    const color = gradient(ctx, center.x - 5, center.y - 10, 37, [
      [0, settled ? '#edac74' : '#d77d59'], [0.6, '#b36e47'], [1, '#6b3b32'],
    ]);
    oval(ctx, center.x, center.y, width, height, color, -0.25);

    const ridge = new Path2D();
    ridge.moveTo(center.x - 12, center.y - 11);
    ridge.quadraticCurveTo(center.x - 8, center.y - 21, center.x + 4, center.y - 17);
    stroke(ctx, ridge, settled ? '#ffe0a7a8' : '#efab7999', 1.55);

    for (let index = 0; index < cut.length; index++) {
      const start = blisterFold(blister, index / cut.length);
      const end = blisterFold(blister, (index + 1) / cut.length);
      if (cut[index]) {
        span(ctx, start, end, '#412a26', open ? 5 : 3.7);
        span(ctx, point(start.x + 2, start.y), point(end.x + 2, end.y), '#efbc85', 1.2);
      } else if (settled) {
        span(ctx, start, end, '#643d33', 1.7);
        span(ctx, point(start.x + 1.8, start.y), point(end.x + 1.8, end.y), '#f7c999', 1.3);
      }
    }
    if (acid >= 10) {
      oval(ctx, center.x + 2, center.y + 3, 7, 11,
        gradient(ctx, center.x + 2, center.y + 3, 12, [[0, '#d5d989cc'], [1, '#d5d98900']]), -0.25);
    }
    if (debug) {
      ctx.font = '9px monospace';
      ctx.fillStyle = '#fff4d4';
      ctx.fillText(settled ? 'slack' : 'swell', center.x - 11, center.y + 26);
    }
  }
  return harvest.blisters.some(({ removed, cut }) => !removed && cut.some((item) => !item));
}

function drawCase(ctx, closed) {
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
    oval(ctx, 0, 0, 32, 32, gradient(ctx, -3, -10, 55, [
      [0, '#242b25'], [0.6, '#323c31'], [1, '#82906d'],
    ]));
    const rim = new Path2D();
    rim.arc(0, 0, 34, 0, circle);
    stroke(ctx, rim, '#a6a585ad', 2);
  }
  span(ctx, point(-8, 48), point(8, 48), '#b6a882', 3);
  ctx.restore();
}

function drawPearl(ctx, harvest, position, scale = 1) {
  if (scale <= 0.02) return;
  const { rotation, wet } = harvest.pearl;
  const { light, damage } = harvest;
  const { x, y } = position;
  oval(ctx, x + 3, y + 12 * scale, 33 * scale, 25 * scale, '#242a246d', -0.12);

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.rotate(rotation);
  ctx.fillStyle = gradient(ctx, -8, -12, 49, [
    [0, light ? '#986344' : '#655044'], [0.42, '#42302c'], [0.76, '#201c1b'], [1, '#110f12'],
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
  for (let index = 0; index < wet.length; index++) {
    const start = index * circle / wet.length;
    const end = (index + 1) * circle / wet.length;
    const segment = new Path2D();
    segment.arc(0, 0, wet[index] ? 25 : 19, start + 0.04, end - 0.04);
    stroke(ctx, segment, wet[index] ? '#e2a86cc4' : '#aca69144', wet[index] ? 2.0 : 9);
  }
  for (const { angle } of damage.scars) {
    const x = 21 * Math.cos(angle);
    const y = 21 * Math.sin(angle);
    oval(ctx, x, y, light ? 15 : 12, 8, gradient(ctx, x, y, 14, [
      [0, '#e3d2a7a9'], [0.68, '#b9a38b65'], [1, '#c1976800'],
    ]), angle + Math.PI / 2);
  }
  ctx.restore();
  ctx.rotate(-rotation);
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

  drawCase(ctx, harvest.stage === 'stored');
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
