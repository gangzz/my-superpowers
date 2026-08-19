# test-driven-development：保守翻译与适用范围闸门

## 背景

上游 320 行 SKILL.md 加一个支持文件 `writing-good-tests.md`（199 行）。跟踪版本：`upstream/superpowers/skills/test-driven-development`，仓库 commit `b36e082`（该 Skill 最后一次改动为 `b9e75dd`，2026-07-23）。

## 决定

- 保守全文翻译两个文件，保留上游全部章节：铁律、红-绿-重构循环、Verify RED/GREEN 强制步骤、好测试标准、自我合理化表、危险信号表、检查清单、卡住对策、调试衔接、最终规则。
- 核心载荷原样保留：先写代码就删掉重来（不留参考、不改造、不看）；Verify RED 必须亲眼看到测试以正确原因失败（直接通过 = 在测已有行为，测试写错了）。
- 代码示例保持 TypeScript 原文，只译说明文字；`<Good>`/`<Bad>` 标签和 dot 流程图结构保留，图内标签译为中文。
- `your human partner` 统一译为“用户”。
- `writing-good-tests.md` 中对 `superpowers:writing-skills` 的引用保留原文（指向上游生态的说明，本仓库未引入该 Skill）。
- `description` 只写触发条件加调用策略，不概括流程。

## 适用范围闸门（主要个人改动，用户指定）

上游假定项目永远有测试基础设施，没有开关。本仓库在“调用前提”新增适用范围检查：

**本 Skill 只在有可运行测试框架的项目中生效。开始前确认测试命令存在；没有测试基础设施的项目（如本 Skill 库、Obsidian 配置）中如实说明不适用，是否搭建测试基础设施由用户决定。**

理由（用户提出）：在没有测试的项目里，TDD 铁律会空转，而空转的铁律会训练出“这条规则可以不算数”的习惯，反而削弱其它铁律。铁律只在它能被执行的地方才是铁律。

## 调用方式

- 仅手工调用。
- `agents/openai.yaml` 设置 `allow_implicit_invocation: false`。
- Agent 主动建议时必须说明具体问题、预期收益和主要成本，并等待用户决定。

## 验收

### 应使用

1. 用户显式调用，且项目有可运行的测试框架，任务是新功能、Bug 修复、重构或行为变更。

### 不应使用

1. 项目没有测试基础设施（先如实说明，交用户决定）。
2. 一次性原型、生成代码、配置文件（上游例外，需询问用户）。
3. 用户未显式调用，且 Agent 无法说明具体问题与成本收益。

## 发布边界

本次只创建 `my-skills/test-driven-development/` 开发版。是否更新 `published-skills/`、安装、Git commit 与 push 均由用户单独授权。发布后需将 `.release` 的 `targets` 设为 `codex,claude-code`。
