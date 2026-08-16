# Antigravity CLI（`agy`）工具映射

Skill 使用动作来描述要求（例如“派发子 Agent”“创建待办”“读取文件”）。在 Antigravity CLI（`agy`）中，这些动作对应以下工具。

| Skill 要求的动作 | Antigravity CLI 对应方式 |
|---|---|
| 派发子 Agent（`Subagent (general-purpose):` 模板） | 使用内置 `TypeName` 调用 `invoke_subagent`：需要完整能力时使用 `self`，只读研究时使用 `research` |
| 任务追踪（“创建待办”“标记完成”） | 使用**任务 artifact**：调用 `write_to_file`，设置 `IsArtifact: true` 和 `ArtifactType: "task"`（见[任务追踪](#任务追踪)）。不要使用 `manage_task`，它管理的是后台进程。 |

## 任务追踪

Antigravity **没有待办工具**。`manage_task` 管理后台进程，包括 `list`、`kill`、`status` 和 `send_input`，不是检查清单。

当 Skill 要求创建待办列表或追踪任务时，维护一个**任务 artifact**：使用 `write_to_file` 保存 Markdown 检查清单，并设置 `IsArtifact: true`、`ArtifactMetadata.ArtifactType: "task"`；执行过程中使用 `replace_file_content` 或 `multi_replace_file_content` 更新。

开始多步骤任务时，创建任务 artifact 并列出计划中的每一步。完成后将对应项目标记为 `- [x]`；计划变化时同步更新。它是剩余工作的事实来源；对话变长后，在开始每一步前重新读取。
