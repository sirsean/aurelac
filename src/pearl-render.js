import { gradient, oval, stroke } from './canvas.js';
import { mix, randomFrom } from './geometry.js';
import { COATING_PATCHES } from './harvest.js';

const styles = {
  honey: {
    name: 'Honey amber',
    outline: new Path2D('M-31-5C-34-17-21-29-8-31C5-35 23-25 28-15C35-4 31 12 22 22C14 31 2 32-9 29C-21 28-28 17-31 5Z'),
    shell: ['#f1c36e', '#b97830', '#613b24', '#2d201d'],
    core: ['#ecc16a', '#9b4729', '#aa512b00'],
    flash: '#fff0c7', ink: '#3f2922', facets: 0.47,
  },
  cloud: {
    name: 'Cloud white',
    outline: new Path2D('M-28-15Q-24-19-17-22L-10-30Q-7-33-2-32L15-29Q20-28 23-23L31-8Q34 2 29 13L21 24Q17 29 10 30L-11 27Q-18 26-21 22L-30 10Q-33 5-32-2Z'),
    shell: ['#f7f0d9', '#c3cbbb', '#849695', '#3f5356'],
    core: ['#ffefd0', '#d0a160', '#dbaf6700'],
    flash: '#fffbed', ink: '#334348', facets: 0.75,
  },
  violet: {
    name: 'Smoky violet',
    outline: new Path2D('M-32-8Q-31-13-26-18L-13-29Q-10-32-5-31L12-29L23-22Q26-20 27-16L32-5Q33 0 31 5L26 17L15 27Q12 31 7 31L-9 29L-23 23Q-27 21-28 17L-32 8Z'),
    shell: ['#c4a0c4', '#8b6398', '#503958', '#261d32'],
    core: ['#d6a5a5', '#84455c', '#9f547600'],
    flash: '#f7e4ec', ink: '#2a2035', facets: 1,
  },
};

const faces = [
  { path: new Path2D('M-36-7 -21-30 -6-36 8-18 -12-7Z'), normal: -2.25, x: -18, y: -26 },
  { path: new Path2D('M-6-36 24-28 33-8 8-18Z'), normal: -1.2, x: 13, y: -29 },
  { path: new Path2D('M8-18 33-8 36 14 13 13 4 0Z'), normal: -0.28, x: 30, y: -8 },
  { path: new Path2D('M13 13 36 14 20 35 -7 35 -4 18Z'), normal: 0.95, x: 22, y: 25 },
  { path: new Path2D('M-12-7 4 0 -4 18 -7 35 -30 26 -35 5Z'), normal: 2.55, x: -28, y: 8 },
];
const goop = new Path2D('M-1 .1C-1.1-.36-.66-.4-.59-.75C-.33-1.16.17-.79.4-.91C.86-.94.77-.46 1-.23C1.08.07.76.26.76.52C.67.97.31.77.09.93C-.21 1.02-.38.63-.62.71C-.97.67-.84.32-1 .1Z');

export function pearlColorName(pearl) {
  return styles[pearl.color].name;
}

function drawFaces(ctx, style, rotation, light) {
  for (const { path, normal, x, y } of faces) {
    const reflection = (1 + Math.cos(rotation + normal + 2.1)) / 2;
    const shine = reflection ** 4;
    const sheen = ctx.createLinearGradient(x, y, 0, 0);
    sheen.addColorStop(0, style.flash);
    sheen.addColorStop(1, style.shell[1]);
    ctx.fillStyle = style.ink;
    ctx.globalAlpha = style.facets * 0.30 * (1 - reflection);
    ctx.fill(path);
    ctx.fillStyle = sheen;
    ctx.globalAlpha = style.facets * (light ? 0.62 : 0.39) * shine;
    ctx.fill(path);
    ctx.globalAlpha *= shine * 0.7;
    stroke(ctx, path, style.flash, 0.75);
  }
  ctx.globalAlpha = 1;
}

function drawInclusions(ctx, style, pattern, light) {
  const random = randomFrom(pattern);
  ctx.save();
  ctx.translate(mix(-12, 11, random()), mix(-4, 13, random()));
  ctx.rotate(mix(-0.9, 0.7, random()));
  ctx.scale(mix(0.4, 0.66, random()), mix(0.25, 0.45, random()));
  ctx.globalAlpha = light ? 0.85 : 0.64;
  ctx.fillStyle = gradient(ctx, -6, -4, 33, [
    [0, style.core[0]], [0.43, style.core[1]], [1, style.core[2]],
  ]);
  ctx.fill(style.outline);
  ctx.restore();

  for (let index = 0; index < 23; index++) {
    const x = mix(-29, 29, random());
    const y = mix(-29, 29, random());
    ctx.globalAlpha = mix(0.13, 0.31, random());
    oval(ctx, x, y, mix(0.6, 2.1, random()), 0.48, index % 3 ? style.flash : style.ink, random() * Math.PI);
  }
  ctx.globalAlpha = 1;
}

const coatingPigments = {
  highlight: [[190, 154, 88], [161, 233, 204]],
  body: [[144, 112, 68], [97, 159, 141]],
  shadow: [[88, 65, 50], [60, 109, 99]],
};

function coatingColor([amber, green], treatment) {
  const channels = amber.map((channel, index) => Math.round(mix(channel, green[index], treatment)));
  return `rgb(${channels.join(' ')})`;
}

function drawCoating(ctx, coating, stripped) {
  for (const [index, patch] of COATING_PATCHES.entries()) {
    const { treatment } = coating[index];
    const amount = coating[index].amount * (1 - stripped);
    if (!amount) continue;
    const treated = treatment === 1;
    const tint = treated ? 1 : treatment * 0.65;
    const radius = patch.radius * Math.sqrt(amount);
    ctx.save();
    ctx.translate(patch.x, patch.y);
    ctx.rotate(index * 0.94);
    ctx.scale(radius, radius);
    ctx.globalAlpha = Math.min(1, amount * 1.75);
    const fill = ctx.createLinearGradient(-0.5, -0.7, 0.4, 0.9);
    fill.addColorStop(0, coatingColor(coatingPigments.highlight, tint));
    fill.addColorStop(0.52, coatingColor(coatingPigments.body, tint));
    fill.addColorStop(1, coatingColor(coatingPigments.shadow, tint));
    ctx.fillStyle = fill;
    ctx.fill(goop);
    stroke(ctx, goop, treated ? '#466e63bb' : '#624d35aa', 0.055);
    const reflection = new Path2D('M-.68-.14C-.45-.55-.11-.39.27-.59');
    stroke(ctx, reflection, treated ? '#dcf7ddb0' : '#d5bd8289', 0.09);
    ctx.restore();
  }
}

function drawCrystal(ctx, position, { color, pattern, rotation, scale, light, coating, scars = [], failure }) {
  const melt = failure?.melt ?? 0;
  const stripped = failure?.stripped ?? 0;
  if (scale <= 0.02 || melt >= 1) return;
  const style = styles[color];
  const { x, y } = position;
  oval(ctx, x + 3 * scale, y + (11 + 10 * melt) * scale,
    (32 - 14 * melt) * scale, (24 - 17 * melt) * scale, '#211c2866', -0.16);

  ctx.save();
  ctx.translate(x, y + 23 * melt * scale);
  ctx.scale(scale * (1 - 0.46 * melt), scale * (1 - 0.89 * melt));
  ctx.rotate(rotation);
  const lamp = -2.16 - rotation;
  const [pale, body, dark, rim] = style.shell;
  ctx.fillStyle = gradient(ctx, Math.cos(lamp) * 15, Math.sin(lamp) * 15, light ? 53 : 43, [
    [0, pale], [0.39, body], [0.79, dark], [1, rim],
  ]);
  ctx.fill(style.outline);
  stroke(ctx, style.outline, style.ink, 1.9);
  ctx.clip(style.outline);

  drawInclusions(ctx, style, pattern, light);
  drawFaces(ctx, style, rotation, light);
  if (!light) {
    ctx.fillStyle = '#21182036';
    ctx.fillRect(-36, -36, 72, 72);
  }
  for (const { angle } of scars) {
    const x = 21 * Math.cos(angle);
    const y = 21 * Math.sin(angle);
    const facesLight = (1 + Math.cos(angle - lamp)) / 2;
    ctx.globalAlpha = light ? mix(0.62, 1, facesLight) : 0.70;
    oval(ctx, x, y, light ? 15 : 12, 8, gradient(ctx, x, y, 14, [
      [0, '#f5e5b7bf'], [0.68, '#cab98c80'], [1, '#c1976800'],
    ]), angle + Math.PI / 2);
  }
  ctx.globalAlpha = 1;
  if (coating) drawCoating(ctx, coating, stripped);
  if (melt) {
    ctx.fillStyle = `rgba(52, 36, 26, ${0.86 * melt})`;
    ctx.fillRect(-36, -36, 72, 72);
  }

  ctx.rotate(-rotation);
  const sweep = Math.sin(rotation);
  const xGlint = -11 + 8 * sweep;
  const yGlint = -17 - 2 * Math.cos(rotation);
  const glintAngle = Math.atan2(yGlint, xGlint) - rotation;
  const haze = scars.reduce((amount, { angle }) => Math.max(amount,
    Math.max(0, Math.cos(angle - glintAngle)) ** 8), 0);
  const coverage = coating ? coating.reduce((total, { amount }) => total + amount, 0) / coating.length : 0;
  ctx.globalAlpha = (light ? 0.9 : 0.68) * (1 - melt) * (1 - 0.64 * haze) * (1 - 0.84 * coverage * (1 - stripped));
  oval(ctx, xGlint, yGlint, light ? 8.4 : 5.2, light ? 2.15 : 1.45, style.flash, -0.55 + sweep * 0.19);
  oval(ctx, xGlint + 10, yGlint - 4, 2.0, 1.1, style.flash, -0.45);
  ctx.restore();
}

export function drawPearl(ctx, harvest, position, scale = 1, failure) {
  const { pattern, rotation, coating } = harvest.pearl;
  drawCrystal(ctx, position, {
    color: harvest.intrinsic.color, pattern, rotation, coating,
    scale: scale * harvest.pearl.scale, light: harvest.light, scars: harvest.damage.scars, failure,
  });
}

export function drawPearlThumbnail(canvas, pearl, pattern) {
  const ctx = canvas.getContext('2d');
  ctx.scale(canvas.width / 84, canvas.height / 84);
  drawCrystal(ctx, { x: 42, y: 39 }, { color: pearl.color, pattern, rotation: 0, scale: pearl.scale, light: true });
}
