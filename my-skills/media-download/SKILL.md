---
name: media-download
description: 下载用户指定的单个公开媒体作品，通过已注册的站点 Extractor 发现资源、选择可用版本、验证本地文件并保存来源记录。当前生产支持抖音和 B 站公开视频；不用于账号批量采集、信息流、搜索结果采集、直播或直接转写。
---

# 通用媒体下载

用户只需提供一个作品 URL。依次解析 URL、选择匹配的站点 Extractor、生成标准化 `MediaManifest`、应用共享选择策略、传输选中的资源、按需后处理，并在报告成功前验证文件。

## 稳定边界

- Extractor 负责 URL 匹配和站点特有的资源发现。它报告作品的实际媒体类型与候选资源，不写入最终文件。
- `MediaManifest` 记录已发现的事实和访问要求；用户偏好属于 `SelectionPolicy`，执行状态属于 `DownloadJob`。
- Selector 与站点无关。内置策略先选择当前播放器使用的音视频合并资源；没有当前标记时回退到最低合并资源，只有合并资源不可用时才允许视频轨和音频轨无损封装。
- 图文作品交付完整且有序的图片集合，媒体类型由 Extractor 判断。
- Transport 共享执行 `DownloadPlan`；Extractor 声明 `direct-http`、`browser-session` 或 `browser-page` 访问要求。
- `browser-page` 传输使用页面 `fetch` 取得响应流；`browser-session` 使用当前 Context 的会话材料按 Range 分段请求。两者都按 Node 写流背压写入 `.partial`，不缓存完整媒体正文。
- 所有需要浏览器的任务共享本机默认 Profile，由唯一 `BrowserHost` 持有 Persistent Context 并串行执行；调用进程提交 `DownloadJob`。
- 用户明确要求自己选择清晰度时，调用者先用同一 Profile 打开作品，用户选好后关闭浏览器并取得当前视频尺寸，再提交带可选期望尺寸的新 Job；人工选择不增加 Job 状态。
- 正式下载链路不得启动或依赖 `NetworkProbe`。生产 Extractor 必须从站点页面、响应或明确接口直接生成 Manifest。
- 登录是 Extractor 的按需访问状态。Extractor 可以直接返回 `ready`，也可以在当前访问路径需要身份时返回 `login_required` 或 `captcha`。
- 需要浏览器的 Extractor 初始状态为 `visible-required`，通过自身实机等价性验证后升级为 `headless-verified`。登录和 CAPTCHA 使用可见人机接管。
- Verifier 通过后报告成功。

## 当前支持与运行

当前生产 Extractor 支持以下入口：

- 抖音：单个公开视频长链接、带 `modal_id` 的作品链接，以及最终能跳转到单作品页的抖音短链。Extractor 按作品 ID 定位目标 `RENDER_DATA` 对象，直接从该对象生成资源候选；正式下载不监听页面网络。
- B 站：`www.bilibili.com/video/<BV号>/` 和等价的 `m.bilibili.com` 单个公开视频链接。Extractor 优先使用页面自身发出的目标 `playurl` 响应；共享 Context 后续页面不再发出该响应时，通过页面会话显式调用公开 `view` 与 `player/playurl` 接口，并再次校验 BV 号、分 P CID 和 DASH 轨道。它不导入或接收开发期 NetworkProbe。

两站资源都使用当前 Context 会话材料的 `browser-session` Range 流传输。B 站 DASH 轨道按主地址、备用 CDN 顺序回退，选中的视频轨和音频轨由共享后处理器无损封装为 MP4。

独立音频、图文、其他站点以及 `direct-http` 目前只有框架契约，没有可发布的端到端实现；不要把它们报告为已支持。

调用者只提交 URL：

```sh
node scripts/submit.mjs 'https://www.douyin.com/jingxuan?modal_id=作品ID'
node scripts/submit.mjs 'https://www.bilibili.com/video/BV号/'
```

`BrowserHost` 顺序处理队列，默认保存到 `~/Downloads`：

```sh
node scripts/host.mjs
```

需要指定输出目录时使用 `node scripts/host.mjs --output '/绝对路径'`。成功结果包含视频路径、来源记录、SHA256、大小、时长、尺寸和音轨确认；失败结果保留错误码与错误信息，由调用者决定是否重新提交新 Job。

修改框架契约前，先读 [docs/architecture.md](docs/architecture.md)。修改或运行站点 Extractor 前，先读 `docs/extractors/` 下的对应文档。

开发或修复 Extractor 时，可以临时使用 `src/dev/network-probe.mjs` 观察网络。Probe 输出必须写入显式指定的临时目录，不能接入 `BrowserHost`、生产 Extractor 或 SQLite，也不能把原始探针数据作为发布制品；结论确认后更新对应 Extractor 文档并删除现场。

本机状态只放在 `~/.codex/state/media-download/`：`profiles/default/` 保存 Chrome Profile，`jobs.sqlite` 保存调度队列，`locks/` 保护 Profile 独占。Skill 目录只保存逻辑、文档和依赖声明；下载结果保存在用户选择的输出目录。
