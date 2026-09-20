# lark-card-builder 本地版本检查与隐式调用决策

## 背景

Skill 本身通过 Codex 安装链接更新，但已经安装到各 TypeScript 项目的 npm 归档是独立快照。只更新 Skill 不会自动改写这些项目的依赖，因此旧项目可能继续使用旧编译器。

## 决策

- 允许平台隐式选择本 Skill，触发范围限于新建、修复、校验飞书 Card JSON / CardSpec，或使用、升级 `lark-card-builder` 的任务。
- 每次 Skill 为项目内 TypeScript API 工作时，在本次任务第一次编译前显式运行一次 `check-project`；纯 CLI 工作不检查项目依赖。
- `check-project` 只读取本地 Skill 包版本、目标项目已安装包版本和包管理器线索，不访问网络、不修改项目。
- 发现缺失或旧版本时，返回结构化安装命令。是否执行仍服从当前任务的项目修改授权；遇到更新版本或无法比较的版本时不自动覆盖。
- TypeScript API 公开 `BUILDER_VERSION`，成功编译结果公开 `builderVersion`。
- `compile()`、Builder 和编译结果生成过程保持确定性，不访问文件系统或网络，不输出隐式日志。
- 每次 API 行为发生变化时递增 npm 包版本，并重新生成 Skill 随附的归档；单纯修改 Skill 指令时不强制升级 API 版本。

## 边界

- `allow_implicit_invocation: true` 表示允许平台自动选择，不构成每次必然加载的技术保证。
- 本机制解决同一台电脑上 Skill 与项目依赖的版本差异，不负责检查 GitHub 或 npm 上的远端更新。
- Skill 仍不负责鉴权、发送卡片、投递重试或群聊管理。
