# lark-card-builder 初始设计决策

## 背景

AI早报曾因飞书卡片所有层级中带 `tag` 的元素和组件总数超过 200 而投递失败。飞铸也需要复用同一套结构化卡片能力，并为后续 CardKit 持续更新保留稳定元素身份。

## 决策

- 开发版本放在 `my-skills/lark-card-builder`；未经明确发布指令，不进入 `published-skills`。
- TypeScript 库 API、`lark-card` CLI 与 Skill 共用同一套 CardSpec 编译器，不维护三套行为。
- 调用者只构建一张逻辑卡片；`compile()` 始终返回 `cards[]`。
- `block` 是不可拆分的语义单元，由编译器按原始顺序自动装箱。
- 递归统计输出 JSON 中所有带 `tag` 的对象；目标预算为 160，硬限制为 200。
- 不提供原始元素透传、任意字段写入或绕过 schema 的入口。
- `cardKey + element key` 确定性生成 `element_id`。v1 生成流式配置与元素索引，但不实现 CardKit 网络客户端。
- `theme` 只映射到 `header.template`；v1 不实现 `template_id + variables` 模板实例化。
- Skill 默认只允许显式调用。
- 项目不负责飞书鉴权、消息发送、失败重试或群聊管理。

## 接口发现

- `SKILL.md` 负责说明何时使用与行为边界。
- `references/api.md` 是面向人和 Agent 的调用入口文档，明确区分 TypeScript API 与 CLI。
- 官方文档快照用于检测规则漂移；漂移只报告，不自动修改编译规则。

## 迁移边界

- 本次只迁移为 `my-superpowers` 中的开发态 Skill。
- 不发布、不安装、不提交、不推送。
- 新位置验证通过后，旧独立仓库移入系统废纸篓，保留可恢复副本。
