const CONTENT_KINDS = new Set(['video', 'audio', 'image-set']);
const ASSET_KINDS = new Set(['video', 'audio', 'image']);
const ACCESS_MODES = new Set(['direct-http', 'browser-session', 'browser-page']);
const BROWSER_CAPABILITIES = new Set(['no-browser', 'visible-required', 'headless-verified']);
const ACCESS_STATES = new Set(['ready', 'login_required', 'captcha', 'unavailable']);
const ENGAGEMENT_FIELDS = new Set(['likeCount', 'favoriteCount', 'commentCount', 'shareCount']);

function requiredString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${name} is required`);
  return value;
}

function optionalNumber(value, name) {
  if (value == null) return null;
  if (!Number.isFinite(value) || value < 0) throw new TypeError(`${name} must be a non-negative number`);
  return value;
}

function optionalString(value, name) {
  if (value == null) return null;
  if (typeof value !== 'string') throw new TypeError(`${name} must be a string`);
  return value;
}

function optionalCount(value, name) {
  if (value == null) return null;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative safe integer`);
  }
  return value;
}

export function validateExtractor(extractor) {
  requiredString(extractor?.id, 'extractor.id');
  if (typeof extractor?.matches !== 'function') throw new TypeError('extractor.matches must be a function');
  if (typeof extractor?.extract !== 'function') throw new TypeError('extractor.extract must be a function');
  if (!BROWSER_CAPABILITIES.has(extractor?.browserCapability)) {
    throw new TypeError('extractor.browserCapability is invalid');
  }
  if (extractor.detectAccessState != null && typeof extractor.detectAccessState !== 'function') {
    throw new TypeError('extractor.detectAccessState must be a function');
  }
  if (extractor.manualEntryUrl != null && typeof extractor.manualEntryUrl !== 'function') {
    throw new TypeError('extractor.manualEntryUrl must be a function');
  }
  return extractor;
}

export function validateAccessState(value) {
  const state = typeof value === 'string' ? value : value?.state;
  if (!ACCESS_STATES.has(state)) throw new TypeError('extractor access state is invalid');
  return Object.freeze(typeof value === 'string' ? { state } : { ...value, state });
}

export async function detectExtractorAccess(extractor, input) {
  validateExtractor(extractor);
  if (!extractor.detectAccessState) return Object.freeze({ state: 'ready' });
  return validateAccessState(await extractor.detectAccessState(input));
}

export function validateManifest(manifest) {
  if (manifest?.schemaVersion !== 1) throw new TypeError('manifest.schemaVersion must be 1');
  requiredString(manifest?.source?.site, 'manifest.source.site');
  requiredString(manifest?.source?.contentId, 'manifest.source.contentId');
  requiredString(manifest?.source?.canonicalUrl, 'manifest.source.canonicalUrl');
  if (!CONTENT_KINDS.has(manifest?.content?.kind)) throw new TypeError('manifest.content.kind is invalid');
  optionalString(manifest.content.title, 'manifest.content.title');
  optionalString(manifest.content.description, 'manifest.content.description');
  optionalNumber(manifest.content.duration, 'manifest.content.duration');
  if (manifest.content.tags != null) {
    if (!Array.isArray(manifest.content.tags)) throw new TypeError('manifest.content.tags must be an array');
    for (const [index, tag] of manifest.content.tags.entries()) {
      requiredString(tag, `manifest.content.tags[${index}]`);
    }
  }
  if (manifest.author != null) {
    requiredString(manifest.author.id, 'manifest.author.id');
    requiredString(manifest.author.nickname, 'manifest.author.nickname');
    requiredString(manifest.author.url, 'manifest.author.url');
  }
  if (manifest.engagement != null) {
    if (typeof manifest.engagement !== 'object' || Array.isArray(manifest.engagement)) {
      throw new TypeError('manifest.engagement must be an object');
    }
    for (const [name, value] of Object.entries(manifest.engagement)) {
      if (!ENGAGEMENT_FIELDS.has(name)) throw new TypeError(`manifest.engagement.${name} is not supported`);
      optionalCount(value, `manifest.engagement.${name}`);
    }
  }
  if (!Array.isArray(manifest?.assets) || manifest.assets.length === 0) {
    throw new TypeError('manifest.assets must be a non-empty array');
  }
  const ids = new Set();
  for (const asset of manifest.assets) {
    const id = requiredString(asset?.id, 'asset.id');
    if (ids.has(id)) throw new TypeError(`duplicate asset.id: ${id}`);
    ids.add(id);
    if (!ASSET_KINDS.has(asset?.kind)) throw new TypeError(`asset.kind is invalid: ${id}`);
    if (!ACCESS_MODES.has(asset?.access?.mode)) throw new TypeError(`asset.access.mode is invalid: ${id}`);
    if (asset.isCurrent != null && typeof asset.isCurrent !== 'boolean') {
      throw new TypeError(`asset.isCurrent must be boolean: ${id}`);
    }
    optionalNumber(asset?.width, `asset.width: ${id}`);
    optionalNumber(asset?.height, `asset.height: ${id}`);
    optionalNumber(asset?.bitrate, `asset.bitrate: ${id}`);
    if (asset.kind === 'image' && !Number.isInteger(asset.order)) {
      throw new TypeError(`image asset.order is required: ${id}`);
    }
  }
  return manifest;
}

export const contractValues = Object.freeze({
  contentKinds: [...CONTENT_KINDS],
  assetKinds: [...ASSET_KINDS],
  accessModes: [...ACCESS_MODES],
  browserCapabilities: [...BROWSER_CAPABILITIES],
  accessStates: [...ACCESS_STATES],
  engagementFields: [...ENGAGEMENT_FIELDS],
});
