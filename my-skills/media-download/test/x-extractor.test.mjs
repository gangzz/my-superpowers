import assert from 'node:assert/strict';
import test from 'node:test';
import { createXExtractor, resolveXUrl, xManifestFromInfo } from '../src/extractors/x.mjs';
import { validateManifest } from '../src/core/contracts.mjs';
import { selectAssets } from '../src/core/selector.mjs';

const source = resolveXUrl('http://x.com/person/status/123?s=46');
const format = { format_id: 'http-1', protocol: 'https', ext: 'mp4', width: 1820, height: 1080, url: 'https://video.twimg.com/a.mp4?secret=1' };
const info = { id: '999', webpage_url: source.canonicalUrl, uploader_id: 'person', uploader: '作者', formats: [format] };

test('X URL matching accepts aliases and strips query without accepting other entry points', () => {
  for (const url of ['https://twitter.com/person/status/123/video/1', 'https://mobile.twitter.com/person/status/123', 'https://x.com/i/web/status/123']) {
    assert.equal(resolveXUrl(url).contentId, '123');
  }
  for (const url of ['https://x.com/person', 'https://x.com/search?q=123', 'https://evil.test/person/status/123', 'ftp://x.com/person/status/123', 'https://x.com/person/status/123/video/2']) assert.equal(resolveXUrl(url), null);
  assert.equal(source.canonicalUrl, 'https://x.com/person/status/123');
});

test('X manifest preserves post identity while filtering unsupported resources', () => {
  const manifest = validateManifest(xManifestFromInfo({ ...info, formats: [format, { ...format, protocol: 'm3u8_native' }, { ...format, acodec: 'none' }, { ...format, url: 'https://evil.test/a.mp4' }] }, source));
  assert.equal(manifest.source.contentId, '123');
  assert.equal(manifest.author.nickname, '作者');
  assert.equal(manifest.assets.length, 1);
  assert.equal(selectAssets(manifest).assets[0].access.mode, 'direct-http');
  assert.throws(() => xManifestFromInfo({ ...info, webpage_url: 'https://x.com/person/status/456' }, source), { code: 'content_identity_mismatch' });
  assert.throws(() => xManifestFromInfo({ ...info, entries: [] }, source), { code: 'unsupported_content' });
  assert.throws(() => xManifestFromInfo(info, source, { width: 10, height: 10 }), { code: 'quality_not_applied' });
});

test('X extraction uses a bounded argument-array process and sanitizes failures', async () => {
  const extractor = createXExtractor({ run: async (command, args, options) => {
    assert.equal(command, 'yt-dlp');
    assert.ok(args.includes('--ignore-config'));
    assert.equal(args.at(-1), source.canonicalUrl);
    assert.equal(options.timeout, 120000);
    return { stdout: JSON.stringify(info) };
  } });
  assert.equal(extractor.browserCapability, 'no-browser');
  assert.equal((await extractor.extract({ url: source.canonicalUrl })).source.contentId, '123');
  for (const [error, code] of [[{ code: 'ENOENT' }, 'dependency_missing'], [new Error('signed-private-url'), 'x_extraction_failed']]) {
    const broken = createXExtractor({ run: async () => { throw error; } });
    await assert.rejects(broken.extract({ url: source.canonicalUrl }), error => error.code === code && !error.message.includes('signed-private-url'));
  }
});
