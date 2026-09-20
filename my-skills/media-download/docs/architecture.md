# 通用媒体下载框架

## 主链路

```text
URL
-> Resolver
-> ExtractorRegistry
-> site Extractor
-> MediaManifest
-> shared Selector
-> DownloadPlan
-> shared Transport
-> Postprocessor
-> Verifier
```

URL 是用户唯一必须提供的输入。站点 Extractor 识别作品的实际类型并报告资源，Selector 在同一内容的不同版本之间进行选择。

## 核心对象

- `Extractor`：匹配 URL 并发现站点事实。基于浏览器的 Extractor 在自身实机探针通过前必须声明为 `visible-required`；通过后才可标记为 `headless-verified`。
- `MediaManifest`：不可变的事实快照，包含来源身份、内容类型、候选资源、媒体属性、访问模式和证据引用。
- `SelectionPolicy`：与站点无关的用户偏好。v0.1 内置策略为：当前播放器资源、音视频合并优先、必须有音频；没有当前标记时回退到最低合并资源，合并资源不可用时允许封装分离轨道。
- `DownloadPlan`：一次调用中冻结的资源选择与传输计划。
- `DownloadJob`：由 SQLite 队列管理的持久化单 URL 执行状态，与 Manifest 分离。

普通 `DownloadJob` 只需要 URL。人工选择清晰度后，调用者可以把 `close_browser()` 返回的 `{width, height}` 作为可选 `expectedVideo` 提交；Extractor 和 Verifier 必须验证实际结果，不匹配时以 `quality_not_applied` 失败。

`DownloadJob` 的状态固定为：

```text
queued -> running -> succeeded | failed
```

任务失败后保留错误码和错误信息，队列继续处理下一个任务。调用者选择再次下载时提交一个新 Job，新 Job 排在队尾。

## 浏览器运行时

- `BrowserHost`：唯一持有 Patchright 对象的 Node 进程。它获取默认 Profile 的文件锁并串行领取 `DownloadJob`；Extractor 需要浏览器时启动一个 Persistent `BrowserContext`，队列排空后关闭浏览器并释放锁。
- `BrowserSession`：`BrowserHost` 内部的一次运行记录，覆盖一次队列排空过程。
- `JobPage`：每个下载任务独占的页面。任务开始时创建，任务结束后关闭。
- 默认 Profile：代表本机的 media-download 浏览器身份，供所有站点共享。用户明确需要另一套浏览器身份时新增 Profile。

调用进程把 `DownloadJob` 写入 SQLite，并查询自身任务状态；当前没有 `BrowserHost` 时，由其中一个调用启动临时 Host。SQLite 通过短事务保存任务和状态；`BrowserContext`、`Page` 等句柄由 BrowserHost 在进程内持有。

v0.1 的进程间通信采用 SQLite 有界轮询。BrowserHost 领取新任务，调用进程等待结果；SQLite 是持久化事实来源。

浏览器控制命令固定为：

```text
open_browser(failedJobId)
open_browser(url, purpose = quality-selection)
close_browser() -> { selectedVideo }
```

调用者决定何时打开或关闭可见浏览器，BrowserHost 使用默认 Profile 执行命令。失败任务恢复时，`open_browser` 根据失败 Job 匹配 Extractor 并进入人工处理入口；清晰度选择时直接打开作品 URL。`close_browser` 在关闭前读取当前有效视频元素的宽、高、时长和播放状态，并把脱敏结果写入命令结果。

清晰度选择发生在 DownloadJob 创建之前。人工浏览器打开期间 BrowserHost 暂停领取下载任务；用户确认并关闭浏览器后，调用者才提交普通 Job，因此不引入等待人工、继续任务或取消任务状态。

Profile 文件锁覆盖 BrowserHost 持有 Persistent Context 的完整周期。残留锁在确认原持有进程已退出且 Profile 未被 Chrome 使用后恢复。

## 开发探针边界

`NetworkProbe` 只用于开发、调试和修复 Extractor。它可以在临时探针脚本中观察 `request`、`response` 和 `requestfailed`，输出脱敏网络证据，帮助确认站点页面里哪些稳定事实足以生成 Manifest。

生产边界是硬约束：`BrowserHost` 不创建 Probe，Extractor 的 `extract()` 不接收 Probe，SQLite 不保存网络事件。开发者必须显式提供临时输出目录；探针现场验证完成后，只保留必要测试和文档结论。

## 传输模式

- `direct-http`：Node HTTP 客户端凭明确的请求材料即可获取资源。
- `browser-session`：共享受管浏览器会话的请求客户端即可完成，不需要完整页面执行环境。
- `browser-page`：请求必须在真实运行的页面环境中发起或经由该环境传输。

Extractor 只声明访问要求，由共享规划器选择匹配的 Transport 实现。资源发现过程即使使用浏览器，最终选中的资源仍可能通过普通 HTTP 传输。

当前生产运行时只实现 `browser-session` 和 `browser-page`；`direct-http` 仍是扩展契约。音频与图文也只有 Manifest 和选择契约，尚未形成端到端交付能力。

`BrowserPageTransport` 的正文链路固定为：

```text
page fetch response.body
-> ReadableStream chunk
-> await Patchright exposed binding
-> Node WriteStream
-> .partial
-> ffprobe
-> atomic rename
```

页面每次只把一个有限大小的 chunk 编码后传给 Node，并等待 Node 确认。Node 写流触发背压时，binding 不返回，页面因此暂停继续读取。传输同时限制响应声明大小和实际写入大小；失败时只删除本次拥有的 `.partial` 文件。原始媒体 URL 和请求材料不写入来源记录。

`BrowserSessionTransport` 从当前 `BrowserContext` 读取目标域 Cookie，并使用 Extractor 从当前页面取得的 User-Agent、Accept、语言和 Referer。它用有限大小的连续 Range 请求覆盖完整资源，每个响应块直接进入同一个 Node 写流；每段校验 `Content-Range`，最后再校验媒体文件。它用于页面脚本因 CDN CORS 不能重新 Fetch、但浏览器会话材料足以访问的资源。

## 访问状态

Extractor 按自己的访问路径检测状态：

```text
ready
login_required
captcha
unavailable
```

未实现 `detectAccessState` 的 Extractor 默认为 `ready`。Resolver 负责 URL 规范化和 Extractor 匹配；页面登录状态由 Extractor 检测。调用者收到 `login_required` 或 `captcha` 后决定是否打开可见浏览器，处理完成后通过提交新 Job 再次执行。

## Extractor 拆分规则

按照 URL 家族或本质不同的取数流程拆分 Extractor。图文和视频共用页面契约时，由同一个笔记 Extractor 返回图片集合或视频。v0.1 处理单个作品 URL；个人主页、直播、搜索结果和批量采集分别使用独立流程。

## 探针门槛

每个浏览器 Extractor 都有自己的实机验证。在同一条受控访问链路上串行比较可见模式与无头模式，记录 URL 入口、登录状态判断、Manifest 结构、选中资源的传输、任务页面清理、队列排空后的浏览器关闭和进程归属。能力声明以 Extractor 决策文档中的验证证据为准。

探索阶段的探针入口和原始抓取数据放在可随时丢弃的外部工作目录中。`src/dev/network-probe.mjs` 只是可复用观察工具，不是生产依赖。结论成为长期维护能力后，只把必要检查缩减并固化到测试中，更新 Extractor 决策文档，然后删除探索现场。

## 运行时归属

已安装代码位于 Skill 安装目录。本机状态位于 `~/.codex/state/media-download/`，只包含 `jobs.sqlite`、`profiles/default/` 和 `locks/`。重新安装 Skill 不复制或删除浏览器身份与任务状态；最终下载文件和来源记录属于用户产物，不进入状态目录。
