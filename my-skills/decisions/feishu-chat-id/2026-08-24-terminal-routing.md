# Feishu Chat ID 终端路由

日期：2026-08-24  
状态：已确认，开发版实施

## 背景

初版为了避免 App Secret 经过聊天，在无法确认安全输入渠道时要求 Agent 只给出本地命令并停止。实际显式调用暴露出三个多余步骤：先输出命令、再询问是否启动、最后才打开系统 Terminal。

问题不在飞书长连接脚本，而在终端路由把“禁止通过聊天传 Secret”错误扩大成了“不能主动寻找或打开用户可见终端”。Codex Desktop 还可能提供延迟加载的 Terminal channel；只检查普通 shell 工具会漏掉这条路径。

## 决策

显式调用 `$feishu-chat-id` 已足够启动取值流程，不再增加一次自然语言确认。平台自身的权限确认仍照常保留。

终端按以下顺序路由：

1. 使用带 PTY/TTY 的 shell 执行工具先启动一个交互式 shell 并取得会话 ID，不直接把 Node.js 脚本作为 PTY 主进程。
2. 将该 shell 会话挂载到当前任务的 Codex Terminal channel，交由用户直接输入凭证。
3. 终端展示调用成功或返回 `queued` 后，用 `write_stdin` 向同一个 PTY 发送不含凭证的脚本启动命令。`queued` 视为已接受并等待 UI 异步打开；不得在同一轮重复创建终端。
4. 只有展示调用明确报错或不受支持，或者用户随后明确反馈终端没有出现或无法接管时，才关闭等待中的 PTY，并自动打开系统 Terminal 运行同一条不含凭证的命令。macOS 直接使用系统启动方式，不先通过 Computer Use 操作 Terminal。
5. 两种终端都不可用时，才输出手工命令并停止。

## 实测纠正

首次端到端试用中，`open_in_codex` 返回 `queued`，短时间内 `read_thread_terminal` 仍报告当前任务没有附加会话，但 Codex UI 随后实际打开了终端。把 `queued` 当作失败并在 3 秒后回退，造成了重复的 Codex Terminal 和 macOS Terminal。

因此，已有 Terminal 不是失败原因；真正的问题是把异步接受状态误判成同步失败。`read_thread_terminal` 只能说明调用当下可读取的附加状态，不能证明排队中的 UI 打开不会完成。

第二次端到端试用进一步发现：先把 Node.js 脚本直接作为后台 PTY 主进程、再请求展示该会话，用户看到的 Codex Terminal 没有进入程序；后台脚本随后在 npm 准备阶段收到 `SIGTERM`。当前工具也只允许读取 Codex Terminal，不能通过专门接口或 Computer Use 向其键入命令。

因此改为最简单的“先打开、再执行”：先创建可见的 shell PTY，终端展示请求被接受后，再用该 PTY 自身的 `write_stdin` 发送非敏感启动命令。`write_stdin` 仍不得用于 App Secret；凭证继续由用户在可见终端的隐藏输入中亲自键入。

## 安全边界

- App Secret 只允许用户在脚本的隐藏输入中直接键入。
- 不通过聊天、命令行参数、环境变量、临时文件或 Agent 的 `write_stdin` 传递 Secret。
- 打开 Codex 或系统 Terminal 时，命令只包含 Skill 路径和非敏感选项。
- 切换到系统 Terminal 前关闭原 PTY，避免两个脚本同时等待或建立连接。
- 本次不修改脚本、飞书权限、输出格式、超时语义或持久化边界。

## 结果与代价

Codex Desktop 可以优先获得任务内交互体验，同时保留系统 Terminal 和手工命令回退。代价是不同宿主提供的 Terminal channel 名称和附加状态可能不同，因此 Skill 描述能力和停止条件，并保留当前 Codex 工具名作为实现提示。

本记录只更新开发版；是否同步到 `published-skills/` 仍需用户明确确认发布。
