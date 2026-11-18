import { chromium, type BrowserContext, type Page } from 'playwright';
import { paths, safeDirectory } from '../config/paths.js';
import { browserOptions } from '../../scripts/browser-options.mjs';

export class BrowserManager {
  private context?: BrowserContext;
  constructor(private readonly root?: string) {}
  async open(id: string, headless = false): Promise<Page> {
    if (this.context) throw new Error('BROWSER_ALREADY_OPEN');
    const p = paths(this.root);
    const directory = p.profile(id);
    await safeDirectory(directory, p.root);
    this.context = await chromium.launchPersistentContext(directory, {
      ...browserOptions(chromium.executablePath()),
      headless, viewport: null, acceptDownloads: false,
      // Navegador ordinario: sin stealth, proxies ni alteraciones de identidad.
    });
    const pages = this.context.pages();
    const page = pages[0] ?? await this.context.newPage();
    page.setDefaultTimeout(8_000);
    page.setDefaultNavigationTimeout(30_000);
    return page;
  }
  async close(): Promise<void> {
    const current = this.context;
    this.context = undefined;
    await current?.close().catch(() => {});
  }
}
