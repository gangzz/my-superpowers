# using-superpowers：统一路由 structured-design

## 背景

Codex 全局 `AGENTS.md` 和 Claude Code 全局 `CLAUDE.md` 曾直接包含 `structured-design` 的触发条件与退化规则。这会让每增加一个自动调用 Skill，都需要修改多个平台的全局文件，并可能产生版本漂移。

## 决定

- 从 Codex 和 Claude Code 的全局文件中移除 `structured-design` 专门路由。
- 全局文件只负责在新请求和明显任务转折点加载 `using-superpowers`。
- 由 `using-superpowers` 维护已单独批准自动调用的 Skill 清单和路由条件。
- 将 `structured-design` 记录为已批准自动调用的第一个具体例外。

## structured-design 路由

满足以下条件时直接调用，不再向用户请求确认：

- 任务主要理解成本来自实体关系、流程、状态、层级、依赖、边界或方案取舍；
- `structured-design` 已安装并启用。

以下情况不调用：简单事实、短说明、单步操作、普通进度更新，或用户明确不要图示。

Skill 未安装或未启用时，不得声称已调用；继续正常处理，并使用“先给一屏全景，再分层细化，用少量文字补充目的和边界”的最低退化表达。

## 边界

本次只修改 `my-skills/using-superpowers/` 开发版和全局路由，不自动更新 `published-skills/using-superpowers/`，也不安装、提交或推送。
