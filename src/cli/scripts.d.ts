declare module '*.mjs' {
  export function doctor(): Promise<boolean>;
  export function browserOptions(chromiumExecutable: string): { channel?: 'chrome' | 'msedge' };
}
