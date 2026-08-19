# dispatching-parallel-agents：保守翻译与调用边界

## 背景

上游 `dispatching-parallel-agents` 是一份已经过验证的行为型 Skill：识别独立问题域、构造聚焦的子 Agent 任务、在同一轮内并发派发、回收后核对冲突并跑完整验证。本仓库只做个人使用，需要中文正文、克制的调用方式，并避免与 `using-superpowers` 的平台参考重复。

跟踪的上游版本：`upstream/superpowers/skills/dispatching-parallel-agents`，commit `b36e082`（该 Skill 最后一次改动为 `6dbbbda`）。

## 决定

- 采用保守翻译加最小适配，不重写上游结构，也不因“规范化”调整已验证的行为内容。
- Skill 名称、目录名保持英文；正文使用简体中文；示例中的测试名、文件名、代码标识符保留英文。
- 将上游的 Graphviz `dot` 判断图改写为等价的 Mermaid 流程图，与本库其它 Skill 的表达方式一致。
- 派发措辞保持平台中立（“同一轮中发出全部派发调用即并发”），不写死某个平台的工具名称；平台差异指向当前运行环境对应的平台参考，由 `using-superpowers` 按需读取。
- 保留上游的“实际案例”一节并精简为中文，保留其判断示范价值。
- 新增一节“调用前提”，落实仓库的手工调用规则。

## 调用方式

- 仅手工调用。
- `agents/openai.yaml` 设置 `allow_implicit_invocation: false`。
- Claude Code 侧不依赖 `description` 自动匹配：`description` 明确写出“仅在用户显式调用，或 Agent 说明理由且用户明确同意后使用”。
- Agent 主动建议时必须说明具体问题、预期收益和主要成本，并等待用户决定。

理由：并行派发的成本（上下文构造、写冲突、结果核对、token）明显高于普通串行处理，误触发的代价大于漏触发。

## 未采纳

- 未加入并行成本判断、worktree 写冲突隔离、“不轻信子 Agent 报告”等个人补充章节。用户本次选择保守翻译；这些内容若确有需要，另开决策记录再加，以免后续跟随上游更新时难以比对。
- 未在本 Skill 内复制 Codex 的 `multi_agent`、`spawn_agent`、`wait_agent` 说明，避免与 `my-skills/using-superpowers/references/codex-tools.md` 双份维护。

## 验收

### 应使用

1. 用户显式调用，且存在 3 个以上根因不同、互不相关的测试文件失败。
2. 多个子系统各自独立损坏，彼此不共享状态和文件。

### 不应使用

1. 各个失败可能同源，修好一个会连带修好其它。
2. 还不知道坏在哪里的探索式调试。
3. 多个任务会编辑同一批文件或占用同一资源。
4. 用户未显式调用，且 Agent 无法说明具体问题与成本收益。

## 发布边界

本次只创建 `my-skills/dispatching-parallel-agents/` 开发版。是否更新 `published-skills/`、安装、Git commit 与 push 均由用户单独授权。发布后需要把 `.release` 的 `targets` 设为 `codex,claude-code`（发布脚本首次发布默认写入 `codex`）。
