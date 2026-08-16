# using-superpowers 初始中文化决策

## 背景

上游 `using-superpowers` 是整套 Superpowers 的入口规则，负责在每次对话开始时检查并调用适用的 Skill。它会直接影响其他 Skill 是否自动介入，也是评估个人调用策略的基础。

## 当前决策

- 保留英文 Skill 名称 `using-superpowers`。
- 对行为主体进行简体中文保守翻译，暂不改变上游规则的含义和强度。
- 原样保留平台工具映射文件，避免在讨论原则之前混入平台适配改造。
- Codex 元数据暂时设置 `allow_implicit_invocation: false`，遵循本项目“默认手工调用、自动调用逐个评估”的项目原则。

## 边界与约束

- 当前版本只用于阅读、讨论和后续调整，不进入 `published-skills/`，也不安装。
- 上游原文仍以 `upstream/superpowers/skills/using-superpowers/` 为准。
- 后续行为调整需要单独讨论并记录，不能把翻译选择误认为已经批准的调用策略。

## 验收标准

- 中文正文忠实呈现上游的强制调用原则、优先级和危险信号。
- `.source` 能定位当前上游提交和原始内容摘要。
- Skill 结构验证通过。
- 未修改发布目录，未提交 Git。
