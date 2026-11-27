import './style.css';
import { BOARD, TUNING, distance, point } from './geometry.js';
import {
  COATING_PATCHES, RUPTURE_DURATION, beginHarvestGesture, createHarvest, finishHarvestGesture, moveHarvestGesture,
  openBlisters, pearlIsClean, storeHarvest,
} from './harvest.js';
import { beginGesture, continuePeel, createSpecimen, dryMembrane, exposed, moveGesture, peelIsWet } from './specimen.js';
import { COMMON_NODE, nodeCode, nodeFor } from './nodes.js';
import { beginSharpening, bladeDrag, createBlade, sharpenBlade } from './blade.js';
import { collectedPearls, loadWorkbench, recordPearl, saveWorkbench } from './save.js';
import { createRenderer } from './render.js';
import { createFeedback, createFeedbackSettings } from './feedback.js';
import { drawPearlThumbnail, pearlColorName } from './pearl-render.js';

const params = new URLSearchParams(location.search);
const playtest = params.get('playtest');
const catchDrill = playtest === 'catch';
const debug = params.get('debug') === '1';
if (['starter', 'intact', 'catch'].includes(playtest)) document.documentElement.classList.add('playtest');

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
const bladeFlat = document.querySelector('#blade-flat');
const collection = document.querySelector('#collection');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const renderer = createRenderer(canvas, { debug, reducedMotion });
const settings = createFeedbackSettings();
const effects = createFeedback(settings);

let specimen = createSpecimen();
let harvest = createHarvest();
let blade = createBlade();
let runId = null;
let tool = 'blade';
let gesture = null;
let primary = null;
let anchor = null;
let frame = null;
let dryingTimer = null;
let storage = null;
try { if (!catchDrill) storage = window.localStorage; } catch { /* The bench also runs without browser storage. */ }
const pearls = new Map();

const materialCues = {
  cut: 'cut', 'blade-drag': 'drag', nick: 'tear', wet: 'spray',
  peeled: 'release', piece: 'release', tear: 'tear', 'dry-tear': 'tear', 'reverse-tear': 'tear',
  'cut-part': 'fold', 'blister-cut': 'fold', 'acid-nick': 'tear', rupture: 'rupture',
  'blister-lifted': 'release', 'pearl-revealed': 'release', seated: 'case', rim: 'rim',
  'coating-wiped': 'wipe', 'pearl-clean': 'wipe',
};
const toolChanges = new Set(['pearl-revealed', 'pearl-clean', 'seated', 'rim', 'tray', 'rupture']);

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
  rupture: 'The blister ruptures. Gas escapes into the opening.',
  loss: 'The root pearl is gone.',
  fazer: 'Hold the spray on the amber goop until it turns green.',
  'coating-wiped': 'The treated coating is lifting off.',
  'coating-sticky': 'The amber coating is still sticky. Spray it with Fazer.',
  'coating-undercoat': 'More amber goop showed through. Spray that patch again.',
  'pearl-clean': 'The pearl is clean. Inspect it under the light or put it in the case.',
  seated: 'The pearl sits flat in the padded recess.',
  rim: 'The pearl rocks on the rim. Re-seat it before closing.',
  tray: 'Place the pearl in the padded recess.',
  'blade-drag': 'The husk bunches under the blade.',
  sharp: 'The blade draws cleanly again.',
};

const toolHints = {
  membrane: {
    blade: 'Trace the dark crease with the blade.',
    diffuser: 'Sweep the diffuser over the exposed pink tissue.',
    grip: 'Take the raised pink edge.',
    stone: 'Draw the blade back and forth along the stone.',
  },
  blisters: {
    blade: 'Cut a pale fold when the blister settles.',
    grip: 'Drag each cut blister clear of the opening.',
    stone: 'Draw the blade back and forth along the stone.',
  },
  pearl: {
    fazer: 'Hold or sweep Fazer slowly over the amber coating until it turns green.',
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
  ruined: 'The ruptured Aurelac node on the harvest bench',
  stored: 'The appraisal view of the root pearl and its case',
};

function report(text) {
  if (feedback.textContent !== text) feedback.textContent = text;
  if (note.textContent !== text) note.textContent = text;
}

function lossReady(time = performance.now()) {
  return harvest.stage === 'ruined' && (reducedMotion || time - harvest.rupture.at >= RUPTURE_DURATION);
}

function render(time) {
  frame = null;
  const wasWet = peelIsWet(specimen);
  const drying = dryMembrane(specimen, time);
  if (wasWet && !peelIsWet(specimen)) report(messages.dried);
  if (gesture?.pull && !gesture.finished) reportInteraction(continuePeel(specimen, gesture, time), time);
  if (gesture?.sprayContact && moveHarvestGesture(harvest, gesture, gesture.last, time)) sprayFazer(time);
  const animating = renderer.draw(specimen, harvest, gesture, time, tool);
  if (pearlActions.hidden && lossReady(time)) {
    report(messages.loss);
    updateTool(time);
  }
  if (animating || gesture?.pull?.settling || gesture?.sprayContact) requestRender();
  else if (drying) dryingTimer = setTimeout(requestRender, 65);
}

function requestRender() {
  clearTimeout(dryingTimer);
  dryingTimer = null;
  frame ??= requestAnimationFrame(render);
}

function updateTool(time) {
  const ruined = harvest.stage === 'ruined';
  const canRecord = lossReady(time);
  const options = toolHints[ruined ? 'blisters' : harvest.stage];
  if (!Object.hasOwn(options, tool)) tool = Object.keys(options)[0];
  instrument.dataset.stage = harvest.stage;
  canvas.setAttribute('aria-label', benchDescriptions[harvest.rupture ? 'ruined' : harvest.stage]);
  bladeFlat.setAttribute('opacity', String(bladeDrag(blade)));
  nodeSelect.value = String(specimen.seed);
  nodeSelect.disabled = catchDrill;
  nodeId.textContent = nodeCode(specimen.seed);
  tray.hidden = canRecord || Object.keys(options).length === 0;
  for (const button of tools) {
    button.hidden = !Object.hasOwn(options, button.dataset.tool);
    button.disabled = ruined;
    button.setAttribute('aria-pressed', String(button.dataset.tool === tool));
    if (button.dataset.tool === 'wipe') button.textContent = pearlIsClean(harvest) ? 'Roll' : 'Wipe';
  }
  pearlActions.hidden = harvest.stage !== 'pearl' && !canRecord;
  lightButton.hidden = harvest.stage !== 'pearl';
  lightButton.setAttribute('aria-pressed', String(harvest.light));
  closeButton.textContent = ruined ? 'Record loss' : 'Close case';
  closeButton.disabled = ruined ? !canRecord : harvest.placement === 'tray';
  appraisalPanel.hidden = harvest.stage !== 'stored';
  note.parentElement.hidden = harvest.stage === 'stored';
}

function persist() {
  if (!runId) return;
  saveWorkbench(storage, { id: runId, specimen, harvest, blade, settings }, performance.now());
}

function finishGesture() {
  const worked = Boolean(gesture);
  const pointers = [primary, anchor];
  primary = null;
  anchor = null;
  gesture = null;
  for (const pointer of pointers) {
    if (pointer !== null && canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
  }
  if (worked) {
    bladeFlat.setAttribute('opacity', String(bladeDrag(blade)));
    persist();
  }
  requestRender();
}

function startNode(seed) {
  finishGesture();
  const node = nodeFor(seed);
  const layoutSeed = catchDrill ? undefined : Math.floor(Math.random() * 0x100000000);
  specimen = createSpecimen({ seed: node.seed, layoutSeed });
  if (catchDrill) {
    specimen.cut.fill(true, 22, 44);
    specimen.attachments.slice(0, TUNING.attachmentsPerSection).forEach((item) => { item.wetness = 1; });
    specimen.wetnessTime = performance.now();
  }
  const undercoatPatch = Math.random() < 1 / 3 ? Math.floor(Math.random() * COATING_PATCHES.length) : -1;
  const pattern = Math.floor(Math.random() * 0x100000000);
  harvest = createHarvest(node.seed, { undercoatPatch, pattern });
  runId = crypto.randomUUID();
  tool = catchDrill ? 'grip' : 'blade';
  feedback.textContent = catchDrill ? messages.soaked : 'The specimen is intact.';
  note.textContent = toolHints[harvest.stage][tool];
  renderer.clearMotion();
  updateTool();
  persist();
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
  effects.activate();
  const location = toBoard(event, canvas.getBoundingClientRect());
  if (primary === null) {
    const next = tool === 'stone'
      ? beginSharpening(location)
      : harvest.stage === 'membrane'
        ? beginGesture(specimen, tool, location, event.timeStamp, blade)
        : beginHarvestGesture(harvest, tool, location, blade, event.timeStamp);
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
    const event = gesture.tool === 'stone'
      ? sharpenBlade(blade, gesture, location)
      : membrane
        ? moveGesture(specimen, gesture, location, sample.timeStamp)
        : moveHarvestGesture(harvest, gesture, location, sample.timeStamp);
    if (event === 'coating-undercoat') result = event;
    else if (event && result !== 'coating-undercoat' && (event !== 'swollen' || !result)) result = event;
  }
  if (gesture.tool === 'stone') {
    if (result) effects.play('stone');
    if (result === 'sharp') report(messages.sharp);
  } else if (membrane) {
    reportInteraction(result, event.timeStamp);
  } else if (result === 'fazer') {
    sprayFazer(event.timeStamp);
  } else if (result) {
    reportHarvestInteraction(result);
  }
  requestRender();
});

function sprayFazer(time) {
  effects.play('spray');
  renderer.splash(gesture.sprayContact, time, 'fazer');
  report(messages.fazer);
}

function reportHarvestInteraction(result) {
  if (materialCues[result]) effects.play(materialCues[result]);
  report(result === 'rupture' && lossReady() ? messages.loss : messages[result]);
  if (result === 'rupture') finishGesture();
  if (toolChanges.has(result)) updateTool();
}

function reportInteraction(result, time) {
  const pull = gesture.pull;
  const caught = !gesture.finished && pull?.catch && pull.load >= 0.14;
  if (result === 'cut' && gesture.bunch > 0.18) effects.play('drag');
  else if (materialCues[result]) effects.play(materialCues[result]);
  else if (caught && !gesture.caught) effects.play('drag');
  gesture.caught = Boolean(caught);
  if (result === 'peeled' || result === 'piece') {
    renderer.detach(pull);
    const damaged = result === 'peeled' && specimen.attachments.some(({ state }) => state === 'torn');
    report(damaged ? 'Carrom lobe exposed. Ragged remnants remain.' : messages[result]);
  } else if (result === 'tear' || result === 'dry-tear' || result === 'reverse-tear') {
    renderer.detach(pull, true);
    report(exposed(specimen) ? 'The last section tears. The carrom lobe is exposed with ragged remnants.' : messages[result]);
  } else if (caught) {
    report(messages[pull.catch]);
  } else if (result === 'wet') {
    renderer.splash(gesture.wetContact, time);
    report(peelIsWet(specimen) ? messages.soaked : messages.wet);
  } else if (result === 'cut' || result === 'nick' || result === 'blade-drag') {
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
      effects.activate();
      if (gesture.tool === 'fazer') {
        moveHarvestGesture(harvest, gesture, toBoard(event, canvas.getBoundingClientRect()), event.timeStamp);
      }
      const result = finishHarvestGesture(harvest, gesture);
      if (result) reportHarvestInteraction(result);
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
  effects.activate();
  if (next === tool || !Object.hasOwn(toolHints[harvest.stage], next)) return;
  finishGesture();
  tool = next;
  updateTool();
  note.textContent = tool === 'wipe' && pearlIsClean(harvest)
    ? 'Roll the clean pearl under the work light.'
    : toolHints[harvest.stage][tool];
}

function onBenchPress(button, press) {
  let touchRelease = -Infinity;
  button.addEventListener('click', (event) => {
    const touchClick = event.pointerType ? event.pointerType === 'touch' : event.detail > 0;
    if (!touchClick || event.timeStamp - touchRelease > 500) press();
  });
  button.addEventListener('pointerup', (event) => {
    // Chromium can suppress the synthetic click when a tap follows a quick swipe.
    if (event.pointerType !== 'touch' || !event.isPrimary || button.disabled) return;
    const target = document.elementFromPoint(event.clientX, event.clientY);
    if (button.contains(target)) {
      touchRelease = event.timeStamp;
      press();
    }
  });
}

for (const button of tools) onBenchPress(button, () => selectTool(button.dataset.tool));

nodeSelect.addEventListener('change', () => startNode(Number(nodeSelect.value)));
document.querySelector('#reset').addEventListener('click', () => startNode(specimen.seed));
document.querySelector('#next-node').addEventListener('click', () => startNode(specimen.seed));
onBenchPress(lightButton, () => {
  harvest.light = !harvest.light;
  if (harvest.light && !pearlIsClean(harvest)) {
    report('The work light shows coating still on the pearl.');
  }
  updateTool();
  persist();
  requestRender();
});
function showAppraisal(appraisal) {
  document.querySelector('#appraisal-outcome').textContent = appraisal.outcome;
  document.querySelector('#appraisal-color').textContent = appraisal.outcome === 'Ruined'
    ? '' : pearlColorName(harvest.intrinsic);
  document.querySelector('#appraisal-size').textContent = `${appraisal.size} · ${appraisal.diameter} mm`;
  document.querySelector('#appraisal-amber').textContent = `${appraisal.amberDepth} / 100`;
  document.querySelector('#appraisal-clarity').textContent = `${appraisal.clarity} / 100`;
  document.querySelector('#appraisal-observation').textContent = appraisal.observation;
  report(appraisal.observation);
  updateTool();
}

onBenchPress(closeButton, () => {
  if (harvest.stage === 'ruined' && !lossReady()) return;
  finishGesture();
  const appraisal = storeHarvest(harvest);
  if (!appraisal) return;
  harvest.light = !harvest.rupture;
  const pearl = recordPearl(storage, runId, specimen.seed, appraisal);
  if (pearl) pearls.set(pearl.id, pearl);
  showAppraisal(appraisal);
  persist();
});

document.querySelector('#open-collection').addEventListener('click', () => {
  finishGesture();
  for (const pearl of collectedPearls(storage)) pearls.set(pearl.id, pearl);
  const entries = [...pearls.values()].sort((left, right) => right.storedAt - left.storedAt);
  document.querySelector('#collection-count').textContent = entries.length
    ? `${entries.length} root ${entries.length === 1 ? 'pearl' : 'pearls'}`
    : 'Harvest and store a root pearl to add it to your collection.';
  const items = entries.map(({ seed, appraisal }) => {
    const node = nodeFor(seed);
    const item = document.createElement('li');
    const thumbnail = document.createElement('canvas');
    thumbnail.width = thumbnail.height = 96;
    thumbnail.setAttribute('aria-hidden', 'true');
    drawPearlThumbnail(thumbnail, node.pearl, appraisal.pattern ?? node.seed);
    const description = document.createElement('div');
    const title = document.createElement('strong');
    const detail = document.createElement('p');
    title.textContent = `${pearlColorName(node.pearl)} · ${nodeCode(seed)}`;
    detail.textContent = `${appraisal.outcome} · ${appraisal.diameter} mm · Amber ${appraisal.amberDepth} · Clarity ${appraisal.clarity}`;
    description.append(title, detail);
    item.append(thumbnail, description);
    return item;
  });
  document.querySelector('#collection-list').replaceChildren(...items);
  collection.showModal();
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

const saved = loadWorkbench(storage, performance.now());
if (saved) {
  ({ id: runId, specimen, harvest, blade } = saved);
  Object.assign(settings, saved.settings);
  updateTool();
  if (harvest.appraisal) showAppraisal(harvest.appraisal);
  else if (harvest.stage === 'ruined') report(lossReady() ? messages.loss : messages.rupture);
  else report(specimen.cut.some(Boolean) ? 'Harvest resumed.' : 'The specimen is intact.');
  requestRender();
} else {
  startNode(COMMON_NODE.seed);
}

for (const name of ['sound', 'haptics']) {
  const input = document.querySelector(`#${name}`);
  input.checked = settings[name];
  input.addEventListener('change', () => {
    settings[name] = input.checked;
    if (name === 'sound') effects.activate();
    persist();
  });
}
document.querySelector('#haptics-option').hidden = !navigator.vibrate;
