# asr-trans：初始设计

## 背景

目标是把 CreatorStudio 中已经跑通的中文 ASR 思路抽成独立 Skill：输入任意本地音频或视频，最后交付包含完整文案和时间对齐信息的 JSON，并由当前大模型完成识别纠错。

## 已确认决定

- Skill 名称为 `asr-trans`，中文展示名为“语音对齐文字”。
- 做成 `my-superpowers` 的独立通用 Skill，不依赖 CreatorStudio 的目录或虚拟环境。
- 第一版面向中文口播，允许夹杂英文和数字；使用 `paraformer-zh + fsmn-vad + ct-punc`。
- 支持 `sentence` 与 `token` 两种模式，默认句子级。
- 大模型只纠正识别错误，不做口语整理、删减、翻译或文案改写。
- 大模型是当前执行 Skill 的 Agent，不在脚本中调用模型 API。
- token 数变化时使用覆盖连续来源 token 的对齐组，不伪造字级时间。
- 最终 JSON 只保留纠正结果，不保留 ASR 原文；内部原文和纠错清单只存在于本次临时目录。
- 默认输出到源文件旁的 `<stem>.transcript.json`，拒绝覆盖，只有显式 `--force` 才替换。
- 仅允许显式调用，`allow_implicit_invocation: false`。

## 实现理由

大模型不直接重写整份最终 JSON，而只写稀疏纠错清单。未修改内容由确定性脚本从 ASR 骨架复制，纠错范围、时间边界、全文拼接和覆盖策略由程序校验。这能减少长文抄写造成的漏句、时间漂移和 JSON 结构错误。

FunASR 的标点没有独立时间戳，英文和数字又可能是多字符 token。因此内部 token 同时保留 `spoken` 与带后随标点的 `text`；最终 token 对齐项是声学 token 或必要的连续 token 组，不承诺 Unicode 字符级时间。

## 已知边界

- 最终文件不保留 ASR 原文，因此离开本次运行后不能独立审计纠错来源；这是用户确认的体积与可追溯性取舍。
- Skill 不包含模型权重。首次在新环境运行可能需要下载较大的 Python 依赖和 FunASR 模型，执行前必须告知用户。
- FunASR 模型短名存在版本解析和联网检查漂移；实现固定三个 ModelScope ID，并优先解析本机完整缓存目录。
- 不支持说话人分离、强制对齐、翻译、多语言自动识别或编辑决策。

## 本次发布边界

本次只创建 `my-skills/asr-trans/` 开发版、决策记录并完成结构与行为验证。不更新 `published-skills/`，不安装，不提交或推送 Git。
