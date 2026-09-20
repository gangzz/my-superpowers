# 决策 0003：开发期 NetworkProbe

状态：已于 2026-09-20 修正为开发工具边界。

- `NetworkProbe` 是 media-download 定义的任务级被动网络观察组件，不是 Patchright 的专有类型。
- Probe 只在开发、调试或修复 Extractor 时由临时探针脚本显式启动；`BrowserHost` 和正式下载链路不得创建它。
- Probe 使用 Patchright 的 `request`、`response` 和 `requestfailed` 事件配对一次网络交换；v0.1 不依赖 CDP。
- `P0` 媒体候选全部保留并按脱敏规范化 URL 去重；重复请求聚合次数、状态和 Range 信息。
- `P1` 小型 JSON、M3U8 和 MPD 在大小限制内读取；正文读取时限默认为 5 秒，超时后不再阻塞 Job 收口；`P2` 普通流量与 `P3` 噪声只保留聚合计数。
- 查询参数值和敏感请求头不写入诊断数据；允许落盘的小型文本正文先脱敏，音视频二进制正文永不落盘。
- 调用者必须显式提供可丢弃的临时输出目录；Probe 不使用 media-download 的运行时状态目录。
- 原始 URL、完整请求头、响应头和允许读取的原始小型正文只在探针进程内短暂存在，不能进入正式 Manifest、来源记录或 SQLite。
- 新 Extractor 可以依靠 Probe 建立和验证实现，但生产 Extractor 的 `extract()` 不接收 Probe，也不能导入 `src/dev/`。
