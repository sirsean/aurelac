import { distance } from './geometry.js';

const lifetime = 360;
const droplets = [
  { x: -24, y: -11, size: 2.5 },
  { x: -14, y: 14, size: 1.9 },
  { x: -5, y: -25, size: 2.3 },
  { x: 11, y: -18, size: 1.6 },
  { x: 25, y: -6, size: 2.4 },
  { x: 13, y: 10, size: 1.8 },
];

export function createDiffuserSplash(reducedMotion) {
  let bursts = [];

  return {
    add(point, time) {
      if (reducedMotion) return;
      const last = bursts.at(-1);
      if (last && (time - last.time < 42 || (time - last.time < 145 && distance(point, last.point) < 12))) return;
      bursts.push({ point, time });
    },

    draw(ctx, time) {
      bursts = bursts.filter((burst) => time - burst.time < lifetime);
      ctx.save();
      for (const { point, time: start } of bursts) {
        const progress = Math.max(0, (time - start) / lifetime);
        ctx.globalAlpha = (1 - progress) ** 1.3;
        const radius = 3 + 19 * progress;
        ctx.beginPath();
        ctx.ellipse(point.x, point.y + 2, radius, radius * 0.44, -0.12, 0, 2 * Math.PI);
        ctx.strokeStyle = '#fbe5c8';
        ctx.lineWidth = 1.65;
        ctx.stroke();

        ctx.strokeStyle = '#63443b';
        ctx.fillStyle = '#ffefd5';
        ctx.lineWidth = 0.75;
        const spread = 0.28 + progress * 0.95;
        for (const drop of droplets) {
          ctx.beginPath();
          ctx.ellipse(
            point.x + drop.x * spread,
            point.y + drop.y * spread + 13 * progress ** 2,
            drop.size, drop.size * 0.66, Math.atan2(drop.y, drop.x), 0, Math.PI * 2,
          );
          ctx.fill();
          ctx.stroke();
        }
      }
      ctx.restore();
      return bursts.length > 0;
    },

    clear() {
      bursts = [];
    },
  };
}
