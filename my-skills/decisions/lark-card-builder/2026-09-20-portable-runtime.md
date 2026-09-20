# lark-card-builder 可移植运行决策

## 背景

该 Skill 将通过个人 GitHub 仓库分发并在多台电脑上使用。Skill 的安装位置、仓库位置和目标 TypeScript 项目位置都不固定，因此运行说明不能依赖开发电脑的绝对路径或固定目录层级。

## 决策

- Skill 不声明或依赖系统预装的 `lark-card` 命令。
- Agent 使用的 CLI 打包为 `scripts/lark-card.mjs`，包含运行所需代码，通过 Node.js 直接执行。
- Codex 以当前加载的 `SKILL.md` 所在目录解析 Skill 根目录，不猜测用户名、磁盘、仓库位置或相对层级。
- TypeScript 项目做本地开发和验证时，安装 Skill 随附的 `packages/lark-card-builder.tgz`；不直接安装 Skill 目录，避免包管理器创建缺少依赖解析的本地链接。
- 需要把依赖提交到项目并跨电脑复现时，必须使用用户发布的 GitHub Release 包，不提交本机 `link:` 或 `file:` 路径。
- `dist/` 是 TypeScript API 的运行产物，必须进入 GitHub 分发内容，不能被开发目录的 `.gitignore` 排除。
- 所有带 `key` 的元素进入 `elementIndex`；`streamTarget` 只决定该索引项是否标记为可流式更新。

## 保持不变的边界

- npm 包仍可导出 `lark-card` 作为安装后的便捷命令，但它不是 Skill 的外部依赖。
- Skill 和库只负责构建、校验及分片 Card JSON 2.0，不负责鉴权、发送或重试。
- 本次修改仍处于 `my-skills` 开发区，不发布、不安装、不提交、不推送。
