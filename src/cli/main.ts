import { loadProfiles, prepareProfiles, exportReport } from '../accounts/service.js';
import { REASONS, setState, type Database, type Profile } from '../accounts/model.js';
import { paths, safeDirectory } from '../config/paths.js';
import { Vault } from '../security/vault.js';
import { acquireLock } from '../storage/lock.js';
import { BrowserManager } from '../browser/manager.js';
import { runAccount } from '../automation/runner.js';
import { trustedUrl, verifySession } from '../automation/inspect.js';
import { ask, secret } from './input.js';

const HELP = `GOOGLE ACCOUNT AUTOMATION
Uso: npm start -- [comando] [01..10]

  prepare       Preparar diez perfiles y el almacén cifrado
  run           Iniciar perfiles preparados, uno por uno
  resume [ID]   Continuar una cuenta pendiente (ID opcional)
  status        Ver estados guardados
  open ID       Abrir el navegador independiente del usuario
  verify [ID]   Comprobar sesiones e identidad de correo exacta
  email ID      Corregir el correo esperado tras un cambio manual
  report        Exportar informe sin credenciales
  doctor        Diagnosticar entorno sin abrir Google
  --help        Mostrar ayuda

Sin argumentos: menú. La contraseña maestra solo se introduce localmente.
Ctrl+C guarda el progreso y cierra el navegador. No ejecutes dos instancias.`;
const p = paths();
const vault = new Vault(p.vault);
const browser = new BrowserManager();
const controller = new AbortController();
let database: Database | undefined;
let release: (() => Promise<void>) | undefined;
let profiles: Profile[] = [];
const stop = () => { controller.abort(); void browser.close(); };

async function unlock(create = false): Promise<Database> {
  if (database) return database;
  if (await vault.exists()) database = await vault.unlock(await secret('Contraseña maestra: '));
  else {
    if (!create) throw new Error('VAULT_MISSING');
    const master = await secret('Nueva contraseña maestra (mínimo 12 caracteres): ');
    if (master !== await secret('Repite la contraseña maestra: ')) throw new Error('MASTER_MISMATCH');
    vault.initialize(master);
    database = await prepareProfiles(profiles);
    await vault.save(database);
  }
  return database;
}
async function save(): Promise<void> { if (database) await vault.save(database); }
async function selectId(id?: string): Promise<string> {
  const chosen = id ?? await ask('ID de cuenta (01..10): ', controller.signal);
  p.profile(chosen); return chosen;
}
async function execute(command: string, id?: string): Promise<void> {
  if (command === 'doctor') {
    const { doctor } = await import('../../scripts/doctor.mjs');
    if (!(await doctor())) process.exitCode = 1;
    return;
  }
  if (command === 'status' && !(await vault.exists())) {
    console.table(profiles.map(profile => ({ ID: profile.id, Nombre: profile.firstName, Estado: 'PENDIENTE' })));
    return;
  }
  const db = await unlock(command === 'prepare');
  if (command === 'prepare') {
    for (const profile of profiles) await safeDirectory(p.profile(profile.id), p.root);
    console.log('10 perfiles preparados. Las contraseñas existentes se conservan.'); return;
  }
  if (command === 'status') {
    console.table(db.accounts.map(a => ({ ID: a.id, Estado: a.state, Motivo: a.reason ? REASONS[a.reason] : '', Verificada: a.verifiedAt ?? '' }))); return;
  }
  if (command === 'report') { console.log(`Informe guardado: ${await exportReport(db, profiles)}`); return; }
  if (command === 'email') {
    const account = db.accounts.find(a => a.id === id)!;
    if (account.verifiedAt) throw new Error('VERIFIED_EMAIL_IMMUTABLE');
    const email = (await ask('Correo @gmail.com elegido manualmente (sin contraseña): ', controller.signal)).toLowerCase();
    if (!/^[a-z0-9.]{6,30}@gmail\.com$/.test(email)) throw new Error('INVALID_EMAIL');
    account.username = email.slice(0, -10); await save(); console.log('Correo esperado actualizado en el almacén cifrado.'); return;
  }
  if (command === 'open') {
    const account = db.accounts.find(a => a.id === id)!;
    const page = await browser.open(account.id);
    try {
      await page.goto(account.lastUrl && trustedUrl(account.lastUrl) ? account.lastUrl : 'https://myaccount.google.com/');
      await ask('Usa el navegador. Pulsa Enter aquí para guardar la ubicación y cerrarlo. ', controller.signal);
      if (!page.isClosed() && trustedUrl(page.url())) account.lastUrl = page.url();
      await save();
    } finally { await browser.close(); }
    return;
  }
  if (command === 'verify') {
    for (const account of db.accounts.filter(a => !id || a.id === id)) {
      if (controller.signal.aborted) break;
      try {
        const page = await browser.open(account.id);
        if (await verifySession(page, account.username)) {
          account.verifiedAt = new Date().toISOString(); setState(account, 'COMPLETADA');
        } else if (account.verifiedAt || account.state === 'COMPLETADA') setState(account, 'REQUIERE_INTERVENCION', 'SESSION_UNVERIFIED');
        console.log(`${account.id}: ${account.state === 'COMPLETADA' ? 'sesión e identidad verificadas' : 'sesión no verificada'}`);
      } catch { console.log(`${account.id}: no se pudo comprobar la sesión`); }
      finally { await browser.close(); await save(); }
    }
    return;
  }
  if (command === 'run' || command === 'resume') {
    const eligible = command === 'run' ? ['PENDIENTE', 'PREPARADA'] : ['EN_PROCESO', 'REQUIERE_INTERVENCION', 'ERROR'];
    const selected = db.accounts.filter(a => id ? a.id === id : eligible.includes(a.state));
    if (!selected.length) { console.log('No hay cuentas elegibles. Usa status para revisar el progreso.'); return; }
    for (const account of selected) {
      if (controller.signal.aborted) break;
      if (account.state === 'BLOQUEADA') {
        const response = await ask('Google bloqueó este perfil. Reanuda solo cuando el bloqueo se haya resuelto. Escribe REANUDAR: ', controller.signal);
        if (response !== 'REANUDAR') break;
      }
      console.log(`Procesando perfil ${account.id}.`);
      let result: string;
      try {
        const page = await browser.open(account.id);
        result = await runAccount({ page, account, profile: profiles.find(profile => profile.id === account.id)!, signal: controller.signal, save,
          onIntervention: async reason => {
            console.log(`Perfil ${account.id}: ${REASONS[reason]}`);
            const response = await ask('Tras completar el paso en el navegador, Enter para continuar; s para guardar y salir: ', controller.signal);
            return response.toLowerCase() === 's' ? 'stop' : 'resume';
          } });
      } catch {
        setState(account, controller.signal.aborted ? 'REQUIERE_INTERVENCION' : 'ERROR', controller.signal.aborted ? 'INTERRUPTED' : 'BROWSER_ERROR');
        await save(); result = 'error';
      } finally { await browser.close(); }
      console.log(`${account.id}: ${account.state}${account.reason ? ` — ${REASONS[account.reason]}` : ''}`);
      if (result !== 'completed') break;
    }
    return;
  }
  throw new Error('UNKNOWN_COMMAND');
}

const MESSAGES: Record<string, string> = {
  VAULT_MISSING: 'Primero ejecuta npm start -- prepare.',
  VAULT_UNLOCK_FAILED: 'No se ha podido desbloquear el almacén: contraseña incorrecta o archivo dañado. No se sobrescribe.',
  MASTER_TOO_SHORT: 'La contraseña maestra debe tener al menos 12 caracteres.',
  MASTER_MISMATCH: 'Las contraseñas maestras no coinciden.',
  LOCAL_TERMINAL_REQUIRED: 'Este comando requiere una terminal local interactiva. No pases contraseñas por argumentos, pipes ni chat.',
  ALREADY_RUNNING: 'Otra instancia está usando los perfiles. Ciérrala antes de continuar.',
  INVALID_ACCOUNT_ID: 'El ID debe ser 01..10.', INVALID_EMAIL: 'El correo debe ser una dirección personal @gmail.com válida.',
  VERIFIED_EMAIL_IMMUTABLE: 'Este perfil ya tiene una identidad verificada. No se cambia el correo automáticamente.',
  UI_CANCELLED: 'Operación cancelada.', UNKNOWN_COMMAND: HELP,
};
async function main(): Promise<void> {
  const [command, rawId, ...extra] = process.argv.slice(2);
  if (command === '--help' || command === '-h') { console.log(HELP); return; }
  const commands = ['prepare', 'run', 'resume', 'status', 'open', 'verify', 'email', 'report', 'doctor'];
  if (command && (!commands.includes(command) || extra.length)) throw new Error('UNKNOWN_COMMAND');
  if (rawId) p.profile(rawId);
  profiles = await loadProfiles();
  if (command === 'doctor' || (command === 'status' && !(await vault.exists()))) { await execute(command); return; }
  await safeDirectory(p.privateDir, p.root);
  release = await acquireLock(p.lock);
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  if (command) { await execute(command, ['open', 'email'].includes(command) ? await selectId(rawId) : rawId); return; }
  const choices: Record<string, string> = { '1': 'prepare', '2': 'run', '3': 'resume', '4': 'status', '5': 'open', '6': 'verify', '7': 'report', '8': 'doctor' };
  while (!controller.signal.aborted) {
    console.log('\nGOOGLE ACCOUNT AUTOMATION\n=========================\n1. Preparar los 10 perfiles\n2. Iniciar creación asistida\n3. Continuar cuenta pendiente\n4. Ver estado de las cuentas\n5. Abrir sesión de un usuario\n6. Comprobar sesiones existentes\n7. Exportar informe de resultados\n8. Diagnosticar entorno\n0. Salir');
    const answer = await ask('Opción: ', controller.signal);
    if (answer === '0') break;
    const action = choices[answer];
    if (!action) { console.log('Selecciona una opción del menú.'); continue; }
    try { await execute(action, action === 'open' ? await selectId() : undefined); }
    catch (error) { if (controller.signal.aborted) break; console.error(MESSAGES[(error as Error).message] ?? 'No se completó la operación. Ejecuta doctor y revisa los archivos locales.'); }
  }
}
try { await main(); }
catch (error) {
  if (controller.signal.aborted) console.log('Ejecución detenida. El progreso guardado permite reanudar.');
  else { console.error(MESSAGES[(error as Error).message] ?? 'No se completó la operación. Ejecuta npm run doctor.'); process.exitCode = 1; }
} finally {
  await browser.close(); vault.close();
  await release?.().catch(() => { process.exitCode = 1; });
  process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
}
