import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createExtractorRegistry } from '../src/core/registry.mjs';
import { createDownloadExecutor } from '../src/runtime/download-executor.mjs';

test('执行器只在媒体检查通过后提交正式文件和无敏感 URL 的来源记录', async (t) => {
  const outputDirectory = mkdtempSync(join(tmpdir(), 'download-executor-'));
  t.after(() => rmSync(outputDirectory, { recursive: true, force: true }));
  const signedUrl = 'https://media.example/target.mp4?token=private';
  const extractor = {
    id: 'fixture',
    browserCapability: 'visible-required',
    matches: (url) => new URL(url).hostname === 'example.test',
    async extract() {
      return {
        schemaVersion: 1,
        source: { site: 'fixture', contentId: 'one', canonicalUrl: 'https://example.test/video/one' },
        content: { kind: 'video' },
        assets: [{
          id: 'combined-current',
          kind: 'video',
          width: 1080,
          height: 1920,
          isCurrent: true,
          tracks: { video: true, audio: true },
          access: { mode: 'browser-page', url: signedUrl },
        }],
      };
    },
  };
  const browserPageTransport = {
    async transfer({ partialPath }) {
      writeFileSync(partialPath, Buffer.from('verified-media'));
      return { partialPath, bytes: 14 };
    },
  };
  const inspect = async ({ filePath }) => ({
    path: filePath,
    bytes: 14,
    duration: 12,
    video: { width: 1080, height: 1920, codec_name: 'hevc' },
    audio: { codec_name: 'aac' },
  });
  const executor = createDownloadExecutor({
    registry: createExtractorRegistry([extractor]),
    outputDirectory,
    browserPageTransport,
    inspect,
    digest: async () => 'digest',
    clock: () => 0,
  });
  const result = await executor.executeDownload({
    job: { url: 'https://example.test/video/one', expectedVideo: { width: 1080, height: 1920 } },
    page: {},
  });

  assert.equal(existsSync(result.outputPath), true);
  assert.equal(existsSync(`${result.outputPath}.partial`), false);
  const source = readFileSync(result.sourcePath, 'utf8');
  assert.equal(source.includes('private'), false);
  assert.equal(source.includes(signedUrl), false);
  assert.deepEqual(JSON.parse(source).access.transports, ['browser-page-stream']);
});

test('来源记录提交失败时回滚已经改名的媒体文件', async (t) => {
  const outputDirectory = mkdtempSync(join(tmpdir(), 'download-executor-rollback-'));
  t.after(() => rmSync(outputDirectory, { recursive: true, force: true }));
  const extractor = {
    id: 'fixture',
    browserCapability: 'visible-required',
    matches: () => true,
    async extract() {
      return {
        schemaVersion: 1,
        source: { site: 'fixture', contentId: 'rollback', canonicalUrl: 'https://example.test/video/rollback' },
        content: { kind: 'video' },
        assets: [{
          id: 'combined-current',
          kind: 'video',
          width: 1080,
          height: 1920,
          isCurrent: true,
          tracks: { video: true, audio: true },
          access: { mode: 'browser-page', url: 'https://media.example/rollback.mp4' },
        }],
      };
    },
  };
  const executor = createDownloadExecutor({
    registry: createExtractorRegistry([extractor]),
    outputDirectory,
    browserPageTransport: {
      async transfer({ partialPath }) {
        writeFileSync(partialPath, Buffer.from('verified-media'));
      },
    },
    inspect: async () => ({
      bytes: 14,
      duration: 12,
      video: { width: 1080, height: 1920, codec_name: 'hevc' },
      audio: { codec_name: 'aac' },
    }),
    digest: async () => 'digest',
    rename(from, to) {
      if (to.endsWith('.source.json')) throw new Error('source rename failed');
      renameSync(from, to);
    },
  });

  await assert.rejects(
    executor.executeDownload({ job: { url: 'https://example.test/video/rollback' }, page: {} }),
    /source rename failed/,
  );
  assert.deepEqual(readdirSync(outputDirectory), []);
});
