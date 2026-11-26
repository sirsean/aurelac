import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const [branch, ...extra] = process.argv.slice(2);
if (!branch || extra.length) throw new Error('Usage: npm run deploy -- <git-branch>');

const current = spawnSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' });
if (current.status !== 0 || current.stdout.trim() !== branch) {
  throw new Error(`Check out ${branch} before deploying it.`);
}

const base = JSON.parse(await readFile(resolve(root, 'wrangler.json'), 'utf8'));
const config = { ...base, assets: { ...base.assets, directory: resolve(root, base.assets.directory) } };
delete config.$schema;

if (branch !== 'main') {
  const clean = branch.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const hash = createHash('sha256').update(branch).digest('hex').slice(0, 8);
  const slug = clean === branch && clean.length <= 48
    ? clean
    : `${(clean || 'branch').slice(0, 39).replace(/-$/, '')}-${hash}`;
  config.name = `${base.name}-${slug}`;
  config.routes = base.routes.map((route) => ({ ...route, pattern: `${slug}.${route.pattern}` }));
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`);
}

const temp = await mkdtemp(join(tmpdir(), 'aurelac-deploy-'));
try {
  const path = join(temp, 'wrangler.json');
  await writeFile(path, JSON.stringify(config, null, 2));
  run('npm', ['run', 'build']);
  run(process.execPath, [resolve(root, 'node_modules/wrangler/bin/wrangler.js'), 'deploy', '--config', path]);
} finally {
  await rm(temp, { recursive: true, force: true });
}
