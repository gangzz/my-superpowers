# 多卡交付边界

Builder 只返回有序 `cards[]`，不发送、不重试，也不生成随机投递 ID。调用项目应：

```text
按 part 升序发送
→ 每张成功后保存 message_id
→ 任一张失败立即停止
→ 记录 partial_failed 和已成功 part
→ 未经明确授权，不重发已成功部分
```

调用方应为每次发送生成自己的 `deliveryRunId`，并以 `deliveryRunId + bundleDigest + part` 标识本次物理投递，同时保存 `specDigest`、`cardDigest`、`message_id` 和发送状态。

- `specDigest` 只标识逻辑输入；同一 CardSpec 使用不同 `targetBudget` 时保持不变。
- `bundleDigest` 标识包含编译选项、Builder 版本、规则快照和有序物理卡摘要的具体编译结果。
- `part` 标识该 bundle 中的物理序号。

这些摘要都不是传输层幂等键；是否支持网络幂等仍由调用项目和传输层决定。

`ok: true` 不证明鉴权、网络、目标群权限或飞书投递成功。只有传输层返回非空 `message_id` 才能把对应 part 记为成功。
