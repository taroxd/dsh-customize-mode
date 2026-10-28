import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const HOST_MODULES = [
  'index.js',
  'state.js',
  'policy.js',
  'controller.js',
  'defaults.js',
  'settings.js',
  'errors.js',
  'preview.js',
  'protocol.js',
];

export async function buildRuntime(root = new URL('./', import.meta.url)) {
  const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  const { version } = manifest;
  if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) {
    throw new Error('The package version must be a semantic version.');
  }
  const entry = `./runtime/${version}/index.js`;
  const patch = await readFile(new URL('cordis.patch.yml', root), 'utf8');
  if (manifest.exports['.'] !== entry || !patch.includes(`name: '${entry}'`)) {
    throw new Error('Update the package export and Loader patch to match the package version.');
  }
  const sources = await Promise.all(HOST_MODULES.map(name => readFile(new URL(name, root))));
  const target = new URL(`runtime/${version}/`, root);
  await mkdir(target, { recursive: true });
  await Promise.all(HOST_MODULES.map((name, index) => writeFile(new URL(name, target), sources[index])));
  return { version, entry, modules: HOST_MODULES };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  console.log(JSON.stringify(await buildRuntime()));
}
