const TRANSPORTS = Object.freeze({
  'direct-http': 'NodeHttpTransport',
  'browser-session': 'BrowserSessionTransport',
  'browser-page': 'BrowserPageTransport',
});

export function createDownloadPlan({ manifest, selection }) {
  if (!manifest || !selection) throw new TypeError('manifest and selection are required');
  return Object.freeze({
    schemaVersion: 1,
    source: { ...manifest.source },
    selectionPolicy: { ...selection.policy },
    transfers: selection.assets.map((asset) => ({
      assetId: asset.id,
      transport: TRANSPORTS[asset.access.mode],
      access: { ...asset.access },
    })),
    postprocess: [...selection.postprocess],
  });
}

