# using-git-worktrees：放弃引入

本记录取代 `2026-08-18-conservative-translation.md`。该 Skill 的开发版已删除，不进入 `published-skills/`。

## 背景

`using-git-worktrees` 原本作为 `executing-plans` 依赖链的第一个引入项，开发版已完成保守翻译并通过结构验证。随后复核触发粒度时发现，正文有六处在“该不该做”和“做多少”上没有条件判断：

1. `description` 写“执行实施计划之前”，不区分计划规模。
2. `executing-plans` 第 1 步无条件调用它。
3. 同意问句只讲收益不讲成本，问的是“要不要建”，不是“这次是否划算”。
4. “已有明确偏好时按其执行，不必再问”把一次表态固化成长期默认。
5. 第 2、3 步无条件装全部依赖并跑全套测试。
6. “常见借口”表五行和快速参考表十二行，全部防止省略步骤，没有一行防止在不必要的场合启动整套流程。

## 决定

不引入本 Skill。

理由：它的全部内容都服务于“Agent 自己建立隔离工作区”这一个动作——Step 0 检测、原生工具优先、`.gitignore` 安全检查、沙箱回退都是为此存在。用户明确表示需要隔离时自己创建 worktree，这个动作被收回，Skill 就没有工作可做，剩下的装依赖和跑基线测试两步不需要独立 Skill 承载。

Step 0 的隔离检测（`GIT_DIR` 与 `GIT_COMMON` 比较、子模块保护）是其中唯一有非显然价值的部分，但它同样只在 Agent 打算自行创建工作树时才需要。用户创建并交付工作目录时，Agent 所处位置是明确的。

## 对下游 Skill 的替代规则

引用本 Skill 的下游 Skill 一律把“创建隔离工作区”降级为“确认并询问”，Agent 不代做：

- `executing-plans`：第 1 步改为确认当前分支和工作区状态；不在隔离环境且改动会影响用户当前分支时，停下来询问用户，不自行创建工作树或分支。
- `finishing-a-development-branch`：工作树归用户所有，Agent 一律不执行 `git worktree remove`，只报告工作树位置。上游 Step 6 中判断工作树归属、删除失败后处理未提交文件的整段清理逻辑不引入。
- `subagent-driven-development`、`writing-plans`：引入时按同一原则处理。

## 依赖顺序调整

`executing-plans` 的前置依赖只剩 `finishing-a-development-branch`。批次 1 改为 `finishing-a-development-branch`。

## 重新评估条件

出现以下情况时可重新考虑：

- 实际使用中出现 Agent 在非隔离环境误改用户当前分支，且事前确认不足以防止。
- 引入 `subagent-driven-development` 后，多个子 Agent 确实需要 Agent 自行创建互不冲突的工作区。
