import type { Locator, Page } from 'playwright';
import type { Reason } from '../accounts/model.js';

export function trustedUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && ['accounts.google.com', 'myaccount.google.com'].includes(url.hostname);
  } catch { return false; }
}
export async function visible(locator: Locator): Promise<Locator | undefined> {
  for (const element of await locator.all()) if (await element.isVisible()) return element;
  return undefined;
}
export async function field(page: Page, name: RegExp, fallback: string): Promise<Locator | undefined> {
  return await visible(page.getByLabel(name)) ?? await visible(page.locator(fallback));
}
export async function pageText(page: Page): Promise<string> {
  return (await page.locator('body').innerText()).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
export async function intervention(page: Page): Promise<Reason | undefined> {
  if (!trustedUrl(page.url())) return 'UNTRUSTED_PAGE';
  const text = await pageText(page);
  if (/too many (?:attempts|requests)|demasiados intentos|try again (?:later|tomorrow)|intentalo (?:de nuevo )?mas tarde|couldn.t create your account|no se ha podido crear tu cuenta|unable to create|unusual traffic|trafico inusual|this phone number has been used too many/.test(text)) return 'RATE_LIMIT';
  if (/captcha|recaptcha|not a robot|no soy un robot|verify you.re (?:a )?human|verifica que eres (?:un )?humano/.test(text)
    || await visible(page.locator('iframe[src*="recaptcha"], iframe[title*="CAPTCHA" i], input[name="ca"]'))) return 'CAPTCHA';
  if (await visible(page.locator('input[type="tel"], input[autocomplete="one-time-code"]'))
    || /verify your phone|verifica tu (?:numero|telefono)|sms|scan (?:the |this )?qr|escanea (?:el |este )?codigo|verify (?:it.s|that it.s) you|verifica que eres tu/.test(text)
    || /\/challenge\//.test(new URL(page.url()).pathname)) return 'PHONE';
  if (await visible(page.locator('input[name="day"], input[name="year"], select#month, input[type="date"]'))
    || /date of birth|fecha de nacimiento|informacion basica|basic information/.test(text)) return 'PERSONAL_DATA';
  if (await visible(page.getByRole('button', { name: /^(i agree|acepto|aceptar|agree|crear cuenta|create account)$/i }))
    || /privacy and terms|privacidad y condiciones|condiciones y privacidad/.test(text)) return 'TERMS';
  return undefined;
}
export async function usernameRejected(page: Page): Promise<boolean> {
  const text = await pageText(page);
  return /username (?:is )?(?:taken|already|not available|unavailable)|username.*already (?:in use|used)|nombre de usuario (?:ya (?:esta|se utiliza|existe)|no esta disponible)|ese nombre de usuario.*(?:uso|utiliza|existe)|try another username|prueba (?:con )?otro (?:nombre|usuario)/.test(text);
}
export async function nextButton(page: Page): Promise<Locator | undefined> {
  return await visible(page.getByRole('button', { name: /^(next|siguiente|continuar|continue)$/i }));
}

// Solo se acepta el correo exacto dentro de un control autenticado de la cuenta.
// Un título, una URL, el texto del formulario o la confirmación humana no bastan.
export async function authenticatedAs(page: Page, email: string): Promise<boolean> {
  if (!trustedUrl(page.url()) || new URL(page.url()).hostname !== 'myaccount.google.com') return false;
  const controls = page.locator('a[href*="SignOutOptions"], a[href*="Logout"], [aria-label*="Google Account"], [aria-label*="Cuenta de Google"], [data-email]');
  const expected = email.toLowerCase();
  for (const control of await controls.all()) {
    if (!(await control.isVisible())) continue;
    const evidence = [await control.getAttribute('aria-label'), await control.getAttribute('data-email'), await control.getAttribute('title'), await control.textContent()].join(' ').toLowerCase();
    const emails: string[] = evidence.match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/g) ?? [];
    if (emails.includes(expected)) return true;
  }
  return false;
}
export async function verifySession(page: Page, username: string): Promise<boolean> {
  await page.goto('https://myaccount.google.com/');
  // El control de cuenta puede aparecer después de DOMContentLoaded.
  try { await page.locator('a[href*="SignOutOptions"], a[href*="Logout"], [aria-label*="Google Account"], [aria-label*="Cuenta de Google"], [data-email]').first().waitFor({ state: 'visible', timeout: 8_000 }); }
  catch { return false; }
  return authenticatedAs(page, `${username}@gmail.com`);
}
