const BILIBILI_HOSTS = new Set([
  'bilibili.com',
  'www.bilibili.com',
  'm.bilibili.com',
]);

function codedError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function parseHttpUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function isBilibiliHost(hostname) {
  return BILIBILI_HOSTS.has(hostname) || hostname.endsWith('.bilibili.com');
}

export function extractBilibiliContentId(value) {
  const url = parseHttpUrl(value);
  if (!url || !isBilibiliHost(url.hostname)) return null;
  const match = url.pathname.match(/\/video\/(BV[0-9A-Za-z]{10})(?:\/|$)/u);
  return match?.[1] ?? null;
}

function canonicalVideoUrl(value, bvid) {
  const input = parseHttpUrl(value);
  const part = input?.searchParams.get('p');
  const canonical = new URL(`https://www.bilibili.com/video/${bvid}/`);
  if (/^[2-9]\d*$/u.test(part ?? '')) canonical.searchParams.set('p', part);
  return canonical.toString();
}

async function currentPageUrl(page) {
  const value = typeof page?.url === 'function' ? page.url() : null;
  return typeof value === 'string' ? value : null;
}

async function readPageRequestHeaders(page) {
  const referer = await currentPageUrl(page);
  let browser = {};
  try {
    browser = await page.evaluate(() => ({
      userAgent: navigator.userAgent,
      acceptLanguage: Array.isArray(navigator.languages) && navigator.languages.length > 0
        ? navigator.languages.join(',')
        : navigator.language,
    }));
  } catch {}
  return {
    accept: '*/*',
    ...(browser?.userAgent ? { 'user-agent': browser.userAgent } : {}),
    ...(browser?.acceptLanguage ? { 'accept-language': browser.acceptLanguage } : {}),
    ...(referer ? { referer } : {}),
  };
}

async function readPageMetadata(page) {
  try {
    return await page.evaluate(() => ({
      title: document.querySelector('meta[property="og:title"]')?.content ?? document.title ?? null,
      description: document.querySelector('meta[name="description"]')?.content ?? null,
    }));
  } catch {
    return {
      title: typeof page?.title === 'function' ? await page.title() : null,
      description: null,
    };
  }
}

async function pageAccessState(page) {
  try {
    return await page.evaluate(() => {
      const body = document.body?.innerText ?? '';
      const captcha = /验证码|安全验证|访问异常|完成验证|拖动滑块/u.test(body)
        || Boolean(document.querySelector('[class*="captcha" i], iframe[src*="captcha" i]'));
      if (captcha) return { state: 'captcha' };
      if (/登录后观看|登录后可继续/u.test(body)) return { state: 'login_required' };
      if (/视频不见了|稿件不可见|视频已失效|404/u.test(body)) return { state: 'unavailable' };
      return { state: 'ready' };
    });
  } catch {
    return { state: 'unavailable' };
  }
}

function matchesPlayInfoResponse(response, bvid) {
  try {
    const url = new URL(response.url());
    return url.pathname === '/x/player/wbi/playurl'
      && url.searchParams.get('bvid')?.toLowerCase() === bvid.toLowerCase();
  } catch {
    return false;
  }
}

function mediaUrls(track) {
  const values = [
    track?.baseUrl ?? track?.base_url,
    ...(track?.backupUrl ?? track?.backup_url ?? []),
  ];
  const seen = new Set();
  return values.filter((value) => {
    if (typeof value !== 'string' || !parseHttpUrl(value) || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function cleanTitle(value) {
  return typeof value === 'string'
    ? value.replace(/_哔哩哔哩_bilibili$/u, '').trim() || null
    : null;
}

function inputPartNumber(value) {
  const part = Number.parseInt(parseHttpUrl(value)?.searchParams.get('p') ?? '1', 10);
  return Number.isInteger(part) && part > 0 ? part : 1;
}

async function fetchPlayInfoFromPage(page, { bvid, part }) {
  return page.evaluate(async ({ targetBvid, targetPart }) => {
    const requestJson = async (url) => {
      const response = await fetch(url, {
        credentials: 'include',
        headers: { accept: 'application/json, text/plain, */*' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    };

    const viewUrl = new URL('https://api.bilibili.com/x/web-interface/view');
    viewUrl.searchParams.set('bvid', targetBvid);
    const view = await requestJson(viewUrl);
    if (view?.code !== 0 || view?.data?.bvid?.toLowerCase() !== targetBvid.toLowerCase()) {
      throw new Error(`view API did not return target BV: ${view?.message ?? view?.code ?? 'unknown'}`);
    }
    const pages = Array.isArray(view.data.pages) ? view.data.pages : [];
    const targetPage = pages.find(({ page: pageNumber }) => Number(pageNumber) === targetPart)
      ?? pages[targetPart - 1]
      ?? (targetPart === 1 ? { cid: view.data.cid } : null);
    const cid = Number(targetPage?.cid);
    if (!Number.isSafeInteger(cid) || cid <= 0) throw new Error(`part ${targetPart} has no CID`);

    const playUrl = new URL('https://api.bilibili.com/x/player/playurl');
    for (const [name, value] of Object.entries({
      bvid: targetBvid,
      cid: String(cid),
      qn: '0',
      fnval: '4048',
      fourk: '1',
    })) playUrl.searchParams.set(name, value);
    const payload = await requestJson(playUrl);
    return { payload, cid: String(cid) };
  }, { targetBvid: bvid, targetPart: part });
}

function dashAssets({ data, requestHeaders }) {
  const videos = Array.isArray(data?.dash?.video) ? data.dash.video : [];
  const audios = Array.isArray(data?.dash?.audio) ? data.dash.audio : [];
  const assets = [];

  videos.forEach((track, index) => {
    const urls = mediaUrls(track);
    if (urls.length === 0) return;
    const quality = Number(track.id);
    assets.push({
      id: `bilibili:video-${String(index + 1).padStart(4, '0')}`,
      kind: 'video',
      width: Number(track.width) || null,
      height: Number(track.height) || null,
      bitrate: Number(track.bandwidth) || null,
      codec: typeof track.codecs === 'string' ? track.codecs : null,
      isCurrent: Number.isFinite(quality) && quality === Number(data.quality),
      tracks: { video: true, audio: false },
      access: {
        mode: 'browser-session',
        url: urls[0],
        fallbackUrls: urls.slice(1),
        requestHeaders,
      },
      evidenceRefs: [`playurl:dash.video:${index}`],
    });
  });

  audios.forEach((track, index) => {
    const urls = mediaUrls(track);
    if (urls.length === 0) return;
    assets.push({
      id: `bilibili:audio-${String(index + 1).padStart(4, '0')}`,
      kind: 'audio',
      bitrate: Number(track.bandwidth) || null,
      codec: typeof track.codecs === 'string' ? track.codecs : null,
      tracks: { video: false, audio: true },
      access: {
        mode: 'browser-session',
        url: urls[0],
        fallbackUrls: urls.slice(1),
        requestHeaders,
      },
      evidenceRefs: [`playurl:dash.audio:${index}`],
    });
  });
  return assets;
}

export function createBilibiliExtractor({
  navigationTimeoutMs = 60_000,
  discoveryTimeoutMs = 30_000,
} = {}) {
  return Object.freeze({
    id: 'bilibili',
    browserCapability: 'visible-required',

    matches(value) {
      return extractBilibiliContentId(value) != null;
    },

    async detectAccessState({ page } = {}) {
      if (!page) return { state: 'unavailable' };
      return pageAccessState(page);
    },

    manualEntryUrl({ job } = {}) {
      return job?.url;
    },

    async extract({ url, page } = {}) {
      if (!page) throw codedError('browser_page_required', 'Bilibili extraction requires a browser page');
      const bvid = extractBilibiliContentId(url);
      if (!bvid) throw codedError('content_id_unresolved', 'Unable to resolve the Bilibili BV ID');
      const canonicalUrl = canonicalVideoUrl(url, bvid);
      const part = inputPartNumber(canonicalUrl);
      const responseResult = page.waitForResponse(
        (response) => matchesPlayInfoResponse(response, bvid),
        { timeout: Math.min(discoveryTimeoutMs, 8_000) },
      ).then(
        (response) => ({ response }),
        (error) => ({ error }),
      );

      const navigation = await page.goto(canonicalUrl, {
        waitUntil: 'domcontentloaded',
        timeout: navigationTimeoutMs,
      });
      const status = typeof navigation?.status === 'function' ? navigation.status() : null;
      if (status != null && status >= 400) {
        throw codedError('navigation_failed', `Bilibili navigation returned HTTP ${status}`);
      }

      const { response, error: responseError } = await responseResult;
      let payload;
      let cid = null;
      let discovery = 'browser-page-playurl-response';
      if (response) {
        try {
          payload = await response.json();
          cid = new URL(response.url()).searchParams.get('cid') ?? null;
        } catch (error) {
          throw codedError('playinfo_invalid', 'Bilibili playurl returned invalid JSON', { cause: error });
        }
      } else {
        try {
          const fallback = await fetchPlayInfoFromPage(page, { bvid, part });
          payload = fallback.payload;
          cid = fallback.cid;
          discovery = 'browser-page-playurl-api';
        } catch (error) {
          const access = await pageAccessState(page);
          if (access.state !== 'ready') {
            throw codedError(access.state, `Bilibili work is not ready: ${access.state}`, { cause: error });
          }
          throw codedError('playinfo_missing', 'Bilibili playurl response was not observed and explicit API fallback failed', {
            cause: error,
            responseError,
          });
        }
      }
      if (payload?.code !== 0 || !payload?.data) {
        throw codedError('playinfo_failed', `Bilibili playurl failed: ${payload?.message ?? payload?.code ?? 'unknown'}`);
      }

      const requestHeaders = await readPageRequestHeaders(page);
      const assets = dashAssets({ data: payload.data, requestHeaders });
      if (!assets.some(({ kind }) => kind === 'video') || !assets.some(({ kind }) => kind === 'audio')) {
        throw codedError('target_media_missing', 'Bilibili playurl has no usable DASH video and audio tracks');
      }
      const metadata = await readPageMetadata(page);
      return {
        schemaVersion: 1,
        source: { site: 'bilibili', contentId: bvid, canonicalUrl },
        content: {
          kind: 'video',
          title: cleanTitle(metadata?.title),
          description: metadata?.description ?? null,
          duration: Number(payload.data.timelength) > 0 ? Number(payload.data.timelength) / 1000 : null,
        },
        assets,
        evidence: {
          identityRule: 'input-bvid -> playurl request bvid -> DASH tracks',
          discovery,
          cid,
          quality: Number(payload.data.quality) || null,
        },
      };
    },
  });
}

export const bilibiliExtractor = createBilibiliExtractor();
