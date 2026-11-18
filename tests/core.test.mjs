import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { Vault, generatePassword } from '../dist/security/vault.js';
import { loadProfiles, prepareProfiles, report, alternativeUsername } from '../dist/accounts/service.js';
import { setState } from '../dist/accounts/model.js';
import { paths } from '../dist/config/paths.js';
import { acquireLock } from '../dist/storage/lock.js';
import { trustedUrl } from '../dist/automation/inspect.js';

const profiles = await loadProfiles();
async function workspace(t) {
  const base = path.join(process.cwd(), '.work', 'tests');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, 'gmail-automation-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'data', 'private'), { recursive: true });
  return root;
}
test('diez perfiles exactos, carpetas separadas y contraseñas únicas', async t => {
  const root = await workspace(t);
  const db = await prepareProfiles(profiles, root);
  assert.equal(db.accounts.length, 10);
  assert.equal(new Set(db.accounts.map(a => a.password)).size, 10);
  assert.equal(new Set(profiles.map(p => paths(root).profile(p.id))).size, 10);
  assert.ok(db.accounts.every(a => a.state === 'PREPARADA'));
  for (let i = 0; i < 50; i++) {
    const pw = generatePassword(); assert.equal(pw.length, 28);
    for (const pattern of [/[a-z]/, /[A-Z]/, /[0-9]/, /[!@#$%_-]/]) assert.match(pw, pattern);
  }
});
test('cifrado autenticado, reinicio, clave incorrecta y manipulación sin sobrescritura', async t => {
  const root = await workspace(t);
  const filename = paths(root).vault;
  const db = await prepareProfiles(profiles, root);
  const vault = new Vault(filename);
  vault.initialize('correct horse battery staple');
  setState(db.accounts[0], 'REQUIERE_INTERVENCION', 'CAPTCHA');
  db.accounts[0].lastUrl = 'https://accounts.google.com/signup?secret-session=example';
  await vault.save(db);
  const first = await readFile(filename, 'utf8');
  assert.ok(!first.includes(db.accounts[0].password));
  assert.ok(!first.includes(db.accounts[0].username));
  assert.ok(!first.includes('secret-session'));
  await vault.save(db);
  assert.notEqual(first, await readFile(filename, 'utf8'), 'cada escritura usa un IV nuevo');
  vault.close();
  const restarted = new Vault(filename);
  const persisted = await restarted.unlock('correct horse battery staple');
  assert.deepEqual(persisted, db);
  restarted.close();
  const unchanged = await readFile(filename, 'utf8');
  await assert.rejects(new Vault(filename).unlock('incorrect master password'), /VAULT_UNLOCK_FAILED/);
  assert.equal(unchanged, await readFile(filename, 'utf8'));
  const envelope = JSON.parse(unchanged);
  const modified = Buffer.from(envelope.ciphertext, 'base64'); modified[0] ^= 1;
  envelope.ciphertext = modified.toString('base64');
  await writeFile(filename, JSON.stringify(envelope));
  await assert.rejects(new Vault(filename).unlock('correct horse battery staple'), /VAULT_UNLOCK_FAILED/);
});
test('no admite marcar completa sin evidencia y el informe excluye secretos', async t => {
  const db = await prepareProfiles(profiles, await workspace(t));
  const account = db.accounts[0];
  assert.throws(() => setState(account, 'COMPLETADA'), /VERIFICATION_REQUIRED/);
  setState(account, 'BLOQUEADA', 'RATE_LIMIT');
  const output = JSON.stringify(report(db, profiles));
  for (const a of db.accounts) { assert.ok(!output.includes(a.password)); assert.ok(!output.includes(a.username)); }
  assert.equal(report(db, profiles).completed, 0);
  assert.ok(output.includes('BLOQUEADA'));
});
test('solo una instancia; un bloqueo de proceso inexistente puede recuperarse', async t => {
  const filename = paths(await workspace(t)).lock;
  const release = await acquireLock(filename);
  await assert.rejects(acquireLock(filename), /ALREADY_RUNNING/);
  await release();
  const releaseAgain = await acquireLock(filename); await releaseAgain();
  await writeFile(filename, JSON.stringify({ pid: 2147483647, token: 'stale-test' }));
  const releaseStale = await acquireLock(filename); await releaseStale();
});
test('rutas y destinos externos no pueden hacerse pasar por Google', () => {
  for (const id of ['../01', '00', '11', '1', 'C:\\temp', '01/else']) assert.throws(() => paths().profile(id));
  for (const url of ['http://accounts.google.com/signup', 'https://accounts.google.com.evil.test/', 'https://evil.test/', 'https://user:pass@accounts.google.com/', 'https://accounts.google.com:8443/', 'javascript:alert(1)']) assert.equal(trustedUrl(url), false);
  assert.equal(trustedUrl('https://accounts.google.com/signup'), true);
  assert.equal(trustedUrl('https://myaccount.google.com/'), true);
});
test('alternativas mantienen el formato personal admitido', () => {
  for (const profile of profiles) {
    const alternative = alternativeUsername(profile);
    assert.match(alternative, /^[a-z0-9.]{6,30}$/);
    assert.notEqual(alternative, profile.suggestedUsername);
  }
});
