# 复杂思路示例：自建还是采购客户数据平台

## 使用场景

决策困难不在步骤，而在目标、约束、证据和二阶影响互相牵制。读者需要先看见判断结构，再比较方案。

## 第一层：决策结构

```mermaid
flowchart TD
    GOAL["目标：六个月内形成稳定的客户数据能力"] --> HARD["硬约束"]
    GOAL --> VALUE["长期价值"]
    GOAL --> EVIDENCE["当前证据"]

    HARD --> H1["上线时间"]
    HARD --> H2["隐私与权限"]
    HARD --> H3["可投入团队"]

    VALUE --> V1["差异化能力"]
    VALUE --> V2["长期总成本"]
    VALUE --> V3["数据控制权"]

    EVIDENCE --> E1["真实使用规模"]
    EVIDENCE --> E2["现成产品覆盖率"]
    EVIDENCE --> E3["内部维护能力"]

    H1 --> DECIDE{"选择路径"}
    H2 --> DECIDE
    H3 --> DECIDE
    V1 --> DECIDE
    V2 --> DECIDE
    V3 --> DECIDE
    E1 --> DECIDE
    E2 --> DECIDE
    E3 --> DECIDE

    DECIDE --> BUY["采购为主"]
    DECIDE --> BUILD["自建为主"]
    DECIDE --> HYBRID["采购底座 + 自建差异层"]

    style GOAL fill:#e6f5e6,stroke:#7aa67a
    style HARD fill:#fde8e8,stroke:#c56f6f
    style VALUE fill:#e8f1ff,stroke:#7b9acc
    style EVIDENCE fill:#fff4d6,stroke:#d9a441
    style DECIDE fill:#ffe9c7,stroke:#d98b3a,stroke-width:3px
    style BUY fill:#f1e8ff,stroke:#9b7bc4
    style BUILD fill:#f1e8ff,stroke:#9b7bc4
    style HYBRID fill:#f1e8ff,stroke:#9b7bc4
```

红色是不能靠偏好绕过的硬约束，黄色是仍需验证的证据，蓝色是长期价值。先区分三者，避免把“我更喜欢自建”伪装成业务要求。

## 第二层：方案比较

| 维度 | 采购为主 | 自建为主 | 采购底座 + 自建差异层 |
|---|---|---|---|
| 六个月上线 | 强 | 弱 | 中强 |
| 权限与合规 | 取决于供应商能力 | 可深度控制但建设成本高 | 底座需审查，差异层可控 |
| 初期团队压力 | 低 | 高 | 中 |
| 差异化空间 | 低 | 高 | 中高 |
| 可逆性 | 中，受迁移成本影响 | 低，沉没成本高 | 高，可逐步替换底座 |
| 主要未知 | 真实覆盖率和锁定成本 | 维护能力和交付速度 | 边界设计是否稳定 |

表格展示同一维度下的差异，不提前替读者做价值排序。只有当硬约束和关键未知有足够证据时，才形成推荐。

## 第三层：可能改变结论的问题

1. 现成产品是否覆盖最关键的 80% 业务旅程？
2. 数据能否完整导出，迁移成本是否可控？
3. 内部团队是否能在六个月内持续投入，而非只完成首版？

这些问题比继续增加比较维度更有价值，因为任一答案都可能改变推荐方向。

## 不推荐的呈现

- 先写“自建更灵活”，再寻找支持它的理由。
- 罗列十几个维度但不区分硬约束、价值偏好和未知证据。
- 只比较首年费用，忽略迁移、维护和组织能力的二阶影响。
