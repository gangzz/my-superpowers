import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { createExtractorRegistry } from '../core/registry.mjs';
import { douyinExtractor } from '../extractors/douyin.mjs';
import { BrowserHost } from './browser-host.mjs';
import { BrowserSession } from './browser-session.mjs';
import { createDownloadExecutor } from './download-executor.mjs';
import { createJobStore } from './job-store.mjs';
import { runtimePaths } from './paths.mjs';
import { acquireProfileLock } from './profile-lock.mjs';

function defaultChromePath() {
  const path = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  return existsSync(path) ? path : null;
}

export function createDefaultMediaDownloadRuntime({
  stateRoot,
  outputDirectory = join(homedir(), 'Downloads'),
  executablePath = defaultChromePath(),
  launchOptions = { viewport: { width: 1440, height: 960 } },
  extractors = [douyinExtractor],
} = {}) {
  const paths = runtimePaths(stateRoot);
  const registry = createExtractorRegistry(extractors);
  const store = createJobStore({ databasePath: paths.jobsDatabase });
  const session = new BrowserSession({
    profilePath: paths.defaultProfile,
    executablePath,
    launchOptions,
  });
  const executor = createDownloadExecutor({ registry, outputDirectory });
  const host = new BrowserHost({
    store,
    session,
    acquireLock: ({ ownerId }) => acquireProfileLock({
      lockPath: paths.defaultProfileLock,
      profilePath: paths.defaultProfile,
      ownerId,
    }),
    executeDownload: executor.executeDownload,
    requiresBrowser: executor.requiresBrowser,
    resolveManualEntry: executor.resolveManualEntry,
  });

  return Object.freeze({ paths, registry, store, session, executor, host });
}
