import { existsSync, accessSync, constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { browserOptions } from './browser-options.mjs';

export async function doctor() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const checks = [];
  const [major, minor] = process.versions.node.split('.').map(Number);
  checks.push(['Node >=22.16', major > 22 || (major === 22 && minor >= 16)]);
  checks.push(['Configuración de diez perfiles', existsSync(path.join(root, 'config', 'profiles.json'))]);
  try { accessSync(root, constants.W_OK); checks.push(['Carpeta escribible', true]); }
  catch { checks.push(['Carpeta escribible', false]); }
  try {
    const { chromium } = await import('playwright');
    checks.push(['Playwright instalado', true]);
    const options = browserOptions(chromium.executablePath());
    checks.push([options.channel ? `Navegador del sistema disponible (${options.channel})` : 'Chromium instalado', existsSync(chromium.executablePath()) || Boolean(options.channel)]);
  } catch { checks.push(['Playwright instalado (npm ci)', false]); }
  checks.push(['Compilación disponible (npm run build)', existsSync(path.join(root, 'dist', 'cli', 'main.js'))]);
  for (const [label, ok] of checks) console.log(`${ok ? 'OK' : 'FALTA'} ${label}`);
  console.log('Diagnóstico local: no se conecta a Google ni intenta registrar cuentas.');
  return checks.every(([, ok]) => ok);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await doctor() ? 0 : 1;
