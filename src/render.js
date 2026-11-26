import {
  ATTACHMENTS, BOARD, SEAM, TUNING, between, clamp, closestSeam, mix, openingLip, openings, point, randomFrom,
} from './geometry.js';
import { createLiquidSplash } from './liquid-splash.js';
import { drawBlisters, drawLiftedBlisters, drawPearlBench } from './harvest-render.js';
import { nodeFor } from './nodes.js';
import { STONE } from './blade.js';
import { exposed, peelFront, peelHandle } from './specimen.js';

const shell = new Path2D(
  'M66 139C64 124 73 108 78 97C79 81 92 73 101 69C109 54 126 53 142 58C157 49 178 51 192 62C207 59 220 64 231 72C247 72 256 78 264 91C276 91 284 98 290 109C305 115 310 126 310 145C327 157 326 171 327 187C346 203 344 220 338 235C346 249 336 269 324 276C325 290 311 303 300 307C295 323 276 328 261 330C251 345 230 348 218 342C205 354 184 352 169 342C148 347 134 336 127 326C109 330 91 317 88 300C72 295 62 282 63 263C50 251 49 233 58 218C47 204 49 188 57 177C47 161 54 148 66 139Z',
);

const tether = new Path2D(
  'M247 82C270 75 306 72 320 53C333 35 310 23 314 11C315 5 321 2 325 4C317 11 324 18 331 22C347 34 349 46 340 64C330 87 309 106 272 117Z',
);

const shellFolds = [
  ['M73 143C94 123 85 115 102 102C117 92 133 96 146 81C155 70 170 65 185 65', 1],
  ['M59 179C70 164 83 159 96 154C110 149 118 130 134 122C161 107 165 88 186 89C210 89 205 100 225 98C241 96 250 94 267 106C275 113 287 120 298 120', -1],
  ['M61 213C87 193 98 195 117 177C132 162 142 162 163 159C183 151 185 139 211 129C238 119 257 123 279 142C291 152 303 148 315 157', 1],
  ['M62 244C87 227 100 233 119 220C141 204 141 186 166 181C187 178 196 182 215 171C239 157 247 149 267 158C282 165 297 182 320 178', -1],
  ['M69 266C81 257 96 263 117 250C130 242 138 229 158 226C189 224 193 212 213 205C240 196 252 179 271 186C285 189 295 204 318 209', 1],
  ['M83 286C104 267 112 282 138 265C148 252 171 254 181 244C195 236 198 230 217 231C247 233 256 209 276 214C290 217 301 226 329 229', -1],
  ['M104 310C122 301 141 295 148 281C162 261 186 265 200 254C213 244 227 259 242 250C264 235 279 238 292 247C301 253 313 252 330 249', 1],
  ['M130 322C160 319 157 303 178 294C194 287 213 292 226 274C239 256 259 268 267 261C285 253 294 273 316 267', -1],
  ['M168 335C189 326 187 313 207 312C230 308 233 287 252 291C273 296 281 281 298 285', 1],
  ['M221 335C237 323 253 325 262 313C267 305 283 307 296 295', -1],
  ['M104 84C115 73 123 76 136 73', 1],
  ['M207 71C218 76 218 85 236 86', 1],
  ['M88 195C95 188 100 186 107 184', -1],
  ['M145 232C159 223 176 233 185 218', -1],
  ['M271 312C281 310 286 307 288 302', -1],
];

const lobeArt = [
  [171, 145, 'M150 152C153 130 179 125 200 133C221 140 230 156 218 174C205 193 181 196 164 183C152 175 145 165 150 152Z'],
  [223, 171, 'M198 178C204 155 225 149 248 158C272 168 284 189 270 207C258 225 232 228 215 215C206 208 194 195 198 178Z'],
  [270, 205, 'M243 210C250 190 270 180 291 192C308 202 314 222 303 240C292 254 267 254 252 242C241 233 239 222 243 210Z'],
  [133, 150, 'M108 174C110 150 130 131 150 132C163 130 182 141 188 155C193 176 181 193 155 206C141 215 111 202 108 174Z'],
  [168, 170, 'M136 207C129 186 157 159 180 158C198 154 215 165 222 180C231 201 212 222 189 227C166 236 145 228 136 207Z'],
  [203, 190, 'M172 225C176 203 196 176 221 177C247 176 263 198 257 215C251 238 235 250 210 249C192 250 176 243 172 225Z'],
  [238, 210, 'M211 244C217 223 232 199 253 200C275 202 291 223 280 244C269 265 247 268 233 266C223 266 211 257 211 244Z'],
  [273, 230, 'M247 260C248 247 265 230 283 229C298 231 307 249 296 260C285 276 256 278 247 260Z'],
].map(([x, y, outline]) => ({ x, y, path: new Path2D(outline) }));

const ink = '#352e27';
const materials = {
  flesh: ['#d99258', '#b66b42', '#704333'],
  membrane: ['#e4a196', '#bb786d', '#844c48'],
};

function smoothLine(ctx, points, connected = false) {
  if (connected) ctx.lineTo(points[0].x, points[0].y);
  else ctx.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length - 1; index++) {
    const next = between(points[index], points[index + 1], 0.5);
    ctx.quadraticCurveTo(points[index].x, points[index].y, next.x, next.y);
  }
  const last = points.at(-1);
  ctx.lineTo(last.x, last.y);
}

function line(ctx, path, color, width = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke(path);
}

function fill(ctx, path, color) {
  ctx.fillStyle = color;
  ctx.fill(path);
}

function radial(ctx, x, y, radius, colors) {
  const gradient = ctx.createRadialGradient(x, y, 1, x, y, radius);
  const positions = [0, 0.61, 1];
  colors.forEach((color, index) => gradient.addColorStop(positions[index], color));
  return gradient;
}

function patina(ctx, random, amount, colors, bounds, size = 1.9) {
  for (let index = 0; index < amount; index++) {
    const x = bounds.x + random() * bounds.width;
    const y = bounds.y + random() * bounds.height;
    const length = 0.4 + random() * size;
    const shade = colors[index % colors.length];
    const mark = new Path2D();
    mark.moveTo(x, y);
    mark.quadraticCurveTo(x + length, y - length * 0.55, x + length * 1.7, y - length * 0.5);
    line(ctx, mark, shade, 0.38 + random() * 0.65);
  }
}

function createShellLayer(seed) {
  const layer = document.createElement('canvas');
  const scale = 2;
  layer.width = BOARD.width * scale;
  layer.height = BOARD.height * scale;
  const ctx = layer.getContext('2d');
  ctx.scale(scale, scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const appearance = nodeFor(seed).shell;
  ctx.translate(197, 203);
  ctx.scale(appearance.width, appearance.height);
  ctx.translate(-197, -203);

  ctx.save();
  ctx.translate(0, 8);
  fill(ctx, tether, '#30351f55');
  fill(ctx, shell, '#2929216b');
  ctx.restore();

  fill(ctx, tether, radial(ctx, 319, 51, 85, appearance.colors));
  line(ctx, tether, ink, 2.2);
  for (const wrinkle of [
    'M316 73Q325 75 325 82', 'M326 57Q334 56 340 61', 'M325 40Q334 35 344 39',
    'M318 27Q325 21 330 22', 'M291 82Q303 85 306 94', 'M272 89Q280 91 285 101',
  ]) {
    line(ctx, new Path2D(wrinkle), '#624b3b', 1.1);
  }

  fill(ctx, shell, radial(ctx, 142, 124, 220, appearance.colors));
  ctx.save();
  ctx.clip(shell);
  const shade = ctx.createLinearGradient(62, 93, 323, 321);
  shade.addColorStop(0, '#fbefd927');
  shade.addColorStop(0.53, '#ffffff00');
  shade.addColorStop(1, '#3f241e3d');
  fill(ctx, shell, shade);

  for (const [path, side] of shellFolds) {
    const fold = new Path2D(path);
    ctx.save();
    ctx.translate(0, 2.4 * side);
    line(ctx, fold, '#684e3d2e', 8.1);
    line(ctx, fold, '#674a3847', 3.3);
    ctx.translate(0, -4.9 * side);
    line(ctx, fold, '#f8dec054', 3.5);
    ctx.restore();
    line(ctx, fold, '#49372db5', 1.03);
  }

  const random = randomFrom(seed);
  patina(ctx, random, 1700, ['#5e46384d', '#49362a40', '#edceb886', '#f1dcc497'],
    { x: 48, y: 49, width: 295, height: 308 }, 2.5);
  for (let index = 0; index < 95; index++) {
    const x = 62 + random() * 270;
    const y = 58 + random() * 285;
    const wrinkle = new Path2D();
    wrinkle.moveTo(x, y);
    wrinkle.bezierCurveTo(x + 4, y - 6, x + 8, y - 2, x + 13, y - 9);
    line(ctx, wrinkle, '#5d473b67', 0.68);
  }
  ctx.restore();
  line(ctx, shell, ink, 2.4);
  return layer;
}

function trayLine(ctx, x, y, dx, dy) {
  const path = new Path2D();
  path.moveTo(x, y + 12 * dy);
  path.lineTo(x, y);
  path.lineTo(x + 12 * dx, y);
  line(ctx, path, '#e1dfbb6e', 1);
}

function createTrayLayer() {
  const layer = document.createElement('canvas');
  layer.width = BOARD.width * 2;
  layer.height = BOARD.height * 2;
  const ctx = layer.getContext('2d');
  ctx.scale(2, 2);
  const background = radial(ctx, 176, 140, 259, ['#90937a', '#7b8069', '#686e58']);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, BOARD.width, BOARD.height);
  const random = randomFrom(49582);
  patina(ctx, random, 2400, ['#e4ddaf1d', '#3d432d29', '#bab88f44'],
    { x: 0, y: 0, width: BOARD.width, height: BOARD.height }, 1.9);

  for (const [x, y, dx, dy] of [[14, 15, 1, 1], [386, 15, -1, 1], [14, 359, 1, -1], [386, 359, -1, -1]]) {
    trayLine(ctx, x, y, dx, dy);
  }
  ctx.strokeStyle = '#ddd7b63f';
  ctx.lineWidth = 0.8;
  for (let x = 36; x < 111; x += 6) {
    ctx.beginPath();
    ctx.moveTo(x, 344);
    ctx.lineTo(x, x % 12 === 0 ? 353 : 349);
    ctx.stroke();
  }
  return layer;
}

function cavityPath(range) {
  const top = [];
  const bottom = [];
  for (let index = range.start; index <= range.end; index++) {
    top.push(openingLip(range, index, -1));
    bottom.unshift(openingLip(range, index, 1));
  }
  const path = new Path2D();
  smoothLine(path, top);
  smoothLine(path, bottom, true);
  path.closePath();
  return path;
}

function createLobeLayer() {
  const layer = document.createElement('canvas');
  layer.width = BOARD.width * 2;
  layer.height = BOARD.height * 2;
  const ctx = layer.getContext('2d');
  ctx.scale(2, 2);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const random = randomFrom(1223);
  for (const { x, y, path: lobe } of lobeArt) {
    fill(ctx, lobe, radial(ctx, x, y, 68, materials.flesh));
    ctx.save();
    ctx.clip(lobe);
    patina(ctx, random, 110, ['#f8c6946e', '#50322d66', '#ffce9470'],
      { x: x - 29, y: y - 22, width: 84, height: 100 }, 2.6);
    const lobeSheen = new Path2D();
    lobeSheen.moveTo(x - 11, y + 11);
    lobeSheen.quadraticCurveTo(x + 5, y - 8, x + 30, y + 2);
    line(ctx, lobeSheen, '#ffd7a677', 1.1);
    ctx.restore();
    line(ctx, lobe, '#4a3029', 1.35);
  }
  return layer;
}

function drawMembrane(ctx, specimen, pose) {
  const front = peelFront(specimen);
  if (front < 0) return;

  const base = ATTACHMENTS[front];
  const unstretched = peelHandle(specimen, front);
  const bend = pose?.catch === 'angle' ? 0 : (pose?.load ?? 0);
  const loadPoint = pose?.anchor ?? base;
  const target = pose?.target ?? unstretched;
  const cover = new Path2D();
  const spread = front / ATTACHMENTS.length;
  const edgeX = mix(355, base.x - 22, spread);
  const foldX = mix(base.x + 29 - 40 * spread, loadPoint.x, bend);
  cover.moveTo(edgeX, 61);
  cover.bezierCurveTo(edgeX - 32, 112, foldX + 19, loadPoint.y - 24, foldX, loadPoint.y);
  cover.bezierCurveTo(foldX - 7, loadPoint.y + 21, edgeX - 30, 248, edgeX - 23, 311);
  cover.lineTo(0, 331);
  cover.lineTo(0, 57);
  cover.closePath();

  fill(ctx, cover, radial(ctx, 179, 137, 199, materials.membrane));
  ctx.save();
  ctx.clip(cover);
  const random = randomFrom(1578);
  patina(ctx, random, 430, ['#6c403a47', '#fed0bd75', '#ecafa88f'],
    { x: 65, y: 80, width: 285, height: 220 });
  const stretch = distanceSquared(target, unstretched);
  for (let index = 0; index < 10; index++) {
    const width = index * 19;
    const fold = new Path2D();
    fold.moveTo(82 + width, 112);
    fold.bezierCurveTo(104 + width, 145, 176 + width / 2, 186, loadPoint.x + 8, loadPoint.y + bend * 10);
    line(ctx, fold, bend > 0.2 ? '#74433e84' : '#814e494d', 0.72);
  }
  if (stretch < 90) {
    const looseFold = new Path2D('M110 152Q130 175 156 172T197 190T234 198');
    line(ctx, looseFold, '#f3b5a482', 1.5);
  }
  drawSectionFolds(ctx, front);
  drawWetness(ctx, specimen);
  ctx.restore();
}

function drawSectionFolds(ctx, front) {
  const size = TUNING.attachmentsPerSection;
  for (let boundary = size; boundary < ATTACHMENTS.length; boundary += size) {
    if (boundary <= front) continue;
    const { x, y } = between(ATTACHMENTS[boundary - 1], ATTACHMENTS[boundary], 0.5);
    const fold = new Path2D();
    fold.moveTo(x + 21, y - 37);
    fold.bezierCurveTo(x - 1, y - 18, x + 9, y + 9, x - 21, y + 35);
    line(ctx, fold, '#76433d70', 2.8);
    ctx.save();
    ctx.translate(1, 1.7);
    line(ctx, fold, '#efb2a3a8', 1.2);
    ctx.restore();
  }
}

function distanceSquared(a, b) {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

function drawWetness(ctx, specimen) {
  for (const [index, attachment] of specimen.attachments.entries()) {
    if (attachment.state !== 'attached' || attachment.wetness <= 0) continue;
    const { x, y } = ATTACHMENTS[index];
    const wash = ctx.createRadialGradient(x, y + 6, 1, x, y + 6, 27);
    wash.addColorStop(0, '#713d4392');
    wash.addColorStop(1, '#713d4300');
    ctx.globalAlpha = attachment.wetness * 0.67;
    ctx.fillStyle = wash;
    ctx.fillRect(x - 27, y - 21, 54, 54);

    const gleam = clamp((attachment.wetness - TUNING.minimumWetness) / (1 - TUNING.minimumWetness));
    if (gleam && index % 2 === 0) {
      const glints = new Path2D();
      const length = index % 3 === 0 ? 17 : 9;
      glints.moveTo(x - 4, y + 6);
      glints.quadraticCurveTo(x + 3, y + 4, x + length * (0.45 + 0.55 * gleam), y + 8);
      if (index % 3 === 0) {
        glints.moveTo(x + 4, y + 14);
        glints.lineTo(x + 5.7, y + 14.8);
      }
      ctx.globalAlpha = gleam;
      line(ctx, glints, '#ffdbc7eb', 2.6);
    }
  }
  ctx.globalAlpha = 1;
}

function drawDiffuserContact(ctx, gesture) {
  if (!gesture?.diffusing) return;
  const { x, y } = gesture.contact;
  const sheen = new Path2D();
  sheen.moveTo(x - 13, y - 6);
  sheen.quadraticCurveTo(x - 6, y - 13, x + 6, y - 8);
  sheen.moveTo(x - 5, y + 9);
  sheen.quadraticCurveTo(x + 5, y + 8, x + 11, y + 2);
  line(ctx, sheen, '#65443d', 4);
  line(ctx, sheen, '#ffedd0', 2.3);
}

function drawFlap(ctx, specimen, ranges, pose) {
  const front = peelFront(specimen);
  if (front === -1) return;
  const range = ranges.find(({ start, end }) =>
    start <= ATTACHMENTS[front].seamT * TUNING.seamSegments
      && end >= ATTACHMENTS[front].seamT * TUNING.seamSegments);
  if (!range) return;
  const wet = specimen.attachments[front].wetness;

  const tip = pose?.target ?? peelHandle(specimen, front);
  const attachment = ATTACHMENTS[front];
  const base = pose?.anchor ?? attachment;
  const tension = pose?.load ?? 0;
  const bunch = pose?.catch === 'angle' ? tension : 0;
  const facing = Math.sign(attachment.direction.x);
  const dx = (tip.x - base.x) * facing;
  const dy = tip.y - base.y;
  const direction = Math.atan2(attachment.direction.y, Math.abs(attachment.direction.x));
  const turn = clamp(Math.atan2(dy, dx) - direction, -0.48, 0.48);
  const angle = direction + turn;
  const length = Math.max(8, dx * Math.cos(angle) + dy * Math.sin(angle));
  const width = mix(7 + 7 * wet, 19, tension);
  const rim = mix(3, 10, wet);

  ctx.save();
  ctx.translate(base.x, base.y);
  ctx.scale(facing, 1);
  ctx.rotate(angle);

  const flap = new Path2D();
  flap.moveTo(-8, -3);
  flap.bezierCurveTo(length * 0.22, -width * 0.9, length * 0.68, -width * 1.21, length, -width);
  flap.bezierCurveTo(length + rim, -width * 0.93, length + rim + 3, width * 0.45, length, width * 0.7);
  flap.bezierCurveTo(length * 0.69, width * 0.94, length * 0.24, width * 0.54, -8, 3);
  flap.closePath();

  ctx.save();
  ctx.translate(3, 5);
  fill(ctx, flap, '#3d251d62');
  ctx.restore();
  fill(ctx, flap, radial(ctx, length - 5, -width / 2, Math.max(29, length * 0.85), materials.membrane));
  line(ctx, flap, '#67423c', 1.18);

  for (const crease of [-0.55, -0.14, 0.25]) {
    const fold = new Path2D();
    fold.moveTo(-3, crease * 4);
    fold.quadraticCurveTo(length * 0.47, crease * width - 3, length - rim * 0.5, crease * width);
    line(ctx, fold, '#774b4498', 0.85);
  }

  if (bunch > 0) {
    const wrinkles = new Path2D();
    for (const mark of [0, 1, 2]) {
      const x = -9 + mark * mix(6, 3, bunch);
      const depth = (9 + 7 * bunch) * (1 - mark * 0.14);
      wrinkles.moveTo(x + 2, -depth);
      wrinkles.quadraticCurveTo(x - 4, -2, x + 2, depth);
    }
    ctx.globalAlpha = bunch;
    line(ctx, wrinkles, '#633934', 2.5);
    ctx.save();
    ctx.translate(-1.8, -0.3);
    line(ctx, wrinkles, '#ffc5a8', 1.35);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // The dark underside opens at the free end. Its bright rim follows the grip point.
  const underside = new Path2D();
  underside.moveTo(length - rim * 0.5, -width * 0.74);
  underside.bezierCurveTo(length + rim * 0.8, -width * 0.72, length + rim * 0.82, width * 0.34, length, width * 0.57);
  underside.quadraticCurveTo(length + rim * 0.22, -width * 0.18, length - rim * 0.5, -width * 0.74);
  fill(ctx, underside, '#713e3c');
  const edge = new Path2D();
  edge.moveTo(length - rim * 0.65, -width * 0.92);
  edge.bezierCurveTo(length + rim, -width, length + rim * 1.2, width * 0.22, length, width * 0.64);
  line(ctx, edge, wet >= TUNING.minimumWetness ? '#ffe1ca' : '#d19584', 0.85 + wet * 1.45);
  const gleam = clamp((wet - TUNING.minimumWetness) / (1 - TUNING.minimumWetness));
  if (gleam) {
    const sheen = new Path2D();
    sheen.moveTo(length * 0.24, -width * 0.44);
    sheen.quadraticCurveTo(length * 0.54, -width * 0.83, length - rim * 0.55, -width * 0.75);
    ctx.globalAlpha = gleam;
    line(ctx, sheen, '#ffead4', 2.2);
  }
  ctx.restore();

  if (pose?.catch && tension > 0.15) {
    const contact = new Path2D();
    contact.ellipse(base.x, base.y, 5 + tension * 3, 2.5, -0.5, 0, 2 * Math.PI);
    line(ctx, contact, '#f9d4b8', 1.7);
  }
}

function drawDetachedFlap(ctx, { tip, direction, torn }, progress) {
  const curl = new Path2D(torn
    ? 'M-16 19L-8 11L-12 7L1 4L-2-3L11-3L10-9C23-16 39-8 35 3C31 14 14 18 3 15L-1 23L-7 19L-18 27Z'
    : 'M-16 19C-12 3 2-13 23-12C39-11 40 8 24 13C11 17 7 8 1 14C-4 19-9 28-18 27Z');
  const edge = new Path2D(torn
    ? 'M12-8C28-15 38-3 30 5C26 9 21 11 18 10'
    : 'M-13 20C-7 2 9-11 27-7C35-5 35 5 28 7C15 10 11 0 3 8');
  ctx.save();
  const travel = 1 - (1 - progress) ** 3;
  ctx.translate(tip.x + direction.x * 74 * travel, tip.y + direction.y * 74 * travel);
  ctx.scale(Math.sign(direction.x) || 1, 1);
  ctx.rotate((torn ? -1.5 : 0.8) * travel);
  ctx.scale(1 - 0.48 * travel, 1 - 0.25 * travel);
  ctx.globalAlpha = 1 - clamp((progress - 0.12) / 0.88);
  fill(ctx, curl, radial(ctx, 13, 2, 36, materials.membrane));
  line(ctx, curl, '#623e36', 1.5);
  line(ctx, edge, '#ffe0c9c0', 1.5);
  ctx.restore();
}

function drawDamage(ctx, specimen) {
  for (const [index, attachment] of specimen.attachments.entries()) {
    if (!attachment.tearAt) continue;
    const { x, y } = attachment.tearAt;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(Math.sign(ATTACHMENTS[index].direction.x), 1);
    const remnant = new Path2D();
    remnant.moveTo(0, 0);
    remnant.bezierCurveTo(7, -3, 12, -24, 35, -24);
    remnant.quadraticCurveTo(34, -17, 45, -16);
    remnant.lineTo(33, -13);
    remnant.quadraticCurveTo(29, -13, 32, -7);
    remnant.lineTo(21, -8);
    remnant.quadraticCurveTo(16, -6, 18, 1);
    remnant.quadraticCurveTo(8, 3, 0, 0);
    remnant.closePath();
    fill(ctx, remnant, radial(ctx, 18, -13, 32, materials.membrane));
    line(ctx, remnant, '#623f36', 1.3);
    ctx.restore();
  }
  for (const nick of specimen.nicks) {
    const mark = new Path2D();
    mark.moveTo(nick.x - 4, nick.y - 5);
    mark.lineTo(nick.x + 1, nick.y - 1);
    mark.lineTo(nick.x - 1, nick.y + 2);
    mark.lineTo(nick.x + 4, nick.y + 6);
    line(ctx, mark, '#723b37', 1.65);
  }
}

function drawSeam(ctx, specimen, lobes) {
  // The same seam samples determine the playable cut and its visible lips.
  const lip = new Path2D();
  smoothLine(lip, SEAM);
  line(ctx, lip, '#f3d8b885', 4);
  line(ctx, lip, '#624c3f', 1.25);

  const ranges = openings(specimen.cut);
  for (const range of ranges) {
    const cavity = cavityPath(range);
    fill(ctx, cavity, radial(ctx, 215, 171, 135, ['#785542', '#52382e', '#312322']));
    ctx.save();
    ctx.clip(cavity);
    ctx.drawImage(lobes, 0, -1, BOARD.width, BOARD.height);
    ctx.restore();
  }
  return ranges;
}

function drawOpening(ctx, specimen, ranges, pose, gesture, drawInterior) {
  for (const range of ranges) {
    const cavity = cavityPath(range);
    ctx.save();
    ctx.clip(cavity);
    drawInterior?.();
    drawMembrane(ctx, specimen, pose);
    drawDamage(ctx, specimen);
    drawDiffuserContact(ctx, gesture);
    line(ctx, cavity, '#402c2440', 7);
    ctx.restore();
    line(ctx, cavity, '#4c362e', 2.2);

    const guard = [];
    for (let index = range.start + 1; index < range.end; index++) {
      guard.push(openingLip(range, index, 1));
    }
    if (guard.length > 1) {
      const light = new Path2D();
      smoothLine(light, guard);
      ctx.save();
      ctx.translate(0, 3.2);
      line(ctx, light, '#f9dec1a1', 1.05);
      ctx.restore();
    }
  }
}

function drawContact(ctx, gesture) {
  if (gesture?.tool !== 'blade') return;
  const { x, y } = gesture.contact;
  ctx.save();
  ctx.clip(shell);
  const depression = ctx.createRadialGradient(x, y, 0, x, y, 21);
  depression.addColorStop(0, '#4f342943');
  depression.addColorStop(1, '#00000000');
  ctx.fillStyle = depression;
  ctx.fillRect(x - 21, y - 21, 42, 42);
  if (gesture.bunch) {
    const { normal } = closestSeam(gesture.contact).sample;
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(-normal.x, normal.y));
    for (let index = 0; index < 3; index++) {
      const bend = new Path2D();
      bend.moveTo(index * 5 - 5, -14);
      bend.quadraticCurveTo(index * 5 - 13, 0, index * 5 - 6, 12);
      line(ctx, bend, '#674a41', 1.2 + gesture.bunch);
    }
  }
  ctx.restore();
}

function drawStone(ctx, gesture) {
  const { left, right, top, bottom } = STONE;
  const stone = new Path2D();
  stone.roundRect(left, top, right - left, bottom - top, 9);
  ctx.save();
  ctx.translate(2, 5);
  fill(ctx, stone, '#252c2270');
  ctx.restore();
  const face = ctx.createLinearGradient(0, top, 0, bottom);
  face.addColorStop(0, '#a6a79a');
  face.addColorStop(0.46, '#818677');
  face.addColorStop(1, '#616653');
  fill(ctx, stone, face);
  line(ctx, stone, '#484d40', 2);
  const travel = new Path2D();
  travel.moveTo(left + 22, (top + bottom) / 2);
  travel.lineTo(right - 22, (top + bottom) / 2);
  line(ctx, travel, '#c3c3a98a', 1);
  if (gesture?.tool !== 'stone') return;
  const { x, y } = gesture.contact;
  const blade = new Path2D();
  blade.moveTo(x - 19, y + 4);
  blade.lineTo(x + 17, y - 7);
  blade.lineTo(x + 12, y + 1);
  blade.closePath();
  fill(ctx, blade, '#e4dfc9');
  line(ctx, blade, '#46463d', 1.4);
}

function drawDebug(ctx, specimen, pose) {
  ctx.font = '10px monospace';
  ctx.fillStyle = '#fff4d9';
  ctx.fillRect(10, 13, 170, 37);
  ctx.fillStyle = '#1b211a';
  ctx.fillText(`Opening ${openings(specimen.cut).map(({ fraction }) => fraction.toFixed(2)).join(' ') || '0.00'}`, 15, 26);
  ctx.fillText(`Load ${(pose?.load ?? 0).toFixed(2)} ${pose?.catch ?? ''}`, 15, 42);
  for (const sample of SEAM) {
    ctx.fillStyle = '#8ee6f2';
    ctx.fillRect(sample.x, sample.y, 1.5, 1.5);
  }
  for (const [index, base] of ATTACHMENTS.entries()) {
    const { state, wetness } = specimen.attachments[index];
    ctx.fillStyle = state === 'attached' ? `rgba(112,197,225,${0.3 + wetness * 0.7})` : '#eef585';
    ctx.fillRect(base.x - 2, base.y - 2, 4, 4);
  }
  const handle = peelHandle(specimen);
  if (!handle) return;
  const region = new Path2D();
  region.arc(handle.x, handle.y, TUNING.gripRadius, 0, Math.PI * 2);
  line(ctx, region, '#fff4d9a9', 0.8);
}

export function createRenderer(canvas, { debug = false, reducedMotion = false } = {}) {
  const ctx = canvas.getContext('2d');
  const tray = createTrayLayer();
  const lobes = createLobeLayer();
  const splash = createLiquidSplash(reducedMotion);
  let body;
  let seed;
  let pose = null;
  let release = null;
  let previousTime = null;

  function draw(specimen, harvest, gesture, time, tool) {
    if (seed !== specimen.seed) {
      seed = specimen.seed;
      body = createShellLayer(seed);
    }
    const elapsed = previousTime === null ? 16 : clamp(time - previousTime, 1, 50);
    previousTime = time;
    const pull = gesture?.pull;
    const handle = peelHandle(specimen);
    const finished = exposed(specimen);

    if (finished || gesture?.finished) {
      pose = null;
    } else if (pull) {
      pose = pull;
    } else if (pose && handle && !reducedMotion) {
      const decay = 1 - Math.exp(-elapsed / 52);
      pose = {
        target: between(pose.target, handle, decay),
        anchor: between(pose.anchor, ATTACHMENTS[peelFront(specimen)], decay),
        load: pose.load * (1 - decay),
        catch: pose.catch,
      };
      if (distanceSquared(pose.target, handle) < 0.8) pose = null;
    } else {
      pose = null;
    }

    ctx.setTransform(canvas.width / BOARD.width, 0, 0, canvas.height / BOARD.height, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.drawImage(tray, 0, 0, BOARD.width, BOARD.height);
    if (['pearl', 'ruined', 'stored'].includes(harvest.stage)) {
      const animating = drawPearlBench(ctx, harvest, gesture, time, reducedMotion);
      return splash.draw(ctx, time) || animating;
    }
    const workingBlisters = harvest.stage === 'blisters';
    ctx.save();
    if (pose && !pose.pinned && !reducedMotion) {
      ctx.translate(clamp(pose.target.x - pose.anchor.x, -100, 100) * pose.load * 0.027,
        clamp(pose.target.y - pose.anchor.y, -100, 100) * pose.load * 0.027);
    }
    ctx.drawImage(body, 0, 0, BOARD.width, BOARD.height);
    const ranges = drawSeam(ctx, specimen, lobes);
    let pulsing = false;
    drawOpening(ctx, specimen, ranges, pose, gesture, workingBlisters
      ? () => { pulsing = drawBlisters(ctx, harvest, gesture, time, reducedMotion, debug); }
      : null);
    if (!finished && ranges.length) drawFlap(ctx, specimen, ranges, pose);
    if (!workingBlisters) drawContact(ctx, gesture);
    ctx.restore();
    if (workingBlisters) drawLiftedBlisters(ctx, harvest, gesture, time, reducedMotion);
    if (tool === 'stone') drawStone(ctx, gesture);
    if (release) {
      release.start ??= time;
      const progress = clamp((time - release.start) / 240);
      if (progress < 1) drawDetachedFlap(ctx, release, progress);
      else release = null;
    }
    const splashing = splash.draw(ctx, time);
    if (debug) drawDebug(ctx, specimen, pose);
    return pulsing || splashing || Boolean(release || (pose && !pull));
  }

  return {
    draw,
    splash: splash.add,
    detach(pull, torn = false) {
      pose = null;
      if (!reducedMotion) release = { tip: pull.target, direction: pull.direction, torn, start: null };
    },
    clearMotion() {
      pose = null;
      release = null;
      splash.clear();
    },
  };
}
