import { mkdirSync } from 'node:fs';

function requireHttpUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new TypeError('browser URL must use http or https');
  return url.toString();
}

export class BrowserSession {
  constructor({ driver = null, profilePath, executablePath = null, launchOptions = {} } = {}) {
    if (!profilePath) throw new TypeError('profilePath is required');
    this.driver = driver;
    this.profilePath = profilePath;
    this.executablePath = executablePath;
    this.launchOptions = { ...launchOptions };
    this.context = null;
    this.headless = null;
    this.manualPage = null;
  }

  async #driver() {
    if (this.driver) return this.driver;
    const { chromium } = await import('patchright');
    return chromium;
  }

  async open({ headless = false } = {}) {
    if (this.context && this.headless === headless) return this.context;
    if (this.context) {
      if (this.isManualOpen()) throw new Error('Cannot change browser mode during manual control');
      await this.close();
    }
    mkdirSync(this.profilePath, { recursive: true });
    const driver = await this.#driver();
    this.context = await driver.launchPersistentContext(this.profilePath, {
      ...this.launchOptions,
      ...(this.executablePath ? { executablePath: this.executablePath } : {}),
      headless,
    });
    this.headless = headless;
    for (const restoredPage of this.context.pages?.() ?? []) {
      await restoredPage.close().catch(() => {});
    }
    return this.context;
  }

  async newJobPage({ headless = false } = {}) {
    const context = await this.open({ headless });
    return context.newPage();
  }

  async openManual(url) {
    const context = await this.open({ headless: false });
    if (this.manualPage) await this.manualPage.close().catch(() => {});
    this.manualPage = await context.newPage();
    await this.manualPage.goto(requireHttpUrl(url), { waitUntil: 'domcontentloaded' });
    return this.manualPage;
  }

  async inspectManualMedia() {
    if (!this.isManualOpen()) return null;
    return this.manualPage.evaluate(() => {
      const candidates = [...document.querySelectorAll('video')]
        .map((video) => ({
          width: video.videoWidth,
          height: video.videoHeight,
          duration: Number.isFinite(video.duration) ? video.duration : null,
          paused: video.paused,
          readyState: video.readyState,
        }))
        .filter(({ width, height }) => width > 0 && height > 0)
        .sort((left, right) => (
          Number(left.paused) - Number(right.paused)
          || right.readyState - left.readyState
          || (right.width * right.height) - (left.width * left.height)
        ));
      return candidates[0] ?? null;
    });
  }

  isManualOpen() {
    return Boolean(this.manualPage && !this.manualPage.isClosed());
  }

  async close() {
    if (!this.context) return { closed: false };
    const context = this.context;
    await context.close();
    this.context = null;
    this.headless = null;
    this.manualPage = null;
    return { closed: true };
  }
}
