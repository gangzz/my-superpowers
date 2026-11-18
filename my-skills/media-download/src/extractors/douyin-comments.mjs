// Read public comments through the rendered page and its visible controls.
async function dismissCommentPrompts(page) {
  const loginPrompt = page.getByText('登录后免费畅享高清视频', { exact: true });
  if (await loginPrompt.isVisible()) {
    // The prompt header contains its visible X as the only SVG control.
    await loginPrompt.locator('..').locator('svg').first().click({ timeout: 3000 });
    await loginPrompt.waitFor({ state: 'hidden', timeout: 3000 });
    await page.waitForTimeout(250);
  }

  const onboarding = page.getByText('我知道了', { exact: true });
  if (await onboarding.isVisible()) {
    await onboarding.click({ timeout: 3000 });
    await page.waitForTimeout(250);
  }

  const continueComments = page.getByText('继续看评论', { exact: true });
  if (await continueComments.isVisible()) {
    await continueComments.click({ timeout: 3000 });
    await page.waitForTimeout(250);
  }
}

export async function collectDouyinComments({
  page,
  source,
  limit = 40,
  clock = Date.now,
  timeoutMs = 35000,
} = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 40) {
    throw new TypeError('comments limit must be 1..40');
  }

  const snapshot = {
    schemaVersion: 1,
    source: { ...source },
    capturedAt: new Date(clock()).toISOString(),
    sortLabel: '平台默认（未切换排序）',
    requestedLimit: limit,
    includesReplies: false,
    status: 'unavailable',
    reason: null,
    items: [],
  };
  const contentId = String(source?.contentId ?? '');
  if (source?.site !== 'douyin' || !/^\d+$/.test(contentId)) {
    snapshot.reason = 'unsupported_site';
    return snapshot;
  }

  try {
    const root = page.locator(`.video_${contentId}`);
    if (await root.count() !== 1) {
      snapshot.reason = 'target_container_missing';
      return snapshot;
    }

    await dismissCommentPrompts(page);
    const list = root.locator('[data-e2e="comment-list"]');
    if (!await list.isVisible()) {
      await root.locator('[data-e2e="feed-comment-icon"]').click({ timeout: 5000 });
    }
    await list.waitFor({ state: 'visible', timeout: 7000 });
    await dismissCommentPrompts(page);

    const deadline = Date.now() + timeoutMs;
    const seen = new Set();
    let idle = 0;
    while (Date.now() < deadline && snapshot.items.length < limit) {
      const batch = await list.evaluate(list => {
        const plain = element => {
          if (!element) return '';
          const copy = element.cloneNode(true);
          for (const image of copy.querySelectorAll('img')) image.replaceWith(image.alt || '');
          return copy.textContent.trim();
        };
        const items = [...list.querySelectorAll('[data-e2e="comment-item"]')]
          .filter(element => !element.parentElement.closest('[data-e2e="comment-item"]'))
          .map(element => {
            const info = element.querySelector('.comment-item-info-wrap');
            const body = info?.nextElementSibling;
            const date = body?.nextElementSibling;
            return {
              id: element.querySelector('[id^="tooltip_"]')?.id.slice(8) || null,
              authorName: plain(info?.querySelector('a')),
              text: plain(body),
              publishedAtText: plain(date).split('·')[0],
              likeCountText: plain(element.querySelector('.comment-item-stats-container p')),
            };
          })
          .filter(item => item.text);
        const text = list.innerText;
        return {
          items,
          empty: /暂无评论|还没有评论/.test(text),
          end: /没有更多评论|暂时没有更多|已显示全部评论/.test(text),
          loginRequired: /登录后可看更多|登录后查看更多评论|登录后查看全部评论/.test(text),
        };
      });

      const before = snapshot.items.length;
      for (const item of batch.items) {
        const key = item.id || JSON.stringify([item.authorName, item.text, item.publishedAtText]);
        if (!seen.has(key)) {
          seen.add(key);
          snapshot.items.push(item);
        }
        if (snapshot.items.length === limit) break;
      }
      if (snapshot.items.length >= limit) {
        snapshot.status = 'limit_reached';
        return snapshot;
      }
      if (batch.loginRequired) {
        snapshot.status = snapshot.items.length ? 'partial' : 'unavailable';
        snapshot.reason = 'login_required';
        return snapshot;
      }
      if (batch.empty && snapshot.items.length === 0) {
        snapshot.status = 'empty';
        return snapshot;
      }
      if (batch.end) {
        snapshot.status = 'exhausted_visible';
        return snapshot;
      }

      idle = snapshot.items.length === before ? idle + 1 : 0;
      if (idle >= 4) break;
      await list.evaluate(element => {
        let scrollable = element;
        while (scrollable && !(scrollable.scrollHeight > scrollable.clientHeight
          && /scroll|auto/.test(getComputedStyle(scrollable).overflowY))) {
          scrollable = scrollable.parentElement;
        }
        if (scrollable) scrollable.scrollTop = scrollable.scrollHeight;
      });
      await page.waitForTimeout(850);
    }
    snapshot.status = snapshot.items.length ? 'partial' : 'unavailable';
    snapshot.reason = 'visible_list_stopped_loading';
  } catch {
    snapshot.status = snapshot.items.length ? 'partial' : 'unavailable';
    snapshot.reason = 'comment_panel_unavailable';
  }
  return snapshot;
}
