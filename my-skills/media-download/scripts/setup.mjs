#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] ?? '--check';

if (!['--check', '--install'].includes(mode) || process.argv.length > 3) {
  console.error('Usage: node scripts/setup.mjs [--check|--install]');
  process.exit(2);
}

function commandName(name) {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

function commandAvailable(name, args = ['--version']) {
  const result = spawnSync(commandName(name), args, { encoding: 'utf8' });
  return !result.error && result.status === 0;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: skillRoot,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with status ${result.status}`);
  }
}

function systemIssues() {
  const issues = [];
  const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10);
  if (!Number.isInteger(nodeMajor) || nodeMajor < 22) {
    issues.push(`需要 Node.js 22 或更高版本；当前为 ${process.versions.node}`);
  }
  if (!commandAvailable('npm')) issues.push('找不到 npm');
  if (!commandAvailable('ffmpeg', ['-version'])) issues.push('找不到 ffmpeg');
  if (!commandAvailable('ffprobe', ['-version'])) issues.push('找不到 ffprobe');
  return issues;
}

async function runtimeIssues() {
  const issues = [];
  try {
    const { chromium } = await import('patchright');
    const executable = chromium.executablePath();
    if (!executable || !existsSync(executable)) {
      issues.push('Patchright Chromium 尚未安装');
    }
  } catch (error) {
    issues.push(`Patchright 运行依赖不可用：${error.message}`);
  }
  return issues;
}

function reportIssues(issues) {
  for (const issue of issues) console.error(`- ${issue}`);
}

const baseIssues = systemIssues();
if (baseIssues.length) {
  console.error('media-download 系统依赖检查失败：');
  reportIssues(baseIssues);
  console.error('本脚本不会自动安装系统软件。');
  process.exit(1);
}

if (mode === '--install') {
  try {
    run(commandName('npm'), ['ci', '--omit=dev', '--prefix', skillRoot]);
    run(process.execPath, [join(skillRoot, 'node_modules', 'patchright', 'cli.js'), 'install', 'chromium']);
  } catch (error) {
    console.error(`media-download 运行依赖安装失败：${error.message}`);
    process.exit(1);
  }
}

const issues = await runtimeIssues();
if (issues.length) {
  console.error('media-download 运行依赖尚未就绪：');
  reportIssues(issues);
  console.error('在获得用户许可后运行：node scripts/setup.mjs --install');
  process.exit(1);
}

console.log('media-download 运行依赖检查通过。');
