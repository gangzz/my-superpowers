# Codex 工具映射

以下内容只在已经选定的下游 Skill 确实需要相应 Codex 能力时读取。实际工具列表、工具 schema 和更高优先级指令优先于本文。

## 派发子 Agent 需要多 Agent 支持

在 Codex 配置文件（`~/.codex/config.toml`）中添加：

```toml
[features]
multi_agent = true
```

这样可以启用 `dispatching-parallel-agents`、`subagent-driven-development` 等 Skill 使用的多 Agent 工具。实际获得哪些工具取决于当前模型预设选择的多 Agent 版本；当任何表格与实际工具列表不一致时，以实际工具列表为准。

- **生成子 Agent：** 使用 `spawn_agent`。需要干净上下文时设置 `fork_turns: "none"`；默认的 `"all"` 会复制完整对话。Codex 0.145 及以后版本中，`~/.codex/agents/` 下的角色文件可通过 `agent_type` 附加到隔离 fork。模型、推理强度和 `agent_type` 是否允许覆盖，以当前 `spawn_agent` schema 为准。
- **修正轮次：** 使用 `followup_task` 让原实施 Agent 继续工作。它会发送消息并触发新一轮，即使运行环境曾回收该子 Agent，也能透明恢复。不要仅因为认为无法再次联系已生成的 Agent，就重新派发一个实施 Agent。
- **生命周期：** 不要虚构不存在的关闭工具。当前版本如果没有 `close_agent`，完成的子 Agent 会在需要槽位时自动回收；只有实际工具列表提供 `close_agent` 时才使用。
- **模型名称：** 不要把 Skill、表格或旧会话中的模型名称直接复制到 `spawn_agent`。先检查当前允许的模型列表，否则调用可能直接失败。

## 等待子 Agent

`wait_agent` 是事件订阅，不是轮询。长等待会在子 Agent 产生消息时立即唤醒，与短等待的响应延迟相同；短超时轮询只会增加工具调用和上下文成本。

- 仍有本地工作时不要等待。子 Agent 的最终结果会进入邮箱，并在控制 Agent 的下一轮显示。
- 确实无事可做且仍有子 Agent 运行时，使用有边界的较长等待，例如 `timeout_ms` 为 `300000–600000`（5–10 分钟）。唤醒或超时后，发送一条简短状态更新并检查 Agent 状态。
- 完成消息本身不能唤醒空闲控制 Agent；`wait_agent` 的作用就是覆盖这段空闲窗口。长等待超时且没有活动时，应核对状态，而不是缩短下一次等待时间。

## 子 Agent 的模型路由

只有当前工具 schema 允许并且正在执行的 Skill 明确要求时，才为 `spawn_agent` 设置 `model` 和 `reasoning_effort`。如果设置模型，应同时明确推理强度，避免子 Agent 静默回到该模型的默认强度。

可以请用户在 `~/.codex/config.toml` 中设置机器级兜底，让遗漏显式路由的子 Agent 使用经过选择的档位：

```toml
[agents]
default_subagent_model = "<当前允许列表中的中档模型>"
default_subagent_reasoning_effort = "medium"
```

## 环境检测

创建工作树或收尾分支的 Skill 应先使用只读 Git 命令检测环境：

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
BRANCH=$(git branch --show-current)
```

- `GIT_DIR != GIT_COMMON`：当前已经位于 linked worktree，应跳过创建。
- `BRANCH` 为空：当前是 detached HEAD，无法从该沙箱直接创建分支、推送或 PR。

具体处理方式见 `using-git-worktrees` 的 Step 0 和 `finishing-a-development-branch` 的 Step 1。

## Codex App 中的分支收尾

如果外部管理的 worktree 处于 detached HEAD，导致沙箱阻止分支或推送操作，Agent 应完成仍被授权的本地工作，并通知用户使用 App 原生入口：

- **Create branch：** 命名分支，然后通过 App UI 完成提交、推送或 PR。
- **Hand off to local：** 将工作移交到用户的本地 checkout。

Agent 仍可运行测试、暂存被授权的文件，并提供建议的分支名、commit message 和 PR 描述供用户复制；是否允许提交仍以用户指令为准。
