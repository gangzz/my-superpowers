# 输出与纠错契约

## 最终 JSON

最终文件只包含纠正后的文本，不保留 ASR 原文、原始 token 或纠错清单。

```json
{
  "schema_version": "1.0",
  "source": {
    "name": "example.mp4",
    "duration_seconds": 12.34
  },
  "language": "zh-CN",
  "text": "纠正后的完整文案。",
  "alignment": {
    "mode": "sentence",
    "units": [
      {
        "index": 0,
        "start": 0.19,
        "end": 1.13,
        "text": "纠正后的句子。"
      }
    ]
  }
}
```

固定要求：

- `schema_version` 为 `1.0`。
- `language` 为 `zh-CN`。
- `source.name` 只保存文件名，不泄露本机绝对路径。
- `source.duration_seconds`、`start`、`end` 使用原始媒体秒。
- `alignment.mode` 只能是 `sentence` 或 `token`。
- `units` 按时间排序，`index` 从 0 连续编号。
- `text` 必须严格等于所有 `units[].text` 顺序拼接。
- token 模式的 unit 通常对应一个 token；发生必要的多对一或一对多纠错时，它是覆盖连续原 token 的对齐组，其时间取整个来源范围的首尾，不能按字符平均伪造时间。

## 内部 ASR 骨架

`extract_asr.py` 生成仅供本次运行使用的临时 JSON。共同字段包括：

```json
{
  "schema_version": "asr-raw-1.0",
  "requested_alignment": "token",
  "source": {"name": "example.mp4", "duration_seconds": 12.34},
  "language": "zh-CN",
  "text": "ASR 原始全文。",
  "sentences": [],
  "tokens": []
}
```

句子包含 `index/start/end/text`。token 包含：

- `index`：原 token 下标；
- `start/end`：FunASR 的真实时间；
- `spoken`：与时间戳对应的发音 token；
- `text`：用于全文拼接的显示文本，包含紧随该 token 的标点或空格。

FunASR 的标点后处理可能只在全文中调整英文大小写，而句子时间模块会从标点前的原文重建句子。因此，比较全文、句子和 token 是否表达同一段发音时，忽略空格、Unicode 标点及字母大小写；真正的字词、数字或顺序差异仍必须失败并要求检查，不得猜测补齐。

模型短名会随 FunASR 版本漂移，因此脚本固定使用以下 ModelScope ID，并在可用时直接读取本机缓存，避免每次联网检查：

- `iic/speech_seaco_paraformer_large_asr_nat-zh-cn-16k-common-vocab8404-pytorch`
- `iic/speech_fsmn_vad_zh-cn-16k-common-pytorch`
- `iic/punc_ct-transformer_cn-en-common-vocab471067-large`

## 大模型纠错清单

纠错清单只写发生变化的范围。`mode` 必须与 ASR 骨架的 `requested_alignment` 相同。

### 句子模式

```json
{
  "mode": "sentence",
  "changes": [
    {"source_index": 3, "text": "纠正后的完整句子。"}
  ]
}
```

- 每个 `source_index` 最多出现一次。
- `text` 必须非空，替换该句全部显示文本，并保留该句原始起止时间。

### Token 模式

```json
{
  "mode": "token",
  "changes": [
    {"source_start": 12, "source_end": 14, "text": "APOE4，"}
  ]
}
```

- 范围为左闭右开 `[source_start, source_end)`。
- 范围必须非空、合法、互不重叠。
- `text` 替换范围内全部原显示文本，时间取第一个 token 的 `start` 到最后一个 token 的 `end`。
- 未出现在 `changes` 中的 token 原样进入终稿。
- 标点附着在前一个 token 的显示文本上；只改标点时也替换该 token。

## 示例：跨 token 纠错

原 token 为：

```text
12: A  [1.00, 1.10]
13: PO [1.10, 1.25]
14: E4 [1.25, 1.42]
```

如果全文语义证明这里应为 `APOE4`，纠错范围写为 `[12, 15)`。终稿产生一个文本为 `APOE4`、时间为 `[1.00, 1.42]` 的对齐组；不能凭空给五个字符各分配时间。
