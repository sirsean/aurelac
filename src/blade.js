import { clamp } from './geometry.js';

const travelToDull = 4600;
const dragStartsAt = 0.62;
const sharpeningTravel = 340;

export const STONE = { left: 68, right: 333, top: 304, bottom: 349 };

export function createBlade() {
  return { wear: 0 };
}

export function bladeDrag(blade) {
  return clamp(((blade?.wear ?? 0) - dragStartsAt) / (1 - dragStartsAt));
}

export function wearBlade(blade, travel) {
  if (blade) blade.wear = clamp(blade.wear + travel / travelToDull);
}

export function beginSharpening(location) {
  if (location.x < STONE.left || location.x > STONE.right
    || location.y < STONE.top || location.y > STONE.bottom) return null;
  return { tool: 'stone', last: location, contact: location };
}

export function sharpenBlade(blade, gesture, location) {
  const previous = gesture.last;
  gesture.last = location;
  if (previous.y < STONE.top || previous.y > STONE.bottom
    || location.y < STONE.top || location.y > STONE.bottom
    || Math.abs(location.y - previous.y) > Math.abs(location.x - previous.x)) return null;
  gesture.contact = location;
  const first = clamp(previous.x, STONE.left, STONE.right);
  const last = clamp(location.x, STONE.left, STONE.right);
  if (first === last || blade.wear === 0) return null;
  blade.wear = clamp(blade.wear - Math.abs(last - first) / sharpeningTravel);
  return blade.wear === 0 ? 'sharp' : 'sharpening';
}
