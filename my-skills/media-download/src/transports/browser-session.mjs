import { createWriteStream, mkdirSync, unlinkSync } from 'node:fs';
import { once } from 'node:events';
import { dirname } from 'node:path';
import { finished } from 'node:stream/promises';

function codedError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function positiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) throw new TypeError(`${name} must be a positive integer`);
  return value;
}

function httpUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new TypeError('access.url must use http or https');
  return url.toString();
}

function parseContentRange(value) {
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/u.exec(value ?? '');
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  const total = Number(match[3]);
  if (![start, end, total].every(Number.isSafeInteger) || start < 0 || end < start || total <= end) return null;
  return { start, end, total };
}

async function openExclusiveWriteStream(path) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const writer = createWriteStream(path, { flags: 'wx', mode: 0o600 });
  await new Promise((resolve, reject) => {
    const onOpen = () => {
      writer.off('error', onError);
      resolve();
    };
    const onError = (error) => {
      writer.off('open', onOpen);
      reject(error);
    };
    writer.once('open', onOpen);
    writer.once('error', onError);
  });
  return writer;
}

function safeSessionHeaders(requestHeaders, { cookie, referer, range }) {
  const headers = {};
  for (const name of ['accept', 'accept-language', 'user-agent']) {
    if (requestHeaders?.[name]) headers[name] = String(requestHeaders[name]);
  }
  headers.range = range;
  if (referer) headers.referer = referer;
  if (cookie) headers.cookie = cookie;
  return headers;
}

async function streamResponse({ response, writer, maximumBytes, bytesWritten }) {
  if (!response.body) throw codedError('media_body_missing', 'Media response has no readable body');
  const reader = response.body.getReader();
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array) || value.byteLength === 0) continue;
      if (bytesWritten + received + value.byteLength > maximumBytes) {
        throw codedError('media_too_large', `Media exceeds ${maximumBytes} bytes`);
      }
      received += value.byteLength;
      if (!writer.write(value)) await once(writer, 'drain');
    }
  } finally {
    reader.releaseLock();
  }
  return received;
}

export class BrowserSessionTransport {
  constructor({
    maxBytes = 2 * 1024 * 1024 * 1024,
    requestBytes = 8 * 1024 * 1024,
    fetchImpl = globalThis.fetch,
  } = {}) {
    this.maxBytes = positiveInteger(maxBytes, 'maxBytes');
    this.requestBytes = positiveInteger(requestBytes, 'requestBytes');
    if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
    this.fetch = fetchImpl;
  }

  async transfer({ context, page, access, partialPath } = {}) {
    if (!context || typeof context.cookies !== 'function') throw new TypeError('browser context is required');
    if (access?.mode !== 'browser-session') throw new TypeError('access.mode must be browser-session');
    if (typeof partialPath !== 'string' || partialPath.trim() === '') throw new TypeError('partialPath is required');

    const mediaUrl = httpUrl(access.url);
    const cookies = await context.cookies(mediaUrl);
    const cookie = cookies.map(({ name, value }) => `${name}=${value}`).join('; ');
    const referer = access.requestHeaders?.referer
      ?? (typeof page?.url === 'function' ? page.url() : null);
    const writer = await openExclusiveWriteStream(partialPath);
    let writerFailure = null;
    let completed = false;
    let bytesWritten = 0;
    let offset = 0;
    let requests = 0;
    writer.on('error', (error) => { writerFailure = error; });

    try {
      while (true) {
        const rangeEnd = Math.min(offset + this.requestBytes - 1, this.maxBytes - 1);
        const range = `bytes=${offset}-${rangeEnd}`;
        const response = await this.fetch(mediaUrl, {
          method: 'GET',
          redirect: 'follow',
          headers: safeSessionHeaders(access.requestHeaders, { cookie, referer, range }),
        });
        requests += 1;
        if (response.status !== 200 && response.status !== 206) {
          throw codedError('media_http_error', `Media fetch returned HTTP ${response.status}`, { status: response.status });
        }
        if (writerFailure) throw writerFailure;

        if (response.status === 200) {
          if (offset !== 0) throw codedError('media_range_ignored', 'Media server stopped honoring Range requests');
          const declared = Number(response.headers.get('content-length') ?? 0) || null;
          if (declared != null && declared > this.maxBytes) {
            throw codedError('media_too_large', `Media exceeds ${this.maxBytes} bytes`);
          }
          const received = await streamResponse({ response, writer, maximumBytes: this.maxBytes, bytesWritten });
          bytesWritten += received;
          if (declared != null && received !== declared) {
            throw codedError('media_size_mismatch', `Expected ${declared} bytes, received ${received}`);
          }
          break;
        }

        const contentRange = parseContentRange(response.headers.get('content-range'));
        if (!contentRange || contentRange.start !== offset || contentRange.total > this.maxBytes) {
          throw codedError('media_range_invalid', 'Media server returned an invalid Content-Range');
        }
        const expected = contentRange.end - contentRange.start + 1;
        const received = await streamResponse({ response, writer, maximumBytes: this.maxBytes, bytesWritten });
        if (received !== expected) {
          throw codedError('media_size_mismatch', `Expected range of ${expected} bytes, received ${received}`);
        }
        bytesWritten += received;
        offset = contentRange.end + 1;
        if (offset >= contentRange.total) break;
      }

      writer.end();
      await finished(writer);
      if (writerFailure) throw writerFailure;
      if (bytesWritten === 0) throw codedError('media_empty', 'Media response was empty');
      completed = true;
      return Object.freeze({ partialPath, bytes: bytesWritten, requests });
    } catch (error) {
      if (!writer.destroyed) writer.destroy();
      await finished(writer).catch(() => {});
      throw error;
    } finally {
      if (!completed) {
        try { unlinkSync(partialPath); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
      }
    }
  }
}
