# Gemini CLI 工具映射

Skill 使用动作来描述要求（例如“派发子 Agent”“创建待办”“读取文件”）。在 Gemini CLI 中，这些动作对应以下工具。

| Skill 要求的动作 | Gemini CLI 对应方式 |
|---|---|
| 读取文件 | `read_file` |
| 一次读取多个文件 | `read_many_files` |
| 创建新文件 | `write_file` |
| 编辑文件 | `replace` |
| 运行 shell 命令 | `run_shell_command` |
| 搜索文件内容 | `grep_search` |
| 按名称查找文件 | `glob` |
| 列出文件和子目录 | `list_directory` |
| 获取 URL | `web_fetch` |
| 搜索网页 | `google_web_search` |
| 调用 Skill | `activate_skill` |
| 派发子 Agent（`Subagent (general-purpose):` 模板） | 使用 `agent_name: "generalist"` 调用 `invoke_agent`，也可通过 `@generalist` 聊天语法调用 |
| 并行派发多个子 Agent | 在同一回复中发出多个 `invoke_agent` 调用 |
| 任务追踪（“创建待办”“标记完成”） | `write_todos`，状态包括 pending、in_progress、completed、cancelled、blocked |

## 指令文件

Skill 提到“你的指令文件”时，在 Gemini CLI 中指 **`GEMINI.md`**。Gemini CLI 分层加载 `GEMINI.md`：全局文件位于 `~/.gemini/GEMINI.md`；项目级文件位于工作区目录及其祖先目录；工具访问子目录文件时，还会加载对应子目录中的 `GEMINI.md`。

## 个人 Skill 目录

用户级 Skill 位于 **`~/.gemini/skills/`**；**`~/.agents/skills/`** 是与 Codex、Copilot CLI 共享的跨运行时别名。同一层级两个目录同时存在时，`.agents/skills/` 优先。每个 Skill 是一个包含 `SKILL.md` 的子目录，其 frontmatter 包含 `name` 和 `description`。

## 子 Agent 支持

Gemini CLI 通过 `invoke_agent` 派发子 Agent，参数包括 `agent_name` 和 `prompt`。同一能力也可以使用聊天快捷语法：输入 `@generalist <prompt>` 等价于以 `agent_name: "generalist"` 调用 `invoke_agent`。内置 Agent 名称包括 `generalist`、`cli_help`、`codebase_investigator`，启用浏览器工具后还包括 `browser_agent`。

Skill 使用 `Subagent (general-purpose):` 派发时，可能引用 prompt 模板文件，也可能直接给出内联 prompt：

| Skill 派发形式 | Gemini CLI 对应方式 |
|---|---|
| 引用 `*-prompt.md` 模板 | 填充模板，然后以 `agent_name: "generalist"` 和完整 prompt 调用 `invoke_agent` |
| 引用 `requesting-code-review` 的 `code-reviewer.md` | 填充评审模板，然后以 `agent_name: "generalist"` 调用 `invoke_agent` |
| 内联 prompt | 直接以 `agent_name: "generalist"` 调用 `invoke_agent` |

### 填充 Prompt

Skill 的 prompt 模板可能包含 `{WHAT_WAS_IMPLEMENTED}` 或 `[FULL TEXT of task]` 等占位符。将所有占位符填完整后，再把完整 prompt 传给 `invoke_agent`。模板本身已经包含 Agent 角色、评审标准和预期输出格式。

### 并行派发

Gemini CLI 支持并行派发子 Agent。在同一回复中发出多个 `invoke_agent` 调用，或在同一 prompt 中使用多个 `@generalist`，即可并行运行相互独立的工作。存在依赖的任务保持顺序执行，不要仅为了让历史记录更简单而串行化独立任务。

## Gemini CLI 特有工具

| 工具 | 用途 |
|---|---|
| `save_memory`（旧版） | 当 `experimental.memoryV2 = false` 时跨会话保存事实 |
| `get_internal_docs` | 查询 Gemini CLI 内置文档 |
| `ask_user` | 向用户提出结构化问题，包括文本、单选和多选 |
| `enter_plan_mode` / `exit_plan_mode` | 进入和退出只读计划模式 |
| `update_topic` | 更新当前对话的主题或战略意图元数据 |
| `complete_task` | 标记 Gemini 子 Agent 已完成，并把结果返回父 Agent |
| `tracker_create_task`、`tracker_update_task`、`tracker_get_task`、`tracker_list_tasks`、`tracker_add_dependency`、`tracker_visualize` | 支持依赖关系和可视化的任务追踪器 |
| `read_mcp_resource`、`list_mcp_resources` | 访问 MCP resource |
