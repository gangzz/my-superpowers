import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { BrowserSessionTransport } from '../src/transports/browser-session.mjs';

test('BrowserSessionTransport 使用浏览器会话材料按 Range 分段流式写盘', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'browser-session-transport-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const partialPath = join(root, 'video.mp4.partial');
  const body = Buffer.from('0123456789');
  const requests = [];
  const fetchImpl = async (_url, options) => {
    requests.push(options);
    const match = /^bytes=(\d+)-(\d+)$/u.exec(options.headers.range);
    const start = Number(match[1]);
    const requestedEnd = Number(match[2]);
    const end = Math.min(requestedEnd, body.byteLength - 1);
    return new Response(body.subarray(start, end + 1), {
      status: 206,
      headers: { 'content-range': `bytes ${start}-${end}/${body.byteLength}` },
    });
  };
  const transport = new BrowserSessionTransport({ maxBytes: 64, requestBytes: 4, fetchImpl });
  const result = await transport.transfer({
    context: { async cookies() { return [{ name: 'sessionid', value: 'secret' }]; } },
    page: { url: () => 'https://www.douyin.com/video/one' },
    access: {
      mode: 'browser-session',
      url: 'https://media.example/video.mp4?token=signed',
      requestHeaders: { 'user-agent': 'Fixture Browser' },
    },
    partialPath,
  });

  assert.equal(readFileSync(partialPath, 'utf8'), body.toString('utf8'));
  assert.equal(result.requests, 3);
  assert.deepEqual(requests.map(({ headers }) => headers.range), ['bytes=0-3', 'bytes=4-7', 'bytes=8-11']);
  assert.equal(requests[0].headers.cookie, 'sessionid=secret');
  assert.equal(requests[0].headers.referer, 'https://www.douyin.com/video/one');
  assert.equal(requests[0].headers['user-agent'], 'Fixture Browser');
});

test('BrowserSessionTransport 拒绝超过上限的 Content-Range 并清理 partial', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'browser-session-transport-limit-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const partialPath = join(root, 'video.mp4.partial');
  const transport = new BrowserSessionTransport({
    maxBytes: 8,
    requestBytes: 4,
    fetchImpl: async () => new Response(Buffer.from('0123'), {
      status: 206,
      headers: { 'content-range': 'bytes 0-3/16' },
    }),
  });

  await assert.rejects(
    transport.transfer({
      context: { async cookies() { return []; } },
      access: { mode: 'browser-session', url: 'https://media.example/video.mp4' },
      partialPath,
    }),
    { code: 'media_range_invalid' },
  );
  assert.equal(existsSync(partialPath), false);
});

test('BrowserSessionTransport 在主 CDN 失败后从头改用备用地址', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'browser-session-transport-fallback-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const partialPath = join(root, 'video.m4s.partial');
  const body = Buffer.from('fallback-media');
  const requested = [];
  const transport = new BrowserSessionTransport({
    maxBytes: 64,
    requestBytes: 64,
    async fetchImpl(url) {
      requested.push(url);
      if (url.includes('primary.example')) return new Response('unavailable', { status: 503 });
      return new Response(body, {
        status: 206,
        headers: { 'content-range': `bytes 0-${body.byteLength - 1}/${body.byteLength}` },
      });
    },
  });

  const result = await transport.transfer({
    context: { async cookies() { return []; } },
    page: { url: () => 'https://www.bilibili.com/video/BV1nLYh6uEH8/' },
    access: {
      mode: 'browser-session',
      url: 'https://primary.example/video.m4s?token=private',
      fallbackUrls: ['https://backup.example/video.m4s?token=private'],
      requestHeaders: { 'user-agent': 'Fixture Browser' },
    },
    partialPath,
  });

  assert.deepEqual(requested, [
    'https://primary.example/video.m4s?token=private',
    'https://backup.example/video.m4s?token=private',
  ]);
  assert.equal(readFileSync(partialPath, 'utf8'), body.toString('utf8'));
  assert.equal(result.requests, 2);
});
