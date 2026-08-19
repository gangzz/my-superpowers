# 工程系统示例：销售任务到合格联系人

## 使用场景

读者需要先理解总数据结构和总流程，再进入某个模块的详细 Spec。系统包含导入记录、公司处理单元、按次启动的执行批次、联系人事实和人工资格评审。

## 第一层：一屏全景

```mermaid
flowchart LR
    INPUT["销售记录<br/>SalesRow"] --> TASK["销售任务<br/>SalesTask"]
    TASK --> TARGET["公司处理池<br/>CompanyTarget"]
    TARGET --> BATCH["本次执行批次<br/>ExecutionBatch"]
    BATCH --> FACTS["公司及联系人事实<br/>ContactFacts"]
    FACTS --> REVIEW{"人工资格评审"}
    REVIEW --> DELIVERY["合格联系人交付"]

    style INPUT fill:#fff4d6,stroke:#d9a441
    style TASK fill:#e8f1ff,stroke:#7b9acc
    style TARGET fill:#e8f1ff,stroke:#7b9acc
    style BATCH fill:#e8f1ff,stroke:#7b9acc
    style FACTS fill:#e6f5e6,stroke:#7aa67a
    style REVIEW fill:#ffe9c7,stroke:#d98b3a,stroke-width:3px
    style DELIVERY fill:#e6f5e6,stroke:#7aa67a
```

黄色是输入，蓝色是系统处理主线，橙色是必须停下来的人工边界，绿色是稳定事实和交付结果。总览只回答处理范围和交付边界，不展开字段与异常。

## 第二层：核心类图

```mermaid
classDiagram
    class SalesTask {
        +string id
        +TaskStatus status
        +datetime createdAt
        +冻结连续导入形成的销售任务范围
    }

    class SalesRow {
        +string id
        +string companyName
        +string partNumber
        +描述导入文件中的一行原始销售记录
    }

    class CompanyTarget {
        +string id
        +string platform
        +string[] sourceRowIds
        +TargetStage businessStage
        +聚合同一公司的销售记录并承接事实采集结果
    }

    class ExecutionBatch {
        +string id
        +int requestedSize
        +BatchStatus status
        +每次开始时从公司池顺序领取本次处理范围
    }

    class ContactFact {
        +string id
        +string name
        +string email
        +string evidenceUrl
        +保存可追溯的联系人事实
    }

    class QualificationReview {
        +string id
        +ReviewDecision decision
        +string reason
        +记录人工资格判断及理由
    }

    class PlatformAction
    class ImportManifest

    SalesTask "1" *-- "many" SalesRow
    SalesTask "1" *-- "many" CompanyTarget
    SalesTask "1" o-- "many" ExecutionBatch
    ExecutionBatch "1" --> "many" CompanyTarget : claims
    CompanyTarget "1" *-- "many" ContactFact
    ContactFact "1" --> "0..1" QualificationReview
    SalesTask --> ImportManifest
    CompanyTarget --> PlatformAction
```

`CompanyTarget` 是核心聚合：它保留来源记录、冻结平台，并承接从公司身份确认到联系人事实落库的结果。浅层对象只显示名称，让读者知道它们存在；字段与 SQL 表映射放到实现章节。

## 第三层：业务状态

```mermaid
stateDiagram-v2
    [*] --> NotStarted
    state "待处理" as NotStarted
    state "确认平台公司身份" as IdentifyingCompany
    state "获取公司及联系人事实" as AcquiringFacts
    state "联系人事实已准备好" as FactsReady
    state "本公司处理结束但有问题" as EndedWithIssue

    NotStarted --> IdentifyingCompany: 开始处理
    IdentifyingCompany --> IdentifyingCompany: 候选不明确，继续下一页
    IdentifyingCompany --> AcquiringFacts: 已确认对应公司
    IdentifyingCompany --> EndedWithIssue: 无法确认公司
    AcquiringFacts --> FactsReady: 事实已保存
    AcquiringFacts --> EndedWithIssue: 无联系人或采集失败
    FactsReady --> [*]
    EndedWithIssue --> [*]
```

翻页、打开详情和持久化属于系统下一动作，不冒充 `CompanyTarget` 的业务状态；浏览器页签占用则属于资源状态，应另图表达。

## 不推荐的呈现

- 在一张类图中展开所有数据库字段、浏览器页签和错误码。
- 使用 `resolving`、`collecting`、`committed`，却不说明处理对象和业务结果。
- 为减少交叉线，把 `ExecutionBatch` 放到与 `SalesTask` 无关的位置，破坏聚合语义。
