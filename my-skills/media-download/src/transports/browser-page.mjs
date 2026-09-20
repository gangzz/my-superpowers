import { randomUUID } from 'node:crypto';
import { createWriteStream, mkdirSync, unlinkSync } from 'node:fs';
import { once } from 'node:events';
import { finished } from 'node:stream/promises';
import { dirname } from 'node:path';

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

function existingHttpUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new TypeError('access.url must use http or https');
  return url.toString();
}

function browserSafeHeaders(headers = {}) {
  const safe = {};
  for (const [name, value] of Object.entries(headers)) {
    const normalized = name.toLowerCase();
    if (normalized === 'accept' || normalized === 'accept-language') safe[normalized] = String(value);
  }
  safe.range = 'bytes=0-';
  return safe;
}

async function openExclusiveWriteStream(path) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const stream = createWriteStream(path, { flags: 'wx', mode: 0o600 });
  await new Promise((resolve, reject) => {
    const onOpen = () => {
      stream.off('error', onError);
      resolve();
    };
    const onError = (error) => {
      stream.off('open', onOpen);
      reject(error);
    };
    stream.once('open', onOpen);
    stream.once('error', onError);
  });
  return stream;
}

export class BrowserPageTransport {
  constructor({ maxBytes = 2 * 1024 * 1024 * 1024, maxChunkBytes = 128 * 1024 } = {}) {
    this.maxBytes = positiveInteger(maxBytes, 'maxBytes');
    this.maxChunkBytes = positiveInteger(maxChunkBytes, 'maxChunkBytes');
  }

  async transfer({ page, access, partialPath } = {}) {
    if (!page || typeof page.exposeBinding !== 'function' || typeof page.evaluate !== 'function') {
      throw new TypeError('page with exposeBinding and evaluate is required');
    }
    if (access?.mode !== 'browser-page') throw new TypeError('access.mode must be browser-page');
    if (typeof partialPath !== 'string' || partialPath.trim() === '') throw new TypeError('partialPath is required');

    const mediaUrl = existingHttpUrl(access.url);
    const bindingName = `__mediaDownloadChunk_${randomUUID().replaceAll('-', '')}`;
    const writer = await openExclusiveWriteStream(partialPath);
    let bytesWritten = 0;
    let completed = false;
    let writerFailure = null;
    writer.on('error', (error) => { writerFailure = error; });

    try {
      await page.exposeBinding(bindingName, async (_source, payload) => {
        if (!payload || payload.type !== 'chunk' || typeof payload.base64 !== 'string') {
          throw codedError('invalid_stream_chunk', 'Browser page sent an invalid media chunk');
        }
        const chunk = Buffer.from(payload.base64, 'base64');
        if (chunk.byteLength === 0 || chunk.byteLength > this.maxChunkBytes) {
          throw codedError('invalid_stream_chunk', `Browser page chunk size is invalid: ${chunk.byteLength}`);
        }
        if (bytesWritten + chunk.byteLength > this.maxBytes) {
          throw codedError('media_too_large', `Media exceeds ${this.maxBytes} bytes`);
        }
        if (writerFailure) throw writerFailure;
        bytesWritten += chunk.byteLength;
        if (!writer.write(chunk)) await once(writer, 'drain');
        if (writerFailure) throw writerFailure;
        return { acceptedBytes: chunk.byteLength };
      });

      const response = await page.evaluate(async ({
        sourceUrl,
        requestHeaders,
        chunkBinding,
        maximumBytes,
        chunkBytes,
      }) => {
        const result = await fetch(sourceUrl, {
          method: 'GET',
          credentials: 'include',
          headers: requestHeaders,
        });
        if (result.status !== 200 && result.status !== 206) {
          throw new Error(`media fetch HTTP ${result.status}`);
        }
        const contentLength = Number(result.headers.get('content-length') ?? 0) || null;
        const contentRange = result.headers.get('content-range');
        const rangeTotal = Number(/\/(\d+)$/u.exec(contentRange ?? '')?.[1] ?? 0) || null;
        const declaredBytes = rangeTotal ?? contentLength;
        if (declaredBytes != null && declaredBytes > maximumBytes) {
          throw new Error(`declared media size exceeds limit: ${declaredBytes}`);
        }
        if (!result.body) throw new Error('media response has no readable body');

        const reader = result.body.getReader();
        let actualBytes = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!(value instanceof Uint8Array) || value.byteLength === 0) continue;
            actualBytes += value.byteLength;
            if (actualBytes > maximumBytes) throw new Error(`media exceeds limit: ${actualBytes}`);
            for (let offset = 0; offset < value.byteLength; offset += chunkBytes) {
              const chunk = value.subarray(offset, Math.min(offset + chunkBytes, value.byteLength));
              let binary = '';
              for (let inner = 0; inner < chunk.byteLength; inner += 0x8000) {
                binary += String.fromCharCode(...chunk.subarray(inner, Math.min(inner + 0x8000, chunk.byteLength)));
              }
              await globalThis[chunkBinding]({ type: 'chunk', base64: btoa(binary) });
            }
          }
        } finally {
          reader.releaseLock();
        }
        return {
          status: result.status,
          contentType: result.headers.get('content-type'),
          contentLength,
          contentRange,
          declaredBytes,
          actualBytes,
        };
      }, {
        sourceUrl: mediaUrl,
        requestHeaders: browserSafeHeaders(access.requestHeaders),
        chunkBinding: bindingName,
        maximumBytes: this.maxBytes,
        chunkBytes: Math.min(this.maxChunkBytes, 64 * 1024),
      });

      writer.end();
      await finished(writer);
      if (writerFailure) throw writerFailure;
      if (bytesWritten === 0 || response.actualBytes !== bytesWritten) {
        throw codedError('media_size_mismatch', `Streamed ${bytesWritten} bytes, browser reported ${response.actualBytes}`);
      }
      if (response.declaredBytes != null && response.declaredBytes !== bytesWritten) {
        throw codedError('media_size_mismatch', `Expected ${response.declaredBytes} bytes, received ${bytesWritten}`);
      }
      completed = true;
      return Object.freeze({ partialPath, bytes: bytesWritten, ...response });
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
