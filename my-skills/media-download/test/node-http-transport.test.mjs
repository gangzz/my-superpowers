import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeHttpTransport } from '../src/transports/node-http.mjs';
import { createXExtractor } from '../src/extractors/x.mjs';
import { createExtractorRegistry } from '../src/core/registry.mjs';
import { createDownloadExecutor } from '../src/runtime/download-executor.mjs';

const access = { mode: 'direct-http', url: 'https://video.twimg.com/a.mp4?private=1' };

test('direct HTTP streams bounded ranges without browser cookies', async t => {
  const root = mkdtempSync(join(tmpdir(), 'x-http-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const transport = new NodeHttpTransport({ requestBytes: 2, fetchImpl: async (url, options) => {
    assert.equal(options.headers.cookie, undefined);
    const start = Number(options.headers.range.match(/bytes=(\d+)/)[1]);
    const end = Math.min(start + 1, 4);
    return new Response(Buffer.from('video').subarray(start, end + 1), { status: 206, headers: { 'content-range': `bytes ${start}-${end}/5` } });
  } });
  const partialPath = join(root, 'media.partial');
  assert.equal((await transport.transfer({ access, partialPath })).bytes, 5);
  assert.equal(readFileSync(partialPath, 'utf8'), 'video');
});

test('failed direct HTTP removes its partial and preserves existing files', async t => {
  const root = mkdtempSync(join(tmpdir(), 'x-http-fail-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const transport = new NodeHttpTransport({ fetchImpl: async () => new Response('bad', { status: 403 }) });
  const partialPath = join(root, 'media.partial');
  await assert.rejects(transport.transfer({ access, partialPath }), { code: 'media_http_error' });
  assert.equal(existsSync(partialPath), false);
});

test('X executor uses direct HTTP and commits v2 sidecar without signed URLs', async t => {
  const root = mkdtempSync(join(tmpdir(), 'x-executor-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const extractor = createXExtractor({ run: async () => ({ stdout: JSON.stringify({ webpage_url: 'https://x.com/person/status/123', formats: [{ format_id: 'http', protocol: 'https', ext: 'mp4', width: 640, height: 360, url: access.url }] }) }) });
  const executor = createDownloadExecutor({ registry: createExtractorRegistry([extractor]), outputDirectory: root,
    nodeHttpTransport: new NodeHttpTransport({ fetchImpl: async () => new Response('video') }),
    inspect: async () => ({ bytes: 5, duration: 1, video: { width: 640, height: 360, codec_name: 'h264' }, audio: { codec_name: 'aac' } }),
    digest: async () => 'test-hash',
  });
  const job = { url: 'https://twitter.com/person/status/123?s=46', commentsLimit: 1 };
  assert.equal(executor.requiresBrowser({ job }), false);
  const result = await executor.executeDownload({ job });
  const text = readFileSync(result.sourcePath, 'utf8');
  const record = JSON.parse(text);
  assert.equal(record.schemaVersion, 2);
  assert.equal(record.source.contentId, '123');
  assert.deepEqual(record.access.transports, ['direct-http-stream']);
  assert.equal(text.includes('private=1'), false);
  assert.equal(existsSync(result.outputPath), true);
  assert.equal(JSON.parse(readFileSync(result.commentsPath, 'utf8')).reason, 'unsupported_site');
});
