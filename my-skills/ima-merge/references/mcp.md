# 官方 ima MCP

上游为 `https://ima.qq.com/mcp`。调用 `scripts/ima-mcp.cjs tools` 获取实时工具列表。`mcp-tools.json` 是更新比对基线，功能判定以实时 schema 和测试结果为准。

## 授权与本机运行

本机桥接读取用户已在 WorkBuddy 授权的 ima 连接，进程内解密 AES-256-GCM connector state。每次请求重新读取已有加密状态。凭据通过 stdin 交给 curl，仅发往固定官方 HTTPS endpoint，不跟随重定向、不落明文令牌。

连接自动选择只适用于恰好一个已授权账户；多账户时由用户指定 `IMA_WORKBUDDY_ACCOUNT_DIR`。该值是本机账户目录。401/403 时检查 WorkBuddy ima 连接，必要时请用户重新授权。WorkBuddy 后台负责它自己的令牌更新，本工具读取更新结果。关闭 WorkBuddy 后长期续期的可用性尚待验证。

`ima-mcp.cjs` 导出 `client`、`discover`、`parseHttp`、`tokenFrom`，供包内上传器及现有本机工作流调用。保留 `tools` 和 `call TOOL JSON|- [--allow-write]` 命令。原始 create_media 返回含临时上传信息，统一由高层上传器处理。

## 能力与真实验证

2026-11-18 实测了知识库列表、共享库目录、订阅资料正文、Markdown 文件上传、同名替换和逐篇正文读回。当前 MCP 含九个工具，涵盖 search_knowledge、get_knowledge_base_list、get_knowledge_list、fetch_media_content、get_addable_knowledge_base_list、search_knowledge_base、import_urls、create_media、add_knowledge。

个人笔记与重命名通过 OpenAPI 模块补充。删除能力仍待独立验证，工具列表缺少某项仅证明当前 MCP 未暴露该操作。

## 上传

`ima-upload.cjs --file FILE --kb KB [--folder FOLDER] [--duplicate cancel|replace] --allow-write`。

1. 运行包内 `preflight-check.cjs`，验证文件类型、MIME、图片签名和大小，读取实际文件字节数。
2. 分页列出目标目录核对完整文件名。默认 cancel 返回 `already_exists`，关联已有条目 ID；用户明确要求替换时使用 replace。
3. 调用 MCP create_media，传 `apply_upload_mode=1`。高层函数 `uploadFile` 可通过 `onCreated` 回调把媒体 ID 交给调用者登记，以便处理结果不确定的写入。
4. 根据返回数据选择上传模式。预签名 URL 模式携带服务返回的全部 headers 并核对 Content-Length。STS 模式使用服务返回的 bucket、region、key 和临时凭据构造 COS 签名。仅允许腾讯 COS 的 HTTPS 地址。
5. COS 上传成功后调用 add_knowledge。预签名模式已实测，STS 签名逻辑继承官方实现并做离线验证，实际 STS 分支尚待一次真实上传覆盖。
6. `submitted` 表示已提交，调用者继续 fetch_media_content 或查询解析状态。解析尚未完成可重试读取，写操作须先核验远端状态。Markdown／TXT 可按归一化后的正文逐段比对，二进制格式按目标要求验证解析内容或原文件哈希。

API 返回值分为进程退出、JSON-RPC 错误、isError 和正文内业务 code。均需逐层检查。正文格式可能为 Markdown、文本或 XML，不能固定按 XML 去标签。

## 上游跟踪

`check-upstreams.cjs` 每次读取最新 tools/list，比较工具名称、输入 schema 和描述的规范化哈希。变动保存到本机 `~/.config/ima/ima-merge/upstream-check.json`，与官方 Skill 更新结果合并报告。出现新增、删除、参数变化时先检查兼容性，再调整本地代码和验证记录。
