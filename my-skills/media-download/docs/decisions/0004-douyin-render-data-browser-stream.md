# 抖音 RENDER_DATA 与浏览器流式传输

## 当前结论

- 抖音页面的 `blob:` 播放地址只表示页面使用 MediaSource，不表示底层没有 HTTP 媒体资源，也不表示资源一定音视频分离。
- 目标作品按 `作品 ID -> RENDER_DATA 中的目标对象 -> 目标对象内的视频 URL` 绑定。正式下载不观察同时加载的推荐视频请求。
- 分享短链先用 HTTP 重定向解析作品 ID，再规范化为已验证的 `jingxuan?modal_id=<id>` 入口后启动浏览器页面；短链落地页和带 `previous_page=web_code_link` 的视频页不作为作品发现入口。
- 目标 `RENDER_DATA` 中的合并资源和显式分离轨道都由 `browser-session` 沿用当前 Context 的 Cookie，并使用 Extractor 从当前页面读取的 User-Agent、语言和 Referer，按连续 Range 请求覆盖完整资源。页面内 `fetch` 不作为抖音生产传输方式；实机验证已出现 CDN 资源在页面环境中 `Failed to fetch`。
- 响应正文使用固定大小 chunk 进入 Node 写流，并按背压落入 `.partial` 文件。页面、BrowserSession 和 Node 都不缓存完整响应。
- 只有媒体检查确认候选为分离轨道时才执行无损封装；已验证的三个 `blob:` 样本实际都是含视频和音频的完整 MP4。

## 验收条件

- Extractor 只返回属于目标 `RENDER_DATA` 对象的媒体候选，不接收 `NetworkProbe`。
- `RENDER_DATA` 没有可靠当前标记时按共享 Selector 的回退规则选择合并资源；不存在合并资源时才选择视频轨与音频轨。
- BrowserSessionTransport 逐段校验 `Content-Range`、总大小和实际写入字节，失败时删除 `.partial`。
- 最终文件必须通过媒体轨道、尺寸、大小和 SHA256 验证后才能改名并报告成功。
