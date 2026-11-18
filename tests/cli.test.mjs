import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('la ayuda funciona sin contraseña ni terminal interactiva', () => {
  const result = spawnSync(process.execPath, ['dist/cli/main.js', '--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /GOOGLE ACCOUNT AUTOMATION/);
  assert.match(result.stdout, /resume/);
});
test('rechaza ID con recorrido de directorio antes de abrir el almacén', () => {
  const result = spawnSync(process.execPath, ['dist/cli/main.js', 'open', '../01'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /01\.\.10/);
  assert.ok(!result.stderr.includes('at file:'));
});
