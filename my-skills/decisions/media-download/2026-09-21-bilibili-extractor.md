# B 站公开视频 Extractor

## 决定

- 在 `media-download` 内新增 `bilibili` Extractor，不建立 Plugin，也不拆出另一个下载 Skill。
- 首期只支持用户指定的标准 BV 公共视频页；不顺带扩展短链、番剧、课程、直播或批量入口。
- 生产发现链路优先等待页面自身发出的 `x/player/wbi/playurl` 明确接口响应，并用输入 BV 号校验响应身份；共享 Context 后续页面不再发出该响应时，通过页面会话显式调用公开 `view` 与 `player/playurl` 接口，按 `p` 选择并校验目标 CID。开发期 NetworkProbe 只用于确认接口和 CDN 行为。
- DASH 视频轨与音频轨继续使用既有 `browser-session` Range 传输和无损封装，不引入站点专用下载器。
- 为同一轨道增加有序备用 CDN：主地址失败时清理 partial，从字节 0 使用备用地址重试。
- 标准分享链接清理跟踪参数；多 P 页面只在规范 URL 中保留决定分集的 `p` 参数。
- 保持 `visible-required`。单次无头端到端成功不足以完成既定的无头模式资格验证。

## 原因

B 站当前页面在水合后会清理旧式全局播放数据。首次访问会发出带 BV 号、CID 和 DASH 资源的 `playurl` 请求；同一 Context 的后续任务页面可以播放视频，却可能完全不产生新的 `playurl` 网络事件。响应快路径与公开接口回退都属于明确页面/API 取数，比依赖易消失的全局变量或把 NetworkProbe 带入生产更符合现有 Extractor 边界。DASH 轨道与现有 Manifest、Selector、Transport、Mux、Verifier 契约一致。

## 验证

- 新增 BV 号解析、目标响应绑定、DASH Manifest 和主备 CDN 回退测试。
- 全量测试通过：41 项通过，0 项失败。
- `BV1nLYh6uEH8` 端到端验证通过：最终 MP4 为 `45,138,649` 字节、`640×480`、AV1 + AAC、时长 `1119.643016` 秒，SHA256 为 `0dc3b17c4c175803785b250b39d7fd1af6034cb046c12496045c03d39128a49a`。
- 补充 5 条隔离解析验证全部通过，覆盖带分享参数、横屏、竖屏、多 P 第 2 集和移动端入口。
- 补充 4 条完整下载与封装全部通过；其中用户提供的 `BV1tMtB6bE1J` 分享链接输出 `16,664,463` 字节、`852×480`、AV1 + AAC、时长 `651.274558` 秒，来源记录未包含 `share_source` 或 `vd_source`。
- 共享 Context 连续三任务验证通过：第一条使用页面响应，第二、三条使用显式 API 回退；竖屏和多 P 下载结果与隔离 Profile 验证完全一致。
- 临时媒体、Profile 和探针数据均在验证后删除。

## 发布边界

本次只更新 `my-skills/media-download/` 开发版和个人决策记录。未更新 `published-skills/media-download/`，未修改平台安装入口，未执行 commit、tag 或 push。是否安装由用户查看开发版与当前发布快照差异后另行确认。
