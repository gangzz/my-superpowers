import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export function runtimePaths(stateRoot = join(homedir(), '.codex', 'state', 'media-download')) {
  const root = resolve(stateRoot);
  const profiles = join(root, 'profiles');
  const locks = join(root, 'locks');
  return Object.freeze({
    root,
    config: join(root, 'config.json'),
    jobsDatabase: join(root, 'jobs.sqlite'),
    profiles,
    defaultProfile: join(profiles, 'default'),
    locks,
    defaultProfileLock: join(locks, 'default-profile.lock'),
  });
}
