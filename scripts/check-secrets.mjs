import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
let names;
try { names = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean); }
catch { console.error('Inicializa Git antes de revisar los archivos publicables.'); process.exit(1); }
const blocked = /(^|\/)(profiles|data|reports|node_modules|test-results|playwright-report)\/|(^|\/)\.env($|\.(?!example$))|\.(enc|pem|key|har|log|zip)$/i;
const patterns = [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /gh[pousr]_[a-zA-Z0-9]{30,}/, /github_pat_[a-zA-Z0-9_]{40,}/, /AIza[a-zA-Z0-9_-]{30,}/, /ya29\.[a-zA-Z0-9_-]{30,}/, /(?:"(?:password|passwd|masterPassword|access_token|refresh_token)"\s*:\s*")[^"\n]{12,}/i];
const problems = [];
for (const name of new Set(names)) {
  if (blocked.test(name.replaceAll('\\', '/'))) { problems.push(name); continue; }
  const content = readFileSync(path.join(root, name), 'utf8');
  if (patterns.some(pattern => pattern.test(content))) problems.push(name);
}
if (problems.length) { console.error(`Revisión fallida. Revisa estos archivos, sin volcar su contenido:\n${problems.join('\n')}`); process.exitCode = 1; }
else console.log(`${new Set(names).size} archivos publicables revisados. Sin rutas privadas ni patrones de secretos detectados.`);
