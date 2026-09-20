# 支持范围

机器可读权威入口：

```bash
node "$LARK_CARD_BUILDER_DIR/scripts/lark-card.mjs" capabilities --pretty
```

能力查询使用两套明确命名空间：

- `supportedSpecKinds`：CardSpec 作者层名称；
- `supportedOfficialTags` / `unsupportedOfficialTags`：飞书 Card JSON v2 的官方 tag；
- `specKindToOfficialTag`：二者的确定映射；
- `officialComponentTags`：被跟踪的完整官方目录，包含组件概览中的 tag 以及 `column_set` 文档内的嵌套 `column`。

旧字段 `supportedComponents` 与 `unsupportedComponents` 仅为兼容保留一个版本，分别等于 `supportedSpecKinds` 与 `unsupportedOfficialTags`，新调用方不要继续使用。

边界：

- 支持范围内必须使用 CardSpec，让编译器执行结构、语义、计数和分片校验。
- 未覆盖的官方 Card JSON 2.0 可由调用项目直接构造，但不享受 Builder 保证。
- 不得向 CardSpec 增加 `rawElement`、任意字段注入或私有协议来伪装支持。
- `ff.workspace.inject` 只是普通 callback value；Builder 原样编译，不理解其业务含义。

内置官方上限及其规则快照来源由 `OFFICIAL_LIMITS` 导出。没有可靠来源的长度或大小限制不写入这里，也不猜测数值。
