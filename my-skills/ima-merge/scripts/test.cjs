const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), os=require('node:os'), path=require('node:path'),crypto=require('node:crypto');
const {parseHttp,tokenFrom,READ,WRITE}=require('./ima-mcp.cjs');
test('JSON over proxy CONNECT headers',()=>assert.deepEqual(parseHttp('HTTP/1.1 200 Connection established\r\n\r\nHTTP/2 200\r\ncontent-type: application/json\r\n\r\n{"jsonrpc":"2.0","id":3,"result":{"ok":true}}',3).result,{ok:true}));
test('SSE event selection',()=>assert.equal(parseHttp('HTTP/2 200\r\n\r\nevent: message\ndata: {"id":4,"result":7}\n\n',4).result,7));
test('auth failure safe',()=>assert.throws(()=>parseHttp('HTTP/2 401\r\n\r\nsecret body',1),/AUTH_EXPIRED/));
test('write gate sets',()=>{assert(!READ.has('import_urls'));assert(WRITE.has('import_urls'));assert(!WRITE.has('create_media'));});
test('encrypted fixture decrypt and tamper rejection',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ima-fixture-')),uid=path.basename(dir),master=crypto.randomBytes(32),salt=crypto.randomBytes(32),iv=crypto.randomBytes(12);
 try{const key=crypto.hkdfSync('sha256',Buffer.concat([master,Buffer.from(uid)]),salt,Buffer.from('workbuddy-oauth-credentials-v1'),32),c=crypto.createCipheriv('aes-256-gcm',key,iv);c.setAAD(Buffer.from(uid+'|connector-states:headerOverrides:ima-mcp|Authorization'));
 const ct=Buffer.concat([c.update('synthetic-test-token'),c.final()]);const j={encryption:{scheme:'aes-256-gcm',kdf:'hkdf-sha256',salt:salt.toString('base64')},headerOverrides:{'ima-mcp':{Authorization:{iv:iv.toString('base64'),tag:c.getAuthTag().toString('base64'),ct:ct.toString('base64')}}}};
 fs.writeFileSync(path.join(dir,'.master.key'),master);fs.writeFileSync(path.join(dir,'connector-states.json'),JSON.stringify(j));assert.equal(tokenFrom(dir),'Bearer synthetic-test-token');j.headerOverrides['ima-mcp'].Authorization.tag=crypto.randomBytes(16).toString('base64');fs.writeFileSync(path.join(dir,'connector-states.json'),JSON.stringify(j));assert.throws(()=>tokenFrom(dir));}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
