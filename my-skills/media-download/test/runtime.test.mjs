import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { BrowserHost } from '../src/runtime/browser-host.mjs';
import { BrowserSession } from '../src/runtime/browser-session.mjs';
import { createJobStore } from '../src/runtime/job-store.mjs';
import { acquireProfileLock } from '../src/runtime/profile-lock.mjs';
import { runtimePaths } from '../src/runtime/paths.mjs';

function tempRuntime(t) {
  const root = mkdtempSync(join(tmpdir(), 'media-download-runtime-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return runtimePaths(root);
}

function createIds() {
  let value = 0;
  return () => `id-${String(++value).padStart(3, '0')}`;
}

function fakeBrowser({ inspectionError = null, selectedVideo = {
  width: 720,
  height: 1280,
  duration: 30,
  paused: false,
  readyState: 4,
} } = {}) {
  const state = { launches: 0, contextCloses: 0, pages: [] };
  const context = {
    pages() { return []; },
    async newPage() {
      const page = {
        closed: false,
        navigatedTo: null,
        async goto(url) { this.navigatedTo = url; },
        async evaluate() {
          if (inspectionError) throw inspectionError;
          return selectedVideo;
        },
        async close() { this.closed = true; },
      };
      state.pages.push(page);
      return page;
    },
    async close() { state.contextCloses += 1; },
  };
  return {
    state,
    driver: {
      async launchPersistentContext() {
        state.launches += 1;
        return context;
      },
    },
  };
}

test('失败后重新提交会创建排在队尾的新 Job', (t) => {
  const paths = tempRuntime(t);
  const store = createJobStore({ databasePath: paths.jobsDatabase, idFactory: createIds() });
  t.after(() => store.close());

  const first = store.submitDownload({ url: 'https://example.com/first' });
  const second = store.submitDownload({ url: 'https://example.com/second' });
  const claimedFirst = store.claimNextDownload({ workerId: 'worker' });
  assert.equal(claimedFirst.id, first.id);
  store.failDownload({ id: first.id, workerId: 'worker', errorCode: 'login_required', errorMessage: 'Login required' });

  const replacement = store.submitDownload({ url: first.url });
  assert.equal(store.claimNextDownload({ workerId: 'worker' }).id, second.id);
  assert.equal(store.claimNextDownload({ workerId: 'worker' }).id, replacement.id);
  assert.equal(store.getDownload(first.id).status, 'failed');
  assert.notEqual(replacement.id, first.id);
});

test('人工选择后的期望分辨率作为可选 Job 输入持久化', (t) => {
  const paths = tempRuntime(t);
  const store = createJobStore({ databasePath: paths.jobsDatabase, idFactory: createIds() });
  t.after(() => store.close());

  const ordinary = store.submitDownload({ url: 'https://example.com/default' });
  const selected = store.submitDownload({
    url: 'https://example.com/selected',
    expectedVideo: { width: 720, height: 1280 },
  });

  assert.equal(ordinary.expectedVideo, null);
  assert.deepEqual(selected.expectedVideo, { width: 720, height: 1280 });
  assert.throws(
    () => store.submitDownload({ url: selected.url, expectedVideo: { width: 0, height: 1280 } }),
    /positive integer/,
  );
});

test('既有 SQLite 队列会补齐清晰度交互字段', (t) => {
  const paths = tempRuntime(t);
  const legacy = new DatabaseSync(paths.jobsDatabase);
  legacy.exec(`
    CREATE TABLE download_jobs (
      id TEXT PRIMARY KEY, url TEXT NOT NULL, status TEXT NOT NULL,
      error_code TEXT, error_message TEXT, result_json TEXT, worker_id TEXT,
      created_at TEXT NOT NULL, started_at TEXT, finished_at TEXT, updated_at TEXT NOT NULL
    );
    CREATE TABLE browser_commands (
      id TEXT PRIMARY KEY, type TEXT NOT NULL, job_id TEXT, status TEXT NOT NULL,
      error_code TEXT, error_message TEXT, worker_id TEXT,
      created_at TEXT NOT NULL, started_at TEXT, finished_at TEXT, updated_at TEXT NOT NULL
    );
  `);
  legacy.close();

  const store = createJobStore({ databasePath: paths.jobsDatabase, idFactory: createIds() });
  t.after(() => store.close());
  const job = store.submitDownload({
    url: 'https://example.com/migrated',
    expectedVideo: { width: 720, height: 1280 },
  });
  const command = store.submitBrowserCommand({
    type: 'open_browser',
    url: job.url,
    purpose: 'quality-selection',
  });
  assert.deepEqual(job.expectedVideo, { width: 720, height: 1280 });
  assert.equal(command.purpose, 'quality-selection');
});

test('浏览器控制命令只接受 open_browser 和 close_browser', (t) => {
  const paths = tempRuntime(t);
  const store = createJobStore({ databasePath: paths.jobsDatabase, idFactory: createIds() });
  t.after(() => store.close());
  const job = store.submitDownload({ url: 'https://example.com/work' });

  assert.equal(store.submitBrowserCommand({ type: 'open_browser', jobId: job.id }).type, 'open_browser');
  const quality = store.submitBrowserCommand({
    type: 'open_browser',
    url: 'https://example.com/quality',
    purpose: 'quality-selection',
  });
  assert.equal(quality.url, 'https://example.com/quality');
  assert.equal(quality.purpose, 'quality-selection');
  assert.equal(store.submitBrowserCommand({ type: 'close_browser' }).type, 'close_browser');
  assert.throws(
    () => store.submitBrowserCommand({ type: 'open_browser', jobId: job.id, url: job.url }),
    /exactly one/,
  );
  assert.throws(
    () => store.submitBrowserCommand({ type: 'open_browser', url: job.url, purpose: 'unknown' }),
    /purpose is invalid/,
  );
  assert.throws(() => store.submitBrowserCommand({ type: 'retry_job', jobId: job.id }), /invalid/);
  assert.throws(() => store.submitBrowserCommand({ type: 'cancel_job', jobId: job.id }), /invalid/);
});

test('BrowserHost 用一个 Context 顺序执行两个 Job，并为每个 Job 创建独立 Page', async (t) => {
  const paths = tempRuntime(t);
  const store = createJobStore({ databasePath: paths.jobsDatabase, idFactory: createIds() });
  t.after(() => store.close());
  const browser = fakeBrowser();
  const session = new BrowserSession({ driver: browser.driver, profilePath: paths.defaultProfile });
  const seen = [];

  store.submitDownload({ url: 'https://example.com/one' });
  store.submitDownload({ url: 'https://example.com/two' });
  const host = new BrowserHost({
    store,
    session,
    workerId: 'host',
    acquireLock: ({ ownerId }) => acquireProfileLock({
      lockPath: paths.defaultProfileLock,
      profilePath: paths.defaultProfile,
      ownerId,
    }),
    executeDownload: async ({ job, page }) => {
      seen.push([job.url, page]);
      return { output: `${job.id}.mp4` };
    },
    requiresBrowser: async () => true,
    resolveManualEntry: async ({ job }) => job.url,
  });

  await host.serve();
  assert.equal(browser.state.launches, 1);
  assert.equal(browser.state.contextCloses, 1);
  assert.equal(browser.state.pages.length, 2);
  assert.notEqual(seen[0][1], seen[1][1]);
  assert.equal(browser.state.pages.every((page) => page.closed), true);
  assert.deepEqual(store.listDownloads().map((job) => job.status), ['succeeded', 'succeeded']);
});

test('一个 Job 失败后 BrowserHost 继续执行队列中的下一个 Job', async (t) => {
  const paths = tempRuntime(t);
  const store = createJobStore({ databasePath: paths.jobsDatabase, idFactory: createIds() });
  t.after(() => store.close());
  const browser = fakeBrowser();
  const session = new BrowserSession({ driver: browser.driver, profilePath: paths.defaultProfile });

  store.submitDownload({ url: 'https://example.com/fail' });
  store.submitDownload({ url: 'https://example.com/pass' });
  const host = new BrowserHost({
    store,
    session,
    workerId: 'host',
    acquireLock: ({ ownerId }) => acquireProfileLock({
      lockPath: paths.defaultProfileLock,
      profilePath: paths.defaultProfile,
      ownerId,
    }),
    executeDownload: async ({ job }) => {
      if (job.url.endsWith('/fail')) {
        const error = new Error('Login required');
        error.code = 'login_required';
        throw error;
      }
      return { ok: true };
    },
    requiresBrowser: async () => true,
    resolveManualEntry: async ({ job }) => job.url,
  });

  await host.serve();
  const [failed, succeeded] = store.listDownloads();
  assert.equal(failed.status, 'failed');
  assert.equal(failed.errorCode, 'login_required');
  assert.equal(succeeded.status, 'succeeded');
});

test('调用者通过 open_browser 和 close_browser 控制人工浏览器', async (t) => {
  const paths = tempRuntime(t);
  const store = createJobStore({ databasePath: paths.jobsDatabase, idFactory: createIds() });
  t.after(() => store.close());
  const browser = fakeBrowser();
  const session = new BrowserSession({ driver: browser.driver, profilePath: paths.defaultProfile });

  const failed = store.submitDownload({ url: 'https://example.com/login' });
  store.claimNextDownload({ workerId: 'previous-host' });
  store.failDownload({ id: failed.id, workerId: 'previous-host', errorCode: 'login_required', errorMessage: 'Login required' });
  const open = store.submitBrowserCommand({ type: 'open_browser', jobId: failed.id });
  const close = store.submitBrowserCommand({ type: 'close_browser' });

  const host = new BrowserHost({
    store,
    session,
    workerId: 'host',
    acquireLock: ({ ownerId }) => acquireProfileLock({
      lockPath: paths.defaultProfileLock,
      profilePath: paths.defaultProfile,
      ownerId,
    }),
    executeDownload: async () => ({ ok: true }),
    requiresBrowser: async () => true,
    resolveManualEntry: async ({ job }) => job.url,
  });

  await host.serve();
  assert.equal(store.getBrowserCommand(open.id).status, 'succeeded');
  const closed = store.getBrowserCommand(close.id);
  assert.equal(closed.status, 'succeeded');
  assert.deepEqual(closed.result, {
    selectedVideo: {
      width: 720,
      height: 1280,
      duration: 30,
      paused: false,
      readyState: 4,
    },
  });
  assert.equal(browser.state.pages[0].navigatedTo, failed.url);
  assert.equal(browser.state.contextCloses, 1);
});

test('人工浏览器已关闭但媒体检查失败时 Host 继续处理下载队列', async (t) => {
  const paths = tempRuntime(t);
  const store = createJobStore({ databasePath: paths.jobsDatabase, idFactory: createIds() });
  t.after(() => store.close());
  const browser = fakeBrowser({ inspectionError: new Error('inspection failed') });
  const session = new BrowserSession({ driver: browser.driver, profilePath: paths.defaultProfile });
  const open = store.submitBrowserCommand({
    type: 'open_browser',
    url: 'https://example.com/video/1',
    purpose: 'quality-selection',
  });
  const close = store.submitBrowserCommand({ type: 'close_browser' });
  const job = store.submitDownload({ url: 'https://example.com/video/1' });
  const host = new BrowserHost({
    store,
    session,
    workerId: 'host',
    acquireLock: ({ ownerId }) => acquireProfileLock({
      lockPath: paths.defaultProfileLock,
      profilePath: paths.defaultProfile,
      ownerId,
    }),
    executeDownload: async () => ({ ok: true }),
    requiresBrowser: async () => false,
    resolveManualEntry: async ({ job: failedJob }) => failedJob.url,
    sleep: async () => { throw new Error('Host remained stuck in manual mode'); },
  });

  await host.serve();
  assert.equal(store.getBrowserCommand(open.id).status, 'succeeded');
  assert.equal(store.getBrowserCommand(close.id).status, 'failed');
  assert.equal(store.getDownload(job.id).status, 'succeeded');
});

test('清晰度选择在创建 DownloadJob 前使用 URL 打开人工浏览器', async (t) => {
  const paths = tempRuntime(t);
  const store = createJobStore({ databasePath: paths.jobsDatabase, idFactory: createIds() });
  t.after(() => store.close());
  const browser = fakeBrowser({
    selectedVideo: {
      width: 1080,
      height: 1920,
      duration: 303.8,
      paused: false,
      readyState: 4,
    },
  });
  const session = new BrowserSession({ driver: browser.driver, profilePath: paths.defaultProfile });
  const open = store.submitBrowserCommand({
    type: 'open_browser',
    url: 'https://example.com/video/1',
    purpose: 'quality-selection',
  });
  const close = store.submitBrowserCommand({ type: 'close_browser' });

  const host = new BrowserHost({
    store,
    session,
    workerId: 'host',
    acquireLock: ({ ownerId }) => acquireProfileLock({
      lockPath: paths.defaultProfileLock,
      profilePath: paths.defaultProfile,
      ownerId,
    }),
    executeDownload: async () => ({ ok: true }),
    requiresBrowser: async () => true,
    resolveManualEntry: async ({ job }) => job.url,
  });

  await host.serve();
  assert.equal(store.getBrowserCommand(open.id).status, 'succeeded');
  assert.equal(browser.state.pages[0].navigatedTo, 'https://example.com/video/1');
  assert.deepEqual(store.getBrowserCommand(close.id).result.selectedVideo, {
    width: 1080,
    height: 1920,
    duration: 303.8,
    paused: false,
    readyState: 4,
  });
  assert.equal(store.listDownloads().length, 0);
});

test('no-browser Extractor 的 Job 不启动 Patchright Context', async (t) => {
  const paths = tempRuntime(t);
  const store = createJobStore({ databasePath: paths.jobsDatabase, idFactory: createIds() });
  t.after(() => store.close());
  const browser = fakeBrowser();
  const session = new BrowserSession({ driver: browser.driver, profilePath: paths.defaultProfile });
  store.submitDownload({ url: 'https://example.com/direct' });

  const host = new BrowserHost({
    store,
    session,
    workerId: 'host',
    acquireLock: ({ ownerId }) => acquireProfileLock({
      lockPath: paths.defaultProfileLock,
      profilePath: paths.defaultProfile,
      ownerId,
    }),
    executeDownload: async ({ page, context }) => {
      assert.equal(page, null);
      assert.equal(context, null);
      return { output: 'direct.bin' };
    },
    requiresBrowser: async () => false,
    resolveManualEntry: async ({ job }) => job.url,
  });

  await host.serve();
  assert.equal(browser.state.launches, 0);
  assert.equal(store.listDownloads()[0].status, 'succeeded');
});

test('Context 关闭失败时保留 Profile 锁', async (t) => {
  const paths = tempRuntime(t);
  const store = createJobStore({ databasePath: paths.jobsDatabase, idFactory: createIds() });
  t.after(() => store.close());
  store.submitDownload({ url: 'https://example.com/close-failure' });
  const context = {
    pages() { return []; },
    async newPage() { return { async close() {} }; },
    async close() { throw new Error('close failed'); },
  };
  const session = new BrowserSession({
    profilePath: paths.defaultProfile,
    driver: { async launchPersistentContext() { return context; } },
  });
  const host = new BrowserHost({
    store,
    session,
    workerId: 'host',
    acquireLock: ({ ownerId }) => acquireProfileLock({
      lockPath: paths.defaultProfileLock,
      profilePath: paths.defaultProfile,
      ownerId,
    }),
    executeDownload: async () => ({ ok: true }),
    requiresBrowser: async () => true,
    resolveManualEntry: async ({ job }) => job.url,
  });

  await assert.rejects(host.serve(), /close failed/);
  assert.equal(existsSync(paths.defaultProfileLock), true);
});
