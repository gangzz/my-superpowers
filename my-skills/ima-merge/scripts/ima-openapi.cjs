#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { TextDecoder } = require('node:util');
const meta = require('../meta.json');

const READ = new Set([
  'openapi/check_skill_update',
  ...['get_knowledge_base', 'get_knowledge_list', 'search_knowledge', 'search_knowledge_base',
    'get_addable_knowledge_base_list', 'check_repeated_names', 'get_media_info'].map(name => 'openapi/wiki/v1/' + name),
  ...['search_note', 'list_notebook', 'list_note', 'get_doc_content'].map(name => 'openapi/note/v1/' + name),
  'openapi/mcp_cloud_agent/get_access_url',
]);

function assertStrings(value) {
  if (typeof value === 'string' && Buffer.from(value, 'utf8').toString('utf8') !== value) {
    throw new Error('INVALID_UNICODE_STRING');
  }
  if (value && typeof value === 'object') Object.values(value).forEach(assertStrings);
}

function credentials() {
  const root = path.join(os.homedir(), '.config/ima');
  const read = name => fs.existsSync(path.join(root, name)) ? fs.readFileSync(path.join(root, name), 'utf8').trim() : '';
  const clientId = process.env.IMA_CLIENT_ID || process.env.IMA_OPENAPI_CLIENTID || read('client_id');
  const apiKey = process.env.IMA_API_KEY || process.env.IMA_OPENAPI_APIKEY || read('api_key');
  if (!clientId || !apiKey) throw new Error('OPENAPI_CREDENTIALS_REQUIRED');
  return { clientId, apiKey };
}

async function imaApi(apiPath, body = {}, options = {}) {
  if (!/^openapi\/(?:check_skill_update|(?:note|wiki)\/v1\/[a-z_]+|mcp_cloud_agent\/[a-z_]+)$/.test(apiPath)) {
    throw new Error('INVALID_API_PATH');
  }
  if (!READ.has(apiPath) && !options.allowWrite) throw new Error('WRITE_REQUIRES_ALLOW_WRITE');
  assertStrings(body);
  const auth = credentials();
  let response;
  try {
    response = await fetch('https://ima.qq.com/' + apiPath, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(options.timeoutMs || 45000),
      headers: {
        'Content-Type': 'application/json', 'ima-openapi-clientid': auth.clientId,
        'ima-openapi-apikey': auth.apiKey, 'ima-openapi-ctx': 'skill_version=' + meta.upstream_skill_version,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('OPENAPI_NETWORK_ERROR');
  }
  if (!response.ok) throw new Error('OPENAPI_HTTP_' + response.status);
  const text = await response.text();
  let result;
  try { result = JSON.parse(text); } catch { throw new Error('OPENAPI_INVALID_JSON'); }
  if (result.code !== 0) {
    const error = new Error('OPENAPI_BUSINESS_ERROR');
    error.businessCode = result.code;
    error.businessMessage = result.msg;
    throw error;
  }
  return text;
}

async function call(apiPath, body, options) {
  return JSON.parse(await imaApi(apiPath, body, options)).data || {};
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length || args[0] === '--help') {
    console.log('Usage: ima-openapi.cjs openapi/PATH JSON|- [--allow-write]');
    return;
  }
  if (args[0].endsWith('/create_media')) throw new Error('USE_HIGH_LEVEL_UPLOAD_COMMAND');
  const raw = args[1] === '-' ? new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(0)) : (args[1] || '{}');
  const output = await imaApi(args[0], JSON.parse(raw), { allowWrite: args.includes('--allow-write') });
  console.log(output);
}

module.exports = { imaApi, call, assertStrings, READ };
if (require.main === module) main().catch(error => {
  console.error(JSON.stringify({ error: error.businessCode || error.message, message: error.businessMessage }));
  process.exitCode = 1;
});
