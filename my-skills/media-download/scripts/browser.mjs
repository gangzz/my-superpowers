#!/usr/bin/env node
import { createDefaultMediaDownloadRuntime } from '../src/runtime/default-runtime.mjs';

const [action, jobId, ...extra] = process.argv.slice(2);
if (extra.length || !((action === 'open' && jobId) || (action === 'close' && !jobId))) {
  console.error('Usage: node scripts/browser.mjs open <failed-job-id> | close');
  process.exitCode = 2;
} else {
  const runtime = createDefaultMediaDownloadRuntime();
  try {
    console.log(JSON.stringify(runtime.store.submitBrowserCommand(
      action === 'open' ? { type: 'open_browser', jobId } : { type: 'close_browser' },
    ), null, 2));
  } finally {
    runtime.store.close();
  }
}
