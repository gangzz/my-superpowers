#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const https = require('node:https');
const cp = require('node:child_process');
const { client, discover } = require('./ima-mcp.cjs');

function decode(result) {
  if (result?.isError) throw new Error('MCP_TOOL_ERROR');
  const text = result?.content?.find(item => item.type === 'text')?.text;
  if (!text) throw new Error('MCP_RESPONSE_MISSING');
  const value = JSON.parse(text);
  if (value.code !== undefined && value.code !== 0) {
    const error = new Error('MCP_BUSINESS_ERROR');
    error.businessCode = value.code;
    throw error;
  }
  return value.data || value;
}

function validateDestination(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.myqcloud.com') || parsed.username || parsed.password) {
    throw new Error('INVALID_COS_DESTINATION');
  }
  return parsed;
}

function put(url, headers, bytes) {
  validateDestination(url);
  return new Promise((resolve, reject) => {
    const request = https.request(url, { method: 'PUT', headers, timeout: 120000 }, response => {
      response.resume();
      response.on('end', () => response.statusCode >= 200 && response.statusCode < 300
        ? resolve() : reject(new Error('COS_HTTP_' + response.statusCode)));
    });
    request.on('timeout', () => request.destroy(new Error('COS_TIMEOUT')));
    request.on('error', () => reject(new Error('COS_UPLOAD_FAILED')));
    request.end(bytes);
  });
}

function credentialHeaders(credential, bytes, contentType) {
  if (!/^[a-zA-Z0-9-]+$/.test(credential.bucket_name) || !/^[a-zA-Z0-9-]+$/.test(credential.region)) {
    throw new Error('INVALID_COS_CREDENTIAL');
  }
  const host = credential.bucket_name + '.cos.' + credential.region + '.myqcloud.com';
  const pathname = '/' + credential.cos_key;
  const keyTime = credential.start_time + ';' + credential.expired_time;
  const hmac = (key, text) => crypto.createHmac('sha1', key).update(text).digest('hex');
  const signKey = hmac(credential.secret_key, keyTime);
  const httpString = 'put\n' + pathname + '\n\ncontent-length=' + bytes.length + '&host=' + encodeURIComponent(host) + '\n';
  const stringToSign = 'sha1\n' + keyTime + '\n' + crypto.createHash('sha1').update(httpString).digest('hex') + '\n';
  const authorization = ['q-sign-algorithm=sha1', 'q-ak=' + credential.secret_id,
    'q-sign-time=' + keyTime, 'q-key-time=' + keyTime, 'q-header-list=content-length;host',
    'q-url-param-list=', 'q-signature=' + hmac(signKey, stringToSign)].join('&');
  return { url: 'https://' + host + pathname,
    headers: { 'Content-Type': contentType, 'Content-Length': bytes.length,
      Authorization: authorization, 'x-cos-security-token': credential.token } };
}

async function uploadFile(options) {
  if (!options.allowWrite) throw new Error('WRITE_REQUIRES_ALLOW_WRITE');
  const file = path.resolve(options.file);
  const preflight = JSON.parse(cp.execFileSync(process.execPath,
    [path.join(__dirname, 'preflight-check.cjs'), '--file', file], { encoding: 'utf8' }));
  if (!preflight.pass) throw new Error('FILE_PREFLIGHT_FAILED');
  if (!options.knowledgeBaseId) throw new Error('TARGET_KNOWLEDGE_BASE_REQUIRED');
  const duplicate = options.duplicate || 'cancel';
  if (!['cancel', 'replace'].includes(duplicate)) throw new Error('INVALID_DUPLICATE_STRATEGY');
  const rpc = options.rpc || client(discover());
  const call = (name, args) => decode(rpc('tools/call', { name, arguments: args }));
  const folder = options.folderId ? { folder_id: options.folderId } : {};
  let cursor = '';
  do {
    const page = call('get_knowledge_list', { knowledge_base_id: options.knowledgeBaseId, ...folder, limit: 20, cursor });
    const existing = (page.knowledge_list || []).find(item => item.title === preflight.file_name);
    if (existing && duplicate === 'cancel') return { status: 'already_exists', media_id: existing.media_id, file_name: existing.title };
    if (page.is_end === false && !page.next_cursor) throw new Error('MCP_PAGINATION_INCOMPLETE');
    cursor = page.is_end ? '' : (page.next_cursor || '');
  } while (cursor);
  const bytes = fs.readFileSync(file);
  const created = call('create_media', { knowledge_base_id: options.knowledgeBaseId,
    apply_upload_mode: 1, content_type: preflight.content_type, file_ext: preflight.file_ext,
    file_name: preflight.file_name, file_size: bytes.length });
  if (!created.media_id) throw new Error('MEDIA_ID_MISSING');
  // Only the in-process caller receives media_id for reconciling uncertain writes.
  options.onCreated?.(created.media_id);
  if (created.upload_url?.presigned_url) {
    const headers = created.upload_url.auth_headers;
    const length = Object.entries(headers || {}).find(([name]) => name.toLowerCase() === 'content-length');
    if (!length || Number(length[1]) !== bytes.length) throw new Error('UPLOAD_SIZE_MISMATCH');
    await put(created.upload_url.presigned_url, headers, bytes);
  } else if (created.cos_credential) {
    const upload = credentialHeaders(created.cos_credential, bytes, preflight.content_type);
    await put(upload.url, upload.headers, bytes);
  } else {
    throw new Error('UPLOAD_MODE_UNSUPPORTED');
  }
  call('add_knowledge', { knowledge_base_id: options.knowledgeBaseId, ...folder, media_id: created.media_id,
    duplicate_name_strategy: duplicate === 'replace' ? 'DUPLICATE_NAME_STRATEGY_REPLACE' : 'DUPLICATE_NAME_STRATEGY_CANCEL' });
  return { status: 'submitted', media_id: created.media_id, file_name: preflight.file_name,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}

async function main() {
  const args = process.argv.slice(2);
  const value = flag => { const index = args.indexOf(flag); return index < 0 ? undefined : args[index + 1]; };
  const result = await uploadFile({ file: value('--file'), knowledgeBaseId: value('--kb'),
    folderId: value('--folder'), duplicate: value('--duplicate'), allowWrite: args.includes('--allow-write') });
  console.log(JSON.stringify(result));
}

module.exports = { uploadFile, decode, validateDestination, credentialHeaders, put };
if (require.main === module) main().catch(error => {
  console.error(JSON.stringify({ error: error.safeCode || error.message, business_code: error.businessCode }));
  process.exitCode = 1;
});
