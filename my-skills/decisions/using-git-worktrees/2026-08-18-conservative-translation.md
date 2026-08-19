# using-git-worktrees：保守翻译与调用边界

> 本记录已被 `2026-08-19-not-introducing.md` 取代：该 Skill 决定不引入，开发版已删除。以下内容保留作为判断轨迹。

## 背景

`executing-plans` 第 1 步就要求“确保存在隔离工作区”，而本仓库尚未引入任何工作区相关 Skill。依赖排序结果显示 `using-git-worktrees` 是零依赖叶子节点，因此作为 `executing-plans` 依赖链的第一个引入项。

跟踪的上游版本：`upstream/superpowers/skills/using-git-worktrees`，commit `b36e082`（该 Skill 最后一次改动为 `bc86802`）。

## 决定

- 采用保守翻译加最小适配，保留上游的三段式结构：先检测已有隔离，再用原生工具，最后才回退到 git worktree。
- Skill 名称和目录名保持英文，正文使用简体中文；命令、路径、分支名、工具名保留英文。
- 上游的 `your human partner` 统一译为“用户”，与 `brainstorming`、`dispatching-parallel-agents` 的既有译法一致。
- 保留上游的 `Announce at start`，译为“开始时说明”。本仓库前三个 Skill 的上游原文都没有这一行，这是首次出现；保留它是为了在手工调用时让用户看到当前确实进入了本 Skill。
- 保留 Step 0 的子模块保护、`.gitignore` 安全检查、沙箱回退、快速参考表和“常见借口”表，这些都是已验证的行为内容，不做结构重写。
- 原生工具部分保持平台中立：给出 `EnterWorktree`、`WorktreeCreate`、`/worktree`、`--worktree` 这类名称示例，并指向“当前运行环境对应的平台参考”，不在本 Skill 内复制各平台工具清单，避免与 `my-skills/using-superpowers/references/` 双份维护。
- 新增“调用前提”一节，落实仓库的手工调用规则，并明确本 Skill 会创建分支目录、安装依赖和运行测试，未获同意不得执行。

## 个人补充

- 第 3 步新增一句：项目没有可运行的测试命令时，如实说明没有基线可验证，不得把“没有测试”表述成“测试通过”。上游未覆盖无测试项目的情况，而本仓库本身就是这种项目；这条同时对应仓库“报告完成时说明实际验证结果”的要求。

## 调用方式

- 仅手工调用。
- `agents/openai.yaml` 设置 `allow_implicit_invocation: false`。
- `description` 明确写出“仅在用户显式调用，或 Agent 说明理由且用户明确同意后使用”。
- Agent 主动建议时必须说明具体问题、预期收益和主要成本，并等待用户决定。

理由：建立工作树会创建分支、目录并安装依赖，属于有副作用的动作，误触发的代价大于漏触发。

## 未采纳

- 未加入 pnpm、uv、bun 等本机常用包管理器的安装分支。上游列表已覆盖主流生态，扩充会让后续跟随上游更新时难以比对；确有需要时另开决策记录。
- 未把“合并后清理工作树”写进本 Skill，该行为属于 `finishing-a-development-branch`。

## 验收

### 应使用

1. 用户显式调用，且即将在当前仓库开始一段需要与主分支隔离的实施工作。
2. 执行实施计划前需要确认当前是否已处于隔离工作区。

### 不应使用

1. 只读分析、问答或单文件小改动。
2. 用户已明确表示就地工作、不要建工作树。
3. 用户未显式调用，且 Agent 无法说明具体问题与成本收益。

## 发布边界

本次只创建 `my-skills/using-git-worktrees/` 开发版，已通过结构验证。是否更新 `published-skills/`、安装、Git commit 与 push 均由用户单独授权。发布后需要把 `.release` 的 `targets` 设为 `codex,claude-code`（发布脚本首次发布默认写入 `codex`）。
