import test from 'node:test';
import assert from 'node:assert/strict';
import { collectDouyinComments } from '../src/extractors/douyin-comments.mjs';

const source = { site: 'douyin', contentId: '123', canonicalUrl: 'https://www.douyin.com/video/123' };
const item = number => ({ id: String(number), authorName: '用户', text: `评论${number}` });

function fakePage(batches, { count = 1, fail = false, prompts = false } = {}) {
  let batchIndex = 0;
  let panelOpen = !prompts;
  const actions = [];
  const visible = new Set(prompts ? ['登录后免费畅享高清视频', '我知道了'] : []);
  const list = {
    isVisible: async () => panelOpen,
    waitFor: async () => assert.ok(panelOpen),
    evaluate: async callback => {
      if (fail) throw Error('private details');
      if (callback.toString().includes('const plain')) {
        assert.equal(visible.size, 0, 'dismiss visible prompts before reading comments');
        return batches[Math.min(batchIndex++, batches.length - 1)];
      }
      actions.push('scroll');
    },
  };
  const icon = {
    click: async () => {
      assert.equal(visible.size, 0, 'dismiss prompts before clicking the comment icon');
      actions.push('open-comments');
      panelOpen = true;
      if (prompts) visible.add('继续看评论');
    },
  };
  const closeLogin = {
    click: async () => {
      visible.delete('登录后免费畅享高清视频');
      actions.push('close-login');
    },
  };
  const headerSvg = { first: () => closeLogin };
  return {
    actions,
    locator: () => ({
      count: async () => count,
      locator: selector => selector.includes('comment-list') ? list : icon,
    }),
    getByText: text => ({
      isVisible: async () => visible.has(text),
      click: async () => {
        visible.delete(text);
        actions.push(text);
      },
      waitFor: async () => assert.equal(visible.has(text), false),
      locator: () => ({ locator: () => headerSvg }),
    }),
    waitForTimeout: async () => {},
  };
}

test('keeps first-seen order, removes duplicates and caps the sample', async () => {
  const page = fakePage([
    { items: [item(1), item(2)] },
    { items: [item(2), item(3), item(4)] },
  ]);
  const result = await collectDouyinComments({ page, source, limit: 3 });
  assert.equal(result.status, 'limit_reached');
  assert.deepEqual(result.items.map(entry => entry.id), ['1', '2', '3']);
  assert.equal(result.includesReplies, false);
});

test('dismisses login, onboarding and continue-comments controls before collecting', async () => {
  const page = fakePage([{ items: [item(1)] }], { prompts: true });
  const result = await collectDouyinComments({ page, source, limit: 1 });
  assert.equal(result.status, 'limit_reached');
  assert.deepEqual(page.actions, ['close-login', '我知道了', 'open-comments', '继续看评论']);
});

test('collects a requested 40 comments across multiple rendered batches', async () => {
  const batches = [10, 20, 30, 45].map(count => ({
    items: Array.from({ length: count }, (_, index) => item(index + 1)),
  }));
  const result = await collectDouyinComments({ page: fakePage(batches), source, limit: 40 });
  assert.equal(result.status, 'limit_reached');
  assert.equal(result.requestedLimit, 40);
  assert.equal(result.items.length, 40);
  assert.equal(result.items.at(-1).id, '40');
});

test('reports an explicit login boundary while retaining the visible sample', async () => {
  const page = fakePage([{
    items: Array.from({ length: 10 }, (_, index) => item(index + 1)),
    loginRequired: true,
  }]);
  const result = await collectDouyinComments({ page, source, limit: 40 });
  assert.equal(result.status, 'partial');
  assert.equal(result.reason, 'login_required');
  assert.equal(result.requestedLimit, 40);
  assert.equal(result.items.length, 10);
  assert.deepEqual(page.actions, []);
});

test('no growth remains partial', async () => {
  const result = await collectDouyinComments({
    page: fakePage([{ items: [item(1)] }]), source,
  });
  assert.equal(result.status, 'partial');
  assert.equal(result.reason, 'visible_list_stopped_loading');
  assert.equal(result.items.length, 1);
});

test('wrong targets and inaccessible panels retain failure states', async () => {
  const missing = await collectDouyinComments({ page: fakePage([], { count: 0 }), source });
  assert.equal(missing.reason, 'target_container_missing');
  const failed = await collectDouyinComments({ page: fakePage([], { fail: true }), source });
  assert.equal(failed.status, 'unavailable');
  assert.equal(failed.items.length, 0);
  assert.doesNotMatch(JSON.stringify(failed), /private details/);
});

test('explicit empty and visible end states remain distinct', async () => {
  const empty = await collectDouyinComments({ page: fakePage([{ items: [], empty: true }]), source });
  assert.equal(empty.status, 'empty');
  const end = await collectDouyinComments({ page: fakePage([{ items: [item(1)], end: true }]), source });
  assert.equal(end.status, 'exhausted_visible');
});
