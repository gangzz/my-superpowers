---
name: lark-card-builder
description: "构建、校验并自动分片飞书 Card JSON 2.0。适用于新建或修复交互卡片、处理 CardSpec，以及在 TypeScript 项目中使用或升级 lark-card-builder；不负责发送消息、重试投递或管理群聊。"
---

# 飞书卡片 Builder

这个 Skill 自带 CardSpec 编译器，不依赖系统预装 `lark-card`。它是官方 Card JSON 2.0 的受支持子集编译器，不是全部飞书组件的替代 DSL。所有方式最终都调用同一套实现：

- 在 TypeScript 项目中长期集成时，安装当前 Skill 随附的 `packages/lark-card-builder.tgz`，再使用库 API。
- Agent 临时生成、校验卡片或非 TypeScript 脚本调用时，运行 Skill 内置的 `scripts/lark-card.mjs`。
- 两种方式都只生成官方 Card JSON 2.0，不发送飞书消息。

需要选择入口或查看调用示例时，读取 [references/api.md](references/api.md)。

## 工作流程

1. 以当前加载的 `SKILL.md` 所在目录作为 Skill 根目录；不要假设用户名、磁盘位置或固定相对层级。
2. 确认调用者需要 TypeScript API 还是内置 CLI；不要把 Skill 本身当成第三套运行时。
3. 每次为项目内 TypeScript API 工作时，在本次任务第一次编译前运行一次 `check-project`。它只比较当前 Skill 随附包与项目已安装包的本地版本，不访问网络。按结果处理：
   - `current`：继续工作。
   - `missing` 或 `update_available`：向用户显示结果提供的安装命令；只有当前任务已授权修改项目依赖时才执行。
   - `newer` 或 `unknown`：不要降级或覆盖，明确报告版本差异。
4. 纯 CLI 生成、校验或修复 CardSpec 时不检查项目依赖版本。
5. 将内容组织成一张逻辑卡片。使用 `block` 表达不可拆分的语义单元，不手工指定第几张物理卡片。
6. 编译器递归统计所有带 `tag` 的元素和组件，按 160 的目标预算自动装箱，并保证不超过飞书 200 的硬限制。
7. 处理结构化结果：成功时读取 `cards[]`、`elementIndex`、`builderVersion`、`rulesSnapshot`、`specDigest` 和 `bundleDigest`；失败时读取 `issues[]`，不要继续发送。
8. 卡片发送、CardKit 更新和投递重试交给调用项目负责。

编写或修复 CardSpec 时，通过内置 CLI 的 `schema --pretty` 查看权威输入 schema，通过 `capabilities --pretty` 查看 CardSpec kind、官方 tag 映射、完整支持状态和硬限制；具体命令见调用入口文档。

- 判断组件是否已覆盖时，读取 [references/support-matrix.md](references/support-matrix.md)。
- 调用项目发送多张卡片时，读取 [references/delivery-integration.md](references/delivery-integration.md)。
- 新增或修改确定性规则时，读取 [references/rule-provenance.md](references/rule-provenance.md)。

## 不变量

- `cardKey` 只用于生成稳定 `element_id`，不进入飞书 JSON。
- `theme("blue")` 编译为 `header.template: "blue"`，不是飞书模板实例化。
- 带 `.key(...)` 的元素进入 `elementIndex`；同时标记 `.streamTarget()` 时，索引中的 `streamable` 为 `true`。
- 公共结构会复制到每张物理卡片，并计入组件预算。
- 官方 200 组件上限不可由调用方放宽；`targetBudget` 只能取 1–200。
- `block` 不拆分；单个 block 加公共结构超过 200 时必须返回精确路径的问题。
- 不提供 `rawElement()`、任意字段写入或官方 JSON 透传。
- Builder 未覆盖的官方 Card JSON 2.0 能力可由调用项目直接使用，但不享受本编译器的校验、摘要和自动分片保证。
- `docs check` 只报告官方文档漂移，不自动改写本地规则。
- 未经官方快照或真实脱敏错误证明的字段组合，不得升级为本地硬错误；“不生效”不等于“非法”。
- `compile()` 及 Builder 不访问文件系统或网络，也不打印版本提醒；版本检查只由 Skill 内置 CLI 的显式 `check-project` 执行。
