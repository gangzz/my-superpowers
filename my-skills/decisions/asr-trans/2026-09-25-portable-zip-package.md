# asr-trans 可移植 ZIP 包

## 决定

- 对外 ZIP 使用单一顶层目录 `asr-trans/`，保留 `SKILL.md`、`agents/`、`references/` 与运行脚本，不包含 `.source`、`.release`、模型缓存、媒体文件或本机环境。
- 继续在首次真实运行时准备 FunASR 环境，不把体积大且平台相关的 Python 包与模型权重塞入 ZIP。
- `uv` 路径固定使用 Python 3.11，并显式声明 `funasr==1.3.22`、`torch` 与 `torchaudio`；下载依赖和模型前仍需告知用户并遵循平台授权流程。
- ZIP 安装成功只证明 Codex 能发现 Skill，不等于 FFmpeg、Python 依赖和模型已经就绪。

## 验收

- 压缩包解开后只有一个 `asr-trans/` 顶层目录，且包内只有一个 `SKILL.md`。
- 解包副本通过 Skill 结构校验和离线确定性测试。
- 不声称跨平台真实媒体端到端已由本次打包验证。
