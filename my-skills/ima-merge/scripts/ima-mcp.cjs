#!/usr/bin/env node
'use strict';
const fs=require('node:fs'), path=require('node:path'), os=require('node:os'), crypto=require('node:crypto'), cp=require('node:child_process');
const ENDPOINT='https://ima.qq.com/mcp';
const READ=new Set(['search_knowledge','get_addable_knowledge_base_list','search_knowledge_base','get_knowledge_list','fetch_media_content','get_knowledge_base_list']);
const WRITE=new Set(['import_urls','add_knowledge']);
function fail(code){const e=new Error(code);e.safeCode=code;throw e;}
function tokenFrom(dir){
 const uid=path.basename(dir), j=JSON.parse(fs.readFileSync(path.join(dir,'connector-states.json'),'utf8'));
 if(j.encryption?.scheme!=='aes-256-gcm'||j.encryption?.kdf!=='hkdf-sha256')fail('UNSUPPORTED_ENCRYPTION');
 const master=fs.readFileSync(path.join(dir,'.master.key')); if(master.length!==32)fail('INVALID_MASTER_KEY');
 const e=j.headerOverrides?.['ima-mcp']?.Authorization;if(!e?.ct)fail('IMA_NOT_AUTHORIZED');
 const key=crypto.hkdfSync('sha256',Buffer.concat([master,Buffer.from(uid)]),Buffer.from(j.encryption.salt,'base64'),Buffer.from('workbuddy-oauth-credentials-v1'),32);
 const d=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(e.iv,'base64'));
 d.setAAD(Buffer.from(uid+'|connector-states:headerOverrides:ima-mcp|Authorization'));d.setAuthTag(Buffer.from(e.tag,'base64'));
 const token=Buffer.concat([d.update(Buffer.from(e.ct,'base64')),d.final()]).toString();
 if(!token||/[\r\n]/.test(token))fail('INVALID_TOKEN');return token.startsWith('Bearer ')?token:'Bearer '+token;
}
function discover(){
 if(process.env.IMA_WORKBUDDY_ACCOUNT_DIR)return path.resolve(process.env.IMA_WORKBUDDY_ACCOUNT_DIR);
 const root=path.join(os.homedir(),'.workbuddy/connectors');
 const candidates=fs.readdirSync(root,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>path.join(root,e.name)).filter(d=>{
  try {return !!JSON.parse(fs.readFileSync(path.join(d,'connector-states.json'),'utf8')).headerOverrides?.['ima-mcp']?.Authorization?.ct;}catch{return false;}
 });
 if(candidates.length!==1)fail(candidates.length?'MULTIPLE_ACCOUNTS_SET_IMA_WORKBUDDY_ACCOUNT_DIR':'IMA_NOT_AUTHORIZED');return candidates[0];
}
function parseHttp(raw,id){
 let rest=raw,status,headers;
 while(/^HTTP\/\S+ \d+/.test(rest)){
  const m=rest.match(/\r?\n\r?\n/);if(!m)fail('INVALID_HTTP_RESPONSE');
  const head=rest.slice(0,m.index);rest=rest.slice(m.index+m[0].length);
  status=Number(head.match(/^HTTP\/\S+ (\d+)/)[1]);headers={};
  for(const l of head.split(/\r?\n/).slice(1)){const n=l.indexOf(':');if(n>0)headers[l.slice(0,n).toLowerCase()]=l.slice(n+1).trim();}
 }
 if(status===401||status===403)fail('AUTH_EXPIRED_OPEN_WORKBUDDY_AND_REAUTHORIZE_IF_NEEDED');
 if(status!==200&&status!==202&&status!==204)fail('HTTP_'+(status||'INVALID'));
 if(id===undefined)return {headers,result:null};
 let data;try{data=JSON.parse(rest);}catch{
  for(const event of rest.split(/\r?\n\r?\n/)){const s=event.split(/\r?\n/).filter(x=>x.startsWith('data:')).map(x=>x.slice(5).trimStart()).join('\n');try{const o=JSON.parse(s);if(o.id===id){data=o;break;}}catch{}}
 }
 if(!data||data.id!==id)fail('INVALID_RPC_RESPONSE');if(data.error)fail('RPC_ERROR_'+data.error.code);
 return {headers,result:data.result};
}
function client(dir){
 let session,protocol='2024-11-05',seq=0;
 function rpc(method,params,notification=false){
  const id=notification?undefined:++seq;
  // Re-read encrypted state on every request: never cache plaintext on disk.
  const headers={'Content-Type':'application/json','Accept':'application/json, text/event-stream','Authorization':tokenFrom(dir)};
  if(session)headers['Mcp-Session-Id']=session;if(method!=='initialize')headers['MCP-Protocol-Version']=protocol;
  const body={jsonrpc:'2.0',...(id===undefined?{}:{id}),method,params};
  const config=['url = '+JSON.stringify(ENDPOINT),'request = "POST"','silent','show-error','include','max-time = 45','proto = "=https"',...Object.entries(headers).map(([k,v])=>'header = '+JSON.stringify(k+': '+v)),'data = '+JSON.stringify(JSON.stringify(body))].join('\n');
  let raw;try{raw=cp.execFileSync('curl',['-q','--config','-'],{input:config,encoding:'utf8',maxBuffer:32*1024*1024,stdio:['pipe','pipe','pipe']});}catch{fail('NETWORK_OR_RESPONSE_SIZE_ERROR');}
  const out=parseHttp(raw,id);if(out.headers['mcp-session-id'])session=out.headers['mcp-session-id'];return out.result;
 }
 const init=rpc('initialize',{protocolVersion:protocol,capabilities:{},clientInfo:{name:'ima-merge-local',version:require('../meta.json').version}});
 if(!init?.protocolVersion)fail('INITIALIZE_FAILED');protocol=init.protocolVersion;rpc('notifications/initialized',{},true);
 return rpc;
}
function main(){
 const args=process.argv.slice(2), cmd=args[0];
 if(cmd==='--help'||!cmd){console.log('Usage: ima-mcp.cjs tools | call TOOL [JSON|-] [--allow-write]\nCredentials: existing local WorkBuddy authorization only. No token export.');return;}
 if(cmd!=='tools'&&cmd!=='call')fail('INVALID_COMMAND');
 const name=args[1];if(cmd==='call'&&!READ.has(name)&&!WRITE.has(name))fail('UNSUPPORTED_TOOL_USE_NATIVE_MCP');
 if(WRITE.has(name)&&!args.includes('--allow-write'))fail('WRITE_REQUIRES_EXPLICIT_USER_AUTHORIZATION_AND_ALLOW_WRITE');
 const input=cmd==='call'?(args[2]==='-'?fs.readFileSync(0,'utf8'):args[2]||'{}'):'{}';
 const params=JSON.parse(input);if(!params||Array.isArray(params)||typeof params!=='object')fail('INVALID_ARGUMENTS');
 const rpc=client(discover());
 const result=cmd==='tools'?rpc('tools/list',{}):rpc('tools/call',{name,arguments:params});
 if(result?.isError)fail('MCP_TOOL_ERROR');
 console.log(JSON.stringify(result,null,2));
}
module.exports={parseHttp,tokenFrom,READ,WRITE,client,discover};
if(require.main===module){try{main();}catch(e){console.error(JSON.stringify({error:e.safeCode||'LOCAL_CONFIG_DECRYPT_OR_INPUT_ERROR',hint:'Do not print credential files. Check WorkBuddy ima connection; no automatic retry or OpenAPI fallback.'}));process.exitCode=1;}}
