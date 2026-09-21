import {
  existsSync,
  mkdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';

import { validateManifest } from '../core/contracts.mjs';
import { createDownloadPlan } from '../core/download-plan.mjs';
import { selectAssets } from '../core/selector.mjs';
import { verifyExpectedVideo } from '../core/video-verification.mjs';
import { BrowserPageTransport } from '../transports/browser-page.mjs';
import { BrowserSessionTransport } from '../transports/browser-session.mjs';
import { inspectMediaFile, muxMediaFiles, sha256File } from './media-files.mjs';

function codedError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function removeOwnedFile(path) {
  try { unlinkSync(path); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
}

function allocateOutputPath(outputDirectory, { site, contentId }) {
  const safeSite = String(site).replace(/[^A-Za-z0-9._-]/gu, '_');
  const safeId = String(contentId).replace(/[^A-Za-z0-9._-]/gu, '_');
  for (let sequence = 0; sequence < 10_000; sequence += 1) {
    const suffix = sequence === 0 ? '' : `-${sequence}`;
    const finalPath = join(outputDirectory, `${safeSite}-${safeId}${suffix}.mp4`);
    const sourcePath = `${finalPath}.source.json`;
    const related = [finalPath, sourcePath, `${finalPath}.partial`, `${finalPath}.video.partial`, `${finalPath}.audio.partial`];
    if (related.every((path) => !existsSync(path))) return { finalPath, sourcePath };
  }
  throw codedError('output_name_exhausted', 'Unable to allocate an output filename');
}

function verifyDeliveredMedia(report, { requireAudio, expectedVideo }) {
  if (!report.video) throw codedError('video_track_missing', 'Downloaded media has no video track');
  if (requireAudio && !report.audio) throw codedError('audio_track_missing', 'Downloaded media has no audio track');
  verifyExpectedVideo({
    expectedVideo,
    actualVideo: { width: report.video.width, height: report.video.height },
  });
  return report;
}

export function createDownloadExecutor({
  registry,
  outputDirectory,
  browserPageTransport = new BrowserPageTransport(),
  browserSessionTransport = new BrowserSessionTransport(),
  inspect = inspectMediaFile,
  mux = muxMediaFiles,
  digest = sha256File,
  clock = Date.now,
  rename = renameSync,
} = {}) {
  if (!registry || typeof registry.match !== 'function') throw new TypeError('registry is required');
  if (!outputDirectory) throw new TypeError('outputDirectory is required');
  const defaultOutputRoot = resolve(outputDirectory);

  async function transferAsset({ transfer, page, context, partialPath }) {
    if (transfer.transport === 'BrowserPageTransport') {
      return browserPageTransport.transfer({ page, access: transfer.access, partialPath });
    }
    if (transfer.transport === 'BrowserSessionTransport') {
      return browserSessionTransport.transfer({ context, page, access: transfer.access, partialPath });
    }
    throw codedError('transport_unavailable', `Transport is not implemented: ${transfer.transport}`);
  }

  return Object.freeze({
    requiresBrowser({ job } = {}) {
      return registry.match(job?.url).browserCapability !== 'no-browser';
    },

    resolveManualEntry({ job } = {}) {
      const extractor = registry.match(job?.url);
      return extractor.manualEntryUrl ? extractor.manualEntryUrl({ job }) : job.url;
    },

    async executeDownload({ job, page, context } = {}) {
      const extractor = registry.match(job?.url);
      const manifest = validateManifest(await extractor.extract({
        url: job.url,
        job,
        page,
      }));
      const selection = selectAssets(manifest);
      const plan = createDownloadPlan({ manifest, selection });
      const outputRoot = resolve(job.outputDirectory ?? defaultOutputRoot);
      mkdirSync(outputRoot, { recursive: true });
      const { finalPath, sourcePath } = allocateOutputPath(outputRoot, manifest.source);
      const finalPartialPath = `${finalPath}.partial`;
      const temporaryPaths = [];
      let committed = false;
      let finalRenamed = false;

      try {
        if (plan.postprocess.includes('mux')) {
          const videoTransfer = plan.transfers.find(({ assetId }) => (
            manifest.assets.find(({ id }) => id === assetId)?.kind === 'video'
          ));
          const audioTransfer = plan.transfers.find(({ assetId }) => (
            manifest.assets.find(({ id }) => id === assetId)?.kind === 'audio'
          ));
          if (!videoTransfer || !audioTransfer) throw codedError('mux_input_missing', 'Mux plan is missing video or audio input');
          const videoPartialPath = `${finalPath}.video.partial`;
          const audioPartialPath = `${finalPath}.audio.partial`;
          temporaryPaths.push(videoPartialPath, audioPartialPath);
          await transferAsset({ transfer: videoTransfer, page, context, partialPath: videoPartialPath });
          await transferAsset({ transfer: audioTransfer, page, context, partialPath: audioPartialPath });
          const [videoReport, audioReport] = await Promise.all([
            inspect({ filePath: videoPartialPath }),
            inspect({ filePath: audioPartialPath }),
          ]);
          if (!videoReport.video) throw codedError('video_track_missing', 'Selected video input has no video track');
          if (!audioReport.audio) throw codedError('audio_track_missing', 'Selected audio input has no audio track');
          await mux({ videoPath: videoPartialPath, audioPath: audioPartialPath, outputPath: finalPartialPath });
        } else {
          if (plan.transfers.length !== 1) throw codedError('invalid_transfer_plan', 'Non-mux plan must contain exactly one transfer');
          await transferAsset({ transfer: plan.transfers[0], page, context, partialPath: finalPartialPath });
        }

        const media = verifyDeliveredMedia(await inspect({ filePath: finalPartialPath }), {
          requireAudio: selection.policy.requireAudio,
          expectedVideo: job.expectedVideo,
        });
        const sha256 = await digest(finalPartialPath);
        const transportNames = [...new Set(plan.transfers.map(({ transport }) => ({
          BrowserPageTransport: 'browser-page-stream',
          BrowserSessionTransport: 'browser-session-range-stream',
          NodeHttpTransport: 'direct-http-stream',
        })[transport] ?? transport))];
        const { duration: _manifestDuration, ...contentMetadata } = manifest.content;
        const sourceRecord = {
          schemaVersion: 2,
          source: { ...manifest.source },
          ...(manifest.author ? { author: { ...manifest.author } } : {}),
          content: contentMetadata,
          ...(manifest.engagement ? { engagement: { ...manifest.engagement } } : {}),
          downloadedAt: new Date(clock()).toISOString(),
          outputFile: basename(finalPath),
          sha256,
          bytes: media.bytes,
          duration: media.duration,
          media: {
            width: media.video.width,
            height: media.video.height,
            videoCodec: media.video.codec_name ?? null,
            audioCodec: media.audio?.codec_name ?? null,
          },
          selection: {
            assetIds: selection.assets.map(({ id }) => id),
            postprocess: [...selection.postprocess],
            policy: { ...selection.policy },
          },
          access: {
            discovery: manifest.evidence?.discovery ?? 'browser-page',
            transports: transportNames,
          },
        };
        const sourcePartialPath = `${sourcePath}.partial`;
        temporaryPaths.push(sourcePartialPath);
        writeFileSync(sourcePartialPath, `${JSON.stringify(sourceRecord, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
        rename(finalPartialPath, finalPath);
        finalRenamed = true;
        rename(sourcePartialPath, sourcePath);
        for (const path of temporaryPaths) removeOwnedFile(path);
        committed = true;
        return Object.freeze({
          outputPath: finalPath,
          sourcePath,
          contentId: manifest.source.contentId,
          bytes: media.bytes,
          duration: media.duration,
          width: media.video.width,
          height: media.video.height,
          hasAudio: Boolean(media.audio),
          sha256,
        });
      } finally {
        if (!committed) {
          if (finalRenamed) removeOwnedFile(finalPath);
          for (const path of [finalPartialPath, ...temporaryPaths]) removeOwnedFile(path);
        }
      }
    },
  });
}
