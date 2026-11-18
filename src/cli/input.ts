import { createInterface } from 'node:readline/promises';
import { emitKeypressEvents } from 'node:readline';

export async function ask(message: string, signal?: AbortSignal): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('LOCAL_TERMINAL_REQUIRED');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try { return (await rl.question(message, { signal })).trim(); } finally { rl.close(); }
}
export async function secret(message: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('LOCAL_TERMINAL_REQUIRED');
  process.stdout.write(message);
  emitKeypressEvents(process.stdin);
  const wasRaw = process.stdin.isRaw;
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    function finish(): void {
      process.stdin.removeListener('keypress', onKey);
      process.stdin.setRawMode(wasRaw);
      process.stdin.pause();
      process.stdout.write('\n');
    }
    function onKey(text: string | undefined, key: { name?: string; ctrl?: boolean; meta?: boolean }): void {
      if (key.ctrl && key.name === 'c') { value = ''; finish(); reject(new Error('UI_CANCELLED')); return; }
      if (key.name === 'return' || key.name === 'enter') { finish(); resolve(value); return; }
      if (key.name === 'backspace') { value = value.slice(0, -1); return; }
      if (!key.ctrl && !key.meta && text && !/[\x00-\x1f\x7f]/.test(text) && value.length < 1024) value += text;
    }
    process.stdin.on('keypress', onKey);
  });
}
