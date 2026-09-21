# 路线图

## 阶段 1：框架骨架

- 冻结 Registry、Extractor、Manifest、SelectionPolicy、DownloadPlan、Transport、浏览器能力和运行时归属边界。
- 验证默认选择当前音视频合并资源、无当前标记时回退最低合并资源、分离轨道封装兜底和完整有序图片集合。

## 阶段 2：浏览器运行时

- 为每台机器实现一个由所有站点共享的默认持久化 Profile；只在用户明确要求另一套浏览器身份时新增 Profile。
- 用 SQLite 实现持久化 `DownloadJob` 队列、短事务任务领取、状态流转和进程间通信。
- 实现唯一 `BrowserHost`：一次启动 Persistent Context，串行处理多个任务页面，队列排空后关闭浏览器。
- 加入 Profile 文件锁、单一进程所有权、`open_browser / close_browser` 人工处理命令、下载前清晰度选择结果和干净退出。
- 实现不含站点逻辑的共享 `browser-session` 与 `browser-page` Transport 契约。

## 阶段 3：抖音探索

- 已在可抛弃探针现场验证完整作品链接、`blob:` 播放、目标资源绑定和页面媒体请求。
- 已通过媒体检查确认三个目标样本为音视频合并 MP4；另一个当前清晰度样本为显式分离轨道。两类样本分别验证 `browser-page` 与 `browser-session` 流式传输。
- 分享短链在浏览器导航前解析 HTTP 重定向与最终作品 ID，已用 `v.douyin.com` 实际分享链接验证；创作者个人主页点击链路留在后续资格验证。

## 阶段 4：抖音 Extractor

- 已实现作品 ID 与目标 `RENDER_DATA` 对象的绑定，正式下载直接使用目标对象资源，不依赖 NetworkProbe。
- 已实现当前合并资源优先、分离轨道封装兜底、浏览器页/浏览器会话流式写盘、分辨率和轨道验证、来源记录。
- 已固化目标排他匹配、流式传输和 partial 清理测试。

## 阶段 5：无头模式资格验证

- 在相同受控输入和本机默认 Profile 上，对比已确认的可见访问链路与无头模式。
- 通过资源发现、选择、传输、验证、清理和进程归属的等价性验证后，将能力升级为 `headless-verified`。

## 阶段 6：新增站点

- 新站点优先复用现有契约并新增 Extractor 和决策记录。
- 开发期可以使用 `src/dev/network-probe.mjs` 观察和验证站点事实；生产 Extractor 不得导入或接收 Probe。
- 跨站点证据表明抽象缺口时，扩展核心契约。

## 阶段 7：B 站 Extractor

- 已实现标准 BV 视频页匹配，并用目标 BV 号约束页面自身的 `x/player/wbi/playurl` 响应。
- 已处理共享 Context 的站点缓存行为：后续页面不再产生 `playurl` 网络事件时，通过页面会话显式调用公开接口，并按 `p` 绑定目标 CID。
- 已将 DASH 视频轨与音频轨映射为标准 Manifest，由共享 Selector 选择当前清晰度，由共享后处理器无损封装。
- 已为 `browser-session` 增加同一轨道的主地址与备用 CDN 顺序回退，失败地址留下的 partial 会先清理再从头传输。
- 已用 `BV1nLYh6uEH8` 完成端到端验证：最终 MP4 为 `45,138,649` 字节、`640×480`、AV1 + AAC、时长 `1119.643016` 秒，并通过 SHA256 检查。
