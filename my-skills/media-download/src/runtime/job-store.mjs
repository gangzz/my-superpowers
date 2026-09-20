import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const JOB_STATUSES = new Set(['queued', 'running', 'succeeded', 'failed']);
const COMMAND_TYPES = new Set(['open_browser', 'close_browser']);
const COMMAND_STATUSES = new Set(['queued', 'running', 'succeeded', 'failed']);
const COMMAND_PURPOSES = new Set(['quality-selection']);

function requiredString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${name} is required`);
  return value;
}

function nowIso(clock) {
  return new Date(clock()).toISOString();
}

function parseJson(value) {
  if (value == null) return null;
  return JSON.parse(value);
}

function normalizeHttpUrl(value, name = 'url') {
  const parsedUrl = new URL(requiredString(value, name));
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new TypeError(`${name} must use http or https`);
  return parsedUrl.toString();
}

function normalizeExpectedVideo(value) {
  if (value == null) return null;
  if (!Number.isInteger(value.width) || value.width <= 0) {
    throw new TypeError('expectedVideo.width must be a positive integer');
  }
  if (!Number.isInteger(value.height) || value.height <= 0) {
    throw new TypeError('expectedVideo.height must be a positive integer');
  }
  return Object.freeze({ width: value.width, height: value.height });
}

function ensureColumn(database, table, column, definition) {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some(({ name }) => name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function mapJob(row) {
  if (!row) return null;
  return Object.freeze({
    id: row.id,
    url: row.url,
    expectedVideo: parseJson(row.expected_video_json),
    status: row.status,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    result: parseJson(row.result_json),
    workerId: row.worker_id,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    updatedAt: row.updated_at,
  });
}

function mapCommand(row) {
  if (!row) return null;
  return Object.freeze({
    id: row.id,
    type: row.type,
    jobId: row.job_id,
    url: row.url,
    purpose: row.purpose,
    result: parseJson(row.result_json),
    status: row.status,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    workerId: row.worker_id,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    updatedAt: row.updated_at,
  });
}

function immediateTransaction(database, action) {
  database.exec('BEGIN IMMEDIATE');
  try {
    const result = action();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function claimNext(database, { table, workerId, timestamp }) {
  return immediateTransaction(database, () => {
    const row = database.prepare(`
      SELECT * FROM ${table}
      WHERE status = 'queued'
      ORDER BY created_at ASC, rowid ASC
      LIMIT 1
    `).get();
    if (!row) return null;
    database.prepare(`
      UPDATE ${table}
      SET status = 'running', worker_id = ?, started_at = ?, updated_at = ?
      WHERE id = ? AND status = 'queued'
    `).run(workerId, timestamp, timestamp, row.id);
    return database.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(row.id);
  });
}

export function createJobStore({
  databasePath,
  clock = Date.now,
  idFactory = randomUUID,
} = {}) {
  requiredString(databasePath, 'databasePath');
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec('PRAGMA journal_mode = WAL');
  database.exec('PRAGMA busy_timeout = 5000');
  database.exec('PRAGMA foreign_keys = ON');
  database.exec(`
    CREATE TABLE IF NOT EXISTS download_jobs (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      expected_video_json TEXT,
      status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
      error_code TEXT,
      error_message TEXT,
      result_json TEXT,
      worker_id TEXT,
      created_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS download_jobs_queue
      ON download_jobs(status, created_at);

    CREATE TABLE IF NOT EXISTS browser_commands (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('open_browser', 'close_browser')),
      job_id TEXT REFERENCES download_jobs(id),
      url TEXT,
      purpose TEXT,
      result_json TEXT,
      status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
      error_code TEXT,
      error_message TEXT,
      worker_id TEXT,
      created_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS browser_commands_queue
      ON browser_commands(status, created_at);
  `);
  ensureColumn(database, 'download_jobs', 'expected_video_json', 'TEXT');
  ensureColumn(database, 'browser_commands', 'url', 'TEXT');
  ensureColumn(database, 'browser_commands', 'purpose', 'TEXT');
  ensureColumn(database, 'browser_commands', 'result_json', 'TEXT');

  return Object.freeze({
    submitDownload({ url, expectedVideo = null } = {}) {
      const normalizedUrl = normalizeHttpUrl(url);
      const normalizedExpectedVideo = normalizeExpectedVideo(expectedVideo);
      const id = idFactory();
      const timestamp = nowIso(clock);
      database.prepare(`
        INSERT INTO download_jobs (id, url, expected_video_json, status, created_at, updated_at)
        VALUES (?, ?, ?, 'queued', ?, ?)
      `).run(id, normalizedUrl, JSON.stringify(normalizedExpectedVideo), timestamp, timestamp);
      return mapJob(database.prepare('SELECT * FROM download_jobs WHERE id = ?').get(id));
    },

    getDownload(id) {
      return mapJob(database.prepare('SELECT * FROM download_jobs WHERE id = ?').get(requiredString(id, 'id')));
    },

    listDownloads() {
      return database.prepare('SELECT * FROM download_jobs ORDER BY created_at ASC, rowid ASC').all().map(mapJob);
    },

    claimNextDownload({ workerId } = {}) {
      const row = claimNext(database, {
        table: 'download_jobs',
        workerId: requiredString(workerId, 'workerId'),
        timestamp: nowIso(clock),
      });
      return mapJob(row);
    },

    succeedDownload({ id, workerId, result = null } = {}) {
      const timestamp = nowIso(clock);
      const changed = database.prepare(`
        UPDATE download_jobs
        SET status = 'succeeded', result_json = ?, error_code = NULL,
            error_message = NULL, finished_at = ?, updated_at = ?
        WHERE id = ? AND status = 'running' AND worker_id = ?
      `).run(JSON.stringify(result ?? null), timestamp, timestamp, requiredString(id, 'id'), requiredString(workerId, 'workerId')).changes;
      if (changed !== 1) throw new Error('download job is not owned by this worker');
      return this.getDownload(id);
    },

    failDownload({ id, workerId, errorCode, errorMessage } = {}) {
      const timestamp = nowIso(clock);
      const changed = database.prepare(`
        UPDATE download_jobs
        SET status = 'failed', error_code = ?, error_message = ?,
            result_json = NULL, finished_at = ?, updated_at = ?
        WHERE id = ? AND status = 'running' AND worker_id = ?
      `).run(
        requiredString(errorCode, 'errorCode'),
        requiredString(errorMessage, 'errorMessage'),
        timestamp,
        timestamp,
        requiredString(id, 'id'),
        requiredString(workerId, 'workerId'),
      ).changes;
      if (changed !== 1) throw new Error('download job is not owned by this worker');
      return this.getDownload(id);
    },

    failInterruptedDownloads({ workerId, errorCode = 'browser_host_lost', errorMessage = 'BrowserHost exited before completing the job' } = {}) {
      const timestamp = nowIso(clock);
      return database.prepare(`
        UPDATE download_jobs
        SET status = 'failed', error_code = ?, error_message = ?,
            result_json = NULL, worker_id = ?, finished_at = ?, updated_at = ?
        WHERE status = 'running'
      `).run(errorCode, errorMessage, requiredString(workerId, 'workerId'), timestamp, timestamp).changes;
    },

    failInterruptedBrowserCommands({ workerId, errorCode = 'browser_host_lost', errorMessage = 'BrowserHost exited before completing the command' } = {}) {
      const timestamp = nowIso(clock);
      return database.prepare(`
        UPDATE browser_commands
        SET status = 'failed', error_code = ?, error_message = ?,
            result_json = NULL, worker_id = ?, finished_at = ?, updated_at = ?
        WHERE status = 'running'
      `).run(errorCode, errorMessage, requiredString(workerId, 'workerId'), timestamp, timestamp).changes;
    },

    submitBrowserCommand({ type, jobId = null, url = null, purpose = null } = {}) {
      if (!COMMAND_TYPES.has(type)) throw new TypeError('browser command type is invalid');
      let normalizedUrl = null;
      let normalizedPurpose = null;
      if (type === 'open_browser') {
        const hasJob = jobId != null;
        const hasUrl = url != null;
        if (hasJob === hasUrl) throw new TypeError('open_browser requires exactly one of jobId or url');
        if (hasJob) {
          requiredString(jobId, 'jobId');
          if (!this.getDownload(jobId)) throw new Error('download job does not exist');
          if (purpose != null) throw new TypeError('failed-job open_browser does not accept purpose');
        } else {
          normalizedUrl = normalizeHttpUrl(url);
          normalizedPurpose = requiredString(purpose, 'purpose');
          if (!COMMAND_PURPOSES.has(normalizedPurpose)) throw new TypeError('browser command purpose is invalid');
        }
      } else if (jobId != null || url != null || purpose != null) {
        throw new TypeError('close_browser does not accept jobId, url, or purpose');
      }
      const id = idFactory();
      const timestamp = nowIso(clock);
      database.prepare(`
        INSERT INTO browser_commands (id, type, job_id, url, purpose, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'queued', ?, ?)
      `).run(id, type, jobId, normalizedUrl, normalizedPurpose, timestamp, timestamp);
      return mapCommand(database.prepare('SELECT * FROM browser_commands WHERE id = ?').get(id));
    },

    getBrowserCommand(id) {
      return mapCommand(database.prepare('SELECT * FROM browser_commands WHERE id = ?').get(requiredString(id, 'id')));
    },

    claimNextBrowserCommand({ workerId } = {}) {
      const row = claimNext(database, {
        table: 'browser_commands',
        workerId: requiredString(workerId, 'workerId'),
        timestamp: nowIso(clock),
      });
      return mapCommand(row);
    },

    succeedBrowserCommand({ id, workerId, result = null } = {}) {
      const timestamp = nowIso(clock);
      const changed = database.prepare(`
        UPDATE browser_commands
        SET status = 'succeeded', result_json = ?, error_code = NULL, error_message = NULL,
            finished_at = ?, updated_at = ?
        WHERE id = ? AND status = 'running' AND worker_id = ?
      `).run(
        JSON.stringify(result ?? null),
        timestamp,
        timestamp,
        requiredString(id, 'id'),
        requiredString(workerId, 'workerId'),
      ).changes;
      if (changed !== 1) throw new Error('browser command is not owned by this worker');
      return this.getBrowserCommand(id);
    },

    failBrowserCommand({ id, workerId, errorCode, errorMessage } = {}) {
      const timestamp = nowIso(clock);
      const changed = database.prepare(`
        UPDATE browser_commands
        SET status = 'failed', error_code = ?, error_message = ?,
            result_json = NULL, finished_at = ?, updated_at = ?
        WHERE id = ? AND status = 'running' AND worker_id = ?
      `).run(
        requiredString(errorCode, 'errorCode'),
        requiredString(errorMessage, 'errorMessage'),
        timestamp,
        timestamp,
        requiredString(id, 'id'),
        requiredString(workerId, 'workerId'),
      ).changes;
      if (changed !== 1) throw new Error('browser command is not owned by this worker');
      return this.getBrowserCommand(id);
    },

    close() {
      database.close();
    },
  });
}

export const jobStoreValues = Object.freeze({
  jobStatuses: [...JOB_STATUSES],
  commandTypes: [...COMMAND_TYPES],
  commandStatuses: [...COMMAND_STATUSES],
  commandPurposes: [...COMMAND_PURPOSES],
});
