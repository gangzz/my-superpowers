import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

export class ProfileLockError extends Error {
  constructor(message, { owner = null } = {}) {
    super(message);
    this.name = 'ProfileLockError';
    this.code = 'profile_in_use';
    this.owner = owner;
  }
}

function readOwner(lockPath) {
  try {
    return JSON.parse(readFileSync(lockPath, 'utf8'));
  } catch {
    return null;
  }
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function profileHasChrome(profilePath) {
  try {
    const commands = execFileSync('ps', ['-axo', 'command='], {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return commands.includes(`--user-data-dir=${resolve(profilePath)}`);
  } catch {
    return true;
  }
}

export function acquireProfileLock({
  lockPath,
  profilePath,
  ownerId,
  pid = process.pid,
  tokenFactory = randomUUID,
  isOwnerAlive = processIsAlive,
  isProfileInUse = profileHasChrome,
  clock = Date.now,
} = {}) {
  if (!lockPath || !profilePath || !ownerId) throw new TypeError('lockPath, profilePath, and ownerId are required');
  mkdirSync(dirname(lockPath), { recursive: true });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = tokenFactory();
    try {
      const descriptor = openSync(lockPath, 'wx', 0o600);
      try {
        writeFileSync(descriptor, JSON.stringify({
          ownerId,
          ownerPid: pid,
          token,
          acquiredAt: new Date(clock()).toISOString(),
        }));
      } finally {
        closeSync(descriptor);
      }
      chmodSync(lockPath, 0o600);
      let released = false;
      return Object.freeze({
        release() {
          if (released) return false;
          released = true;
          if (readOwner(lockPath)?.token !== token) return false;
          try {
            unlinkSync(lockPath);
            return true;
          } catch (error) {
            if (error?.code === 'ENOENT') return false;
            throw error;
          }
        },
      });
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const owner = readOwner(lockPath);
      const stale = owner && !isOwnerAlive(owner.ownerPid) && !isProfileInUse(profilePath);
      if (stale && attempt === 0) {
        try {
          unlinkSync(lockPath);
          continue;
        } catch (unlinkError) {
          if (unlinkError?.code === 'ENOENT') continue;
        }
      }
      throw new ProfileLockError('The default media-download Profile is already in use', { owner });
    }
  }

  throw new ProfileLockError('The default media-download Profile is already in use');
}
