# AntV 信息图弱依赖

用户在 2026-11-17 明确要求核对官方 Skill 是否服务有效表达、安装，并让 Structured Design 知晓和按需调用（弱依赖）。消息 Sentinel_260b732b8b8c81919b8d248bcd753d83。

官方 infographic-creator 覆盖清单、步骤、对比、层级、关系和脑图，并可生成 HTML 与 SVG；它不能替代受众、语义和信息取舍判断。本地保留官方语法／模板，补调用边界，修正“只输出语法”和 HTML 交付的冲突；不建立新 MCP 或 Plugin，不绑定本次 ima 内容。

Structured Design 保留自动匹配策略；AntV 只在明确要图或 Structured Design 判断图示有益并转交时允许调用。缺失／失败不阻塞原流程，不自动安装，不反向依赖 Structured Design。用户可要求不要图、只用文字或指定其他引擎。

安装范围沿用仓库的 Codex 与 Claude Code；此次用户已明确要求安装。使用仓库安装器生成 published-skills 并核验，不提交或推送 Git。引擎 CDN 示例需使用时固定版本；此次安装 Skill 不等于离线渲染环境已部署。
