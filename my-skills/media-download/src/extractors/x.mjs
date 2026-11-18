import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function failure(code, message) {
  return Object.assign(new Error(message), { code });
}

export function resolveXUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)
      || !['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'].includes(url.hostname)) return null;
    const match = /^\/(?:[A-Za-z0-9_]+|i\/web)\/status\/(\d+)(?:\/video\/1)?\/?$/u.exec(url.pathname);
    if (!match) return null;
    return { contentId: match[1], canonicalUrl: `https://x.com${url.pathname.replace(/\/video\/1\/?$/u, '').replace(/\/$/u, '')}` };
  } catch {
    return null;
  }
}

export function xManifestFromInfo(info, source, expectedVideo = null) {
  const resolved = resolveXUrl(info?.webpage_url);
  if (!resolved || resolved.contentId !== source.contentId) {
    throw failure('content_identity_mismatch', 'X extractor returned a different post');
  }
  if (info._type === 'playlist' || info.entries) {
    throw failure('unsupported_content', 'X posts with multiple media items require explicit single-video support');
  }
  const formats = (info.formats ?? []).filter(format => {
    let url;
    try { url = new URL(format.url); } catch { return false; }
    return url.protocol === 'https:' && url.hostname === 'video.twimg.com'
      && format.protocol === 'https' && format.ext === 'mp4'
      && format.vcodec !== 'none' && format.acodec !== 'none'
      && format.width > 0 && format.height > 0;
  });
  const selectedFormats = expectedVideo
    ? formats.filter(format => format.width === expectedVideo.width && format.height === expectedVideo.height)
    : formats;
  if (!selectedFormats.length) {
    throw failure(expectedVideo ? 'quality_not_applied' : 'unsupported_content',
      expectedVideo ? 'X has no MP4 matching the requested dimensions' : 'X has no public combined MP4 video');
  }
  return {
    schemaVersion: 1,
    source: { site: 'x', ...source },
    ...(info.uploader_id && info.uploader ? { author: {
      id: info.uploader_id, nickname: info.uploader, url: `https://x.com/${encodeURIComponent(info.uploader_id)}`,
    } } : {}),
    content: { kind: 'video', title: info.title ?? '', description: info.description ?? '', duration: info.duration ?? null },
    assets: selectedFormats.map(format => ({
      id: String(format.format_id), kind: 'video', width: format.width, height: format.height,
      bitrate: (format.tbr ?? 0) * 1000, tracks: { video: true, audio: true },
      access: { mode: 'direct-http', url: format.url, requestHeaders: format.http_headers ?? info.http_headers ?? {} },
    })),
    evidence: { discovery: 'yt-dlp-twitter' },
  };
}

export function createXExtractor({ run = execFileAsync } = {}) {
  return Object.freeze({
    id: 'x', browserCapability: 'no-browser',
    matches: url => resolveXUrl(url) !== null,
    async extract({ url, job } = {}) {
      const source = resolveXUrl(url);
      if (!source) throw failure('unsupported_url', 'Expected an X or Twitter single-post URL');
      let stdout;
      try {
        ({ stdout } = await run('yt-dlp', [
          '--ignore-config', '--skip-download', '--dump-single-json', '--no-playlist',
          '--no-warnings', '--socket-timeout', '30', source.canonicalUrl,
        ], { encoding: 'utf8', timeout: 120_000, maxBuffer: 16 * 1024 * 1024 }));
      } catch (error) {
        if (error.code === 'ENOENT') throw failure('dependency_missing', 'X downloads require yt-dlp on PATH');
        // yt-dlp errors can contain signed URLs. Keep them out of persistent jobs.
        throw failure('x_extraction_failed', 'yt-dlp could not resolve this public X video. Check availability, network and yt-dlp version');
      }
      let info;
      try { info = JSON.parse(stdout); } catch { throw failure('x_response_invalid', 'yt-dlp returned invalid JSON'); }
      return xManifestFromInfo(info, source, job?.expectedVideo);
    },
  });
}

export const xExtractor = createXExtractor();
