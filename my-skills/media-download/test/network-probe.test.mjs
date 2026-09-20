import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { NetworkProbe } from '../src/dev/network-probe.mjs';

function tempProbe(t, options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'media-download-network-probe-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const page = new EventEmitter();
  const job = join(root, 'job-001');
  const paths = {
    job,
    networkEvents: join(job, 'network.ndjson'),
    bodies: join(job, 'bodies'),
  };
  const probe = new NetworkProbe({ page, jobId: 'job-001', diagnosticPaths: paths, ...options });
  probe.start();
  return { page, paths, probe };
}

function fakeRequest({
  url,
  method = 'GET',
  resourceType = 'xhr',
  headers = {},
  failure = null,
} = {}) {
  return {
    url: () => url,
    method: () => method,
    resourceType: () => resourceType,
    headers: () => headers,
    allHeaders: async () => headers,
    redirectedFrom: () => null,
    failure: () => failure,
  };
}

function fakeResponse(request, {
  status = 200,
  headers = {},
  body = Buffer.alloc(0),
  onBody = () => {},
} = {}) {
  return {
    request: () => request,
    url: () => request.url(),
    status: () => status,
    headers: () => headers,
    allHeaders: async () => headers,
    body: async () => {
      onBody();
      return body;
    },
  };
}

function readEvents(path) {
  return readFileSync(path, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
}

test('媒体请求按脱敏归一化 URL 去重，二进制正文不落盘', async (t) => {
  const { page, paths, probe } = tempProbe(t);
  let bodyReads = 0;
  for (const signature of ['first-secret', 'second-secret']) {
    const request = fakeRequest({
      url: `https://media.example/video.mp4?quality=low&signature=${signature}`,
      resourceType: 'media',
      headers: { range: 'bytes=0-1023', cookie: 'session=secret' },
    });
    const response = fakeResponse(request, {
      status: 206,
      headers: {
        'content-type': 'video/mp4',
        'content-length': '1024',
        'content-range': 'bytes 0-1023/4096',
      },
      body: Buffer.alloc(1024),
      onBody: () => { bodyReads += 1; },
    });
    page.emit('request', request);
    page.emit('response', response);
  }

  const summary = await probe.stop();
  const eventsText = readFileSync(paths.networkEvents, 'utf8');
  const events = readEvents(paths.networkEvents);
  const candidate = events.find((event) => event.type === 'media_candidate');
  const candidateSummary = events.find((event) => event.type === 'media_candidate_summary');

  assert.equal(summary.mediaCandidates, 1);
  assert.equal(candidate.request.url, 'https://media.example/video.mp4?quality=<redacted>&signature=<redacted>');
  assert.equal(candidateSummary.requests, 2);
  assert.equal(bodyReads, 0);
  assert.equal(eventsText.includes('first-secret'), false);
  assert.equal(eventsText.includes('second-secret'), false);
  assert.equal(eventsText.includes('session=secret'), false);
  assert.equal(probe.getAccessMaterial(candidate.candidateId).url.includes('second-secret'), true);
});

test('小型 JSON 与 M3U8 只写入脱敏正文，原始访问材料留在内存', async (t) => {
  const { page, paths, probe } = tempProbe(t);
  const rawJson = JSON.stringify({
    playUrl: 'https://media.example/video.mp4?token=raw-token&quality=540',
    access_token: 'raw-access-token',
  });
  const jsonRequest = fakeRequest({ url: 'https://api.example/item.json?auth=raw-auth' });
  page.emit('request', jsonRequest);
  page.emit('response', fakeResponse(jsonRequest, {
    headers: { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(rawJson)) },
    body: Buffer.from(rawJson),
  }));

  const rawManifest = '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="https://media.example/key?token=raw-key"\nsegment.ts?signature=raw-signature\n';
  const manifestRequest = fakeRequest({ url: 'https://media.example/index.m3u8?token=manifest-token' });
  page.emit('request', manifestRequest);
  page.emit('response', fakeResponse(manifestRequest, {
    headers: { 'content-type': 'application/vnd.apple.mpegurl' },
    body: Buffer.from(rawManifest),
  }));

  const snapshot = await probe.flush();
  assert.equal(snapshot.mediaCandidates.length, 1);
  assert.equal(snapshot.resourceDescriptors.length, 1);
  await probe.stop();
  const events = readEvents(paths.networkEvents);
  const descriptor = events.find((event) => event.type === 'resource_descriptor');
  const manifest = events.find((event) => event.type === 'media_candidate' && event.category === 'manifest');
  const jsonDiagnostic = readFileSync(join(paths.job, descriptor.bodyRef), 'utf8');
  const manifestDiagnostic = readFileSync(join(paths.job, manifest.bodyRef), 'utf8');

  assert.equal(jsonDiagnostic.includes('raw-token'), false);
  assert.equal(jsonDiagnostic.includes('raw-access-token'), false);
  assert.equal(jsonDiagnostic.includes('<redacted>'), true);
  assert.equal(manifestDiagnostic.includes('raw-key'), false);
  assert.equal(manifestDiagnostic.includes('raw-signature'), false);
  assert.equal(probe.getAccessMaterial(descriptor.descriptorId).rawBody.toString('utf8'), rawJson);
  assert.equal(probe.getAccessMaterial(manifest.candidateId).rawBody.toString('utf8'), rawManifest);
});

test('普通流量和噪声只汇总，失败的媒体请求仍作为候选保留', async (t) => {
  const { page, paths, probe } = tempProbe(t);
  const scriptRequest = fakeRequest({ url: 'https://static.example/app.js', resourceType: 'script' });
  page.emit('request', scriptRequest);
  page.emit('response', fakeResponse(scriptRequest, { headers: { 'content-type': 'text/javascript' } }));

  const documentRequest = fakeRequest({ url: 'https://www.example/post', resourceType: 'document' });
  page.emit('request', documentRequest);
  page.emit('response', fakeResponse(documentRequest, { headers: { 'content-type': 'text/html' } }));

  const failedMedia = fakeRequest({
    url: 'https://media.example/audio.m4a?token=failed-secret',
    resourceType: 'media',
    failure: { errorText: 'net::ERR_ABORTED' },
  });
  page.emit('request', failedMedia);
  page.emit('requestfailed', failedMedia);

  await probe.stop();
  const events = readEvents(paths.networkEvents);
  const media = events.find((event) => event.type === 'media_candidate');
  const traffic = events.find((event) => event.type === 'network_traffic_summary');

  assert.equal(media.failure.errorText, 'net::ERR_ABORTED');
  assert.deepEqual(traffic.ignored, { 'script:200': 1 });
  assert.deepEqual(traffic.ordinary, { 'document:200': 1 });
  assert.deepEqual(traffic.failures, { 'media:net::ERR_ABORTED': 1 });
  assert.equal(events.some((event) => event.request?.url === 'https://static.example/app.js'), false);
});

test('无 Content-Length 的 JSON 不读取正文', async (t) => {
  const { page, paths, probe } = tempProbe(t);
  let bodyReads = 0;
  const request = fakeRequest({ url: 'https://api.example/item.json' });
  page.emit('request', request);
  page.emit('response', fakeResponse(request, {
    headers: { 'content-type': 'application/json' },
    body: Buffer.from('{"large":"unknown"}'),
    onBody: () => { bodyReads += 1; },
  }));

  await probe.stop();
  const descriptor = readEvents(paths.networkEvents).find((event) => event.type === 'resource_descriptor');
  assert.equal(descriptor.bodyCapture, 'unknown-size');
  assert.equal(descriptor.bodyRef, null);
  assert.equal(bodyReads, 0);
});

test('永不完成的文本正文读取会超时且不阻塞 stop', { timeout: 1000 }, async (t) => {
  const { page, paths, probe } = tempProbe(t, { bodyReadTimeoutMs: 20 });
  const request = fakeRequest({ url: 'https://media.example/live.m3u8?token=secret' });
  page.emit('request', request);
  page.emit('response', fakeResponse(request, {
    headers: { 'content-type': 'application/vnd.apple.mpegurl' },
    body: new Promise(() => {}),
  }));

  const startedAt = Date.now();
  const summary = await probe.stop();
  const elapsedMs = Date.now() - startedAt;
  const candidate = readEvents(paths.networkEvents).find((event) => event.type === 'media_candidate');

  assert.equal(candidate.bodyCapture, 'timeout');
  assert.equal(candidate.bodyRef, null);
  assert.equal(summary.internalErrors, 0);
  assert.equal(elapsedMs < 250, true);
});

test('正文读取超时后会消费迟到的 rejection', { timeout: 1000 }, async (t) => {
  const { page, paths, probe } = tempProbe(t, { bodyReadTimeoutMs: 10 });
  const request = fakeRequest({ url: 'https://media.example/late.m3u8' });
  const lateRejection = new Promise((_resolve, reject) => {
    setTimeout(() => reject(new Error('late body failure')), 40);
  });
  page.emit('request', request);
  page.emit('response', fakeResponse(request, {
    headers: { 'content-type': 'application/vnd.apple.mpegurl' },
    body: lateRejection,
  }));

  await probe.stop();
  await new Promise((resolve) => setTimeout(resolve, 60));
  const candidate = readEvents(paths.networkEvents).find((event) => event.type === 'media_candidate');
  assert.equal(candidate.bodyCapture, 'timeout');
});
