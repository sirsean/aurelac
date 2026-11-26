import './style.css';
import { BOARD, TUNING, distance, point } from './geometry.js';
import { TOOLS, beginGesture, createSpecimen, exposed, moveGesture } from './specimen.js';
import { createRenderer } from './render.js';

const params = new URLSearchParams(location.search);
const playtest = ['starter', 'intact'].includes(params.get('playtest'));
const starter = params.get('playtest') === 'starter';
const debug = params.get('debug') === '1';
if (playtest) document.documentElement.classList.add('playtest');

const canvas = document.querySelector('#specimen');
const feedback = document.querySelector('#feedback');
const note = document.querySelector('#bench-note');
const tools = [...document.querySelectorAll('[data-tool]')];
const guide = document.querySelector('#guide');
const renderer = createRenderer(canvas, {
  debug,
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
});

let specimen = createSpecimen({ starter });
let tool = starter ? 'grip' : 'blade';
let gesture = null;
let primary = null;
let anchor = null;
let frame = null;

const messages = {
  cut: 'The husk opens along the crease.',
  nick: 'The blade nicks the membrane.',
  wet: 'The membrane shines where the diffuser touched it.',
  release: 'Part of the flap comes free.',
  peeled: 'The membrane is free. The carrom lobe is exposed.',
  tear: 'The membrane tears and leaves a pink remnant.',
};

function render(time) {
  frame = null;
  if (renderer.draw(specimen, gesture, time)) requestRender();
}

function requestRender() {
  frame ??= requestAnimationFrame(render);
}

function updateTool() {
  for (const button of tools) {
    button.setAttribute('aria-pressed', String(button.dataset.tool === tool));
  }
}

function finishGesture() {
  const pointers = [primary, anchor];
  primary = null;
  anchor = null;
  gesture = null;
  for (const pointer of pointers) {
    if (pointer !== null && canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
  }
  requestRender();
}

function reset() {
  finishGesture();
  specimen = createSpecimen({ starter });
  tool = starter ? 'grip' : 'blade';
  feedback.textContent = starter ? 'Starter slit restored.' : 'The specimen is intact.';
  note.textContent = 'Open the node to expose the carrom lobe.';
  renderer.clearMotion();
  updateTool();
  requestRender();
}

function toBoard(event, rect) {
  return point(
    (event.clientX - rect.left) * BOARD.width / rect.width,
    (event.clientY - rect.top) * BOARD.height / rect.height,
  );
}

canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  const location = toBoard(event, canvas.getBoundingClientRect());
  if (primary === null) {
    const next = beginGesture(specimen, tool, location);
    if (!next) return;
    gesture = next;
    primary = event.pointerId;
  } else if (gesture?.tool === 'grip' && anchor === null
      && distance(location, point(197, 207)) <= TUNING.pinRadius) {
    anchor = event.pointerId;
    gesture.pinned = true;
  } else {
    return;
  }
  canvas.setPointerCapture(event.pointerId);
  requestRender();
});

canvas.addEventListener('pointermove', (event) => {
  if (event.pointerId !== primary || !gesture) return;
  const rect = canvas.getBoundingClientRect();
  const samples = event.getCoalescedEvents?.();
  let result = null;
  for (const sample of samples?.length ? samples : [event]) {
    result = moveGesture(specimen, gesture, toBoard(sample, rect)) ?? result;
  }

  if (result) {
    feedback.textContent = messages[result];
    if (exposed(specimen)) {
      note.textContent = specimen.attachments.some(({ state }) => state === 'torn')
        ? 'Carrom lobe exposed. A pink remnant remains.'
        : 'Carrom lobe exposed. The membrane came free.';
    }
  }
  requestRender();
});

function endPointer(event) {
  if (event.pointerId === primary) {
    finishGesture();
  } else if (event.pointerId === anchor) {
    anchor = null;
    gesture.pinned = false;
    if (gesture.pull) gesture.pull.pinned = false;
    requestRender();
  }
}

for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  canvas.addEventListener(event, endPointer);
}

canvas.addEventListener('contextmenu', (event) => event.preventDefault());
window.addEventListener('blur', finishGesture);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) finishGesture();
});

for (const button of tools) {
  button.addEventListener('click', () => {
    if (!TOOLS.includes(button.dataset.tool)) return;
    finishGesture();
    tool = button.dataset.tool;
    updateTool();
  });
}

document.querySelector('#reset').addEventListener('click', reset);
document.querySelector('#open-guide').addEventListener('click', () => {
  finishGesture();
  guide.showModal();
});

new ResizeObserver(([entry]) => {
  const dpr = Math.min(devicePixelRatio || 1, 3);
  const width = Math.max(1, Math.round(entry.contentRect.width * dpr));
  const height = Math.max(1, Math.round(entry.contentRect.height * dpr));
  if (width === canvas.width && height === canvas.height) return;
  finishGesture();
  canvas.width = width;
  canvas.height = height;
  requestRender();
}).observe(canvas);

reset();
