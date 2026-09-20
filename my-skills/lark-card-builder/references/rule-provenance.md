# 规则来源与回归

飞书确定性规则只接受两类来源：

1. `docs/snapshot.json` 中固定的官方文档快照；
2. 脱敏后的真实飞书 API 拒绝结果。

真实错误回归 fixture 至少保存：外层错误码、内部错误码、飞书错误路径、错误消息、最小 CardSpec 和期望本地 issue。不得保存 token、群 ID、用户 ID、日志 ID或业务敏感内容。

新增规则时：

- 先添加会失败的最小回归测试；
- issue 必须有稳定 `code` 和精确 CardSpec `path`；
- 只约束已由来源证明的组合，不从一个错误推广出未经验证的数值；
- 更新 `OFFICIAL_LIMITS` 时同时写入 source 和 rules snapshot；
- 运行 API、包内 CLI、standalone CLI 一致性测试。

`src/rules.ts` 通过 `SEMANTIC_RULES` 公开机器可读来源。CardSpec 自身的互斥输入和安全 URL 策略标记为 `cardspec-contract` 或 `builder-policy`，不得伪装成飞书官方限制。

当前真实回归 `feishu-230099-required-disabled` 只证明：`input` 的 `required=true` 与 `disabled=true` 是非法组合。它不证明 `staticSelect` 或其他组件存在相同规则。

以下组合在官方文档中只被描述为覆盖、失效或生效条件，尚无拒绝证据，因此 Builder 不把它们作为硬错误：

- `staticSelect.required + disabled`；
- `disabledTips` 在未禁用时出现；
- `maxRows` 在未启用 `autoResize` 时出现；
- `initialOption` 与 `initialIndex` 同时出现。

`staticSelect.initialOption` 是选项显示内容，不是回调 `value`；`initialIndex` 是 1-based，`0` 表示不选择。不得再按 `options[].value` 或 0-based 数组索引校验。
