import { randomBytes, randomInt, scryptSync, createCipheriv, createDecipheriv } from 'node:crypto';
import { readFile, open, rename, unlink, lstat } from 'node:fs/promises';
import type { Database } from '../accounts/model.js';
import { isState, REASONS } from '../accounts/model.js';

const AAD = Buffer.from('google-account-automation:v1');
const KDF = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%_-';
  let value: string;
  do { value = Array.from({ length: 28 }, () => alphabet[randomInt(alphabet.length)]).join(''); }
  while (!/[A-Z]/.test(value) || !/[a-z]/.test(value) || !/[0-9]/.test(value) || !/[!@#$%_-]/.test(value));
  return value;
}
export function validateDatabase(value: unknown): asserts value is Database {
  const db = value as Database;
  if (db?.version !== 1 || !Array.isArray(db.accounts) || db.accounts.length !== 10) throw new Error('INVALID_VAULT');
  const ids = new Set<string>();
  for (const a of db.accounts) {
    if (!a || !/^(0[1-9]|10)$/.test(a.id) || ids.has(a.id) || !isState(a.state)
      || !/^[a-z0-9.]{6,30}$/.test(a.username) || typeof a.password !== 'string' || a.password.length < 12
      || !Number.isInteger(a.usernameAttempts) || a.usernameAttempts < 0 || a.usernameAttempts > 3
      || !Number.isFinite(Date.parse(a.updatedAt)) || (a.reason && !(a.reason in REASONS))
      || (a.state === 'COMPLETADA' && !a.verifiedAt)) throw new Error('INVALID_VAULT');
    ids.add(a.id);
  }
}
export class Vault {
  private key?: Buffer;
  private salt?: Buffer;
  constructor(private readonly filename: string) {}
  async exists(): Promise<boolean> {
    try {
      const info = await lstat(this.filename);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 2 * 1024 * 1024) throw new Error('INVALID_VAULT');
      return true;
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
  }
  initialize(master: string): void {
    if (master.length < 12) throw new Error('MASTER_TOO_SHORT');
    this.salt = randomBytes(32);
    this.key = scryptSync(master, this.salt, 32, KDF);
  }
  async unlock(master: string): Promise<Database> {
    if (!(await this.exists())) throw new Error('VAULT_MISSING');
    try {
      const envelope = JSON.parse(await readFile(this.filename, 'utf8'));
      if (envelope.version !== 1 || envelope.algorithm !== 'aes-256-gcm' || envelope.kdf !== 'scrypt-32768-8-1') throw new Error();
      const salt = Buffer.from(envelope.salt, 'base64');
      const iv = Buffer.from(envelope.iv, 'base64');
      const tag = Buffer.from(envelope.tag, 'base64');
      if (salt.length !== 32 || iv.length !== 12 || tag.length !== 16) throw new Error();
      const key = scryptSync(master, salt, 32, KDF);
      try {
        const cipher = createDecipheriv('aes-256-gcm', key, iv);
        cipher.setAAD(AAD); cipher.setAuthTag(tag);
        const plain = Buffer.concat([cipher.update(Buffer.from(envelope.ciphertext, 'base64')), cipher.final()]);
        try {
          const data: unknown = JSON.parse(plain.toString('utf8'));
          validateDatabase(data);
          this.key = key; this.salt = salt;
          return data;
        } finally { plain.fill(0); }
      } catch { key.fill(0); throw new Error(); }
    } catch { throw new Error('VAULT_UNLOCK_FAILED'); }
  }
  async save(data: Database): Promise<void> {
    validateDatabase(data);
    if (!this.key || !this.salt) throw new Error('VAULT_LOCKED');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(AAD);
    const plaintext = Buffer.from(JSON.stringify(data));
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    plaintext.fill(0);
    const contents = JSON.stringify({ version: 1, algorithm: 'aes-256-gcm', kdf: 'scrypt-32768-8-1',
      salt: this.salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: encrypted.toString('base64') });
    const temp = `${this.filename}.${randomBytes(8).toString('hex')}.tmp`;
    try {
      const file = await open(temp, 'wx', 0o600);
      try { await file.writeFile(contents, 'utf8'); await file.sync(); } finally { await file.close(); }
      await rename(temp, this.filename);
    } finally { await unlink(temp).catch(() => {}); }
  }
  close(): void { this.key?.fill(0); this.key = undefined; this.salt = undefined; }
}
