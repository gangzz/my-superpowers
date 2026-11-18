# X 公开单视频下载

用户要求把本次 X 视频下载方法并入 media-download，随后明确确认现在安装。

## 实现

新增 no-browser 的 X Extractor，通过已安装 yt-dlp 发现公开 MP4，接入现有 Registry、Manifest、Selector、DownloadPlan、Verifier、队列和 schema v2 来源记录。新增 NodeHttpTransport 复用既有有界 Range 流实现并提供空 Cookie 源，避免复制传输逻辑。yt-dlp 忽略用户配置，设定进程超时和输出上限，失败输出脱敏。

推文 ID 与媒体 ID 分开，资源身份对齐使用推文 URL 的 status ID。筛选 video.twimg.com 的 HTTPS 合并 MP4。沿用共享默认清晰度策略，缺少当前标记时选择最低合并资源；程序化 expectedVideo 支持精确尺寸。

X 评论、需登录作品、图文、多视频和 HLS-only 尚无交付能力。系统额外依赖 yt-dlp，仅在 --check-x 时检查，不扩大原有抖音和 B 站的依赖要求。

## 验证

- 67 项 Node 测试通过，包含 6 项新增 X/HTTP 回归测试。
- Skill 结构验证、--check-x、git diff --check 通过。系统 Python 缺少 PyYAML，复用仓库 uv --with pyyaml 验证路径通过。
- 公开样本 https://x.com/czzzzzzj_/status/2122267555133821359 走默认正式队列，任务 15953c57-c607-4670-a452-33d4b5136052 succeeded，454×270、521.6 秒、7529285 字节、H.264/AAC，SHA256 读回一致，FFmpeg 全片解码通过。
- 同样本指定 1820×1080，任务 58910683-9940-4b3f-851f-31ae1fe2793c succeeded，137445300 字节，SHA256 为 8f71821facea85100d17a66aa9a680b17ca52be6db6b7a4e13df50f95c7a2cb1，与此前完整解码验证的手工下载文件一致。
- 测试媒体放临时目录，正常队列记录保存在技能标准状态目录。没有改动个人定位项目中的已交付视频。

安装使用仓库 skill:install 入口，安装后再次检查发布目录与实机链路。其他 X 样本和后续 yt-dlp 版本兼容性按实际任务继续验证。
