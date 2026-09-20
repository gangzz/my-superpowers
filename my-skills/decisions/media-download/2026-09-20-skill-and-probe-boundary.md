# media-download 的 Skill 与 Probe 边界

## 决定

- `media-download` 作为一个可持续增加站点 Extractor 的独立 Skill 维护和发布，不使用 Plugin 外壳。
- Skill 可以携带运行脚本、源码、依赖声明、测试和开发工具；这些内容本身不构成迁移到 Plugin 的理由。
- 本机状态固定在 `~/.codex/state/media-download/`，只保存 Chrome Profile、SQLite 调度队列和 Profile 锁；下载结果由用户选择输出目录。
- `NetworkProbe` 只用于开发、调试和修复 Extractor。正式下载链路、`BrowserHost` 和生产 Extractor 不得依赖它。

## 生产与开发边界

生产 Extractor 必须从站点页面、响应或明确接口直接生成 `MediaManifest`。开发者可以在外部临时工作区使用 Skill 内的 `src/dev/network-probe.mjs` 观察网络，以确认哪些站点事实稳定可用；探针数据不进入 SQLite、来源记录或发布制品。

抖音 Extractor 从作品 ID 定位目标 `RENDER_DATA` 对象，并直接使用该对象的视频 URL。最终媒体仍须通过轨道、尺寸、大小和 SHA256 验证；如果站点变化导致直接发现客观不可行，再基于新的实机证据重新讨论生产观察机制，而不是静默恢复 Probe 依赖。

## 实机结果

- 直接读取目标 `RENDER_DATA` 成功获得媒体候选，证明资源发现不需要 `NetworkProbe`。
- 页面内 `fetch` 因 CDN 访问策略返回 `Failed to fetch`；这属于 Transport 问题，不是发现问题。
- 将抖音候选统一交给同一 Context 会话材料的 `browser-session` Range 流后，端到端下载成功：`210,523,562` 字节、`576×1024`、含音轨、时长 `889.695782` 秒，并通过 SHA256 检查。
