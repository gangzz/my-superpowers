# 原理与授权边界

链路：用户既有 WorkBuddy 授权 → 本机加密 connector state → 进程内解密 → HTTPS 官方 `https://ima.qq.com/mcp` → initialize / initialized / tools。

WorkBuddy 当前保存 Authorization 为 AES-256-GCM 密文；主密钥、本机账户标识及 salt 经 HKDF-SHA256 派生密钥，AAD 绑定账户和 ima 字段。桥接每次请求读取最新密文，在内存中解密，不复制主密钥、不导出令牌、不把明文令牌写入配置、日志或命令参数。curl 配置通过 stdin，固定官方 HTTPS 地址，不跟随重定向。网络错误只返回安全错误类别。

这不是绕过授权，也不增加知识库权限。账户目录自动选择仅在恰好一个 ima 授权账户时生效。加密格式变化会失败关闭，不试其他凭据或账户。

静态分析已核实 WorkBuddy 的个人 ima 令牌由其已登录后端会话获取：`GET /v2/as/connector/oauth/ima/accesstoken`，支持 `force_refresh=1`；个人版主要读取 `access_token`，不能把企业版的 `mcp_token` 推广过来。WorkBuddy 根据 expires_in / expiresIn / expires_at 排期，提前约 300 秒刷新；未知到期时间默认约 20 分钟检查。重新授权经后端 start 流程获得网页授权地址。

本 Skill **不调用这些 WorkBuddy 私有刷新接口、不提取 WorkBuddy 登录凭据、不撤销授权**。它读取 WorkBuddy 更新后的令牌。401/403 时停止，打开 WorkBuddy 确认 ima 连接，必要时在那里重新授权后再试。完全独立于 WorkBuddy 的可持续 OAuth 尚未验证；不能保证关闭 WorkBuddy 后无限期可用。未来客户端或服务协议变化需要重新核验。

实际验证：2026-11-17 initialize、tools/list 及两个订阅库各一篇正文返回成功。没有验证全部媒体类型、长期到期续期、写入或上传；没有逐字对照 ima GUI。当前桥接以每次命令独立初始化，不开放监听端口。
