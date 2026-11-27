import { createFeedbackSettings } from './feedback.js';
import { TUNING, clamp, layoutFor } from './geometry.js';
import { COATING_PATCHES } from './harvest.js';
import { NODES } from './nodes.js';
import { dryMembrane } from './specimen.js';

const version = 1;
const workbenchKey = 'aurelac.workbench.v1';
const pearlPrefix = 'aurelac.pearl.v1.';
const stages = ['membrane', 'blisters', 'pearl', 'ruined', 'stored'];

function read(storage, key) {
  try {
    return JSON.parse(storage?.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

function write(storage, key, value) {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function saveWorkbench(storage, state, clock, wall = Date.now()) {
  return write(storage, workbenchKey, { version, clock, wall, ...state });
}

export function loadWorkbench(storage, clock, wall = Date.now()) {
  const saved = read(storage, workbenchKey);
  if (saved?.version !== version || typeof saved.id !== 'string'
    || !Number.isFinite(saved.clock) || !Number.isFinite(saved.wall)) return null;

  const { id, specimen, harvest, blade } = saved;
  const node = NODES.find(({ seed }) => seed === specimen?.seed);
  if (!node || harvest?.seed !== node.seed || !stages.includes(harvest.stage)
    || (specimen.layoutSeed !== undefined && specimen.layoutSeed !== (specimen.layoutSeed >>> 0))
    || !Array.isArray(specimen.cut) || specimen.cut.length !== TUNING.seamSegments
    || !Array.isArray(specimen.attachments) || specimen.attachments.length !== layoutFor(specimen).anchors.length
    || !Array.isArray(specimen.nicks) || !Number.isFinite(specimen.wetnessTime)
    || !Array.isArray(harvest.blisters) || !Array.isArray(harvest.damage?.scars)
    || !Array.isArray(harvest.pearl?.coating) || harvest.pearl.coating.length !== COATING_PATCHES.length
    || !Number.isFinite(blade?.wear)
    || (harvest.stage === 'stored' && !harvest.appraisal)) return null;

  const shift = clock - saved.clock - Math.max(0, wall - saved.wall);
  specimen.wetnessTime += shift;
  dryMembrane(specimen, clock);
  harvest.layoutSeed = specimen.layoutSeed;
  harvest.intrinsic = node.pearl;
  harvest.pearl.pattern ??= node.seed;
  for (const coating of harvest.pearl.coating) {
    coating.treatment ??= coating.treated ? 1 : 0;
    coating.undercoat ??= 0;
    delete coating.treated;
  }
  for (const blister of harvest.blisters) {
    blister.started += shift;
    blister.timing = node.timing;
    blister.foldContrast = node.foldContrast;
  }
  if (harvest.rupture) harvest.rupture.at += shift;
  blade.wear = clamp(blade.wear);
  const settings = createFeedbackSettings(saved.settings);
  return { id, specimen, harvest, blade, settings };
}

export function recordPearl(storage, id, seed, appraisal, wall = Date.now()) {
  if (!appraisal || appraisal.outcome === 'Ruined') return null;
  const key = pearlPrefix + id;
  const existing = read(storage, key);
  if (existing?.version === version && existing.id === id) return existing;
  const record = { version, id, seed, appraisal, storedAt: wall };
  write(storage, key, record);
  return record;
}

export function collectedPearls(storage) {
  const pearls = [];
  try {
    for (let index = 0; index < (storage?.length ?? 0); index++) {
      const key = storage.key(index);
      if (!key?.startsWith(pearlPrefix)) continue;
      const entry = read(storage, key);
      if (entry?.version === version && entry.appraisal && entry.appraisal.outcome !== 'Ruined') pearls.push(entry);
    }
  } catch {
    return pearls;
  }
  return pearls.sort((left, right) => right.storedAt - left.storedAt);
}
