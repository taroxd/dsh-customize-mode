import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { parseDocument } from 'yaml';
import { buildRuntime, HOST_MODULES } from './build-runtime.mjs';
import { PRESET_ID } from './state.js';

const root = new URL('./', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const patch = await readFile(new URL('cordis.patch.yml', root), 'utf8');
const document = parseDocument(patch, {
  customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: expression => ({ expression }) }],
});
assert.deepEqual(document.errors, []);
assert.deepEqual(document.warnings, []);
const rows = document.toJS()[0].insert;
const preset = rows.find(row => row.id === 'preset-customize-mode');

function allRows(entries) {
  return entries.flatMap(row => [row, ...(row.group ? allRows(row.config) : [])]);
}

const plugins = allRows(preset.config.plugins);

test('Loader entry and preset identity match the runtime exports and controller', () => {
  const host = rows.find(row => row.id === PRESET_ID);
  assert.ok(host, 'The Host plugin must be declared');
  assert.equal(host.name, manifest.exports['.']);
  assert.equal(host.name, `./runtime/${manifest.version}/index.js`);
  assert.equal(preset.name, '@deepseek-ai/dsh-agent-preset');
  assert.equal(preset.config.id, PRESET_ID);
});

test('preset selects the platform shell and keeps subagents in the inherited tool layer', () => {
  const shells = plugins.filter(row => ['tool-bash', 'tool-pwsh'].includes(row.id));
  assert.equal(shells.length, 2);
  for (const platform of ['win32', 'darwin', 'linux']) {
    const active = shells.filter(row => !vm.runInNewContext(row.disabled.expression, { process: { platform } }));
    assert.deepEqual(active.map(row => row.id), [platform === 'win32' ? 'tool-pwsh' : 'tool-bash']);
  }
  assert.equal(plugins.find(row => row.id === 'tool-subagent').config.modelSelectionSettings, false);
  for (const id of ['tool-subagent', 'tool-subagent-fork']) {
    const config = plugins.find(row => row.id === id).config;
    assert.equal(config.agentPreset, undefined);
    assert.equal(config.allowedAgentPresets, undefined);
  }
});

test('runtime build is reproducible and works from a directory with spaces', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'customize mode build-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = pathToFileURL(directory + '/');
  const names = ['package.json', 'cordis.patch.yml', ...HOST_MODULES];
  for (const name of names) {
    await writeFile(new URL(name, fixture), await readFile(new URL(name, root)));
  }
  const result = await buildRuntime(fixture);
  assert.equal(result.entry, manifest.exports['.']);
  for (const name of HOST_MODULES) {
    const built = new URL(`runtime/${manifest.version}/${name}`, fixture);
    assert.deepEqual(await readFile(built), await readFile(new URL(name, root)));
  }
  assert.deepEqual(await buildRuntime(fixture), result);
  const changed = { ...manifest, version: '9.9.9' };
  await writeFile(new URL('package.json', fixture), JSON.stringify(changed));
  await assert.rejects(buildRuntime(fixture), /match the package version/);
});

test('every Host import is a packaged module, a Node builtin, or a declared dependency', async () => {
  const queue = ['index.js'];
  const visited = new Set();
  while (queue.length) {
    const name = queue.pop();
    if (visited.has(name)) continue;
    visited.add(name);
    const source = await readFile(new URL(name, root), 'utf8');
    for (const [, specifier] of source.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g)) {
      if (specifier.startsWith('./')) {
        const dependency = specifier.slice(2);
        assert.ok(HOST_MODULES.includes(dependency), `Missing runtime module: ${dependency}`);
        queue.push(dependency);
      } else {
        assert.ok(specifier.startsWith('node:') || Object.hasOwn(manifest.dependencies, specifier), `Undeclared dependency: ${specifier}`);
      }
    }
  }
});

test('package resources are local and both metadata translations are complete', async () => {
  const locales = await Promise.all(['en', 'zh'].map(async locale => JSON.parse(await readFile(new URL(manifest.exports['./locale/*.json'].replace('*', locale), root), 'utf8'))));
  assert.deepEqual(Object.keys(locales[0].meta).sort(), Object.keys(locales[1].meta).sort());
  for (const locale of locales) {
    assert.ok(locale.meta.title.length > 0);
    assert.ok(locale.meta.description.length > 0);
  }
  await readFile(new URL(manifest.exports['./client'], root));
  const icon = await readFile(new URL(manifest.exports['./icon'], root), 'utf8');
  assert.match(icon, /^<svg\b/);
  assert.doesNotMatch(icon, /<script\b|<foreignObject\b|(?:href|src)\s*=/i);
  assert.ok(Buffer.byteLength(icon) <= 256 * 1024);
});

test('authored files contain no home paths, credential values, or private key blocks', async () => {
  const ignored = new Set(['.git', 'node_modules', '.pnpm-store', 'runtime', 'artifacts', 'coverage']);
  const forbidden = [
    /[A-Za-z]:[\\/](?:Users|workspace|local)[\\/]/,
    /\/(?:Users|home)\/[\w.-]+\//,
    /\b(?:sk-|ghp_|github_pat_)[A-Za-z0-9_]{20,}/,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /https?:\/\/[^\s/@]+:[^\s/@]+@/,
  ];
  async function scan(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
      if (entry.isDirectory()) await scan(url);
      else {
        const text = await readFile(url, 'utf8');
        for (const pattern of forbidden) assert.doesNotMatch(text, pattern, url.pathname);
      }
    }
  }
  await scan(root);
});
