# finishing-a-development-branch：保守翻译与工作树归属

## 背景

放弃引入 `using-git-worktrees` 后，`executing-plans` 只剩这一个前置依赖，因此它成为该依赖链的第一个引入项。

跟踪的上游版本：`upstream/superpowers/skills/finishing-a-development-branch`，commit `b36e082`（该 Skill 最后一次改动即 `b36e082`，2026-08-12）。

## 决定

- 采用保守翻译加最小适配，保留上游主干：验证测试 → 判断环境 → 确定基线分支 → 呈现选项 → 执行选择。
- 保留三选项菜单和分离 HEAD 的两选项菜单，保留菜单原文呈现的要求，保留“整合决定属于用户”的约束。
- 保留丢弃路径必须输入 `discard` 才生效的确认词，不译成中文，避免歧义。
- 保留“常见借口”表，并按本仓库的改动调整其中两行。
- `your human partner` 统一译为“用户”。保留 `Announce at start`，译为“开始时说明”。
- 新增“调用前提”一节，落实手工调用规则，并明确：菜单选项即用户对该选项所含动作的授权；强制推送、删除远端分支、修改他人分支、向外部仓库提 PR 都需要单独明确要求。

## 工作树归属（主要个人改动）

上游 Step 6 承担一整套工作树清理逻辑：判断工作树是否位于 `.worktrees/` 或 `worktrees/`、是否由 Superpowers 创建、执行 `git worktree remove` 和 `git worktree prune`、删除被拒时列出未提交文件并给出三选项。

本仓库不引入这一整节，改为一条固定规则：**工作树由用户或运行环境创建和管理，本 Skill 一律不删除。** 无论用户选择哪个选项，都不执行 `git worktree remove` 或 `git worktree prune`，只汇报工作树位置。

理由：与 `2026-08-19-not-introducing.md` 中放弃 `using-git-worktrees` 的决定一致——创建工作区的动作已经收回给用户，删除动作没有理由留在 Agent 这边。同时这消除了上游最容易出错的一段逻辑（判断归属、处理未提交文件、`--force` 的边界）。

连带改动：

- 丢弃确认文案去掉“删除工作树”，改为说明工作树会保留。
- 快速参考表的“清理工作树”列改为“保留并汇报位置”，四种情况取值相同。
- “常见借口”表中“PR 建好了，工作树是多余的”一行补一句“工作树不归你管，任何情况下都不要删”；删去上游“这个工作树看着没用了，顺手一起清理”和“删除被拒，`--force` 只是完成清理”两行——对应行为已不存在。
- 保留选项 1 中 `cd "$MAIN_ROOT"`，但理由改为“链接工作树中无法检出已被别处占用的分支”，而不是上游的“为工作树删除做准备”。

## 其它个人补充

- 第 1 步新增：项目没有可运行的测试命令时如实说明无法用测试验证，把是否继续交给用户。上游未覆盖无测试项目，而本仓库自身就是这种项目。

## description 写法

本 Skill 的 `description` 只写触发条件加调用策略，不概括流程（上游 `writing-skills` 的实测结论：description 概括工作流会让 Agent 照描述走捷径而不读正文）。

`dispatching-parallel-agents`、`structured-design`、`using-superpowers` 现有的 `description` 仍包含流程概括，尚未统一调整，待用户确认后另行处理。

## 调用方式

- 仅手工调用。
- `agents/openai.yaml` 设置 `allow_implicit_invocation: false`。
- Agent 主动建议时必须说明具体问题、预期收益和主要成本，并等待用户决定。

理由：本 Skill 会执行合并、推送、创建 PR 和删除分支，均为有外部可见后果的动作，误触发代价高。

## 验收

### 应使用

1. 用户显式调用，且一段开发已完成、需要决定改动怎样并回主线。
2. 实施计划全部任务完成并验证通过后的收尾环节。

### 不应使用

1. 实施尚未完成，或测试未通过。
2. 用户只是想看当前分支状态或提交历史。
3. 用户未显式调用，且 Agent 无法说明具体问题与成本收益。

## 发布边界

本次只创建 `my-skills/finishing-a-development-branch/` 开发版，已通过结构验证。是否更新 `published-skills/`、安装、Git commit 与 push 均由用户单独授权。发布后需要把 `.release` 的 `targets` 设为 `codex,claude-code`（发布脚本首次发布默认写入 `codex`）。
