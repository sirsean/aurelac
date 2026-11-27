export function stroke(ctx, path, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke(path);
}

export function gradient(ctx, x, y, radius, stops) {
  const color = ctx.createRadialGradient(x, y, 1, x, y, radius);
  for (const [offset, value] of stops) color.addColorStop(offset, value);
  return color;
}

export function oval(ctx, x, y, width, height, color, angle = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, width, height, angle, 0, 2 * Math.PI);
  ctx.fillStyle = color;
  ctx.fill();
}
