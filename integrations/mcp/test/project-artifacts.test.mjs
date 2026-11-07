import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Execution } from '../dist/execution.js';

const hash = value => createHash('sha256').update(value).digest('hex');
const dll = Buffer.from('allowed fixture DLL bytes');
const host = {
  config: { execution: { native_allowlist: [hash(dll)] } },
  resolve: value => value.replaceAll('\\', '/'),
};
const manifest = (relative, row) => ({ relative, bytes: Buffer.from('vela-project|1\n' + row + '\n') });
const natives = (entries, root) => Execution.prototype.natives.call({ host }, entries, root);

test('resource execution restriction applies to the selected project only', () => {
  const resource = manifest('resources/vela.project', 'resource|assets/settings.json|settings.json');
  assert.throws(() => natives([resource], resource.relative), /require local CLI/);
  assert.equal(natives([resource], 'other/vela.project').size, 0);
});

test('explicit native metadata keeps the byte allowlist', () => {
  const artifact = { relative: 'native/adapter.dll', bytes: dll };
  const approved = manifest('vela.project', 'native|adapter.dll|native/adapter.dll|windows-x64|1|shared');
  assert.deepEqual(natives([approved, artifact], approved.relative).get('adapter.dll'), dll);
  assert.throws(() => natives([approved, { ...artifact, bytes: Buffer.from('changed') }], approved.relative), /not authorized/);
  const wrongAbi = manifest('vela.project', 'native|adapter.dll|native/adapter.dll|windows-x64|2|shared');
  assert.throws(() => natives([wrongAbi, artifact], wrongAbi.relative), /Invalid native declaration/);
});
