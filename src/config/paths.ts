import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { lstat, mkdir } from 'node:fs/promises';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
// Se conserva la misma raíz al compilar src/config -> dist/config.
export function paths(root = ROOT) {
  const privateDir = path.join(root, 'data', 'private');
  return {
    root, privateDir, vault: path.join(privateDir, 'vault.enc'),
    lock: path.join(privateDir, 'runtime.lock'),
    config: path.join(root, 'config', 'profiles.json'),
    reports: path.join(root, 'reports'),
    profile(id: string) {
      if (!/^(0[1-9]|10)$/.test(id)) throw new Error('INVALID_ACCOUNT_ID');
      return path.join(root, 'profiles', `user${id}`);
    },
  };
}

export async function safeDirectory(directory: string, root: string): Promise<void> {
  const relative = path.relative(root, directory);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('UNSAFE_PATH');
  let cursor = root;
  for (const component of relative.split(path.sep)) {
    cursor = path.join(cursor, component);
    await mkdir(cursor, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw error;
    });
    const info = await lstat(cursor);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('UNSAFE_PATH');
  }
}
