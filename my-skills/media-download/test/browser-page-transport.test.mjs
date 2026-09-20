import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { BrowserPageTransport } from '../src/transports/browser-page.mjs';

function fakePage(chunks, { declaredBytes = null } = {}) {
  const bindings = new Map();
  return {
    evaluateSource: null,
    arguments: null,
    async exposeBinding(name, callback) { bindings.set(name, callback); },
    async evaluate(operation, args) {
      this.evaluateSource = operation.toString();
      this.arguments = args;
      let actualBytes = 0;
      for (const chunk of chunks) {
        actualBytes += chunk.byteLength;
        await bindings.get(args.chunkBinding)(null, { type: 'chunk', base64: chunk.toString('base64') });
      }
      return {
        status: 206,
        contentType: 'video/mp4',
        contentLength: actualBytes,
        contentRange: `bytes 0-${actualBytes - 1}/${declaredBytes ?? actualBytes}`,
        declaredBytes: declaredBytes ?? actualBytes,
        actualBytes,
      };
    },
  };
}

test('BrowserPageTransport 逐块等待 Node 落盘且不读取完整 arrayBuffer', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'browser-page-transport-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const partialPath = join(root, 'video.mp4.partial');
  const page = fakePage([Buffer.from('first-'), Buffer.from('second')]);
  const transport = new BrowserPageTransport({ maxBytes: 1024, maxChunkBytes: 64 });
  const result = await transport.transfer({
    page,
    access: { mode: 'browser-page', url: 'https://media.example/video.mp4?token=secret' },
    partialPath,
  });

  assert.equal(readFileSync(partialPath, 'utf8'), 'first-second');
  assert.equal(result.bytes, 12);
  assert.match(page.evaluateSource, /getReader/u);
  assert.doesNotMatch(page.evaluateSource, /arrayBuffer/u);
  assert.equal(page.arguments.requestHeaders.range, 'bytes=0-');
});

test('BrowserPageTransport 超过上限时失败并删除 partial 文件', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'browser-page-transport-limit-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const partialPath = join(root, 'video.mp4.partial');
  const page = fakePage([Buffer.alloc(8), Buffer.alloc(8)]);
  const transport = new BrowserPageTransport({ maxBytes: 12, maxChunkBytes: 8 });

  await assert.rejects(
    transport.transfer({
      page,
      access: { mode: 'browser-page', url: 'https://media.example/video.mp4' },
      partialPath,
    }),
    { code: 'media_too_large' },
  );
  assert.equal(existsSync(partialPath), false);
});
