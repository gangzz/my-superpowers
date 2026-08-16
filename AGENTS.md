# my-superpowers 维护规则

本仓库是个人简体中文 Skill 库，不是 Superpowers 的 fork、公开翻译项目或完整 Plugin。维护目标是逐个理解、选择、调整、验证和发布独立 Skill。

## 目录边界

- `upstream/superpowers/`：上游独立仓库，只用于读取、比较和追踪更新，不得写入个人修改。
- `my-skills/<skill-name>/`：个人 Skill 的开发和调试版本。
- `my-skills/decisions/<skill-name>/`：该 Skill 的个人设计决策。
- `published-skills/<skill-name>/`：用户确认发布的稳定版本，不是开发区。

不要把上游仓库整体复制进个人仓库，也不要把个人修改提交到上游。

## 调用策略

- 所有 Skill 默认手工调用。
- 未经用户明确允许，不得自行把 Skill 改为自动调用。
- 建议 Skill 时必须说明当前具体问题、预期收益和主要成本，并等待用户决定。
- 自动调用必须逐个评估，并具有狭窄、可观察的触发条件、明确排除条件、用户控制点和安全回退方式。
- 单个 Skill 的最终调用行为必须写入其 `SKILL.md`；平台支持机器策略时，同时维护对应元数据。
- Codex 的 `agents/openai.yaml` 默认设置：

```yaml
policy:
  allow_implicit_invocation: false
```

只有完成评估并获得用户同意后，才可将特定 Skill 设置为 `true`。

## 维护一个 Skill

1. 读取 `upstream/superpowers/skills/<skill-name>/` 和已有个人版本。
2. 检查 `.source`、对应决策记录和当前发布版本，明确上游变化与个人变化。
3. 先保守翻译和理解，不以“规范化”为理由重写经过验证的行为。
4. 根据用户实际使用问题讨论调整；不要擅自扩大范围或引入 Plugin。
5. 只修改 `my-skills/<skill-name>/`，并保持英文 Skill 名称和目录名、简体中文正文。
6. 将行为决策写入 `my-skills/decisions/<skill-name>/YYYY-MM-DD-<topic>.md`。
7. 更新 `.source`，运行适用的结构检查和行为验证。
8. 展示变更和未解决问题，等待用户明确确认是否发布。

决策记录写入后不得自动执行 Git commit。

## 发布规则

“开发完成”和“确认发布”是两个不同状态。

只有用户明确要求发布时，才可以更新 `published-skills/<skill-name>/`。发布时：

- 先展示开发版与发布版差异。
- 只复制运行所需文件，不复制 `.source` 或 `my-skills/decisions/`。
- 更新 `.release` 中的版本、来源、上游提交、内容摘要、发布时间和目标平台。
- 验证发布目录，而不只验证开发目录。
- 不自动安装、提交 Git、创建标签或推送；这些动作分别需要用户明确授权。

日常安装必须指向 `published-skills/`，不能指向 `my-skills/`。

## 文档职责

- 根目录 `README.md` 面向使用者，说明项目目的、默认原则、结构和入口。
- 本文件面向维护仓库的 Agent，保存可执行的工程规则。
- 每个 `SKILL.md` 只保留运行该 Skill 所需的指令，不在 Skill 目录创建额外 README、安装指南或变更日志。
- 个人修改理由放入对应决策记录，不把过程说明堆进 `SKILL.md`。

如果 README 的概括与单个 Skill 的明确行为不同，以该 Skill 的 `SKILL.md` 和平台元数据为实际行为来源；同时检查这是否是经过记录和授权的例外。

## 内容和交互风格

- 与用户使用简洁的中文沟通，明确区分已完成、未完成和待确认事项。
- 默认使用 Markdown；只有关系或流程确实难以用短文本说明时，才使用表格、文本树或 Mermaid。
- 不主动增加 Visual Companion、第三方服务或其他复杂工具。只有用户明确要求，或静态表达明显不足且用户同意后，才可启用。
- 不为了满足固定数量制造问题、方案、文档或文件。

## Git 边界

- 保留用户已有修改，不清理或覆盖无关文件。
- 上游更新使用 `git -C upstream/superpowers pull --ff-only`。
- 未经用户明确要求，不执行 commit、tag、push、force push 或向外部仓库提交 PR。
- 报告完成时，说明实际验证结果，不把“文件已修改”表述成“Skill 已发布或已安装”。
