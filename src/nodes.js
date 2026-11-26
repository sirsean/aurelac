const teachingLayout = [
  { along: 0.20, across: -0.12, angle: 0.52 },
  { along: 0.35, across: 0.45, angle: 1.95 },
  { along: 0.50, across: -0.48, angle: 0.19 },
  { along: 0.64, across: 0.47, angle: -0.68 },
  { along: 0.80, across: -0.22, angle: 1.17 },
];

export const NODES = [
  {
    seed: 107,
    name: 'Broad common node',
    rarity: 'Common',
    pearl: { size: 'Large', diameter: 25, amberDepth: 74, clarity: 96, scale: 1 },
    shell: { width: 1, height: 1, colors: ['#d9c5a9', '#bb9e80', '#8b6952'] },
    timing: { cycle: 2700, slack: 1200, stagger: 280 },
    foldContrast: 1,
    blisters: teachingLayout,
  },
  {
    seed: 154,
    name: 'Small common node',
    rarity: 'Common',
    pearl: { size: 'Small', diameter: 17, amberDepth: 67, clarity: 92, scale: 0.79 },
    shell: { width: 0.87, height: 0.84, colors: ['#cbb1a0', '#a28073', '#77584f'] },
    timing: { cycle: 2850, slack: 1080, stagger: 350 },
    foldContrast: 0.95,
    blisters: [
      teachingLayout[0],
      { along: 0.33, across: 0.47, angle: -1.24 },
      teachingLayout[2],
      { along: 0.68, across: 0.41, angle: 2.26 },
      teachingLayout[4],
    ],
  },
  {
    seed: 391,
    name: 'Rare node',
    rarity: 'Rare',
    pearl: { size: 'Large', diameter: 27, amberDepth: 91, clarity: 99, scale: 1.10 },
    shell: { width: 0.94, height: 1.045, colors: ['#d6cfb8', '#a5a98a', '#6b745f'] },
    timing: { cycle: 2420, slack: 600, stagger: 435 },
    foldContrast: 0.75,
    blisters: [
      { along: 0.19, across: 0.22, angle: 1.4 },
      { along: 0.32, across: -0.34, angle: 0.18 },
      { along: 0.49, across: 0.39, angle: 2.32 },
      { along: 0.66, across: -0.43, angle: -0.69 },
      { along: 0.79, across: 0.19, angle: 1.72 },
    ],
  },
];

export const COMMON_NODE = NODES[0];

export function nodeFor(seed) {
  return NODES.find((node) => node.seed === seed) ?? COMMON_NODE;
}

export function nodeCode(seed) {
  return `BG–${seed}`;
}
