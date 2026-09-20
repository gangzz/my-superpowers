import { validateManifest } from './contracts.mjs';

export const DEFAULT_SELECTION_POLICY = Object.freeze({
  videoQuality: 'current',
  targetHeight: null,
  preferCombined: true,
  requireAudio: true,
  allowMux: true,
});

const QUALITY_MODES = new Set(['current', 'lowest', 'highest', 'target']);

export function normalizeSelectionPolicy(overrides = {}) {
  const policy = { ...DEFAULT_SELECTION_POLICY, ...overrides };
  if (!QUALITY_MODES.has(policy.videoQuality)) throw new TypeError('videoQuality is invalid');
  if (policy.videoQuality === 'target') {
    if (!Number.isInteger(policy.targetHeight) || policy.targetHeight <= 0) {
      throw new TypeError('targetHeight is required for target video quality');
    }
  } else {
    policy.targetHeight = null;
  }
  for (const name of ['preferCombined', 'requireAudio', 'allowMux']) {
    if (typeof policy[name] !== 'boolean') throw new TypeError(`${name} must be boolean`);
  }
  return Object.freeze(policy);
}

function hasVideo(asset) {
  return asset.kind === 'video' && asset.tracks?.video === true;
}

function hasAudio(asset) {
  return asset.tracks?.audio === true || asset.kind === 'audio';
}

function resolution(asset) {
  return (asset.width ?? 0) * (asset.height ?? 0);
}

function rankVideo(candidates, policy) {
  if (policy.videoQuality === 'current') {
    return [...candidates].sort((a, b) => (
      Number(b.isCurrent === true) - Number(a.isCurrent === true)
      || resolution(a) - resolution(b)
      || (a.bitrate ?? 0) - (b.bitrate ?? 0)
      || a.id.localeCompare(b.id)
    ));
  }
  if (policy.videoQuality === 'target') {
    return [...candidates].sort((a, b) => {
      const aHeight = a.height ?? 0;
      const bHeight = b.height ?? 0;
      const aDistance = Math.abs(aHeight - policy.targetHeight);
      const bDistance = Math.abs(bHeight - policy.targetHeight);
      return aDistance - bDistance || bHeight - aHeight || (a.bitrate ?? 0) - (b.bitrate ?? 0);
    });
  }
  const direction = policy.videoQuality === 'highest' ? -1 : 1;
  return [...candidates].sort((a, b) => (
    direction * (resolution(a) - resolution(b))
    || direction * ((a.bitrate ?? 0) - (b.bitrate ?? 0))
    || a.id.localeCompare(b.id)
  ));
}

function rankAudio(candidates, policy) {
  if (policy.videoQuality === 'current') {
    return [...candidates].sort((a, b) => (
      Number(b.isCurrent === true) - Number(a.isCurrent === true)
      || (a.bitrate ?? 0) - (b.bitrate ?? 0)
      || a.id.localeCompare(b.id)
    ));
  }
  const direction = policy.videoQuality === 'highest' ? -1 : 1;
  return [...candidates].sort((a, b) => (
    direction * ((a.bitrate ?? 0) - (b.bitrate ?? 0)) || a.id.localeCompare(b.id)
  ));
}

export function selectAssets(manifest, overrides = {}) {
  validateManifest(manifest);
  const policy = normalizeSelectionPolicy(overrides);

  if (manifest.content.kind === 'image-set') {
    const assets = manifest.assets.filter((asset) => asset.kind === 'image')
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    if (assets.length === 0) throw new Error('Image post has no image assets');
    return Object.freeze({ assets, postprocess: [], policy });
  }

  if (manifest.content.kind === 'audio') {
    const audio = rankAudio(manifest.assets.filter(hasAudio), policy)[0];
    if (!audio) throw new Error('Audio post has no audio asset');
    return Object.freeze({ assets: [audio], postprocess: [], policy });
  }

  const videoCandidates = manifest.assets.filter(hasVideo);
  const combined = videoCandidates.filter(hasAudio);
  if (policy.preferCombined && combined.length > 0) {
    return Object.freeze({ assets: [rankVideo(combined, policy)[0]], postprocess: [], policy });
  }

  const selectedVideo = rankVideo(videoCandidates, policy)[0];
  if (!selectedVideo) throw new Error('Video post has no video asset');
  if (!policy.requireAudio || hasAudio(selectedVideo)) {
    return Object.freeze({ assets: [selectedVideo], postprocess: [], policy });
  }
  if (!policy.allowMux) throw new Error('Video requires audio but muxing is disabled');
  const selectedAudio = rankAudio(
    manifest.assets.filter((asset) => asset.kind === 'audio' && hasAudio(asset)),
    policy,
  )[0];
  if (!selectedAudio) throw new Error('Video post has no usable audio asset');
  return Object.freeze({ assets: [selectedVideo, selectedAudio], postprocess: ['mux'], policy });
}
