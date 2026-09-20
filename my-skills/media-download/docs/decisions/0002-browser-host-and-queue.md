# 决策 0002：公共 BrowserHost 与持久化队列

状态：已于 2026-09-20 接受为浏览器运行时设计。

- 每台机器默认使用一个供所有站点共享的 media-download Profile，它代表本机浏览器身份。
- 用户明确需要第二套浏览器身份或账号隔离时创建额外 Profile。
- 所有下载任务进入持久化 SQLite `DownloadJob` 队列并串行执行；需要浏览器的任务共享默认 Profile 和 Persistent Context。
- 唯一 `BrowserHost` 进程持有 Profile 文件锁、Patchright Persistent `BrowserContext` 和任务页面；调用进程负责提交任务和读取状态。
- `BrowserSession` 覆盖一次队列排空过程。同一轮中的多个任务共享 Context，但每个任务创建并关闭自己的 `JobPage`。
- SQLite 通过短事务保存任务、状态、结果引用和浏览器控制命令；浏览器对象句柄由 BrowserHost 在进程内持有。
- Profile 文件锁覆盖 BrowserHost 持有 Persistent Context 的完整周期，是浏览器身份的硬性独占保护。
- v0.1 通过 SQLite 有界轮询完成进程间通信，SQLite 是持久化事实来源。
- `DownloadJob` 使用 `queued -> running -> succeeded | failed` 四个状态；失败后队列继续，下次尝试通过提交新 Job 排到队尾。
- 浏览器控制命令只有 `open_browser` 和 `close_browser`。`open_browser(failedJobId)` 用于失败任务的人机处理，`open_browser(url, purpose=quality-selection)` 用于下载前人工选择清晰度；`close_browser()` 在关闭前返回当前视频尺寸。
- 清晰度选择发生在 DownloadJob 创建之前，不增加 Job 状态。用户确认后，调用者可以用返回的视频尺寸提交带可选 `expectedVideo` 的普通 Job，最终文件必须验证匹配。
- 登录由 Extractor 按需检测，统一返回 `ready`、`login_required`、`captcha` 或 `unavailable`；Resolver 只负责 URL 规范化和 Extractor 匹配。
- 队列排空后 BrowserHost 关闭 Context、确认所属 Chrome 已退出、释放 Profile 锁并结束。
