# asr-trans 命名共享运行工具

## 决定与总览

将 ASR 依赖作为 uv 命名工具 `asr-trans-runtime` 维护。Skill 负责 Agent 的保真纠错工作流；[统一启动程序](../../asr-trans/scripts/runtime.py)负责发现、一次性安装与校验工具；uv 负责各电脑的持久工具环境。业务项目只提供输入输出，不管理 ASR Python。

主线：已加载 Skill → 绝对路径启动程序 → uv 工具登记与命令目录 → 检查版本、代码和健康度 → 已安装工具执行抽取/合成/校验。

## 逐阶段执行

### 1. 构建维护

维护者修改 [requirements.in](../../asr-trans/requirements.in) 后，使用 `uv pip compile --python-version 3.11 --universal --no-header --no-annotate --output-file requirements.lock requirements.in` 更新完整依赖锁；在 Skill 根目录用 `uv build --wheel --out-dir runtime` 构建本地 wheel。依赖锁嵌入 wheel 的 Requires-Dist，而非假定 `uv tool install` 自动读取项目锁文件。运行代码或依赖改变时提高工具版本，重新构建并验收，只随附当前版本一个 wheel。所有依赖和代码属于该 Skill，不另建平台。

### 2. 发现与准备

Agent 按 [SKILL.md](../../asr-trans/SKILL.md) 调用启动程序，不自行扫描目录或拼装安装命令。启动程序通过 uv 公共接口查询工具登记和可执行目录；未安装且路径空闲时从随附 wheel 安装，已安装时核对版本、代码摘要、完整依赖声明和实际依赖健康度。未登记命令占位、已登记入口缺失、不兼容和安装失败均停止，不覆盖、升级或自动重试。`status` 不安装，`ensure` 只补首次缺失。

Python 3.11 为本版本运行基线。启动程序仅依赖标准库；真实 ASR 依赖在工具环境。不同电脑可以有不同目录，不修改源码、不设置默认 ASR_PYTHON。升级/修复必须另行明确执行安装，不把新旧版本冲突当作首次缺失。

### 3. 运行与交付

[运行工具](../../asr-trans/scripts/asr_trans_runtime.py)提供 doctor、extract、finalize、validate，复用既有 [抽取](../../asr-trans/scripts/extract_asr.py)与[终稿契约](../../asr-trans/scripts/transcript_json.py)。doctor 验证 Python、锁定依赖、AutoModel 导入与 FFmpeg，不加载模型，因此不能单独证明识别成功。模型沿用用户缓存与显式模型覆盖设置。ASR、纠错、校验和临时目录清理仍以 SKILL.md 为运行权威。

## 完成标准与边界

- 缺失工具只安装一次，后续复用；同版本不同代码也必须拒绝。
- 从两个工作目录使用相同工具环境完成真实媒体工作流；缓存齐全时以 `UV_OFFLINE=1` 和本地模型缓存验证复用。
- 覆盖未安装、入口占位、损坏、不兼容、安装失败不重试，以及原有时间对齐/不覆盖输出约束。
- 开发验证与本机发布安装分开；按仓库 AGENTS.md 显示差异并确认安装后，再验证发布目录。源码变更、导入成功、真实媒体识别、内容听校是不同验证层级。
- wheel 是小型纯 Python 安装包，不包含 Python 环境或模型；其他操作系统的实际运行需在对应系统验收，不能从本机测试推断全部平台可用。

## 本机验收记录

- 2026-10-30，macOS Apple Silicon：22 项离线测试、Skill 结构校验和安装 dry-run 通过；随后经用户明确授权，已安装发布快照 `2026.10.30.1`。两个 Codex 全局安装链接均指向发布目录。
- 发布后独立核对源码、发布文件和 `.release` 的内容摘要一致：`c60730dceef8761c6296444c56984babe20bd4a07419112b1279bda07c8b02d2`。发布目录的 22 项测试、离线 status 工具复用和转写 JSON 独立终检均通过。
- `asr-trans-runtime 1.0.0` 已通过随附 wheel 安装到 uv 持久工具环境，安装来源已指向仓库中的持久 wheel。FunASR 1.3.22、torch/torchaudio 2.8.0、Python 3.11.15 的实际导入与依赖约束检查通过。
- 分别从视频所在项目和系统临时目录转写同一段 35.736 秒中文视频；第二次设置 UV_OFFLINE/HF_HUB_OFFLINE/MODELSCOPE_OFFLINE，使用本地完整模型缓存，原始输出完全一致。没有进行操作系统层面的物理断网测试。
- 跨目录 status 返回同一工具环境、Python 和代码摘要，reused=true；合成和独立终检通过，得到 13 个句子对齐单元，并导出与 JSON 文本一致的 TXT。姓名识别存在不确定性，保留原文，没有声称逐句听校。
- 本次不包含 Windows/Linux 实机验证或全局旧环境清理，也没有提交或推送 Git。
