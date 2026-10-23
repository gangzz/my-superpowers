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
          title: '目标作品标题',
          description: '目标作品完整文案 #AI工具 #效率',
          tags: ['AI工具', '效率'],
          author: {
            id: 'MS4wLjABAAAAfixture',
            nickname: '目标作者',
            url: 'https://www.douyin.com/user/MS4wLjABAAAAfixture',
          },
          engagement: {
            likeCount: 1234,
            favoriteCount: 321,
            commentCount: 45,
            shareCount: 67,
          },
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

function rawRenderDataPage({ contentId, targetUrl }) {
  const target = {
    aweme_id: contentId,
    item_title: 'RENDER_DATA 标题',
    desc: '完整文案 #备用标签',
    author: {
      sec_uid: 'MS4wLjABAAAArenderdata',
      nickname: 'RENDER_DATA 作者',
    },
    text_extra: [
      { hashtag_name: '人工智能' },
      { hashtag_name: '效率工具' },
    ],
    statistics: {
      digg_count: '4321',
      collect_count: 210,
      comment_count: 98,
      share_count: 76,
      play_count: 999999,
    },
    video: {
      width: 1080,
      height: 1920,
      duration: 12_000,
      play_addr: { url_list: [targetUrl] },
    },
  };
  return {
    async goto() { return { status: () => 200 }; },
    url() { return `https://www.douyin.com/jingxuan?modal_id=${contentId}`; },
    async waitForTimeout() {},
    async evaluate(operation, input) {
      const source = operation.toString();
      if (source.includes("document.querySelector('#RENDER_DATA')")) {
        const previousDocument = globalThis.document;
        globalThis.document = {
          querySelector: (selector) => (
            selector === '#RENDER_DATA' ? { textContent: JSON.stringify({ target }) } : null
          ),
        };
        try { return operation(input); } finally { globalThis.document = previousDocument; }
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

test('标准长链和带 modal_id 的入口统一规范化且不额外请求短链解析', async () => {
  const id = '7677380416872959247';
  for (const url of [
    `https://www.douyin.com/video/${id}`,
    `https://www.douyin.com/video/${id}?previous_page=web_code_link`,
    `https://www.douyin.com/jingxuan?modal_id=${id}`,
  ]) {
    assert.equal(await resolveDouyinInputUrl(url, {
      fetchImpl: () => { throw new Error('Long links must not request short-link resolution'); },
    }), `https://www.douyin.com/jingxuan?modal_id=${id}`);
  }
  assert.equal(await resolveDouyinInputUrl(`https://example.com/video/${id}`), `https://example.com/video/${id}`);
});

test('普通长链下载和失败任务人工接管使用同一个规范作品入口', async () => {
  const id = '7677380416872959247';
  const url = `https://www.douyin.com/video/${id}`;
  const page = fakePage({ contentId: id, targetUrl: 'https://v3.douyinvod.com/video/target' });
  const extractor = createDouyinExtractor();
  const manifest = await extractor.extract({ url, page });
  assert.equal(page.navigatedTo, `https://www.douyin.com/jingxuan?modal_id=${id}`);
  assert.equal(await extractor.manualEntryUrl({ job: { url } }), page.navigatedTo);
  assert.equal(manifest.source.canonicalUrl, url);
});

function accessElement({ hidden = false, opacity = '1', text = '', tagName = 'DIV', parentElement = null } = {}) {
  return {
    hidden, parentElement, tagName, innerText: text,
    style: { display: 'block', visibility: 'visible', opacity },
    closest() { return hidden ? this : null; },
    querySelector() { return null; },
    getBoundingClientRect() { return { width: 300, height: 200, top: 0, left: 0, bottom: 200, right: 300 }; },
  };
}

function accessPage({ candidates = [], videos = [], body = '' } = {}) {
  return {
    async evaluate(operation) {
      const globals = {
        document: { body: { innerText: body }, querySelectorAll: (selector) => selector === 'video' ? videos : candidates },
        getComputedStyle: (element) => element.style,
        innerHeight: 960,
        innerWidth: 1440,
      };
      const previous = Object.fromEntries(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
      Object.assign(globalThis, globals);
      try { return operation(); } finally {
        for (const [key, descriptor] of Object.entries(previous)) {
          if (descriptor) Object.defineProperty(globalThis, key, descriptor);
          else delete globalThis[key];
        }
      }
    },
  };
}

test('隐藏验证码挂件和正文提及验证码均不算人工验证', async () => {
  const extractor = createDouyinExtractor();
  const video = { ...accessElement(), videoWidth: 720, videoHeight: 1280, readyState: 4 };
  for (const candidates of [
    [accessElement({ hidden: true, text: '安全验证' })],
    [accessElement({ opacity: '0', text: '安全验证' })],
    [accessElement({ text: '安全验证', parentElement: accessElement({ opacity: '0' }) })],
    [],
  ]) {
    assert.deepEqual(await extractor.detectAccessState({ page: accessPage({
      candidates, videos: [video], body: '这个视频解释如何填写验证码',
    }) }), { state: 'ready' });
  }
  assert.deepEqual(await extractor.detectAccessState({ page: accessPage({
    candidates: [accessElement({ hidden: true, text: '安全验证' })],
  }) }), { state: 'unavailable' });
});

test('可见验证弹层优先于其后的可播放视频', async () => {
  const extractor = createDouyinExtractor();
  for (const candidate of [accessElement({ text: '请完成安全验证' }), accessElement({ tagName: 'IFRAME' })]) {
    assert.deepEqual(await extractor.detectAccessState({ page: accessPage({
      candidates: [candidate], videos: [{ ...accessElement(), videoWidth: 720, videoHeight: 1280, readyState: 4 }],
    }) }), { state: 'captcha' });
  }
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
  assert.deepEqual(manifest.author, {
    id: 'MS4wLjABAAAAfixture',
    nickname: '目标作者',
    url: 'https://www.douyin.com/user/MS4wLjABAAAAfixture',
  });
  assert.deepEqual(manifest.content, {
    kind: 'video',
    title: '目标作品标题',
    description: '目标作品完整文案 #AI工具 #效率',
    tags: ['AI工具', '效率'],
    duration: 12,
  });
  assert.deepEqual(manifest.engagement, {
    likeCount: 1234,
    favoriteCount: 321,
    commentCount: 45,
    shareCount: 67,
  });
  assert.equal(manifest.assets[0].access.mode, 'browser-session');
  assert.equal(manifest.assets[0].access.url, targetUrl);
  assert.deepEqual(manifest.assets[0].tracks, { video: true, audio: true });
  assert.equal(manifest.assets[0].isCurrent, undefined);
  assert.equal(manifest.evidence.identityRule, 'content-id -> RENDER_DATA target -> target video URLs');
});

test('Extractor 从目标 RENDER_DATA 提取作者、完整文案、标签和互动快照但忽略播放量', async () => {
  const contentId = '7681531359059365171';
  const targetUrl = 'https://v3.douyinvod.com/video/tos/cn/render-data-key';
  const extractor = createDouyinExtractor({ discoveryTimeoutMs: 10, pollIntervalMs: 1 });
  const manifest = await extractor.extract({
    url: `https://www.douyin.com/jingxuan?modal_id=${contentId}`,
    page: rawRenderDataPage({ contentId, targetUrl }),
  });

  assert.deepEqual(manifest.author, {
    id: 'MS4wLjABAAAArenderdata',
    nickname: 'RENDER_DATA 作者',
    url: 'https://www.douyin.com/user/MS4wLjABAAAArenderdata',
  });
  assert.deepEqual(manifest.content, {
    kind: 'video',
    title: 'RENDER_DATA 标题',
    description: '完整文案 #备用标签',
    tags: ['人工智能', '效率工具'],
    duration: 12,
  });
  assert.deepEqual(manifest.engagement, {
    likeCount: 4321,
    favoriteCount: 210,
    commentCount: 98,
    shareCount: 76,
  });
  assert.equal(Object.hasOwn(manifest.engagement, 'playCount'), false);
});
