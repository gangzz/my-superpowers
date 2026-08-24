---
name: feishu-chat-id
description: "显式调用，一次性通过飞书自建应用机器人的长连接取得目标群 chat_id，并输出可复制的 .env 配置行；不修改或保存业务项目配置。"
---

# 获取飞书群 Chat ID

## 目标与边界

只完成一次性取值：等待用户在目标飞书群内 `@机器人` 发送本次随机确认码，从 `im.message.receive_v1` 的 `message.chat_id` 输出一行可复制的环境变量配置。随机确认码不是飞书验证码，而是脚本为本次运行临时生成的一次性确认口令，用来证明消息来自用户当前指定的群。

不得执行以下操作：

- 修改任何业务项目的 `.env`，或在项目中保存绑定关系；
- 写入 SQLite 或其他持久存储；
- 保存 App Secret、tenant token 或 chat_id；
- 持续监听飞书，或管理多个项目的配置；
- 向群内发送确认消息、日报、通知或其他业务消息；
- 根据群名称搜索、猜测或选择 chat_id。

## 调用前提

- 仅在用户显式调用 `$feishu-chat-id` 时使用。
- 使用飞书企业自建应用，并已开启机器人能力。
- 开发者后台已选择长连接接收事件、订阅 `im.message.receive_v1`，并开通和发布接收群内 `@机器人` 消息的只读权限 `im:message.group_at_msg:readonly`。本 Skill 不发送消息，不应为它增加发送权限或读取全部群消息的权限。
- 机器人已经在目标群中。
- 同一应用若还有其他长连接客户端运行，飞书可能把事件投递给其中任意一个客户端。本 Skill 不得擅自停止其他服务；应提示用户改用当前没有并发消费者的应用，或由用户自行安排安全的停机窗口。

## 输入

凭证必须由用户直接在交互式终端中输入，不能让用户把 Secret 发到聊天中，也不能把它放进命令行参数、环境变量或文件：

- `FEISHU_APP_ID`：飞书开发者后台的 App ID；有些界面或用户会称为 `app_key`。
- `FEISHU_APP_SECRET`：隐藏回显输入。

可选参数：

- 输出变量名：默认 `FEISHU_WORK_REPORT_CHAT_ID`；使用 `--env-name <NAME>` 指定。
- 等待群消息的秒数：默认 `120`；使用 `--timeout <SECONDS>` 指定。

变量名必须符合 shell 环境变量命名规则；等待时间必须是 1–3600 的整数秒。

## 执行

1. 从本 Skill 所在目录运行：

   ```bash
   node scripts/get-chat-id.mjs [--env-name NAME] [--timeout SECONDS]
   ```

   必须使用可让用户直接输入的交互式终端。若当前环境不能安全提供终端输入，只给用户这条本地命令并停止；不要改用聊天、命令行参数或临时文件传递 Secret。

2. 脚本会先准备固定版本的官方 `@larksuiteoapi/node-sdk`。若本地无法解析到该版本，只在系统临时目录安装；npm 缓存也位于该临时目录，退出时一并删除。不得改为依赖其他业务项目的 `node_modules`。

3. 用户输入 App ID 与隐藏的 App Secret。脚本建立长连接后生成并显示本次一次性确认口令。

4. 提示用户在等待时间内到目标群先真正选择并 `@机器人`，再发送脚本给出的完整文本，例如 `@机器人 获取群ID FSC-XXXXXXXXXX`。只回复确认码或只输入机器人名字都不够。只接受当前连接就绪后收到、同时满足以下条件的事件：

   - `message.chat_type === "group"`；
   - `message.message_type === "text"`；
   - `message.mentions` 至少包含一个真实的飞书 @ 提及；配合最小权限 `im:message.group_at_msg:readonly`，该事件即为 @ 当前机器人触发；
   - 文本包含本次随机确认码；
   - `message.chat_id` 非空。

5. 成功时只把脚本输出的配置行交给用户，例如：

   ```dotenv
   FEISHU_WORK_REPORT_CHAT_ID=oc_xxxxxxxxx
   ```

6. 成功、超时、连接失败或中断后都立即关闭长连接并退出。超时不创建任何配置或绑定状态。

## 安全要求

- 不打印 App Secret、tenant token、鉴权请求头、SDK 调试日志或错误对象堆栈。
- 不读取现有业务 `.env`，即使其中已有飞书凭证。
- 不把 App ID 或 Secret 传给 npm 子进程；SDK 在凭证输入前准备完成。
- 不把一次成功表述为已经修改业务项目；只说明已取得 chat_id，并让用户自行复制配置行。
