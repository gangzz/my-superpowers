# media-download 可移植 ZIP 包

## 决定

- 对外 ZIP 使用单一顶层目录 `media-download/`，不携带 `node_modules`、浏览器缓存、登录 Profile、队列数据库、锁、下载结果或开发现场数据。
- 保留 `package.json` 与 `package-lock.json`，新增 `scripts/setup.mjs` 作为跨机器依赖检查与准备入口。
- 准备脚本要求 Node.js 22+、npm、FFmpeg 与 ffprobe；获得用户许可后，只按锁文件安装 Node 依赖并安装对应 Patchright Chromium，不自动安装系统软件。
- 锁文件使用官方 npm registry URL，避免把个人镜像配置固化到分享包。
- ZIP 安装成功只证明 Codex 能发现 Skill；`setup.mjs --check` 通过才表示本机运行依赖就绪，站点下载仍受网络、登录、CAPTCHA 和站点变化影响。

## 验收

- 压缩包解开后只有一个 `media-download/` 顶层目录，且包内只有一个 `SKILL.md`。
- 解包副本通过 Skill 结构校验；从无 `node_modules` 的状态运行依赖准备后通过全量离线测试与再次复检。
- 分享包不包含用户会话或来源媒体，且满足 OpenAI Skills ZIP 的文件数和体积限制。
