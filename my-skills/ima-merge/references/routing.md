# MCP 优先能力对照（2026-11-17）

| 任务 | 首选 | 本机桥接 |
|---|---|---|
| 自有/共享/加入的订阅库列表 | get_knowledge_base_list | 已支持 |
| 查找知识库、资料搜索、目录 | search_knowledge_base / search_knowledge / get_knowledge_list | 已支持 |
| 读取资料正文 | fetch_media_content | 已支持，已测订阅文章 |
| 列出可写知识库 | get_addable_knowledge_base_list | 已支持；虽注释 readOnlyHint=false，语义是列表 |
| 网页导入、已有媒体入库 | import_urls / add_knowledge | 用户授权后 --allow-write；尚未实写测试 |
| 文件创建与上传 | create_media → COS → add_knowledge | 原生 MCP 支持；本机桥接上传未实现 |
| 个人笔记本、笔记搜索、新建、追加、图片处理 | 现有 ima-skill notes 模块 | 属于已识别的 MCP 缺口；按需加载旧 Skill |

旧 Skill 的知识库搜索、列表、上传、链接收藏与 MCP 重叠，不默认调用。只有实时 schema / 明确验证揭示新增缺口，才具体说明补足点后使用旧模块。Skill 缺失时报告依赖，不联网安装或静默更新。
