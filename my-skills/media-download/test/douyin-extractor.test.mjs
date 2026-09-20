import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDouyinExtractor,
  extractDouyinContentId,
  resolveDouyinInputUrl,
} from '../src/extractors/douyin.mjs';

function fakePage({ contentId, targetUrl }) {
  return {
    navigatedTo: null,
    async goto(url) {
      this.navigatedTo = url;
      return { status: () => 200 };
    },
    url() { return `https://www.douyin.com/jingxuan?modal_id=${contentId}&token=private`; },
    async title() { return '目标作品 - 抖音'; },
    async waitForTimeout() {},
    async evaluate(operation) {
      const source = operation.toString();
      if (source.includes("document.querySelector('#RENDER_DATA')")) {
        return {
          description: '目标作品',
          width: 1080,
          height: 1920,
          durationMs: 12_000,
          urls: [{ field: 'play_addr', url: targetUrl }],
        };
      }
      if (source.includes("document.querySelectorAll('video')")) {
        return {
          index: 0,
          width: 1080,
          height: 1920,
          duration: 12,
          currentSrcKind: 'blob',
          paused: false,
          readyState: 4,
        };
      }
      if (source.includes('navigator.userAgent')) {
        return { userAgent: 'Fixture Browser', acceptLanguage: 'zh-CN' };
      }
      throw new Error(`unexpected evaluate operation: ${source.slice(0, 80)}`);
    },
  };
}

test('抖音作品 ID 同时支持 modal_id 和标准作品路径', () => {
  assert.equal(extractDouyinContentId('https://www.douyin.com/jingxuan?modal_id=7659735376830991635'), '7659735376830991635');
  assert.equal(extractDouyinContentId('https://www.douyin.com/video/7659735376830991635'), '7659735376830991635');
  assert.equal(extractDouyinContentId('https://v.douyin.com/example/'), null);
});

test('分享短链先通过 HTTP 重定向解析成正式作品 URL', async () => {
  const resolved = await resolveDouyinInputUrl('https://v.douyin.com/example/', {
    fetchImpl: async (_url, options) => {
      assert.equal(options.method, 'HEAD');
      assert.equal(options.redirect, 'follow');
      return { url: 'https://www.douyin.com/video/7686536402804247871?previous_page=web_code_link' };
    },
  });
  assert.equal(resolved, 'https://www.douyin.com/jingxuan?modal_id=7686536402804247871');
});

test('Extractor 用短链解析后的正式 URL 导航，避免短链入口验证码', async () => {
  const contentId = '7686536402804247871';
  const targetUrl = 'https://v3.douyinvod.com/video/tos/cn/target-key';
  const page = fakePage({ contentId, targetUrl });
  const extractor = createDouyinExtractor({
    discoveryTimeoutMs: 10,
    pollIntervalMs: 1,
    fetchImpl: async () => ({ url: `https://www.douyin.com/video/${contentId}?previous_page=web_code_link` }),
  });
  const manifest = await extractor.extract({
    url: 'https://v.douyin.com/example/',
    page,
  });
  assert.equal(page.navigatedTo, `https://www.douyin.com/jingxuan?modal_id=${contentId}`);
  assert.equal(manifest.source.contentId, contentId);
  assert.equal(manifest.source.canonicalUrl, `https://www.douyin.com/video/${contentId}`);
});

test('抖音 RENDER_DATA 资源统一使用 browser-session', async () => {
  const contentId = '7659735376830991635';
  const splitUrl = 'https://v3.douyinvod.com/split-key/media-video-hvc1/?token=target';
  const extractor = createDouyinExtractor({ discoveryTimeoutMs: 10, pollIntervalMs: 1 });
  const manifest = await extractor.extract({
    url: `https://www.douyin.com/jingxuan?modal_id=${contentId}`,
    page: fakePage({ contentId, targetUrl: splitUrl }),
  });
  assert.equal(manifest.assets[0].access.mode, 'browser-session');
  assert.deepEqual(manifest.assets[0].tracks, { video: true, audio: false });
  assert.equal(manifest.assets[0].access.requestHeaders['user-agent'], 'Fixture Browser');
});

test('Extractor 只使用目标 RENDER_DATA 中的资源且运行时不依赖 NetworkProbe', async () => {
  const contentId = '7659735376830991635';
  const targetUrl = 'https://v3.douyinvod.com/video/tos/cn/target-key?token=target';
  const extractor = createDouyinExtractor({ discoveryTimeoutMs: 10, pollIntervalMs: 1 });
  const manifest = await extractor.extract({
    url: `https://www.douyin.com/jingxuan?modal_id=${contentId}`,
    page: fakePage({ contentId, targetUrl }),
  });

  assert.equal(manifest.source.contentId, contentId);
  assert.deepEqual(manifest.assets.map(({ id }) => id), ['douyin:render-0001']);
  assert.equal(manifest.assets[0].access.mode, 'browser-session');
  assert.equal(manifest.assets[0].access.url, targetUrl);
  assert.deepEqual(manifest.assets[0].tracks, { video: true, audio: true });
  assert.equal(manifest.assets[0].isCurrent, undefined);
  assert.equal(manifest.evidence.identityRule, 'content-id -> RENDER_DATA target -> target video URLs');
});
