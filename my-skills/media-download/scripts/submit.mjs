#!/usr/bin/env node
import { createDefaultMediaDownloadRuntime } from '../src/runtime/default-runtime.mjs';

const [url] = process.argv.slice(2);
if (!url) {
  console.error('Usage: node scripts/submit.mjs <url>');
  process.exitCode = 2;
} else {
  const runtime = createDefaultMediaDownloadRuntime();
  try {
    console.log(JSON.stringify(runtime.store.submitDownload({ url }), null, 2));
  } finally {
    runtime.store.close();
  }
}
