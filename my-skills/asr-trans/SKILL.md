---
name: asr-trans
description: "显式调用，将本地中文音频或视频转为经大模型纠错的 JSON，支持句子级或 token 级时间对齐；不做口语删改、翻译、说话人分离或剪辑。"
---

# 语音对齐文字

把本地音频或视频转成一份可供字幕、检索或剪辑继续使用的 JSON：FunASR 负责识别和原始时间，大模型只纠正识别错误，确定性脚本负责合成和校验终稿。

## 调用边界

- 仅在用户显式调用 `$asr-trans` 时使用。
- 第一版面向中文口播，可包含英文缩写和数字。
- 只纠正错字、同音词、专有名词、数字、英文和标点；不删除语气词、重复表达或说错重来，不润色、改写、翻译，也不判断该剪掉什么。
- 不调用外部大模型 API。纠错由当前执行本 Skill 的 Agent 完成。
- 输入必须是本机已有、FFmpeg 可读取的音频或视频。

## 参数

按下面的调用语义解析用户输入：

```text
$asr-trans <media-path>
  [--alignment sentence|token]
  [--output <json-path>]
  [--force]
```

- `--alignment` 默认 `sentence`。
- `--output` 默认是源文件同目录的 `<stem>.transcript.json`。
- 输出已存在时停止；只有用户显式传入 `--force` 才允许替换。
- `sentence` 输出句子级时间；`token` 输出更细的 token 时间。纠错涉及多个相邻 token 时，允许合并成一个对齐组，不伪造不存在的字级时间。

开始前完整读取 [output-schema.md](references/output-schema.md)，按其中的内部纠错清单和最终 JSON 契约执行。

## 执行

### 1. 预检与共享运行工具

1. 将输入和输出路径解析为绝对路径，确认输入是普通文件且可读；输出存在且未传 `--force` 时停止。
2. 从**本次实际加载的 Skill 目录**定位 [scripts/runtime.py](scripts/runtime.py)，以绝对路径调用。以下 `<runtime.py>` 均指这个绝对路径；`python3` 仅运行标准库启动程序，不承载 ASR 依赖。
3. 确认 `python3`、`uv`、`ffmpeg`、`ffprobe` 可用。首次运行前告知可能下载 Python 3.11、较大的依赖和模型，再运行：

```bash
python3 <runtime.py> ensure
```

启动程序通过 `uv tool list` 和 `uv tool dir --bin` 查找固定工具 `asr-trans-runtime`。已登记且版本、代码、依赖和导入检查通过时复用；只有未登记且命令路径未被占用时，才从 Skill 随附的 `runtime/*.whl` 安装持久工具环境。真实路径由 uv 在本机确定，不修改 Skill 源码，不写死用户名、磁盘路径或缓存目录。

- 只查看状态用 `python3 <runtime.py> status`：不会安装；未安装时返回 `state=missing` 和退出码 3。
- 不扫描或借用业务项目 `.venv`，不使用当前 Python 的 FunASR，不临时拼 `--with`，不读取 `ASR_PYTHON` 选择 ASR 环境。
- 已登记工具损坏、版本/代码/依赖不兼容、FFmpeg 缺失或安装失败时停止并报告；不自动覆盖、升级、换环境或重试。不要绕过启动程序继续执行，不产生终稿。
- 运行包、锁定依赖和源码一起随 Skill 分发；环境与模型在各电脑本地准备，不打包环境或模型。平台下载与文件系统权限仍遵循当前平台流程，不自动安装系统软件。

### 2. 生成临时 ASR 骨架

在系统临时目录中创建本次专用目录，通过同一入口运行：

```bash
python3 <runtime.py> extract \
  --input <media-path> \
  --alignment <sentence|token> \
  --output <temp-dir>/raw.json
```

启动程序再次核对命名工具，随后调用已安装工具中的识别代码；不依赖当前工作目录，也不向业务项目写入 Python 环境。

脚本把 `paraformer-zh + fsmn-vad + ct-punc` 解析为固定的 ModelScope 模型 ID，优先复用本机完整缓存，并把音频转换为临时的 16kHz 单声道 WAV。必要时可用 `ASR_TRANS_MODEL`、`ASR_TRANS_VAD_MODEL`、`ASR_TRANS_PUNC_MODEL` 指定模型目录或 ID。token 数与时间戳数不一致时必须失败，不能截断后继续。

### 3. 大模型纠错

读取 `raw.json` 的全文以及所选模式的全部对齐单元，结合全文语义找出真正的识别错误。把**仅发生变化的部分**写入 `<temp-dir>/corrections.json`：

- 没有错误时写空的 `changes`。
- 不确定的词保留原文，不猜测。
- 不改变实际说话内容；不能用“更通顺”为理由删词或改写。
- 长材料可分批检查，但每批必须带相邻上下文；最终纠错范围不得重叠。
- `sentence` 模式每项只替换一个完整原句。
- `token` 模式每项覆盖一个或多个连续 token。只有一个词确实需要跨 token 修正时才合并，不为减少条目而扩大范围。
- 纠正标点时，把变化归入标点前的句子或 token 对齐单元。

### 4. 合成并验收终稿

先合成，再独立校验：

```bash
python3 <runtime.py> finalize \
  --raw <temp-dir>/raw.json \
  --corrections <temp-dir>/corrections.json \
  --output <output-path> [--force]

python3 <runtime.py> validate --input <output-path>
```

只有两条命令都成功才报告完成。确认：

- `text` 与 `alignment.units[].text` 顺序拼接完全一致；
- 时间为原始媒体秒，非负、递增且每段 `end > start`；
- 纠错范围合法、无重叠、没有空文本；
- 输出只含纠正后的文案和对齐信息，不保留 ASR 原文或内部纠错清单。

无论成功或失败，都清理本次临时目录。失败时说明停在哪一步；不得把未通过校验的文件称为完成。

## 交付说明

向用户简短报告输出路径、对齐模式、总时长、对齐单元数，以及是否存在不确定但保留原文的词。不要把大模型纠错表述为人工确认或百分之百准确。
