'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const { imaApi, assertStrings, READ } = require('./ima-openapi.cjs');
const { uploadFile, decode, validateDestination, credentialHeaders } = require('./ima-upload.cjs');
const { toolHash } = require('./check-upstreams.cjs');

test('OpenAPI requires write approval and rejects endpoint substitution', async () => {
  await assert.rejects(imaApi('https://unrelated.example/'), /INVALID_API_PATH/);
  await assert.rejects(imaApi('openapi/wiki/v1/rename_knowledge', {}), /WRITE_REQUIRES_ALLOW_WRITE/);
  assert(READ.has('openapi/note/v1/list_notebook'));
});

test('Unicode validation preserves valid Chinese and rejects unpaired surrogates', () => {
  assert.doesNotThrow(() => assertStrings({ title: '公众号✨', content: ['正文'] }));
  assert.throws(() => assertStrings({ content: '\ud800' }), /INVALID_UNICODE/);
});

test('OpenAPI checks HTTP and business status, suppresses redirect and sets timeout', async () => {
  const previousFetch = global.fetch;
  const previousId = process.env.IMA_CLIENT_ID;
  const previousKey = process.env.IMA_API_KEY;
  process.env.IMA_CLIENT_ID = 'synthetic-client';
  process.env.IMA_API_KEY = 'synthetic-key';
  try {
    global.fetch = async (url, options) => {
      assert.equal(url, 'https://ima.qq.com/openapi/note/v1/list_note');
      assert.equal(options.redirect, 'error');
      assert(options.signal);
      return new Response(JSON.stringify({ code: 0, data: { ok: true } }));
    };
    assert.equal(JSON.parse(await imaApi('openapi/note/v1/list_note', {})).data.ok, true);
    global.fetch = async () => new Response('{}', { status: 403 });
    await assert.rejects(imaApi('openapi/note/v1/list_note', {}), /HTTP_403/);
    global.fetch = async () => new Response(JSON.stringify({ code: 220001, msg: 'invalid media_id' }));
    await assert.rejects(imaApi('openapi/note/v1/list_note', {}), error => error.businessCode === 220001);
  } finally {
    global.fetch = previousFetch;
    if (previousId === undefined) delete process.env.IMA_CLIENT_ID; else process.env.IMA_CLIENT_ID = previousId;
    if (previousKey === undefined) delete process.env.IMA_API_KEY; else process.env.IMA_API_KEY = previousKey;
  }
});

test('MCP tool errors and business errors remain failures', () => {
  assert.throws(() => decode({ isError: true }), /MCP_TOOL_ERROR/);
  assert.throws(() => decode({ content: [{ type: 'text', text: '{"code":5}' }] }), /BUSINESS_ERROR/);
  assert.deepEqual(decode({ content: [{ type: 'text', text: '{"content":"# 正文"}' }] }), { content: '# 正文' });
});

test('COS destination validation enforces official HTTPS', () => {
  assert.throws(() => validateDestination('https://example.com/a'), /INVALID_COS/);
  assert.throws(() => validateDestination('http://bucket.cos.ap-guangzhou.myqcloud.com/a'), /INVALID_COS/);
  assert.throws(() => validateDestination('https://a.myqcloud.com.evil.example/a'), /INVALID_COS/);
  assert(validateDestination('https://bucket.cos.ap-guangzhou.myqcloud.com/a'));
});

test('temporary COS signature construction stays inside the process', () => {
  const credential = { bucket_name: 'bucket-123', region: 'ap-guangzhou', cos_key: 'file.md',
    secret_id: 'synthetic-id', secret_key: 'synthetic-key', token: 'synthetic-token', start_time: 100, expired_time: 200 };
  const upload = credentialHeaders(credential, Buffer.from('正文'), 'text/markdown');
  assert.equal(upload.headers['Content-Length'], 6);
  assert.match(upload.headers.Authorization, /q-signature=[a-f0-9]{40}$/);
  assert.equal(upload.headers['x-cos-security-token'], 'synthetic-token');
});

test('upstream hashing ignores array order but detects schema changes', () => {
  const a = { name: 'a', inputSchema: { type: 'object' } };
  const b = { name: 'b', inputSchema: { required: ['id'] } };
  assert.equal(toolHash([a, b]), toolHash([b, a]));
  assert.notEqual(toolHash([a]), toolHash([{ ...a, inputSchema: { type: 'string' } }]));
});

test('upload checks write intent and skips existing full filenames without creating media', async () => {
  await assert.rejects(uploadFile({}), /WRITE_REQUIRES_ALLOW_WRITE/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ima-upload-test-'));
  try {
    const file = path.join(dir, '测试.md');
    fs.writeFileSync(file, '# 标题\n正文');
    const rpc = (method, args) => {
      assert.equal(args.name, 'get_knowledge_list');
      return { content: [{ type: 'text', text: JSON.stringify({ is_end: true,
        knowledge_list: [{ title: '测试.md', media_id: 'synthetic-media' }] }) }] };
    };
    const result = await uploadFile({ file, knowledgeBaseId: 'synthetic-kb', allowWrite: true, rpc });
    assert.equal(result.status, 'already_exists');
    assert.equal(result.media_id, 'synthetic-media');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('image dry-run and original-file preflight are self contained', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ima-notes-test-'));
  try {
    const file = path.join(dir, 'notes.md');
    fs.writeFileSync(file, '# 标题\n正文');
    const output = cp.execFileSync(process.execPath, [path.join(__dirname, 'note-images.cjs'),
      '--note-id', 'synthetic-note', '--file', file, '--dry-run'], { encoding: 'utf8' });
    assert.equal(JSON.parse(output)[0].type, 'text');
    const denied = cp.spawnSync(process.execPath, [path.join(__dirname, 'note-images.cjs'),
      '--note-id', 'synthetic-note', '--file', file], { encoding: 'utf8' });
    assert.notEqual(denied.status, 0);
    assert.match(denied.stderr, /WRITE_REQUIRES/);
    fs.writeFileSync(file, Buffer.from([0xff, 0xfe]));
    const invalid = cp.spawnSync(process.execPath, [path.join(__dirname, 'note-images.cjs'),
      '--note-id', 'synthetic-note', '--file', file, '--dry-run'], { encoding: 'utf8' });
    assert.notEqual(invalid.status, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('one installed entry and two top-level references with no old installation dependency', () => {
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'SKILL.md'), 'utf8');
  assert.equal((main.match(/\]\(references\//g) || []).length, 2);
  for (const file of fs.readdirSync(__dirname).filter(name => name.endsWith('.cjs') && !name.includes('test'))) {
    const code = fs.readFileSync(path.join(__dirname, file), 'utf8');
    assert(!code.includes('/Users/willard/.codex/skills/ima-skill/'));
  }
  assert.equal(require('../meta.json').version, '0.2.0');
});
