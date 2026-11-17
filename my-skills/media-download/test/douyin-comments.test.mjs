import test from 'node:test';
import assert from 'node:assert/strict';
import {collectDouyinComments} from '../src/extractors/douyin-comments.mjs';
const source={site:'douyin',contentId:'123',canonicalUrl:'https://www.douyin.com/video/123'};
function fake(batches,{count=1,fail=false}={}){let n=0;const list={isVisible:async()=>true,waitFor:async()=>{},evaluate:async(fn)=>{if(fail)throw Error('private details');if(fn.toString().includes('const plain'))return batches[Math.min(n++,batches.length-1)];return null}};return {locator:()=>({count:async()=>count,locator:()=>list}),waitForTimeout:async()=>{}}}
test('keeps first-seen order, removes duplicates and caps the sample',async()=>{
 const item=n=>({id:String(n),authorName:'用户',text:`评论${n}`});
 const page=fake([{items:[item(1),item(2)]},{items:[item(2),item(3),item(4)]}]);
 const r=await collectDouyinComments({page,source,limit:3});
 assert.equal(r.status,'limit_reached');assert.deepEqual(r.items.map(i=>i.id),['1','2','3']);assert.equal(r.includesReplies,false);
});
test('no growth is partial rather than claiming all comments were collected',async()=>{
 const r=await collectDouyinComments({page:fake([{items:[{id:'1',text:'一条'}]}]),source});
 assert.equal(r.status,'partial');assert.equal(r.items.length,1);
});
test('wrong target and inaccessible panels do not invent empty comment sections',async()=>{
 assert.equal((await collectDouyinComments({page:fake([],{count:0}),source})).reason,'target_container_missing');
 const r=await collectDouyinComments({page:fake([],{fail:true}),source});assert.equal(r.status,'unavailable');assert.equal(r.items.length,0);assert.doesNotMatch(JSON.stringify(r),/private details/);
});
test('explicit empty state and visible end are distinct from a loading failure',async()=>{
 assert.equal((await collectDouyinComments({page:fake([{items:[],empty:true}]),source})).status,'empty');
 assert.equal((await collectDouyinComments({page:fake([{items:[{id:'1',text:'x'}],end:true}]),source})).status,'exhausted_visible');
});
