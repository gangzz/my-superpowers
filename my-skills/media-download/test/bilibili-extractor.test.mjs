import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createBilibiliExtractor,
  extractBilibiliContentId,
} from '../src/extractors/bilibili.mjs';

const BVID = 'BV1nLYh6uEH8';

function playInfoResponse() {
  return {
    url: () => `https://api.bilibili.com/x/player/wbi/playurl?bvid=${BVID}&cid=41725527823`,
    async json() {
      return {
        code: 0,
        message: 'OK',
        data: {
          quality: 32,
          timelength: 1_119_643,
          dash: {
            video: [
              {
                id: 32,
                width: 640,
                height: 480,
                bandwidth: 419_636,
                codecs: 'avc1.640033',
                baseUrl: 'https://primary.example/video-avc.m4s?deadline=private',
                backupUrl: [
                  'https://backup-one.example/video-avc.m4s?deadline=private',
                  'https://backup-two.example/video-avc.m4s?deadline=private',
                ],
              },
              {
                id: 16,
                width: 480,
                height: 360,
                bandwidth: 297_841,
                codecs: 'avc1.640033',
                baseUrl: 'https://primary.example/video-low.m4s?deadline=private',
                backupUrl: [],
              },
            ],
            audio: [{
              id: 30216,
              bandwidth: 65_570,
              codecs: 'mp4a.40.2',
              baseUrl: 'https://primary.example/audio.m4s?deadline=private',
              backupUrl: ['https://backup.example/audio.m4s?deadline=private'],
            }],
          },
        },
      };
    },
  };
}

function fakePage() {
  const response = playInfoResponse();
  return {
    navigatedTo: null,
    responsePredicate: null,
    waitForResponse(predicate) {
      this.responsePredicate = predicate;
      assert.equal(predicate(response), true);
      return Promise.resolve(response);
    },
    async goto(url) {
      this.navigatedTo = url;
      return { status: () => 200 };
    },
    url() { return `https://www.bilibili.com/video/${BVID}/`; },
    async title() { return '目标视频_哔哩哔哩_bilibili'; },
    async evaluate(operation) {
      const source = operation.toString();
      if (source.includes('navigator.userAgent')) {
        return { userAgent: 'Fixture Browser', acceptLanguage: 'zh-CN' };
      }
      if (source.includes('meta[property="og:title"]')) {
        return { title: '目标视频', description: '目标简介' };
      }
      throw new Error(`unexpected evaluate operation: ${source.slice(0, 120)}`);
    },
  };
}

test('B 站作品 ID 只从标准视频页解析', () => {
  assert.equal(extractBilibiliContentId(`https://www.bilibili.com/video/${BVID}/?spm_id_from=333.1007`), BVID);
  assert.equal(extractBilibiliContentId(`https://www.bilibili.com/video/${BVID}/?share_source=copy_web&vd_source=private`), BVID);
  assert.equal(extractBilibiliContentId(`https://m.bilibili.com/video/${BVID}`), BVID);
  assert.equal(extractBilibiliContentId('https://www.bilibili.com/list/watchlater'), null);
  assert.equal(extractBilibiliContentId('https://example.com/video/BV1nLYh6uEH8'), null);
});

test('Extractor 用页面自身 playurl 响应生成绑定到目标 BV 号的 DASH 轨道', async () => {
  const page = fakePage();
  const extractor = createBilibiliExtractor({ discoveryTimeoutMs: 100 });
  const manifest = await extractor.extract({
    url: `https://www.bilibili.com/video/${BVID}/?spm_id_from=333.1007`,
    page,
  });

  assert.equal(page.navigatedTo, `https://www.bilibili.com/video/${BVID}/`);
  assert.deepEqual(manifest.source, {
    site: 'bilibili',
    contentId: BVID,
    canonicalUrl: `https://www.bilibili.com/video/${BVID}/`,
  });
  assert.deepEqual(manifest.content, {
    kind: 'video',
    title: '目标视频',
    description: '目标简介',
    duration: 1119.643,
  });
  assert.deepEqual(manifest.assets.map(({ kind, isCurrent }) => [kind, isCurrent]), [
    ['video', true],
    ['video', false],
    ['audio', undefined],
  ]);
  assert.deepEqual(manifest.assets[0].tracks, { video: true, audio: false });
  assert.deepEqual(manifest.assets[2].tracks, { video: false, audio: true });
  assert.equal(manifest.assets[0].access.mode, 'browser-session');
  assert.deepEqual(manifest.assets[0].access.fallbackUrls, [
    'https://backup-one.example/video-avc.m4s?deadline=private',
    'https://backup-two.example/video-avc.m4s?deadline=private',
  ]);
  assert.equal(manifest.assets[0].access.requestHeaders['user-agent'], 'Fixture Browser');
  assert.equal(manifest.evidence.identityRule, 'input-bvid -> playurl request bvid -> DASH tracks');
  assert.equal(manifest.evidence.discovery, 'browser-page-playurl-response');
});

test('Extractor 清理分享参数但保留多 P 的 p 参数', async () => {
  const page = fakePage();
  const extractor = createBilibiliExtractor({ discoveryTimeoutMs: 100 });
  const manifest = await extractor.extract({
    url: `https://www.bilibili.com/video/${BVID}/?p=2&share_source=copy_web&vd_source=private`,
    page,
  });

  assert.equal(page.navigatedTo, `https://www.bilibili.com/video/${BVID}/?p=2`);
  assert.equal(manifest.source.canonicalUrl, `https://www.bilibili.com/video/${BVID}/?p=2`);
  assert.equal(JSON.stringify(manifest.source).includes('share_source'), false);
  assert.equal(JSON.stringify(manifest.source).includes('private'), false);
});

test('共享 Context 未产生新 playurl 响应时回退到页面显式 API', async () => {
  const page = fakePage();
  page.waitForResponse = () => Promise.reject(new Error('no new response'));
  const originalEvaluate = page.evaluate.bind(page);
  page.evaluate = async (operation) => {
    if (operation.toString().includes('/x/web-interface/view')) {
      return { payload: await playInfoResponse().json(), cid: '41725527823' };
    }
    return originalEvaluate(operation);
  };

  const extractor = createBilibiliExtractor({ discoveryTimeoutMs: 10 });
  const manifest = await extractor.extract({
    url: `https://www.bilibili.com/video/${BVID}/`,
    page,
  });

  assert.equal(manifest.evidence.discovery, 'browser-page-playurl-api');
  assert.equal(manifest.evidence.cid, '41725527823');
  assert.equal(manifest.assets.length, 3);
});

test('Extractor 只匹配 B 站标准视频页', () => {
  const extractor = createBilibiliExtractor();
  assert.equal(extractor.matches(`https://www.bilibili.com/video/${BVID}/`), true);
  assert.equal(extractor.matches('https://www.douyin.com/video/123'), false);
});
