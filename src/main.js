import './style.css';
import { BOARD, TUNING, distance, point } from './geometry.js';
import {
  beginHarvestGesture, createHarvest, finishHarvestGesture, moveHarvestGesture, openBlisters, pearlIsClean, storeHarvest,
} from './harvest.js';
import { beginGesture, continuePeel, createSpecimen, dryMembrane, exposed, moveGesture, peelIsWet } from './specimen.js';
import { COMMON_NODE, nodeCode, nodeFor } from './nodes.js';
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
const instrument = document.querySelector('.instrument');
const tray = document.querySelector('.tool-tray');
const pearlActions = document.querySelector('#pearl-actions');
const lightButton = document.querySelector('#work-light');
const closeButton = document.querySelector('#close-case');
const appraisalPanel = document.querySelector('#appraisal');
const nodeSelect = document.querySelector('#node-select');
const nodeId = document.querySelector('#node-id');
const renderer = createRenderer(canvas, {
  debug,
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
});

let specimen = createSpecimen();
let harvest = createHarvest();
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
  'reverse-tear': 'The bunched fold tears and leaves a ragged remnant.',
  swollen: 'The blister is swollen. Wait for the pale fold to return.',
  'cut-part': 'The cut holds. Continue when the blister settles.',
  'acid-nick': 'Acid leaked from a nick in the blister.',
  'blister-cut': 'The fold is free. Grip the blister and drag it past the lip.',
  'blister-attached': 'The fold still holds the blister.',
  'blister-in-husk': 'Drag the cut blister clear of the opening.',
  'blister-lifted': 'The blister is out. The pearl is showing through.',
  'pearl-revealed': 'The root pearl is exposed. Spray the coating with Fazer.',
  rupture: 'The blister ruptures. Poison gas dissolves the root pearl.',
  fazer: 'Fazer turns the coating green. Wipe away the treated goop.',
  'coating-wiped': 'The treated coating is lifting off.',
  'coating-sticky': 'The amber coating is still sticky. Spray it with Fazer.',
  'pearl-clean': 'The pearl is clean. Inspect it under the light or put it in the case.',
  seated: 'The pearl sits flat in the padded recess.',
  rim: 'The pearl rocks on the rim. Re-seat it before closing.',
  tray: 'Place the pearl in the padded recess.',
};

const toolHints = {
  membrane: {
    blade: 'Trace the dark crease with the blade.',
    diffuser: 'Sweep the diffuser over the exposed pink tissue.',
    grip: 'Take the raised pink edge.',
  },
  blisters: {
    blade: 'Cut a pale fold when the blister settles.',
    grip: 'Drag each cut blister clear of the opening.',
  },
  pearl: {
    fazer: 'Spray the amber coating until it turns green.',
    wipe: 'Rub the green coating to lift it off.',
    case: 'Lift the pearl into the padded recess.',
  },
  ruined: {},
  stored: {},
};

const benchDescriptions = {
  membrane: 'Overhead view of a tethered Aurelac node',
  blisters: 'Exposed carrom blisters on the harvest bench',
  pearl: 'Root pearl and padded storage case',
  ruined: 'The remains of a dissolved root pearl',
  stored: 'The appraisal view of the root pearl and its case',
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
  const animating = renderer.draw(specimen, harvest, gesture, time);
  if (animating || gesture?.pull?.settling) requestRender();
  else if (drying) dryingTimer = setTimeout(requestRender, 65);
}

function requestRender() {
  clearTimeout(dryingTimer);
  dryingTimer = null;
  frame ??= requestAnimationFrame(render);
}

function updateTool() {
  const options = toolHints[harvest.stage];
  if (!Object.hasOwn(options, tool)) tool = Object.keys(options)[0];
  instrument.dataset.stage = harvest.stage;
  canvas.setAttribute('aria-label', benchDescriptions[harvest.stage]);
  tray.hidden = Object.keys(options).length === 0;
  for (const button of tools) {
    button.hidden = !Object.hasOwn(options, button.dataset.tool);
    button.setAttribute('aria-pressed', String(button.dataset.tool === tool));
    if (button.dataset.tool === 'wipe') button.textContent = pearlIsClean(harvest) ? 'Roll' : 'Wipe';
  }
  pearlActions.hidden = harvest.stage !== 'pearl' && harvest.stage !== 'ruined';
  lightButton.hidden = harvest.stage !== 'pearl';
  lightButton.setAttribute('aria-pressed', String(harvest.light));
  closeButton.textContent = harvest.stage === 'ruined' ? 'Record loss' : 'Close case';
  closeButton.disabled = harvest.stage !== 'ruined' && harvest.placement === 'tray';
  appraisalPanel.hidden = harvest.stage !== 'stored';
  note.parentElement.hidden = harvest.stage === 'stored';
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

function startNode(seed) {
  finishGesture();
  const node = nodeFor(seed);
  specimen = createSpecimen({ seed: node.seed });
  harvest = createHarvest(node.seed);
  nodeSelect.value = String(node.seed);
  nodeId.textContent = nodeCode(node.seed);
  tool = 'blade';
  feedback.textContent = 'The specimen is intact.';
  note.textContent = toolHints[harvest.stage][tool];
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
    const next = harvest.stage === 'membrane'
      ? beginGesture(specimen, tool, location, event.timeStamp)
      : beginHarvestGesture(harvest, tool, location);
    if (!next) {
      if (tool === 'grip' && !exposed(specimen) && specimen.cut.some(Boolean)) report(messages.grab);
      return;
    }
    gesture = next;
    primary = event.pointerId;
    if (next.diffusing) reportInteraction('wet', event.timeStamp);
    if (next.sprayContact) sprayFazer(event.timeStamp);
  } else if (harvest.stage === 'membrane' && gesture?.tool === 'grip' && anchor === null
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
  const membrane = harvest.stage === 'membrane';
  let result = null;
  for (const sample of samples?.length ? samples : [event]) {
    const location = toBoard(sample, rect);
    const event = membrane
      ? moveGesture(specimen, gesture, location, sample.timeStamp)
      : moveHarvestGesture(harvest, gesture, location, sample.timeStamp);
    if (event && (event !== 'swollen' || !result)) result = event;
  }
  if (membrane) {
    reportInteraction(result, event.timeStamp);
  } else if (result === 'fazer') {
    sprayFazer(event.timeStamp);
  } else if (result) {
    report(messages[result]);
    updateTool();
  }
  requestRender();
});

function sprayFazer(time) {
  renderer.splash(gesture.sprayContact, time, 'fazer');
  report(messages.fazer);
}

function reportInteraction(result, time) {
  const pull = gesture.pull;
  if (result === 'peeled' || result === 'piece') {
    renderer.detach(pull);
    const damaged = result === 'peeled' && specimen.attachments.some(({ state }) => state === 'torn');
    report(damaged ? 'Carrom lobe exposed. Ragged remnants remain.' : messages[result]);
  } else if (result === 'tear' || result === 'dry-tear' || result === 'reverse-tear') {
    renderer.detach(pull, true);
    report(exposed(specimen) ? 'The last section tears. The carrom lobe is exposed with ragged remnants.' : messages[result]);
  } else if (!gesture.finished && pull?.catch && pull.load >= 0.14) {
    report(messages[pull.catch]);
  } else if (result === 'wet') {
    renderer.splash(gesture.wetContact, time);
    report(peelIsWet(specimen) ? messages.soaked : messages.wet);
  } else if (result === 'cut' || result === 'nick') {
    report(messages[result]);
  }
  if (harvest.stage === 'membrane' && exposed(specimen)) {
    openBlisters(harvest, specimen, time);
    updateTool();
  }
}

function endPointer(event) {
  if (event.pointerId === primary) {
    if (event.type === 'pointerup') {
      const result = finishHarvestGesture(harvest, gesture);
      if (result) {
        report(messages[result]);
        updateTool();
      }
    }
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
  if (next === tool || !Object.hasOwn(toolHints[harvest.stage], next)) return;
  finishGesture();
  tool = next;
  updateTool();
  note.textContent = tool === 'wipe' && pearlIsClean(harvest)
    ? 'Roll the clean pearl under the work light.'
    : toolHints[harvest.stage][tool];
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

nodeSelect.addEventListener('change', () => startNode(Number(nodeSelect.value)));
document.querySelector('#reset').addEventListener('click', () => startNode(specimen.seed));
lightButton.addEventListener('click', () => {
  harvest.light = !harvest.light;
  if (harvest.light && !pearlIsClean(harvest)) {
    report('The work light shows coating still on the pearl.');
  }
  updateTool();
  requestRender();
});
closeButton.addEventListener('click', () => {
  const appraisal = storeHarvest(harvest);
  if (!appraisal) return;
  finishGesture();
  harvest.light = true;
  document.querySelector('#appraisal-outcome').textContent = appraisal.outcome;
  document.querySelector('#appraisal-size').textContent = `${appraisal.size} · ${appraisal.diameter} mm`;
  document.querySelector('#appraisal-amber').textContent = `${appraisal.amberDepth} / 100`;
  document.querySelector('#appraisal-clarity').textContent = `${appraisal.clarity} / 100`;
  document.querySelector('#appraisal-observation').textContent = appraisal.observation;
  report(appraisal.observation);
  updateTool();
});
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

startNode(COMMON_NODE.seed);
