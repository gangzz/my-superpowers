# 业务流程示例：销售线索资格确认与交接

## 使用场景

读者需要理解市场、系统、销售和主管之间怎样交接，哪些结果能自动前进，哪些必须人工判断。

## 第一层：角色分区流程

```mermaid
flowchart LR
    subgraph MARKET["市场"]
        direction TB
        A["提交线索和来源证据"]
    end

    subgraph SYSTEM["系统"]
        direction TB
        B["去重并补全基础资料"]
        C{"证据是否达到自动判定条件？"}
        D["形成待评审线索"]
        E["进入销售队列"]
    end

    subgraph SALES["销售"]
        direction TB
        F{"确认客户适配度"}
        G["接受并制定跟进动作"]
        H["退回并记录原因"]
    end

    subgraph MANAGER["主管"]
        direction TB
        I{"处理规则外争议"}
    end

    A --> B
    B --> C
    C -->|"是"| E
    C -->|"否"| D
    D --> F
    F -->|"合格"| G
    F -->|"不合格"| H
    F -->|"有争议"| I
    I -->|"接受"| G
    I -->|"退回"| H

    style A fill:#fff4d6,stroke:#d9a441
    style B fill:#e8f1ff,stroke:#7b9acc
    style C fill:#f1e8ff,stroke:#9b7bc4
    style D fill:#fff4d6,stroke:#d9a441
    style E fill:#e6f5e6,stroke:#7aa67a
    style F fill:#ffe9c7,stroke:#d98b3a,stroke-width:3px
    style G fill:#e6f5e6,stroke:#7aa67a
    style H fill:#fde8e8,stroke:#c56f6f
    style I fill:#ffe9c7,stroke:#d98b3a,stroke-width:3px
```

分区表达责任边界，箭头表达交付。紫色是规则或模型判断，橙色是人必须承担责任的判断，二者不能用同一种“审核中”状态代替。

## 第二层：线索业务状态

```mermaid
stateDiagram-v2
    [*] --> Submitted
    state "已提交，等待资料处理" as Submitted
    state "资料已准备，等待资格确认" as ReadyForQualification
    state "已接受，等待销售跟进" as Accepted
    state "已退回并记录原因" as Rejected
    state "跟进中" as InFollowUp

    Submitted --> ReadyForQualification: 去重和补全完成
    ReadyForQualification --> Accepted: 自动或人工确认合格
    ReadyForQualification --> Rejected: 确认不合格
    Accepted --> InFollowUp: 销售接受任务
    Rejected --> [*]
    InFollowUp --> [*]
```

“等待谁做什么”写进状态含义；通知、分配队列和提醒属于系统动作，不加入线索的业务生命周期。

## 第三层：核心护栏

| 护栏 | 业务含义 |
|---|---|
| 来源可追溯 | 每条线索保留来源和证据，不只保留整理后的结果 |
| 自动判定可解释 | 只有满足明确条件时才能跳过人工确认 |
| 退回必须有原因 | 不合格不是删除，原因用于后续规则修正 |
| 争议有责任人 | 规则外情况升级给主管，不在多个队列间循环 |

## 不推荐的呈现

- 只画“收集 → 清洗 → 审核 → 分配”，看不出谁负责以及审核对象是什么。
- 把自动规则、人工资格确认和主管争议处理都叫“审核”。
- 用部门组织图替代实际交付流程。
