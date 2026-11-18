import { existsSync } from 'node:fs';
import path from 'node:path';

// Se usan instalaciones normales del sistema; no se cambia su perfil personal.
export function browserOptions(chromiumExecutable) {
  if (existsSync(chromiumExecutable)) return {};
  const locations = process.platform === 'win32' ? [
    ['chrome', process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'],
    ['chrome', process.env['PROGRAMFILES(X86)'], 'Google/Chrome/Application/chrome.exe'],
    ['chrome', process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'],
    ['msedge', process.env['PROGRAMFILES(X86)'], 'Microsoft/Edge/Application/msedge.exe'],
    ['msedge', process.env.PROGRAMFILES, 'Microsoft/Edge/Application/msedge.exe'],
  ] : process.platform === 'darwin' ? [
    ['chrome', '/Applications', 'Google Chrome.app/Contents/MacOS/Google Chrome'],
    ['msedge', '/Applications', 'Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
  ] : [
    ['chrome', '/opt/google/chrome', 'chrome'],
    ['chrome', '/usr/bin', 'google-chrome'],
    ['msedge', '/opt/microsoft/msedge', 'msedge'],
  ];
  for (const [channel, base, relative] of locations) {
    if (base && existsSync(path.join(base, relative))) return { channel };
  }
  return {};
}
