#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { client, discover } = require('./ima-mcp.cjs');
const { call } = require('./ima-openapi.cjs');
const baseline = require('../references/upstreams.json');

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

function toolHash(tools) {
  const schema = [...tools].sort((a, b) => a.name.localeCompare(b.name))
    .map(tool => ({ name: tool.name, inputSchema: tool.inputSchema, description: tool.description }));
  return crypto.createHash('sha256').update(JSON.stringify(canonical(schema))).digest('hex');
}

async function checkUpstreams() {
  const report = { local_version: baseline.local_version, checked_at: new Date().toISOString(), changes: [], errors: [] };
  try {
    const tools = client(discover())('tools/list', {}).tools;
    const previous = JSON.parse(fs.readFileSync(path.join(__dirname, '../references/mcp-tools.json'), 'utf8'));
    report.mcp = { tool_count: tools.length, sha256: toolHash(tools) };
    if (report.mcp.sha256 !== toolHash(Array.isArray(previous) ? previous : previous.tools)) {
      report.changes.push('MCP_TOOL_SCHEMA_CHANGED');
    }
  } catch (error) {
    report.errors.push({ source: 'mcp', error: error.safeCode || 'MCP_CHECK_FAILED' });
  }
  try {
    const version = await call('openapi/check_skill_update', { version: baseline.official_skill.version });
    report.official_skill = { latest_version: version.latest_version, release_desc: version.release_desc };
    if (!/^\d+\.\d+\.\d+$/.test(version.latest_version || '')) throw new Error('INVALID_UPSTREAM_VERSION');
    if (version.latest_version !== baseline.official_skill.version) report.changes.push('OFFICIAL_SKILL_VERSION_CHANGED');
    const url = 'https://app-dl.ima.qq.com/skills/ima-skills-' + version.latest_version + '.zip';
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error('UPSTREAM_DOWNLOAD_FAILED');
    if (Number(response.headers.get('content-length')) > 10 * 1024 * 1024) throw new Error('UPSTREAM_ARCHIVE_TOO_LARGE');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > 10 * 1024 * 1024) throw new Error('UPSTREAM_ARCHIVE_TOO_LARGE');
    report.official_skill.sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    report.official_skill.last_modified = response.headers.get('last-modified');
    if (version.latest_version === baseline.official_skill.version && report.official_skill.sha256 !== baseline.official_skill.sha256) {
      report.changes.push('OFFICIAL_SKILL_CONTENT_CHANGED');
    }
  } catch (error) {
    report.errors.push({ source: 'official_skill', error: error.businessCode || error.message || 'SKILL_CHECK_FAILED' });
  }
  report.changed = report.changes.length > 0;
  const cache = path.join(os.homedir(), '.config/ima/ima-merge');
  fs.mkdirSync(cache, { recursive: true, mode: 0o700 });
  const target = path.join(cache, 'upstream-check.json');
  fs.writeFileSync(target + '.tmp', JSON.stringify(report, null, 2), { mode: 0o600 });
  fs.renameSync(target + '.tmp', target);
  return report;
}

module.exports = { canonical, toolHash, checkUpstreams };
if (require.main === module) checkUpstreams().then(report => {
  console.log(JSON.stringify(report, null, 2));
  if (report.errors.length) process.exitCode = 1;
}).catch(() => { console.error(JSON.stringify({ error: 'UPSTREAM_CHECK_FAILED' })); process.exitCode = 1; });
