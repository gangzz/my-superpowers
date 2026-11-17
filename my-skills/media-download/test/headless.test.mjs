import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { BrowserSession } from '../src/runtime/browser-session.mjs';
import { createDefaultMediaDownloadRuntime } from '../src/runtime/default-runtime.mjs';

function setup(t) {
  const root = mkdtempSync(join(tmpdir(), 'media-headless-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const events = [];
  let active = 0;
  const driver = { async launchPersistentContext(profile, options) {
    assert.equal(active, 0, 'Profile contexts must never overlap');
    active++;
    events.push(['launch', options.headless, profile]);
    return {
      pages: () => [],
      async newPage() {
        return { closed: false, async goto() {}, async close() { this.closed = true; }, isClosed() { return this.closed; } };
      },
      async close() { active--; events.push(['close']); },
    };
  } };
  return { root, events, driver };
}

test('同模式复用，跨模式关闭旧 Context，人工接管总是可见', async t => {
  const { root, driver, events } = setup(t);
  const session = new BrowserSession({ profilePath: root, driver, launchOptions: { headless: false } });
  await (await session.newJobPage({ headless: true })).close();
  await (await session.newJobPage({ headless: true })).close();
  assert.equal(events.filter(e => e[0] === 'launch').length, 1);
  await (await session.newJobPage({ headless: false })).close();
  await (await session.newJobPage({ headless: true })).close();
  await session.openManual('https://example.com/login');
  assert.equal(session.headless, false);
  await assert.rejects(session.newJobPage({ headless: true }), /manual control/);
  await session.close();
  assert.deepEqual(events.map(e => e.slice(0, 2)), [['launch', true], ['close'], ['launch', false], ['close'], ['launch', true], ['close'], ['launch', false], ['close']]);
  assert.equal(new Set(events.filter(e => e[0] === 'launch').map(e => e[2])).size, 1);
});

test('默认运行时按任务选择抖音无头与 B站可见，失败不重试，队列退出清理', async t => {
  const { root, driver, events } = setup(t);
  const runtime = createDefaultMediaDownloadRuntime({ stateRoot: root, outputDirectory: join(root, 'output') });
  t.after(() => runtime.store.close());
  runtime.session.driver = driver;
  const urls = ['https://www.douyin.com/video/7707481055191649599', 'https://www.bilibili.com/video/BV1nLYh6uEH8/', 'https://www.douyin.com/video/7708964739254144292'];
  const jobs = urls.map(url => runtime.store.submitDownload({ url }));
  const modes = [];
  runtime.host.executeDownload = async () => {
    modes.push(runtime.session.headless);
    if (modes.length === 1) { const error = new Error('Login required'); error.code = 'login_required'; throw error; }
    return { ok: true };
  };
  await runtime.host.serve();
  assert.deepEqual(modes, [true, false, true]);
  assert.equal(runtime.store.getDownload(jobs[0].id).errorCode, 'login_required');
  assert.deepEqual(jobs.slice(1).map(j => runtime.store.getDownload(j.id).status), ['succeeded', 'succeeded']);
  assert.equal(runtime.session.context, null);
  assert.deepEqual(events.map(e => e.slice(0, 2)), [['launch', true], ['close'], ['launch', false], ['close'], ['launch', true], ['close']]);
});

test('Context 关闭失败时不启动另一模式', async t => {
  const { root } = setup(t);
  let launches = 0;
  const session = new BrowserSession({ profilePath: root, driver: { async launchPersistentContext() {
    launches++;
    return { pages: () => [], async close() { throw new Error('close failed'); } };
  } } });
  await session.open({ headless: true });
  await assert.rejects(session.open({ headless: false }), /close failed/);
  assert.equal(launches, 1);
  assert.equal(session.headless, true);
});
