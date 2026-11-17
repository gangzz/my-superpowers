// Public, already-rendered comments only. No API signing, network probe or replies.
export async function collectDouyinComments({page,source,limit=40,clock=Date.now,timeoutMs=35000}={}){
 if(!Number.isInteger(limit)||limit<1||limit>40)throw new TypeError('comments limit must be 1..40');
 const snapshot={schemaVersion:1,source:{...source},capturedAt:new Date(clock()).toISOString(),sortLabel:'平台默认（未切换排序）',requestedLimit:limit,includesReplies:false,status:'unavailable',reason:null,items:[]};
 const contentId=String(source?.contentId??'');
 if(source?.site!=='douyin'||!/^\d+$/.test(contentId)){snapshot.reason='unsupported_site';return snapshot}
 try{
  const root=page.locator(`.video_${contentId}`);
  if(await root.count()!==1){snapshot.reason='target_container_missing';return snapshot}
  const list=root.locator('[data-e2e="comment-list"]');
  if(!await list.isVisible())await root.locator('[data-e2e="feed-comment-icon"]').click({timeout:5000});
  await list.waitFor({state:'visible',timeout:7000});
  const deadline=Date.now()+timeoutMs,seen=new Set();let idle=0;
  while(Date.now()<deadline&&snapshot.items.length<limit){
   const batch=await list.evaluate(list=>{
    const plain=e=>{if(!e)return '';const c=e.cloneNode(true);for(const img of c.querySelectorAll('img'))img.replaceWith(img.alt||'');return c.textContent.trim()};
    const items=[...list.querySelectorAll('[data-e2e="comment-item"]')].filter(e=>!e.parentElement.closest('[data-e2e="comment-item"]')).map(e=>{
     const info=e.querySelector('.comment-item-info-wrap'),body=info?.nextElementSibling,date=body?.nextElementSibling;
     return {id:e.querySelector('[id^="tooltip_"]')?.id.slice(8)||null,authorName:plain(info?.querySelector('a')),text:plain(body),publishedAtText:plain(date).split('·')[0],likeCountText:plain(e.querySelector('.comment-item-stats-container p'))};
    }).filter(e=>e.text);
    return {items,empty:/暂无评论|还没有评论/.test(list.innerText),end:/没有更多评论|暂时没有更多|已显示全部评论/.test(list.innerText)};
   });
   const before=snapshot.items.length;
   for(const item of batch.items){const key=item.id||JSON.stringify([item.authorName,item.text,item.publishedAtText]);if(!seen.has(key)){seen.add(key);snapshot.items.push(item)}if(snapshot.items.length===limit)break}
   if(snapshot.items.length>=limit){snapshot.status='limit_reached';return snapshot}
   if(batch.empty&&snapshot.items.length===0){snapshot.status='empty';return snapshot}
   if(batch.end){snapshot.status='exhausted_visible';return snapshot}
   idle=snapshot.items.length===before?idle+1:0;
   if(idle>=4)break;
   await list.evaluate(e=>{let s=e;while(s&&!(s.scrollHeight>s.clientHeight&&/scroll|auto/.test(getComputedStyle(s).overflowY)))s=s.parentElement;if(s)s.scrollTop=s.scrollHeight;});
   await page.waitForTimeout(850);
  }
  snapshot.status=snapshot.items.length?'partial':'unavailable';snapshot.reason='visible_list_stopped_loading';
 }catch{snapshot.status=snapshot.items.length?'partial':'unavailable';snapshot.reason='comment_panel_unavailable'}
 return snapshot;
}
