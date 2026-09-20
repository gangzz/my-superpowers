import assert from 'node:assert/strict';
import test from 'node:test';

import { createDownloadPlan } from '../src/core/download-plan.mjs';
import { detectExtractorAccess } from '../src/core/contracts.mjs';
import { createExtractorRegistry } from '../src/core/registry.mjs';
import { selectAssets } from '../src/core/selector.mjs';
import { verifyExpectedVideo } from '../src/core/video-verification.mjs';

function manifest(contentKind, assets) {
  return {
    schemaVersion: 1,
    source: { site: 'fixture', contentId: 'one', canonicalUrl: 'https://example.test/post/one' },
    content: { kind: contentKind },
    assets,
  };
}

const direct = { mode: 'direct-http' };

test('registry chooses exactly one site extractor', () => {
  const registry = createExtractorRegistry([{
    id: 'fixture',
    browserCapability: 'no-browser',
    matches: (url) => new URL(url).hostname === 'example.test',
    async extract() {},
  }]);
  assert.equal(registry.match('https://example.test/post/one').id, 'fixture');
  assert.throws(() => registry.match('https://other.test/post/one'), { code: 'extractor_not_found' });
});

test('default policy chooses the lowest combined audio-video asset', () => {
  const selected = selectAssets(manifest('video', [
    { id: 'preload', kind: 'video', width: 360, height: 640, bitrate: 200, tracks: { video: true, audio: false }, access: direct },
    { id: 'combined-high', kind: 'video', width: 1080, height: 1920, bitrate: 2000, tracks: { video: true, audio: true }, access: direct },
    { id: 'combined-low', kind: 'video', width: 540, height: 960, bitrate: 700, tracks: { video: true, audio: true }, access: direct },
  ]));
  assert.deepEqual(selected.assets.map(({ id }) => id), ['combined-low']);
  assert.deepEqual(selected.postprocess, []);
});

test('default policy chooses the current combined stream before another resolution', () => {
  const selected = selectAssets(manifest('video', [
    { id: 'combined-low', kind: 'video', width: 540, height: 960, bitrate: 700, tracks: { video: true, audio: true }, access: direct },
    { id: 'combined-current', kind: 'video', width: 1080, height: 1920, bitrate: 2000, isCurrent: true, tracks: { video: true, audio: true }, access: direct },
  ]));
  assert.deepEqual(selected.assets.map(({ id }) => id), ['combined-current']);
  assert.equal(selected.policy.videoQuality, 'current');
});

test('separate lowest video and audio assets are selected only when no combined asset exists', () => {
  const sourceManifest = manifest('video', [
    { id: 'video-high', kind: 'video', width: 1080, height: 1920, bitrate: 2000, tracks: { video: true, audio: false }, access: direct },
    { id: 'video-low', kind: 'video', width: 540, height: 960, bitrate: 700, tracks: { video: true, audio: false }, access: direct },
    { id: 'audio', kind: 'audio', bitrate: 128, tracks: { video: false, audio: true }, access: { mode: 'browser-session' } },
  ]);
  const selected = selectAssets(sourceManifest);
  assert.deepEqual(selected.assets.map(({ id }) => id), ['video-low', 'audio']);
  assert.deepEqual(selected.postprocess, ['mux']);
  const plan = createDownloadPlan({ manifest: sourceManifest, selection: selected });
  assert.deepEqual(plan.transfers.map(({ transport }) => transport), ['NodeHttpTransport', 'BrowserSessionTransport']);
});

test('image posts return the complete ordered set without user media arguments', () => {
  const selected = selectAssets(manifest('image-set', [
    { id: 'third', kind: 'image', order: 3, access: direct },
    { id: 'first', kind: 'image', order: 1, access: direct },
    { id: 'second', kind: 'image', order: 2, access: direct },
  ]));
  assert.deepEqual(selected.assets.map(({ id }) => id), ['first', 'second', 'third']);
});

test('人工选择的期望尺寸必须与最终媒体检查一致', () => {
  assert.deepEqual(verifyExpectedVideo({
    expectedVideo: { width: 1080, height: 1920 },
    actualVideo: { width: 1080, height: 1920 },
  }), {
    matched: true,
    expected: { width: 1080, height: 1920 },
    actual: { width: 1080, height: 1920 },
  });
  assert.throws(
    () => verifyExpectedVideo({
      expectedVideo: { width: 720, height: 1280 },
      actualVideo: { width: 1080, height: 1920 },
    }),
    { code: 'quality_not_applied' },
  );
});

test('登录状态由 Extractor 按需检测', async () => {
  const publicExtractor = {
    id: 'public',
    browserCapability: 'no-browser',
    matches: () => true,
    extract: async () => ({}),
  };
  assert.deepEqual(await detectExtractorAccess(publicExtractor, {}), { state: 'ready' });

  const loginExtractor = {
    ...publicExtractor,
    id: 'login',
    browserCapability: 'visible-required',
    detectAccessState: async () => ({ state: 'login_required' }),
  };
  assert.deepEqual(await detectExtractorAccess(loginExtractor, {}), { state: 'login_required' });
});
