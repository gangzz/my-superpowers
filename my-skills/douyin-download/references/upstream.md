# 上游选型与版本

核验日期：2026-09-09。通过 GitHub API 读取维护记录，源码从官方仓库克隆。没有使用第三方下载二进制。

| 候选 | 当时证据 | 选择 |
|---|---|---|
| [jiji262/douyin-downloader](https://github.com/jiji262/douyin-downloader) | 未归档；2026-09-06 提交修复 msToken 配置回退；MIT；独立 Python 下载器 | 首选，适合窄范围脚本封装 |
| [JoeanAmier/TikTokDownloader](https://github.com/JoeanAmier/TikTokDownloader) | 未归档；2026-09-07 修复 params，09-08 文档更新；最新 release 5.7 发布于 2025-08-19；GPL-3.0 | 维护活跃，备选，不能因 release 较旧判为失修 |
| [Johnserf-Seed/f2](https://github.com/Johnserf-Seed/f2) | 最近获取到的提交是 2025-10-12 文档更新；最新 release v0.0.1.7 为 2024-12-31；抖音 403 issue 在 2026-09-06 仍有更新 | 当前不优先；repo 概况 API 本次未成功返回，不猜归档状态 |

固定源码提交：`1f540317aa09338e1c33abdd6099c53c1918caf5`。

[提交记录](https://github.com/jiji262/douyin-downloader/commit/1f540317aa09338e1c33abdd6099c53c1918caf5)。桌面版 release 与 CLI 源码不是同一个交付物；本 Skill 不依赖桌面邀请码或桌面安装包。

本次有针对性检查：依赖文件、Cookie 获取与持久化、CLI 返回语义、单视频 API／下载器、配置默认值、日志输出、msToken 请求来源。不是完整安全审计。

上游单视频路径向抖音及媒体 CDN 发请求；msToken 可读取 F2 的公开配置并请求字节 mssdk，存在内置配置回退。该路径未发现依赖付费第三方解析 API。维护活跃和源码可审查不证明登录校验可以省略，也不保证所有视频都能下载。

包装层保留上游源码，不打补丁；通过固定 API 做单视频下载，用内存 Cookie 对象避免上游默认 Cookie 落盘，用临时目录隔离附加状态。关闭浏览器回退、通知和云端转写。依赖版本见 requirements.lock.txt；版本锁没有替代软件供应链审计。

上游许可证副本：[UPSTREAM-LICENSE.txt](UPSTREAM-LICENSE.txt)。完整 checkout 中继续保留各文件署名与许可。

运行依赖按纯下载路径收窄：不安装 `imageio-ffmpeg`（上游仅在音频抽取时延迟导入），直接使用用户已有 ffprobe 验证媒体。ASR／音频抽取不在本 Skill 中，未启用。依赖锁在 macOS Apple Silicon、Python 3.14 环境安装验证；其他环境需重新检验兼容性。
