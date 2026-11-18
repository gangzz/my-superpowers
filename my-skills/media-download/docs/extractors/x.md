# X（Twitter）Extractor

## 范围与运行

接受 x.com、www.x.com、twitter.com、www.twitter.com、mobile.twitter.com 的单推文 status URL，以及 i/web/status URL。移除查询参数和 `/video/1` 后缀。作者 ID 大小写沿用平台响应，作品 ID 始终取推文 status ID；yt-dlp 的顶层 `id` 可以是独立媒体 ID。

执行 `node scripts/setup.mjs --check-x` 检查额外的 yt-dlp 命令依赖。setup 不自动安装或更新该系统工具。发布快照仍携带原有 Node 依赖。

## 执行与选择

`x` 声明 `no-browser`。通过 execFile 参数数组调用 `yt-dlp --ignore-config --skip-download --dump-single-json --no-playlist`，限制进程时间、网络超时和 JSON 大小。它只发现资源，由共享 Selector、NodeHttpTransport、媒体校验及来源记录写入器完成交付。无需 Cookie 或浏览器。生产链路不使用 NetworkProbe。

只接受目标推文的 HTTPS video.twimg.com 合并 MP4 候选，排除 HLS 和明确缺音轨/视频轨的格式。平台对 HTTP MP4 未给 codec 时，仍需最终 ffprobe 确认两种轨道。响应网页 URL 必须与目标推文 ID 一致。多媒体 playlist 以 unsupported_content 结束。

沿用共享默认策略。由于没有当前播放器标记，选择最低合并资源；调用者可通过程序化 Job 的 expectedVideo 限定精确尺寸，匹配失败返回 quality_not_applied。Extractor 不把最高清晰度伪装成当前资源。来源记录 schema v2 保持原有字段，记录规范推文 ID、作者、发布内容及验证属性。临时 CDN 地址、请求头、原始 yt-dlp JSON 不写入来源记录或 SQLite。

## 失败与边界

缺少 yt-dlp 返回 dependency_missing；执行失败返回脱敏的 x_extraction_failed；JSON 损坏返回 x_response_invalid；作品 ID 不符返回 content_identity_mismatch。错误不自动归因登录或验证码。受限作品、图文、多视频、直播、HLS-only 暂无交付能力，X 评论返回 unsupported_site。

## 验证

2026-11-18 使用公开推文 `https://x.com/czzzzzzj_/status/2122267555133821359`。前期人工链路已取得 1820×1080、521.6 秒、137445300 字节的 H.264/AAC MP4，完整 FFmpeg 解码通过。正式接入的自动化测试覆盖 URL 匹配、推文与媒体 ID 区分、候选过滤、精确尺寸、错误脱敏、HTTP 流传输及失败清理。正式队列入口实机验收通过。默认选择得到 454×270、521.6 秒、7529285 字节文件；指定 expectedVideo={width:1820,height:1080} 得到 137445300 字节文件，SHA256 与此前人工下载一致。两次任务均 succeeded，音轨、时长及来源记录哈希读回检查通过；270p 完整 FFmpeg 解码通过。

其他公开样本、需登录作品和 yt-dlp 后续版本兼容性仍需按实际任务验证。
