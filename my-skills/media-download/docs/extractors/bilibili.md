# Extractor 决策记录：`bilibili`

## 范围

- 支持的 URL 家族：`www.bilibili.com/video/<BV号>/`、`m.bilibili.com/video/<BV号>/` 及同域等价标准视频页。
- 排除的 URL 家族：`b23.tv` 短链、番剧、课程、直播、收藏夹、稍后再看、搜索结果、用户空间批量采集和互动数据。
- 返回的内容类型：单个公开视频的 `video`。

## 当前能力

- 浏览器能力：`visible-required`。无头模式已用于开发期多样本验证，但尚未完成与默认可见 Profile 的完整等价性门槛，因此不升级能力声明。
- Profile 使用方式：`default-shared`。
- 访问状态检测：识别 `captcha`、明确的 `login_required` 与 `unavailable`；普通页面上的登录推广文案不等于下载必须登录。
- 人工处理入口：原始作品 URL。
- 必须遵循的入口链路：从输入解析目标 BV 号，导航到去除跟踪参数后的规范视频页；导航前注册精确的 `x/player/wbi/playurl` 响应等待，只接受查询参数 `bvid` 与目标一致的响应。共享 Context 的后续页面未发出新响应时，使用页面会话调用公开 `x/web-interface/view` 和 `x/player/playurl`，按 `p` 选择目标 CID 并重新校验 BV 号。
- 支持的 Transport 模式：`browser-session`。DASH 视频轨与音频轨分别传输并无损封装；同一轨道按 `baseUrl`、`backupUrl` 顺序回退。

## 已确认决策

- 当前网页首次访问会正常发出 `x/player/wbi/playurl` 请求，但页面水合后不保证保留 `window.__playinfo__` 或 `window.__INITIAL_STATE__`；同一 Context 的后续任务页面可以正常播放却不再产生新的 `playurl` 网络事件。生产 Extractor 优先等待目标响应，未观察到响应时通过页面会话显式调用公开接口；两条路径都不读取开发探针结果，也不依赖已被页面清理的全局变量。
- 目标绑定使用三段证据：输入 BV 号、`playurl` 请求查询参数中的 BV 号、响应中的 DASH 轨道。其他作品的并发响应不能成为候选。
- `data.quality` 表示当前播放器清晰度；同一清晰度下的多个编码轨道都标记为当前候选，由共享 Selector 按既有规则选择。
- `data.dash.video` 与 `data.dash.audio` 是分离轨道。Extractor 不伪造合并资源；共享后处理器用 `ffmpeg -c copy` 封装为 MP4，并由 `ffprobe` 验证视频轨、音频轨、尺寸、时长和大小。
- 媒体访问材料只存在于内存 Manifest 和 DownloadPlan；来源记录不保存签名 URL、备用地址、Cookie 或完整请求头。
- B 站返回的边缘主地址可能失败而备用地址可用。`BrowserSessionTransport` 对每个地址独立从字节 0 开始，失败时清理本次 partial，再尝试下一个地址。
- 标准 BV 分享链接中的 `share_source`、`vd_source`、`spm_id_from` 等参数只用于入口识别，不进入规范 URL 或来源记录；多 P 页面只保留决定目标分集的 `p` 参数。

## 实机证据

- 受控输入：`https://www.bilibili.com/video/BV1nLYh6uEH8/`。
- 页面响应：目标 `playurl` 返回当前清晰度 `32`、时长 `1,119,643 ms`，包含多种视频编码和 AAC 音频轨道。
- 完整交付：选中当前 `640×480` AV1 视频轨与 AAC 音频轨，Range 流式下载后无损封装；最终文件 `45,138,649` 字节、时长 `1119.643016` 秒、含音轨，SHA256 为 `0dc3b17c4c175803785b250b39d7fd1af6034cb046c12496045c03d39128a49a`。
- 补充解析矩阵共 5 条，全部成功：带 `share_source`/`vd_source` 的标准分享链接、60 秒高帧率样本、`480×852` 竖屏样本、多 P 的 `p=2`、`m.bilibili.com` 移动端入口。
- 补充完整交付共 4 条，全部通过轨道、尺寸、时长、大小和 SHA256 验证：
  - `BV1tMtB6bE1J` 分享链接：`16,664,463` 字节、`852×480`、AV1 + AAC、`651.274558` 秒；来源记录仅保留无跟踪参数的规范 URL。
  - `BV1Jo4y1i741`：`367,185` 字节、`852×480`、AV1 + AAC、`60.117333` 秒。
  - `BV1br4y1T7Zi`：`1,725,826` 字节、`480×852`、H.264 + AAC、`24.891338` 秒。
  - `BV1XY411o7Cv?p=2`：`9,993,402` 字节、`394×854`、H.264 + AAC、`90.181791` 秒；规范 URL 保留 `p=2`。
- 共享 Context 队列验证：连续处理分享链接、竖屏视频和多 P 第 2 集共 3 个独立任务页面。第一条使用页面响应，后两条使用显式 API 回退；三条均完成 Range 下载、无损封装、`ffprobe` 和 SHA256 验证，结果与隔离 Profile 测试一致。
- 清理：测试产物、临时 Profile 和探针现场均已删除；仓库与发布快照未保存原始响应、签名 URL 或媒体正文。

## 探针契约

开发或修复时，可以在显式临时目录运行 `src/dev/network-probe.mjs`，观察 `playurl`、DASH Range 请求和主备 CDN 行为。只保留脱敏 URL 形态、状态、Range/Content-Range 和媒体检查结论；不得把探针导入生产 Extractor，不得保存 Cookie、签名参数、原始响应或媒体正文。

## 待验证事项

- 默认持久化 Profile 在可见模式与无头模式下的完整等价性，包括登录状态、当前清晰度、传输、任务清理和进程归属。
- 多 P 视频的 `p` 参数与 `cid` 是否需要提升为来源身份的一部分。
- B 站短链是否应在浏览器导航前解析并纳入同一 Extractor。
