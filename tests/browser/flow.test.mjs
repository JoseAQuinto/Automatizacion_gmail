import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { BrowserManager } from '../../dist/browser/manager.js';
import { runAccount } from '../../dist/automation/runner.js';
import { authenticatedAs } from '../../dist/automation/inspect.js';
import { loadProfiles, prepareProfiles } from '../../dist/accounts/service.js';

const profiles = await loadProfiles();
const signup = 'https://accounts.google.com/signup';
const frame = body => `<!doctype html><html lang="es"><meta charset="utf-8"><body>${body}</body></html>`;
const next = url => `<button onclick="location.href='${url}'">Siguiente</button>`;
async function setup(t, scenario = 'normal') {
  const base = path.join(process.cwd(), '.work', 'tests');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, 'gmail-browser-test-'));
  const database = await prepareProfiles(profiles, root);
  const account = database.accounts[0];
  const manager = new BrowserManager(root);
  t.after(async () => { await manager.close(); await rm(root, { force: true, recursive: true }); });
  const page = await manager.open('01', true);
  const visits = [];
  // Se intercepta TODA petición: ni siquiera un fallo de fixture contacta Google.
  await page.context().route('**/*', async route => {
    const url = new URL(route.request().url()); visits.push(url.href);
    let body;
    if (url.hostname === 'myaccount.google.com') body = `<a aria-label="Cuenta de Google: Laura (${account.username}@gmail.com)" href="https://accounts.google.com/SignOutOptions">Cuenta</a>`;
    else if (url.hostname !== 'accounts.google.com') { await route.abort(); return; }
    else if (scenario === 'blocked') body = 'Demasiados intentos. Inténtalo más tarde.';
    else if (scenario === 'captcha') body = 'Verify you are human. CAPTCHA';
    else if (scenario === 'username') body = `<p>That username is taken. Try another username.</p><label>Nombre de usuario<input name="Username"></label>${next(`/username?attempt=${Number(url.searchParams.get('attempt') ?? 0) + 1}`)}`;
    else if (url.pathname === '/signup') body = `<label>Nombre<input name="firstName"></label><label>Apellidos<input name="lastName"></label>${next('/basic')}`;
    else if (url.pathname === '/basic') body = `<h1>Información básica</h1><input name="day"><input name="year">${next('/username')}`;
    else if (url.pathname === '/username') body = `<label>Nombre de usuario<input name="Username"></label>${next('/password')}`;
    else if (url.pathname === '/password') body = `<label>Contraseña<input name="Passwd" type="password" autocomplete="new-password"></label><input name="PasswdAgain" type="password">${next('/terms')}`;
    else if (url.pathname === '/terms') body = '<h1>Privacidad y condiciones</h1><button onclick="location.href=\'https://myaccount.google.com/\'">Acepto</button>';
    else { await route.abort(); return; }
    await route.fulfill({ contentType: 'text/html; charset=utf-8', body: frame(body) });
  });
  return { root, account, manager, page, visits };
}

test('flujo normal rellena campos, pausa datos y condiciones y verifica identidad', async t => {
  const { account, page } = await setup(t);
  const checkpoints = []; const reasons = [];
  const result = await runAccount({ page, account, profile: profiles[0], save: async () => { checkpoints.push(structuredClone(account)); },
    onIntervention: async reason => {
      reasons.push(reason);
      if (reason === 'PERSONAL_DATA') {
        await page.locator('[name=day]').fill('1'); await page.locator('[name=year]').fill('1990');
        await page.getByRole('button', { name: 'Siguiente' }).click();
      } else if (reason === 'TERMS') {
        await page.getByRole('button', { name: 'Acepto' }).click();
      } else assert.fail(`Intervención inesperada: ${reason}`);
      return 'resume';
    } });
  assert.equal(result, 'completed'); assert.equal(account.state, 'COMPLETADA'); assert.ok(account.verifiedAt);
  assert.deepEqual(reasons, ['PERSONAL_DATA', 'TERMS']);
  assert.ok(checkpoints.some(a => a.state === 'REQUIERE_INTERVENCION'));
  assert.equal(await authenticatedAs(page, 'otra.cuenta@gmail.com'), false);
});
test('CAPTCHA se guarda y se reanuda sin repetir el nombre ya completado', async t => {
  const { account, page, visits } = await setup(t, 'captcha');
  let saved = false;
  const first = await runAccount({ page, account, profile: profiles[0], save: async () => { saved = true; }, onIntervention: async () => 'stop' });
  assert.equal(first, 'paused'); assert.equal(account.reason, 'CAPTCHA'); assert.equal(saved, true);
  const signupVisits = visits.filter(url => url === signup).length;
  // El usuario ha completado personalmente el reto y llega a la cuenta.
  await page.goto('https://myaccount.google.com/');
  const resumed = await runAccount({ page, account, profile: profiles[0], save: async () => {}, onIntervention: async () => 'stop' });
  assert.equal(resumed, 'completed');
  assert.equal(visits.filter(url => url === signup).length, signupVisits);
});
test('el bloqueo detiene la ejecución sin reintentos', async t => {
  const { account, page, visits } = await setup(t, 'blocked');
  const result = await runAccount({ page, account, profile: profiles[0], save: async () => {}, onIntervention: async () => assert.fail('No debe reintentar') });
  assert.equal(result, 'blocked'); assert.equal(account.state, 'BLOQUEADA'); assert.equal(visits.length, 1);
});
test('limita a tres alternativas de usuario y conserva el estado de intervención', async t => {
  const { account, page, visits } = await setup(t, 'username');
  const result = await runAccount({ page, account, profile: profiles[0], save: async () => {}, onIntervention: async reason => {
    assert.equal(reason, 'USERNAME'); return 'stop';
  } });
  assert.equal(result, 'paused'); assert.equal(account.usernameAttempts, 3);
  assert.equal(account.reason, 'USERNAME'); assert.equal(visits.length, 4);
});
test('tras cerrar el navegador reanuda la URL guardada sin repetir pantallas enviadas', async t => {
  const { account, page, manager } = await setup(t);
  const first = await runAccount({ page, account, profile: profiles[0], save: async () => {}, onIntervention: async reason => {
    assert.equal(reason, 'PERSONAL_DATA'); return 'stop';
  } });
  assert.equal(first, 'paused'); assert.equal(account.lastUrl, 'https://accounts.google.com/basic');
  await manager.close();
  const restarted = await manager.open('01', true);
  const visits = [];
  await restarted.context().route('**/*', async route => {
    visits.push(route.request().url());
    const body = route.request().url().startsWith('https://myaccount.google.com/')
      ? `<a aria-label="Cuenta de Google: Laura (${account.username}@gmail.com)">Cuenta</a>`
      : '<h1>Información básica</h1><input name="day"><input name="year">';
    await route.fulfill({ contentType: 'text/html', body: frame(body) });
  });
  const result = await runAccount({ page: restarted, account, profile: profiles[0], save: async () => {}, onIntervention: async reason => {
    assert.equal(reason, 'PERSONAL_DATA'); await restarted.goto('https://myaccount.google.com/'); return 'resume';
  } });
  assert.equal(result, 'completed');
  assert.deepEqual(visits, ['https://accounts.google.com/basic', 'https://myaccount.google.com/']);
});
test('la pérdida de sesión de una cuenta ya verificada nunca abre signup', async t => {
  const { account, page, visits } = await setup(t);
  account.verifiedAt = new Date().toISOString(); account.state = 'COMPLETADA';
  await page.context().unroute('**/*');
  await page.context().route('**/*', route => { visits.push(route.request().url()); return route.fulfill({ contentType: 'text/html', body: frame('<p>Inicia sesión</p>') }); });
  const result = await runAccount({ page, account, profile: profiles[0], save: async () => {}, onIntervention: async () => assert.fail('No signup') });
  assert.equal(result, 'paused'); assert.equal(account.reason, 'SESSION_UNVERIFIED');
  assert.ok(visits.every(url => !url.includes('/signup')));
});
test('cookies y almacenamiento persisten por perfil y quedan separados', async t => {
  const { manager, page } = await setup(t);
  await page.goto(signup);
  await page.evaluate(() => { localStorage.setItem('isolation-test', 'user01'); document.cookie = 'isolation-test=user01; path=/; Max-Age=3600; Secure'; });
  await manager.close();
  const second = await manager.open('02', true);
  await second.context().route('**/*', route => route.fulfill({ body: frame('<p>Local fixture</p>'), contentType: 'text/html' }));
  await second.goto(signup);
  assert.equal(await second.evaluate(() => localStorage.getItem('isolation-test')), null);
  assert.equal(await second.evaluate(() => document.cookie), '');
  await manager.close();
  const first = await manager.open('01', true);
  await first.context().route('**/*', route => route.fulfill({ body: frame('<p>Local fixture</p>'), contentType: 'text/html' }));
  await first.goto(signup);
  assert.equal(await first.evaluate(() => localStorage.getItem('isolation-test')), 'user01');
  assert.match(await first.evaluate(() => document.cookie), /user01/);
});
