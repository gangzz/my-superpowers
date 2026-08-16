# Hermes Agent 工具映射

Skill 使用动作来描述要求（例如“派发子 Agent”“创建待办”“读取文件”）。在 Hermes Agent 中，这些动作对应以下工具。

## 工具

| Skill 要求的动作 | Hermes 工具 |
|---|---|
| 读取文件 | `read_file` |
| 创建新文件 | `write_file` |
| 定点编辑文件 | `patch` |
| 运行 shell 命令 | `terminal` |
| 搜索文件内容 | `search_files` |
| 按名称查找文件 | 使用 `terminal` 执行 `find` |
| 获取 URL 或读取网页 | `web_extract(urls=[...])` |
| 搜索网页 | `web_search(query=...)` |
| 派发子 Agent | `delegate_task(goal=..., context=..., toolsets=[...], role="leaf")` |
| 任务追踪 | `todo` 工具 |
| 调用 Skill | `skill_view("skill-name")` |

## 指令文件

Skill 提到“你的指令文件”时，在 Hermes Agent 中指项目目录下的 **`AGENTS.md`**，或全局的 **`~/.hermes/SOUL.md`**。

## 调用 Skill

Hermes Agent 提供包含 `skill_view` 和 `skills_list` 的 `skills` 工具集。调用 Superpowers Skill 时使用：

```text
skill_view("brainstorming")
skill_view("test-driven-development")
```

如果 `skill_view` 找不到 Superpowers Skill（Plugin 完成注册前可能不会出现在目录中），退化为直接读取 `SKILL.md`：

```text
read_file(path="~/.hermes/plugins/superpowers/skills/<skill-name>/SKILL.md")
```

这与没有原生 Skill 加载能力的其他运行环境使用同一机制。

## 派发子 Agent

使用 `delegate_task` 创建隔离的子 Agent，处理并行或顺序工作流：

```text
delegate_task(goal="...", context="...", toolsets=[...], role="leaf")
```

如果 `delegate_task` 不可用，就在当前会话中完成工作，不要虚构工具调用。

## 任务追踪

在单次会话中使用 `todo` 工具追踪任务。多 Agent 任务看板可以使用 `hermes kanban` CLI（如果可用）。旧版文档中的 `TodoWrite` 表示上述任务追踪动作。
