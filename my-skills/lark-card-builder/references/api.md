# lark-card-builder 调用入口

`lark-card-builder` 只有一套编译逻辑，但提供两种调用方式：

```text
TypeScript 项目 ──库 API────────┐
                                ├─> CardSpec 编译器 ─> cards[]
Agent / 脚本 ──Skill 内置 CLI───┘
```

| 场景 | 入口 |
|---|---|
| 飞铸等 TypeScript 项目长期集成 | TypeScript API |
| Agent 临时生成、修复或校验卡片 | Skill 内置 CLI |
| 非 TypeScript 程序调用 | CLI + CardSpec JSON |

Skill 负责告诉 Agent 何时使用、遵守什么边界；真正执行编译的是库 API 或内置 CLI。两条路径共享 schema、组件映射、计数和分片算法。

## 路径规则

先将当前加载的 `SKILL.md` 所在目录解析为 Skill 根目录，以下记为 `LARK_CARD_BUILDER_DIR`。这个名称只表示本次运行解析出的实际目录，不是固定系统变量。

- 不要写死用户名、磁盘、仓库位置或 `my-skills` / `published-skills` 层级。
- 不要假设目标项目与 Skill 之间存在固定相对路径。
- 不要直接把 Skill 目录交给 `pnpm add` 或 `npm install`；本地目录会被记录为 `link:` / `file:` 依赖，并绕过包依赖安装。
- 需要把依赖提交到项目并跨电脑复现时，使用用户发布的 GitHub Release 包；不要提交指向本机目录的依赖。正式发布地址尚未确定时，不要猜测 URL。

## TypeScript API

每次本 Skill 为某个项目处理 TypeScript API 集成时，先在该项目目录执行一次纯本地检查：

```bash
node "$LARK_CARD_BUILDER_DIR/scripts/lark-card.mjs" check-project --project "$PWD" --pretty
```

该命令只读取当前 Skill 随附包版本与项目 `node_modules/lark-card-builder/package.json`，不访问网络、不修改项目。若需要安装或升级，结构化结果会给出适合当前包管理器的本地归档命令。

本地开发或验证时，安装 Skill 随附的 npm 包归档：

```bash
pnpm add "$LARK_CARD_BUILDER_DIR/packages/lark-card-builder.tgz"
```

这个归档是 TypeScript API 的安装单元，包含编译产物并声明运行依赖。GitHub 正式分发时使用同一归档作为版本化 Release 产物。

调用示例：

```ts
import {
  BUILDER_VERSION,
  block,
  button,
  card,
  header,
  markdown,
} from "lark-card-builder";

const result = card()
  .cardKey("ai-morning-brief")
  .header(header("AI早报").theme("blue"))
  .add(
    block()
      .add(markdown().bold("标题").lineBreak().text("摘要"))
      .add(button("查看原文").openUrl("https://example.com")),
  )
  .compile();

if (!result.ok) {
  throw new Error(JSON.stringify(result.issues));
}

for (const part of result.cards) {
  console.log(
    BUILDER_VERSION,
    result.builderVersion,
    result.specDigest,
    result.bundleDigest,
    part.componentCount,
    part.serializedBytes,
    part.cardDigest,
    part.card,
  );
}
```

`BUILDER_VERSION` 和 `result.builderVersion` 公开实际编译器版本。`compile()` 不读取 Skill、项目目录或网络，也不发送消息；调用项目负责把 `part.card` 交给已授权的飞书传输层。

公开编译选项只有：

```ts
{
  targetBudget?: number; // 1–200，默认 160
  consumerLimits?: {
    maxCardBytes?: number; // 调用方更严格的单卡 UTF-8 字节限制
    maxCallbackBytes?: number; // 调用方更严格的单个 callback value 限制
  };
}
```

官方 200 组件上限不可配置。旧版 `hardLimit` 不再生效，不能用于放宽官方限制。

CLI/CardSpec 在处理不可信文本时可以使用 `markdown.fragments`：`text`、`boldText` 和 `link.label` 会转义 Markdown，`rawMarkdown` 仅用于明确受信任的原始 Markdown。`content` 与 `fragments` 互斥。

`staticSelect.initialOption` 对应飞书 `initial_option` 的“选项内容”，不是 `options[].value`；`initialIndex` 直接采用飞书的 1-based 语义，`0` 表示不展示初始选项。官方文档只说明两者的覆盖顺序，Builder 不臆造额外冲突错误。

## CLI

```bash
node "$LARK_CARD_BUILDER_DIR/scripts/lark-card.mjs" validate --input card-spec.json
node "$LARK_CARD_BUILDER_DIR/scripts/lark-card.mjs" compile --input card-spec.json --pretty
node "$LARK_CARD_BUILDER_DIR/scripts/lark-card.mjs" compile --input card-spec.json --target-budget 160 --max-card-bytes 900000 --max-callback-bytes 4000 --pretty
node "$LARK_CARD_BUILDER_DIR/scripts/lark-card.mjs" schema --pretty
node "$LARK_CARD_BUILDER_DIR/scripts/lark-card.mjs" capabilities --pretty
node "$LARK_CARD_BUILDER_DIR/scripts/lark-card.mjs" docs check --pretty
node "$LARK_CARD_BUILDER_DIR/scripts/lark-card.mjs" check-project --project "$PWD" --pretty
```

内置 CLI 已包含运行所需代码，不依赖系统预装 `lark-card`。省略 `--input` 或使用 `--input -` 时从标准输入读取严格的 CardSpec JSON。CLI 始终输出结构化 JSON，不发送消息。

如果目标项目已经安装 `lark-card-builder` 包，也可以使用该包导出的 `pnpm exec lark-card`；这是包自身提供的便捷命令，不是 Skill 的外部依赖。

## 编译结果

成功结果包括：

- `cards[]`：按发送顺序排列的一至多张 Card JSON 2.0。
- `componentCount`：每张物理卡片递归统计得到的带 `tag` 对象数。
- `serializedBytes`：该物理卡片 JSON 的 UTF-8 字节数。
- `cardDigest`：该物理卡片规范化 JSON 的稳定 SHA-256 摘要。
- `elementIndex`：稳定 element key 到卡片序号、`element_id`、类型和流式能力的映射。
- `builderVersion`：生成这份结果的 `lark-card-builder` 版本。
- `rulesSnapshot`：编译器依据的官方规则快照。
- `specDigest`：规范化 CardSpec 的稳定 SHA-256 摘要。
- `bundleDigest`：本次物理编译结果的稳定 SHA-256 摘要，覆盖 `specDigest`、实际 `targetBudget`、Builder 版本、规则快照和有序 `cardDigest`；消费者字节门槛不改变卡片内容，因此不进入摘要。
- `snapshot`：兼容字段，暂时等于 `rulesSnapshot`，新代码不要再把它理解为内容摘要。

失败结果包含稳定的 `issues[].code/path/message`。Builder 支持范围内应修复 CardSpec，不应通过任意字段绕过校验；确需未覆盖的官方组件时，调用项目可以直接使用官方 Card JSON 2.0，但必须自行承担校验和分片。
