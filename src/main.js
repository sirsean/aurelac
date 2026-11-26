import './style.css';
import { BOARD, TUNING, distance, point } from './geometry.js';
import { TOOLS, beginGesture, continuePeel, createSpecimen, dryMembrane, exposed, moveGesture, peelIsWet } from './specimen.js';
import { createRenderer } from './render.js';

const params = new URLSearchParams(location.search);
const playtest = ['starter', 'intact'].includes(params.get('playtest'));
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

let specimen = createSpecimen();
let tool = 'blade';
let gesture = null;
let primary = null;
let anchor = null;
let frame = null;
let dryingTimer = null;

const messages = {
  cut: 'Pink tissue is exposed. Sweep it with the diffuser.',
  nick: 'The blade nicked the membrane. Keep the next cut on the crease.',
  wet: 'The membrane shines where it is wet. Sweep toward any matte patches.',
  soaked: 'The fold is glossy and the edge has lifted.',
  dried: 'The sheen has faded. Wet the fold again before pulling.',
  husk: 'The flap caught on the husk. Extend the slit from either end.',
  dry: 'The matte fold feels brittle. Reapply diffuser.',
  angle: 'The fold bunches under the grip.',
  grab: 'Grab the raised pink edge.',
  peeled: 'The membrane is free. The carrom lobe is exposed.',
  piece: 'One section came free. Wet the next fold.',
  tear: 'The section tears and leaves a ragged remnant.',
  'dry-tear': 'The dry section tears and leaves a ragged remnant.',
};

const toolHints = {
  blade: 'Trace the dark crease with the blade.',
  diffuser: 'Sweep the diffuser over the exposed pink tissue.',
  grip: 'Take the raised pink edge.',
};

function report(text) {
  if (feedback.textContent !== text) feedback.textContent = text;
  if (note.textContent !== text) note.textContent = text;
}

function render(time) {
  frame = null;
  const wasWet = peelIsWet(specimen);
  const drying = dryMembrane(specimen, time);
  if (wasWet && !peelIsWet(specimen)) report(messages.dried);
  if (gesture?.pull && !gesture.finished) reportInteraction(continuePeel(specimen, gesture, time), time);
  const animating = renderer.draw(specimen, gesture, time);
  if (animating || gesture?.pull?.settling) requestRender();
  else if (drying) dryingTimer = setTimeout(requestRender, 65);
}

function requestRender() {
  clearTimeout(dryingTimer);
  dryingTimer = null;
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
  specimen = createSpecimen();
  tool = 'blade';
  feedback.textContent = 'The specimen is intact.';
  note.textContent = toolHints[tool];
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
    const next = beginGesture(specimen, tool, location, event.timeStamp);
    if (!next) {
      if (tool === 'grip' && !exposed(specimen) && specimen.cut.some(Boolean)) report(messages.grab);
      return;
    }
    gesture = next;
    primary = event.pointerId;
    if (next.diffusing) reportInteraction('wet', event.timeStamp);
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
    result = moveGesture(specimen, gesture, toBoard(sample, rect), sample.timeStamp) ?? result;
  }
  reportInteraction(result, event.timeStamp);
  requestRender();
});

function reportInteraction(result, time) {
  const pull = gesture.pull;
  if (result === 'peeled' || result === 'piece') {
    renderer.detach(pull.target);
    const damaged = result === 'peeled' && specimen.attachments.some(({ state }) => state === 'torn');
    report(damaged ? 'Carrom lobe exposed. Ragged remnants remain.' : messages[result]);
  } else if (result === 'tear' || result === 'dry-tear') {
    renderer.detach(pull.target, true);
    report(exposed(specimen) ? 'The last section tears. The carrom lobe is exposed with ragged remnants.' : messages[result]);
  } else if (!gesture.finished && pull?.catch && pull.load >= 0.14) {
    report(messages[pull.catch]);
  } else if (result === 'wet') {
    renderer.splash(gesture.wetContact, time);
    report(peelIsWet(specimen) ? messages.soaked : messages.wet);
  } else if (result === 'cut' || result === 'nick') {
    report(messages[result]);
  }
}

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

function selectTool(next) {
  if (next === tool || !TOOLS.includes(next)) return;
  finishGesture();
  tool = next;
  updateTool();
  if (!exposed(specimen)) note.textContent = toolHints[tool];
}

for (const button of tools) {
  button.addEventListener('click', () => selectTool(button.dataset.tool));
  button.addEventListener('pointerup', (event) => {
    // Chromium can suppress the synthetic click when a tap follows a quick swipe.
    if (event.pointerType !== 'touch') return;
    const target = document.elementFromPoint(event.clientX, event.clientY);
    if (button.contains(target)) selectTool(button.dataset.tool);
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
