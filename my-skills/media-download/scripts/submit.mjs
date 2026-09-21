#!/usr/bin/env node
import { resolve } from 'node:path';

import { createDefaultMediaDownloadRuntime } from '../src/runtime/default-runtime.mjs';

const argumentsList = process.argv.slice(2);
const outputIndex = argumentsList.indexOf('--output');
const outputArgument = outputIndex >= 0 ? argumentsList[outputIndex + 1] : null;
const positional = argumentsList.filter((_value, index) => (
  outputIndex < 0 || (index !== outputIndex && index !== outputIndex + 1)
));
const hasUnknownOption = positional.some((value) => value.startsWith('--'));
const hasInvalidOutput = outputIndex >= 0 && (
  argumentsList.lastIndexOf('--output') !== outputIndex
  || !outputArgument
  || outputArgument.startsWith('--')
);
const url = positional.length === 1 && !hasUnknownOption && !hasInvalidOutput ? positional[0] : null;
const outputDirectory = outputIndex >= 0
  ? (outputArgument ? resolve(outputArgument) : null)
  : null;

if (!url) {
  console.error('Usage: node scripts/submit.mjs <url> [--output /absolute/path]');
  process.exitCode = 2;
} else {
  const runtime = createDefaultMediaDownloadRuntime();
  try {
    console.log(JSON.stringify(runtime.store.submitDownload({ url, outputDirectory }), null, 2));
  } finally {
    runtime.store.close();
  }
}
