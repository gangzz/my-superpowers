const DOUYIN_HOSTS = new Set([
  'douyin.com',
  'www.douyin.com',
  'v.douyin.com',
  'v.iesdouyin.com',
]);

const ID_FIELDS = ['aweme_id', 'awemeId', 'group_id', 'groupId', 'item_id', 'itemId', 'id_str'];
const SHORT_LINK_HOSTS = new Set(['v.douyin.com', 'v.iesdouyin.com']);

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

export function extractDouyinContentId(value) {
  const url = parseHttpUrl(value);
  if (!url) return null;
  const modalId = url.searchParams.get('modal_id');
  if (/^\d+$/u.test(modalId ?? '')) return modalId;
  const match = url.pathname.match(/\/(?:video|note)\/(\d+)(?:\/|$)/u);
  return match?.[1] ?? null;
}

export async function resolveDouyinInputUrl(value, { fetchImpl = globalThis.fetch } = {}) {
  const url = parseHttpUrl(value);
  if (!url || !SHORT_LINK_HOSTS.has(url.hostname)) return value;
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
  try {
    const response = await fetchImpl(url.toString(), {
      method: 'HEAD',
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0' },
    });
    const resolved = parseHttpUrl(response.url);
    const contentId = resolved ? extractDouyinContentId(resolved) : null;
    if (contentId) return `https://www.douyin.com/jingxuan?modal_id=${contentId}`;
  } catch {}
  return value;
}

function candidateTrackFacts(value) {
  const path = parseHttpUrl(value)?.pathname ?? '';
  if (path.includes('/media-audio-')) {
    return Object.freeze({ kind: 'audio', tracks: { video: false, audio: true }, accessMode: 'browser-session' });
  }
  if (path.includes('/media-video-')) {
    return Object.freeze({ kind: 'video', tracks: { video: true, audio: false }, accessMode: 'browser-session' });
  }
  return Object.freeze({ kind: 'video', tracks: { video: true, audio: true }, accessMode: 'browser-session' });
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

async function discoverIdFromPage(page) {
  return page.evaluate(() => {
    const values = [location.href];
    for (const selector of ['link[rel="canonical"]', 'meta[property="og:url"]']) {
      const element = document.querySelector(selector);
      const value = element?.href || element?.content;
      if (value) values.push(value);
    }
    for (const value of values) {
      try {
        const url = new URL(value, location.href);
        const modalId = url.searchParams.get('modal_id');
        if (/^\d+$/u.test(modalId ?? '')) return modalId;
        const match = url.pathname.match(/\/(?:video|note)\/(\d+)(?:\/|$)/u);
        if (match) return match[1];
      } catch {}
    }
    return null;
  });
}

async function inspectActivePlayer(page, { play = false } = {}) {
  return page.evaluate(async ({ shouldPlay }) => {
    const visible = [...document.querySelectorAll('video')]
      .map((video, index) => {
        const rect = video.getBoundingClientRect();
        const style = getComputedStyle(video);
        const inViewport = rect.width > 0 && rect.height > 0
          && rect.bottom > 0 && rect.right > 0
          && rect.top < innerHeight && rect.left < innerWidth;
        return {
          video,
          index,
          area: rect.width * rect.height,
          visible: style.display !== 'none' && style.visibility !== 'hidden' && inViewport,
        };
      })
      .filter(({ video, visible }) => visible && video.videoWidth > 0 && video.videoHeight > 0)
      .sort((left, right) => (
        Number(left.video.paused) - Number(right.video.paused)
        || right.video.readyState - left.video.readyState
        || right.area - left.area
      ));
    const selected = visible[0];
    if (!selected) return null;
    if (shouldPlay) {
      selected.video.muted = false;
      selected.video.volume = 0.01;
      await selected.video.play().catch(() => null);
    }
    return {
      index: selected.index,
      width: selected.video.videoWidth,
      height: selected.video.videoHeight,
      duration: Number.isFinite(selected.video.duration) ? selected.video.duration : null,
      currentSrcKind: selected.video.currentSrc.startsWith('blob:') ? 'blob' : 'http',
      paused: selected.video.paused,
      readyState: selected.video.readyState,
    };
  }, { shouldPlay: play });
}

async function readTargetRenderData(page, contentId) {
  return page.evaluate(({ id, idFields }) => {
    const parse = (text) => {
      for (const value of [text, (() => { try { return decodeURIComponent(text); } catch { return ''; } })()]) {
        try { return JSON.parse(value); } catch {}
      }
      return null;
    };
    const script = document.querySelector('#RENDER_DATA');
    const root = script?.textContent ? parse(script.textContent) : null;
    if (!root) return null;

    const seen = new Set();
    let target = null;
    const visit = (node, depth = 0) => {
      if (target || depth > 18 || node == null || typeof node !== 'object' || seen.has(node)) return;
      seen.add(node);
      if (!Array.isArray(node)) {
        const matches = idFields.some((field) => String(node[field] ?? '') === id);
        if (matches && node.video && typeof node.video === 'object') {
          target = node;
          return;
        }
      }
      for (const child of Array.isArray(node) ? node : Object.values(node)) visit(child, depth + 1);
    };
    visit(root);
    if (!target) return null;

    const urls = [];
    const collect = (value, field = '', depth = 0) => {
      if (depth > 12 || value == null) return;
      if (typeof value === 'string' && /^https?:\/\//u.test(value)) {
        try {
          const url = new URL(value);
          if (
            url.hostname.includes('douyinvod.com')
            || url.hostname.includes('byte')
            || url.hostname.includes('smtcdn')
            || url.pathname.includes('/aweme/v1/play/')
          ) urls.push({ field, url: value });
        } catch {}
        return;
      }
      if (Array.isArray(value)) {
        for (const child of value.slice(0, 100)) collect(child, field, depth + 1);
      } else if (typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) collect(child, key, depth + 1);
      }
    };
    collect(target.video);
    return {
      description: typeof target.desc === 'string' ? target.desc : null,
      width: Number(target.video.width ?? 0) || null,
      height: Number(target.video.height ?? 0) || null,
      durationMs: Number(target.video.duration ?? 0) || null,
      urls,
    };
  }, { id: contentId, idFields: ID_FIELDS });
}

async function pageAccessState(page) {
  return page.evaluate(() => {
    const body = document.body?.innerText ?? '';
    const hasCaptcha = /验证码|安全验证|完成验证|拖动滑块/u.test(body)
      || Boolean(document.querySelector('[class*="captcha" i], iframe[src*="captcha" i]'));
    if (hasCaptcha) return { state: 'captcha' };
    const playable = [...document.querySelectorAll('video')]
      .some((video) => video.videoWidth > 0 && video.videoHeight > 0 && video.readyState > 0);
    if (playable) return { state: 'ready' };
    const loginRequired = /登录后观看|登录后可继续|请先登录/u.test(body);
    return { state: loginRequired ? 'login_required' : 'unavailable' };
  });
}

function manifestAssets({ player, requestHeaders, target }) {
  const seen = new Set();
  const resources = target.urls.filter(({ url }) => {
    if (!parseHttpUrl(url) || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
  return resources.map(({ field, url }, index) => {
    const facts = candidateTrackFacts(url);
    return {
      id: `douyin:render-${String(index + 1).padStart(4, '0')}`,
      kind: facts.kind,
      ...(facts.kind === 'video' ? {
        width: player?.width ?? target.width,
        height: player?.height ?? target.height,
      } : {}),
      tracks: facts.tracks,
      access: {
        mode: facts.accessMode,
        url,
        requestHeaders,
      },
      evidenceRefs: [`render-data:${field || 'unknown'}`],
    };
  });
}

export function createDouyinExtractor({
  navigationTimeoutMs = 60_000,
  discoveryTimeoutMs = 20_000,
  pollIntervalMs = 500,
  fetchImpl = globalThis.fetch,
} = {}) {
  return Object.freeze({
    id: 'douyin',
    browserCapability: 'visible-required',

    matches(value) {
      const url = parseHttpUrl(value);
      return Boolean(url && (DOUYIN_HOSTS.has(url.hostname) || url.hostname.endsWith('.douyin.com')));
    },

    async detectAccessState({ page } = {}) {
      if (!page) return { state: 'unavailable' };
      return pageAccessState(page);
    },

    manualEntryUrl({ job } = {}) {
      return job?.url;
    },

    async extract({ url, page } = {}) {
      if (!page) throw codedError('browser_page_required', 'Douyin extraction requires a browser page');

      const navigationUrl = await resolveDouyinInputUrl(url, { fetchImpl });
      const navigation = await page.goto(navigationUrl, { waitUntil: 'domcontentloaded', timeout: navigationTimeoutMs });
      const status = typeof navigation?.status === 'function' ? navigation.status() : null;
      if (status != null && status >= 400) throw codedError('navigation_failed', `Douyin navigation returned HTTP ${status}`);

      const redirectedUrl = await currentPageUrl(page);
      const contentId = extractDouyinContentId(url)
        ?? extractDouyinContentId(navigationUrl)
        ?? extractDouyinContentId(redirectedUrl)
        ?? await discoverIdFromPage(page);
      if (!contentId) throw codedError('content_id_unresolved', 'Unable to resolve the Douyin work ID after redirects');

      const deadline = Date.now() + discoveryTimeoutMs;
      let target = null;
      let player = null;
      while (Date.now() <= deadline) {
        target ??= await readTargetRenderData(page, contentId);
        player = await inspectActivePlayer(page, { play: true }) ?? player;
        if (target?.urls?.length > 0 && player) break;
        await page.waitForTimeout(pollIntervalMs);
      }

      if (!target || !player) {
        const access = await pageAccessState(page);
        if (access.state !== 'ready') {
          throw codedError(access.state, `Douyin work is not ready: ${access.state}`);
        }
      }
      if (!target) throw codedError('target_metadata_missing', 'Target work is missing from Douyin RENDER_DATA');
      if (!player) throw codedError('target_player_missing', 'No active target video player was found');
      if (!Array.isArray(target.urls) || target.urls.length === 0) {
        throw codedError('target_media_missing', 'Target work has no usable media URL in Douyin RENDER_DATA');
      }

      const canonicalUrl = `https://www.douyin.com/video/${contentId}`;
      const requestHeaders = await readPageRequestHeaders(page);
      return {
        schemaVersion: 1,
        source: { site: 'douyin', contentId, canonicalUrl },
        content: {
          kind: 'video',
          title: typeof page.title === 'function' ? await page.title() : null,
          description: target.description,
          duration: player.duration ?? (target.durationMs == null ? null : target.durationMs / 1000),
        },
        assets: manifestAssets({ player, requestHeaders, target }),
        evidence: {
          identityRule: 'content-id -> RENDER_DATA target -> target video URLs',
          player: { ...player },
        },
      };
    },
  });
}

export const douyinExtractor = createDouyinExtractor();
