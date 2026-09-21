# 保存目录属于 DownloadJob

## 决定

- `DownloadJob` 新增可选 `outputDirectory`，提交时规范化为绝对路径并写入 SQLite。
- `submit.mjs` 支持 `--output <目录>`；显式指定时目标目录随 Job 冻结，未指定时保持原有 Host 默认目录行为。
- 下载执行器优先使用 `job.outputDirectory`，因此同一个 BrowserHost 可以连续处理目标目录不同的任务。
- Host 级 `--output` 保留为回退值，只服务迁移前没有该字段的旧 Job，以及未指定目录的程序化调用。
- SQLite 启动时自动补充 `output_directory` 列，既有队列无需重建。

## 原因

输出目录描述单个下载结果的归属，而不是 BrowserHost 的进程属性。把它只配置在 Host 上，会让调用者必须为不同作者或项目重启 Host，也会使已排队任务的最终位置受到后来启动参数影响。

把绝对目录随 Job 持久化后，任务从提交到执行期间语义保持不变；Host 仍只负责串行调度和共享浏览器身份。

## 验证

- JobStore 测试覆盖目录规范化、持久化和旧 SQLite 自动迁移。
- BrowserHost 测试覆盖同一个 Context 顺序处理两个不同输出目录的 Job。
- DownloadExecutor 测试覆盖 Job 目录覆盖 Host 默认目录，并确认媒体与 sidecar 同目录提交。
