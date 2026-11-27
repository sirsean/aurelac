import { gradient, oval, stroke } from './canvas.js';
import { BOARD, between, clamp, distance, mix, point } from './geometry.js';
import { CASE_CENTER, PEARL_CENTER, RUPTURE_DURATION, blisterFold, blisterPose, casePlacement, readyToLift } from './harvest.js';
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
  const { settled, swell, slackLeft } = blisterPose(blister, time);
  const open = readyToLift(blister);
  const pressure = reducedMotion || open || detached ? 0 : swell;
  const slack = settled ? mix(0.52, 1, clamp(slackLeft / 155)) : 0;
  const length = 17 + pressure * 3.1;
  const width = 12 + pressure * 4.5;
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

  if (!settled && !open && !detached) {
    span(ctx, blisterFold(blister, 0.06), blisterFold(blister, 0.94), '#7b4937b6', 1.15);
  }

  for (let index = 0; index < cut.length && !detached; index++) {
    const start = blisterFold(blister, index / cut.length);
    const end = blisterFold(blister, (index + 1) / cut.length);
    if (!settled && !cut[index]) continue;
    span(ctx, start, end, '#412a26', cut[index] ? 4.1 : 1.35 + slack * 1.55);
    const previousAlpha = ctx.globalAlpha;
    if (!cut[index]) ctx.globalAlpha *= blister.foldContrast * slack;
    const lip = cut[index] ? 1.8 : 1.1 + slack * 1.9;
    span(ctx, point(start.x + axis.y * lip, start.y - axis.x * lip),
      point(end.x + axis.y * lip, end.y - axis.x * lip), cut[index] ? '#efbc85' : '#fff0c7', 1.25 + slack * 0.8);
    ctx.globalAlpha = previousAlpha;
  }
  if (acid >= 10) {
    oval(ctx, center.x + 2, center.y + 3, 7, 11,
      gradient(ctx, center.x + 2, center.y + 3, 12, [[0, '#d5d989cc'], [1, '#d5d98900']]), angle);
  }
}

function ease(time, start, end) {
  const fraction = clamp((time - start) / (end - start));
  return fraction * fraction * (3 - 2 * fraction);
}

export function rupturePose(harvest, time, reducedMotion) {
  const { rupture, blisters } = harvest;
  const culprit = blisters[rupture.blister];
  const complete = reducedMotion || harvest.stage === 'stored';
  const elapsed = complete ? RUPTURE_DURATION : clamp(time - rupture.at, 0, RUPTURE_DURATION);
  return {
    elapsed, culprit, frozenAt: rupture.at,
    wound: rupture.wound ?? blisterFold(culprit, 0.5),
    collapse: ease(elapsed, 40, 1280),
    slump: ease(elapsed, 360, 2200),
    stripped: ease(elapsed, 760, 1700),
    melt: ease(elapsed, 1660, 4390),
    active: elapsed < RUPTURE_DURATION,
  };
}

const tear = new Path2D('M-12 1 -7-2 -4-1 -1-5 3-2 7-3 12-1 6 2 2 2 -1 4 -6 2Z');

function drawDeflatingBlister(ctx, blister, pocket, failure, reducedMotion) {
  const { center, axis } = blister;
  const ruptured = blister === failure.culprit;
  const amount = ruptured ? failure.collapse : failure.slump * 0.48;
  const angle = Math.atan2(axis.y, axis.x);
  const retreat = failure.slump * (10 + (1 - clamp(distance(center, pocket) / 65)) * 11);
  const fromPocket = Math.max(10, distance(center, pocket));
  const x = center.x + (center.x - pocket.x) * retreat / fromPocket;
  const y = center.y + (center.y - pocket.y) * retreat / fromPocket;
  ctx.save();
  ctx.translate(x, y + 2 * amount);
  ctx.rotate(angle);
  ctx.scale(1 - 0.3 * amount, 1 - 0.77 * amount);
  ctx.rotate(-angle);
  ctx.translate(-center.x, -center.y);
  drawBlister(ctx, blister, failure.frozenAt, reducedMotion);
  ctx.restore();

  if (ruptured && failure.collapse > 0) {
    ctx.save();
    const wound = between(failure.wound, { x, y }, failure.collapse * 0.86);
    ctx.translate(wound.x, wound.y);
    ctx.rotate(angle);
    ctx.scale(0.45 + failure.collapse * 0.55, 0.5 + failure.collapse * 0.22);
    ctx.globalAlpha = failure.collapse;
    ctx.fillStyle = '#322320';
    ctx.fill(tear);
    stroke(ctx, tear, '#b67855', 0.85);
    ctx.restore();
  }
}

const plumes = [
  { start: 130, duration: 1370, drift: -16, rise: 22, size: 25, fade: 0.66 },
  { start: 290, duration: 2080, drift: 17, rise: 45, size: 48, fade: 0.6 },
  { start: 530, duration: 2780, drift: -38, rise: 61, size: 62, fade: 0.69 },
  { start: 840, duration: 3150, drift: 30, rise: 71, size: 63, fade: 0.65 },
  { start: 1110, duration: 3130, drift: -17, rise: 46, size: 54, fade: 0.65 },
  { start: 1570, duration: 3270, drift: 31, rise: 59, size: 62, fade: 0.47 },
  { start: 2020, duration: 3000, drift: -28, rise: 38, size: 42, fade: 0.37 },
];

export function drawRuptureGas(ctx, pocket, failure) {
  for (const [index, plume] of plumes.entries()) {
    const progress = clamp((failure.elapsed - plume.start) / plume.duration);
    if (progress === 0 || progress === 1) continue;
    const spread = Math.sqrt(progress);
    const origin = between(failure.wound, pocket, clamp((index - 2) / 5));
    const x = origin.x + plume.drift * spread + Math.sin(progress * 7 + index) * 7 * spread;
    const y = origin.y - plume.rise * progress + Math.sin(progress * 4 + index) * 4 * spread;
    const radius = 4 + plume.size * spread;
    const opacity = Math.sin(progress ** 0.54 * Math.PI) * plume.fade;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.22);
    ctx.scale(1, 0.68);
    oval(ctx, 0, 0, radius, radius, gradient(ctx, 0, 0, radius, [
      [0, `rgba(211, 209, 140, ${opacity})`],
      [0.38, `rgba(165, 172, 100, ${opacity * 0.8})`],
      [1, '#8b9a5a00'],
    ]));
    ctx.restore();
  }
}

const residue = new Path2D('M-24 0C-20-4-12-3-8-6C-3-9 4-6 11-6C17-7 24-4 24-1C24 3 18 7 12 5C7 4 4 8-3 8C-10 7-15 4-20 4Q-26 4-24 0Z');

function drawPearlResidue(ctx, { x, y }, melt) {
  if (melt <= 0) return;
  ctx.save();
  ctx.translate(x + 1, y + 11);
  ctx.rotate(-0.14);
  ctx.scale(0.24 + 0.79 * melt, 0.47 + 0.53 * melt);
  ctx.fillStyle = gradient(ctx, -2, -1, 26, [
    [0, '#726244'], [0.54, '#4b3b2b'], [1, '#292520'],
  ]);
  ctx.fill(residue);
  oval(ctx, -5, -2, 9, 2.1, '#b8996583', -0.12);
  oval(ctx, 11, 2, 2.1, 1.2, '#a38a5f73', 0.2);
  ctx.restore();
}

export function drawBlisters(ctx, harvest, gesture, time, reducedMotion, debug, failure) {
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
  const revealed = (opened + (gesture?.preview ? 0.44 : 0)) / harvest.blisters.length;
  const amount = failure ? mix(revealed, 0.94, failure.slump) : revealed;
  if (amount > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x + 7 * (1 - amount), y - 4, 12 + amount * 30, 10 + amount * 32, 0.28, 0, circle);
    ctx.clip();
    if (failure) drawPearlResidue(ctx, harvest.pocket, failure.melt);
    drawPearl(ctx, harvest, harvest.pocket, 0.82, failure);
    ctx.restore();
  }
  for (const blister of harvest.blisters) {
    if (blister.removed || (gesture?.blister === blister && gesture.preview)) continue;
    if (failure) drawDeflatingBlister(ctx, blister, harvest.pocket, failure, reducedMotion);
    else drawBlister(ctx, blister, time, reducedMotion);
    if (debug && !failure) {
      ctx.font = '9px monospace';
      ctx.fillStyle = '#fff4d4';
      ctx.fillText(blisterPose(blister, time).settled ? 'slack' : 'swell', blister.center.x - 11, blister.center.y + 23);
    }
  }
  return failure ? failure.active : harvest.blisters.some(({ removed, cut }) => !removed && cut.some((item) => !item));
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

function drawCase(ctx, closed, scale, supported) {
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
    oval(ctx, 0, supported ? 1 : 0, recess, recess, gradient(ctx, -3, -10, 55, [
      [0, supported ? '#191e1a' : '#242b25'], [0.6, '#323c31'], [1, '#82906d'],
    ]));
    const rim = new Path2D();
    rim.arc(0, 0, recess + 2, 0, circle);
    stroke(ctx, rim, supported ? '#d0c39c' : '#a6a585ad', supported ? 2.3 : 2);
  }
  span(ctx, point(-8, 48), point(8, 48), '#b6a882', 3);
  ctx.restore();
}

export function drawPearlBench(ctx, harvest, gesture) {
  if (harvest.light) {
    oval(ctx, PEARL_CENTER.x, PEARL_CENTER.y, 106, 90,
      gradient(ctx, PEARL_CENTER.x, PEARL_CENTER.y, 110, [[0, '#fff0b666'], [1, '#ffebaa00']]));
  }

  const held = gesture?.tool === 'case' ? gesture.preview : null;
  const supported = held ? casePlacement(held) === 'seated' : harvest.placement === 'seated';
  drawCase(ctx, harvest.stage === 'stored', harvest.pearl.scale, supported);
  const location = harvest.stage === 'stored' ? PEARL_CENTER
    : held && supported ? between(held, CASE_CENTER, 0.78) : held ?? harvest.pearl.position;
  drawPearl(ctx, harvest, location);

  if (harvest.stage === 'pearl' && harvest.placement === 'rim' && !gesture?.preview) {
    const { x, y } = location;
    span(ctx, point(x - 38, y + 10), point(x - 34, y + 16), '#d8c59eb4', 1.6);
    span(ctx, point(x + 34, y + 4), point(x + 39, y - 2), '#d8c59eb4', 1.6);
  }
}
