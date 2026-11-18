import { readFile, writeFile } from 'node:fs/promises';
import { randomInt } from 'node:crypto';
import { paths, safeDirectory } from '../config/paths.js';
import { generatePassword } from '../security/vault.js';
import { REASONS } from './model.js';
import type { Database, Profile } from './model.js';

export async function loadProfiles(root?: string): Promise<Profile[]> {
  const result: Profile[] = JSON.parse(await readFile(paths(root).config, 'utf8'));
  if (!Array.isArray(result) || result.length !== 10 || new Set(result.map(p => p.id)).size !== 10) throw new Error('INVALID_PROFILES');
  for (const p of result) {
    paths(root).profile(p.id);
    if (!p.firstName || !p.lastName || !/^[a-z0-9.]{6,30}$/.test(p.suggestedUsername)) throw new Error('INVALID_PROFILES');
  }
  return result;
}
export async function prepareProfiles(profiles: Profile[], root?: string): Promise<Database> {
  const p = paths(root);
  for (const profile of profiles) await safeDirectory(p.profile(profile.id), p.root);
  return { version: 1, accounts: profiles.map(profile => ({ id: profile.id, state: 'PREPARADA',
    username: profile.suggestedUsername, password: generatePassword(), usernameAttempts: 0, updatedAt: new Date().toISOString() })) };
}
export function alternativeUsername(profile: Profile): string {
  const base = profile.suggestedUsername.replace(/\./g, '').slice(0, 22);
  return `${base}${randomInt(100000, 1000000)}`;
}
export function report(database: Database, profiles: Profile[]) {
  return { generatedAt: new Date().toISOString(), prepared: database.accounts.length,
    completed: database.accounts.filter(a => a.state === 'COMPLETADA').length,
    accounts: database.accounts.map(a => ({ id: a.id,
      name: profiles.find(p => p.id === a.id)?.firstName, state: a.state,
      instruction: a.reason ? REASONS[a.reason] : null, verifiedAt: a.verifiedAt ?? null, updatedAt: a.updatedAt })) };
}
export async function exportReport(database: Database, profiles: Profile[], root?: string): Promise<string> {
  const p = paths(root);
  await safeDirectory(p.reports, p.root);
  const filename = `${p.reports}/results-${Date.now()}.json`;
  await writeFile(filename, JSON.stringify(report(database, profiles), null, 2), { flag: 'wx', mode: 0o600 });
  return filename;
}
