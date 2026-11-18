import { open, readFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

export async function acquireLock(filename: string): Promise<() => Promise<void>> {
  const token = randomUUID();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(filename, 'wx', 0o600);
      try { await handle.writeFile(JSON.stringify({ pid: process.pid, token })); } finally { await handle.close(); }
      return async () => {
        const current = JSON.parse(await readFile(filename, 'utf8'));
        if (current.token === token) await unlink(filename);
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const current = JSON.parse(await readFile(filename, 'utf8'));
      if (!Number.isSafeInteger(current.pid) || current.pid <= 0) throw new Error('LOCK_INVALID');
      try { process.kill(current.pid, 0); }
      catch (probeError) {
        if ((probeError as NodeJS.ErrnoException).code === 'ESRCH') { await unlink(filename); continue; }
      }
      throw new Error('ALREADY_RUNNING');
    }
  }
  throw new Error('ALREADY_RUNNING');
}
