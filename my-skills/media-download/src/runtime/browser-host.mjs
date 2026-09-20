import { randomUUID } from 'node:crypto';

function errorCode(error, fallback) {
  return typeof error?.code === 'string' && error.code ? error.code : fallback;
}

function errorMessage(error, fallback) {
  return typeof error?.message === 'string' && error.message ? error.message : fallback;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class BrowserHost {
  constructor({
    store,
    session,
    acquireLock,
    executeDownload,
    requiresBrowser,
    resolveManualEntry,
    workerId = `browser-host:${randomUUID()}`,
    pollIntervalMs = 500,
    sleep = wait,
  } = {}) {
    if (!store || !session || typeof acquireLock !== 'function') throw new TypeError('store, session, and acquireLock are required');
    if (typeof executeDownload !== 'function') throw new TypeError('executeDownload is required');
    if (typeof requiresBrowser !== 'function') throw new TypeError('requiresBrowser is required');
    if (typeof resolveManualEntry !== 'function') throw new TypeError('resolveManualEntry is required');
    this.store = store;
    this.session = session;
    this.acquireLock = acquireLock;
    this.executeDownload = executeDownload;
    this.requiresBrowser = requiresBrowser;
    this.resolveManualEntry = resolveManualEntry;
    this.workerId = workerId;
    this.pollIntervalMs = pollIntervalMs;
    this.sleep = sleep;
  }

  async #runCommand(command) {
    let sessionClosed = false;
    try {
      if (command.type === 'open_browser') {
        let url = command.url;
        if (command.jobId) {
          const job = this.store.getDownload(command.jobId);
          if (!job || job.status !== 'failed') {
            const error = new Error('open_browser requires a failed download job');
            error.code = 'job_not_failed';
            throw error;
          }
          url = await this.resolveManualEntry({ job });
        }
        await this.session.openManual(url);
        this.store.succeedBrowserCommand({ id: command.id, workerId: this.workerId });
        return 'manual_open';
      }
      let selectedVideo = null;
      let inspectionFailure = null;
      try {
        selectedVideo = await this.session.inspectManualMedia();
      } catch (error) {
        inspectionFailure = error;
      }
      await this.session.close();
      sessionClosed = true;
      if (inspectionFailure) throw inspectionFailure;
      this.store.succeedBrowserCommand({
        id: command.id,
        workerId: this.workerId,
        result: { selectedVideo },
      });
      return 'manual_closed';
    } catch (error) {
      this.store.failBrowserCommand({
        id: command.id,
        workerId: this.workerId,
        errorCode: errorCode(error, 'browser_command_failed'),
        errorMessage: errorMessage(error, 'Browser command failed'),
      });
      return sessionClosed ? 'manual_closed_failed' : 'command_failed';
    }
  }

  async #runDownload(job) {
    let page;
    let result;
    let failure;
    try {
      if (await this.requiresBrowser({ job })) page = await this.session.newJobPage();
      result = await this.executeDownload({
        job,
        page: page ?? null,
        context: page ? this.session.context : null,
      });
    } catch (error) {
      failure = error;
    } finally {
      if (page) await page.close().catch(() => {});
    }
    if (failure) {
      this.store.failDownload({
        id: job.id,
        workerId: this.workerId,
        errorCode: errorCode(failure, 'download_failed'),
        errorMessage: errorMessage(failure, 'Download failed'),
      });
      return;
    }
    this.store.succeedDownload({ id: job.id, workerId: this.workerId, result });
  }

  async serve({ signal = null } = {}) {
    const lock = this.acquireLock({ ownerId: this.workerId });
    let manualOpen = false;
    this.store.failInterruptedDownloads({ workerId: this.workerId });
    this.store.failInterruptedBrowserCommands({ workerId: this.workerId });
    let closeError = null;
    try {
      while (!signal?.aborted) {
        const command = this.store.claimNextBrowserCommand({ workerId: this.workerId });
        if (command) {
          const result = await this.#runCommand(command);
          if (result === 'manual_open') manualOpen = true;
          if (result === 'manual_closed' || result === 'manual_closed_failed') manualOpen = false;
          continue;
        }

        if (manualOpen) {
          await this.sleep(this.pollIntervalMs);
          continue;
        }

        const job = this.store.claimNextDownload({ workerId: this.workerId });
        if (!job) break;
        await this.#runDownload(job);
      }
    } finally {
      try {
        await this.session.close();
      } catch (error) {
        closeError = error;
      }
      if (!closeError) lock.release();
    }
    if (closeError) throw closeError;
    return { status: 'stopped', workerId: this.workerId };
  }
}
