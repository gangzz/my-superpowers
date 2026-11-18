import { BrowserSessionTransport } from './browser-session.mjs';

// Reuse the bounded Range streaming implementation with an empty cookie source.
// This adapter requires neither a browser page nor a persistent session.
export class NodeHttpTransport {
  constructor(options = {}) {
    this.transport = new BrowserSessionTransport(options);
  }

  async transfer({ access, partialPath } = {}) {
    if (access?.mode !== 'direct-http') throw new TypeError('access.mode must be direct-http');
    return this.transport.transfer({
      context: { cookies: async () => [] },
      access: { ...access, mode: 'browser-session' },
      partialPath,
    });
  }
}
