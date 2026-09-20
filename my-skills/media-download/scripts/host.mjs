#!/usr/bin/env node
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import { createDefaultMediaDownloadRuntime } from '../src/runtime/default-runtime.mjs';

const argumentsList = process.argv.slice(2);
const outputIndex = argumentsList.indexOf('--output');
const outputArgument = outputIndex >= 0 ? argumentsList[outputIndex + 1] : null;
const outputDirectory = outputIndex >= 0
  ? (outputArgument ? resolve(outputArgument) : null)
  : join(homedir(), 'Downloads');
if (!outputDirectory) {
  console.error('Usage: node scripts/host.mjs [--output /absolute/path]');
  process.exitCode = 2;
} else {
  const runtime = createDefaultMediaDownloadRuntime({ outputDirectory });
  try {
    const result = await runtime.host.serve();
    console.log(JSON.stringify({ ...result, jobs: runtime.store.listDownloads() }, null, 2));
  } finally {
    runtime.store.close();
  }
}
