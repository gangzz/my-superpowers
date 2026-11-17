#!/usr/bin/env node
import {resolve} from 'node:path';
import {createDefaultMediaDownloadRuntime} from '../src/runtime/default-runtime.mjs';
const args=process.argv.slice(2);let url=null,outputDirectory=null,commentsLimit=null,invalid=false;
for(let i=0;i<args.length;i++){
 const a=args[i];
 if(a==='--output'&&outputDirectory===null&&args[i+1]&&!args[i+1].startsWith('--'))outputDirectory=resolve(args[++i]);
 else if(a==='--comments'&&commentsLimit===null&&/^\d+$/.test(args[i+1]??''))commentsLimit=Number(args[++i]);
 else if(!a.startsWith('--')&&url===null)url=a;
 else invalid=true;
}
if(invalid||!url||(commentsLimit!==null&&(commentsLimit<1||commentsLimit>40))){
 console.error('Usage: node scripts/submit.mjs <url> [--output /absolute/path] [--comments 1..40]');process.exitCode=2;
}else{
 const runtime=createDefaultMediaDownloadRuntime();
 try{console.log(JSON.stringify(runtime.store.submitDownload({url,outputDirectory,commentsLimit}),null,2))}finally{runtime.store.close()}
}
