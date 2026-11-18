export const STATES = ['PENDIENTE', 'PREPARADA', 'EN_PROCESO', 'REQUIERE_INTERVENCION', 'COMPLETADA', 'BLOQUEADA', 'ERROR'] as const;
export type State = typeof STATES[number];
export type Reason = 'CAPTCHA' | 'PHONE' | 'PERSONAL_DATA' | 'TERMS' | 'MANUAL_STEP' | 'RATE_LIMIT' | 'USERNAME' | 'INTERRUPTED' | 'BROWSER_ERROR' | 'SESSION_UNVERIFIED' | 'UNTRUSTED_PAGE' | 'STEP_LIMIT';
export const REASONS: Record<Reason, string> = {
  CAPTCHA: 'Resuelve el CAPTCHA o desafío en el navegador y continúa allí.',
  PHONE: 'Completa personalmente la verificación por teléfono en el navegador.',
  PERSONAL_DATA: 'Aporta los datos obligatorios verídicos en el navegador y avanza de pantalla.',
  TERMS: 'Lee y acepta personalmente las condiciones en el navegador si estás de acuerdo.',
  MANUAL_STEP: 'La pantalla no se reconoce. Revisa el navegador y completa el paso personalmente.',
  RATE_LIMIT: 'Google ha bloqueado o limitado el registro. No se harán más intentos automáticos.',
  USERNAME: 'No se ha podido asignar un usuario tras tres alternativas. Revísalo personalmente.',
  INTERRUPTED: 'Ejecución detenida. Puedes reanudar este perfil.',
  BROWSER_ERROR: 'No se pudo completar la operación del navegador. Ejecuta doctor y reanuda.',
  SESSION_UNVERIFIED: 'No se ha verificado una sesión autenticada con el correo esperado.',
  UNTRUSTED_PAGE: 'La página está fuera de los dominios de registro autorizados. Revísala.',
  STEP_LIMIT: 'Se ha alcanzado el límite de pasos de esta ejecución. Revisa el navegador.',
};
export interface Profile { id: string; firstName: string; lastName: string; suggestedUsername: string }
export interface Account {
  id: string; state: State; username: string; password: string;
  usernameAttempts: number; updatedAt: string; reason?: Reason;
  lastUrl?: string; verifiedAt?: string;
}
export interface Database { version: 1; accounts: Account[] }
export function setState(account: Account, state: State, reason?: Reason): void {
  if (state === 'COMPLETADA' && !account.verifiedAt) throw new Error('VERIFICATION_REQUIRED');
  account.state = state;
  account.updatedAt = new Date().toISOString();
  account.reason = reason;
}
export function isState(value: unknown): value is State { return STATES.includes(value as State); }
