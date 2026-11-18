import type { Page } from 'playwright';
import { setState, type Account, type Profile, type Reason } from '../accounts/model.js';
import { alternativeUsername } from '../accounts/service.js';
import { authenticatedAs, field, intervention, nextButton, trustedUrl, usernameRejected, verifySession, visible } from './inspect.js';

export interface RunOptions {
  page: Page; account: Account; profile: Profile; signal?: AbortSignal;
  save: () => Promise<void>;
  onIntervention: (reason: Reason) => Promise<'resume' | 'stop'>;
}
export type RunResult = 'completed' | 'paused' | 'blocked' | 'error';

export async function runAccount(options: RunOptions): Promise<RunResult> {
  const { page, account, profile, signal, save, onIntervention } = options;
  let navigated = false;
  async function checkpoint(): Promise<void> {
    if (!page.isClosed() && trustedUrl(page.url())) account.lastUrl = page.url();
    await save();
  }
  async function pause(reason: Reason): Promise<boolean> {
    setState(account, 'REQUIERE_INTERVENCION', reason);
    await checkpoint();
    if (signal?.aborted) return false;
    const decision = await onIntervention(reason);
    if (decision !== 'resume' || signal?.aborted || page.isClosed()) return false;
    setState(account, 'EN_PROCESO');
    await checkpoint();
    return true;
  }
  try {
    // Una cuenta verificada nunca vuelve a pasar automáticamente por signup.
    if (account.state === 'COMPLETADA' || account.verifiedAt) {
      if (await verifySession(page, account.username)) {
        account.verifiedAt = new Date().toISOString(); setState(account, 'COMPLETADA'); await checkpoint(); return 'completed';
      }
      setState(account, 'REQUIERE_INTERVENCION', 'SESSION_UNVERIFIED'); await checkpoint(); return 'paused';
    }
    setState(account, 'EN_PROCESO'); await save();
    if (!trustedUrl(page.url())) {
      await page.goto(account.lastUrl && trustedUrl(account.lastUrl) ? account.lastUrl : 'https://accounts.google.com/signup');
    }
    navigated = true;
    for (let step = 0; step < 40; step++) {
      if (signal?.aborted || page.isClosed()) { setState(account, 'REQUIERE_INTERVENCION', 'INTERRUPTED'); await checkpoint(); return 'paused'; }
      if (!trustedUrl(page.url())) { await pause('UNTRUSTED_PAGE'); return 'paused'; }
      if (await authenticatedAs(page, `${account.username}@gmail.com`)) {
        account.verifiedAt = new Date().toISOString(); setState(account, 'COMPLETADA'); await checkpoint(); return 'completed';
      }
      const reason = await intervention(page);
      if (reason === 'RATE_LIMIT') { setState(account, 'BLOQUEADA', reason); await checkpoint(); return 'blocked'; }
      if (reason) { if (await pause(reason)) continue; return 'paused'; }
      if (new URL(page.url()).hostname === 'myaccount.google.com') {
        if (await pause('SESSION_UNVERIFIED')) continue;
        return 'paused';
      }
      const first = await field(page, /^(first name|nombre)$/i, 'input[name="firstName"]');
      const last = await field(page, /^(last name|apellidos?)$/i, 'input[name="lastName"]');
      const username = await field(page, /^(username|nombre de usuario|crea.*gmail|create.*gmail)$/i, 'input[name="Username"], input[name="username"]');
      const password = await visible(page.locator('input[name="Passwd"], input[name="password"][autocomplete="new-password"], input[autocomplete="new-password"]'));
      let acted = false;
      if (first) { await first.fill(profile.firstName); if (last) await last.fill(profile.lastName); acted = true; }
      else if (username) {
        if (await usernameRejected(page)) {
          if (account.usernameAttempts >= 3) { if (await pause('USERNAME')) continue; return 'paused'; }
          account.username = alternativeUsername(profile); account.usernameAttempts++;
        } else {
          // Conserva un nombre que la persona haya corregido en este campo.
          const current = (await username.inputValue()).trim().toLowerCase();
          if (/^[a-z0-9.]{6,30}$/.test(current)) account.username = current;
        }
        await username.fill(account.username); await checkpoint(); acted = true;
      } else if (password) {
        await password.fill(account.password);
        const confirmation = await visible(page.locator('input[name="PasswdAgain"], input[name="confirmPassword"], input[name="confirmation"]'));
        if (confirmation) await confirmation.fill(account.password);
        acted = true;
      } else {
        const custom = await visible(page.getByRole('radio', { name: /create your own|crear.*(?:propia|direccion)|crea.*direccion/i }));
        if (custom && !(await custom.isChecked())) { await custom.check(); continue; }
      }
      const next = await nextButton(page);
      if (!acted || !next) { if (await pause('MANUAL_STEP')) continue; return 'paused'; }
      // Se espera un cambio observable. No se reenvía un formulario atascado.
      const before = await page.evaluate(() => `${location.href}\n${document.body.innerText}`);
      await next.click();
      try {
        await page.waitForFunction(previous => `${location.href}\n${document.body.innerText}` !== previous, before, { timeout: 8_000 });
      } catch {
        if (await usernameRejected(page) && username) continue;
        if (await pause('MANUAL_STEP')) continue;
        return 'paused';
      }
      await checkpoint();
    }
    await pause('STEP_LIMIT'); return 'paused';
  } catch {
    const interrupted = signal?.aborted || (navigated && page.isClosed());
    setState(account, interrupted ? 'REQUIERE_INTERVENCION' : 'ERROR', interrupted ? 'INTERRUPTED' : 'BROWSER_ERROR');
    await save();
    return interrupted ? 'paused' : 'error';
  }
}
