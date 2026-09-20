import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function codedError(code, message, cause = null) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  return error;
}

export async function inspectMediaFile({ filePath, ffprobePath = 'ffprobe', run = execFileAsync } = {}) {
  if (!filePath) throw new TypeError('filePath is required');
  let stdout;
  try {
    ({ stdout } = await run(ffprobePath, [
      '-v', 'error',
      '-show_entries', 'format=duration,size,format_name:stream=codec_type,codec_name,width,height,bit_rate',
      '-of', 'json',
      filePath,
    ], { encoding: 'utf8', timeout: 60_000, maxBuffer: 4 * 1024 * 1024 }));
  } catch (error) {
    throw codedError('media_probe_failed', `ffprobe failed for ${filePath}`, error);
  }

  let report;
  try { report = JSON.parse(stdout); } catch (error) {
    throw codedError('media_probe_invalid', 'ffprobe returned invalid JSON', error);
  }
  const streams = Array.isArray(report.streams) ? report.streams : [];
  const video = streams.find(({ codec_type: type }) => type === 'video') ?? null;
  const audio = streams.find(({ codec_type: type }) => type === 'audio') ?? null;
  return Object.freeze({
    path: filePath,
    formatName: report.format?.format_name ?? null,
    duration: Number(report.format?.duration ?? 0) || null,
    bytes: Number(report.format?.size ?? 0) || null,
    streams,
    video,
    audio,
  });
}

export async function muxMediaFiles({
  videoPath,
  audioPath,
  outputPath,
  ffmpegPath = 'ffmpeg',
  run = execFileAsync,
} = {}) {
  if (!videoPath || !audioPath || !outputPath) throw new TypeError('videoPath, audioPath, and outputPath are required');
  try {
    await run(ffmpegPath, [
      '-v', 'error', '-nostdin', '-n',
      '-i', videoPath,
      '-i', audioPath,
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-c', 'copy',
      '-movflags', '+faststart',
      '-f', 'mp4',
      outputPath,
    ], { encoding: 'utf8', timeout: 10 * 60_000, maxBuffer: 4 * 1024 * 1024 });
  } catch (error) {
    throw codedError('media_mux_failed', 'ffmpeg could not mux the selected video and audio tracks', error);
  }
  return outputPath;
}

export async function sha256File(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}
