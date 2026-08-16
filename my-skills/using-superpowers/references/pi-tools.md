# Pi 工具映射

Skill 使用动作来描述要求（例如“派发子 Agent”“创建待办”“读取文件”）。在 Pi 中，这些动作对应以下工具。

| Skill 要求的动作 | Pi 对应方式 |
|---|---|
| 派发子 Agent（`Subagent (general-purpose):` 模板） | 如果可用，使用已安装的子 Agent 工具，例如 `pi-subagents` 提供的 `subagent` |
| 任务追踪（“创建待办”“标记完成”） | 如果已安装待办或任务工具，使用该工具；否则在计划或 `TODO.md` 中追踪 |

## 子 Agent

Pi 核心不提供标准子 Agent 工具。`pi-subagents` 是功能较完整的可选配套包，提供 `subagent` 工具，支持单 Agent、链式、并行、异步、fork 上下文以及恢复和状态查询。

没有子 Agent 工具时，不要虚构 `Task` 调用；在当前会话中顺序执行，或说明尚未安装该可选能力。

## 任务列表

Pi 核心不提供标准任务列表工具。如果已经安装待办或任务扩展，使用其文档规定的工具；否则使用 Superpowers 计划文件、Markdown 检查清单或仓库内的 `TODO.md`。旧版 Superpowers 文档可能使用 `TodoWrite`，应将其理解为上述任务追踪动作。
