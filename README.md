# my-superpowers

一个面向个人工作流的简体中文 Skill 仓库：精选并调整 Superpowers 中有价值的 Skill，也托管自己创建的能力。

## 为什么有这个项目

[Superpowers](https://github.com/obra/superpowers) 中有很多经过实践打磨的优秀 Skill，但整套 Plugin 更偏向全面、强制地执行工作流。对我而言，这种平衡点并不合适：一些原本可以直接完成的任务，也会因为 Skill 的主动介入而增加判断、沟通和执行成本。

这个项目希望重新平衡方法的完整性和实际执行效率，而不是否定 Superpowers 的方法。对于选中的上游 Skill，我会先理解并将其中文化，再根据个人工作方式进行调整。调用策略也从“满足条件就主动执行”，改为“发现具体问题、明确收益且成本合理时克制地建议”，是否真正调用由用户决定。

随着使用和演进，我也会创建自己的 Skill。Skill 可以携带完成任务所需的运行代码、依赖声明和开发工具；是否需要 Plugin 取决于平台级交付边界，而不是有没有代码。

这个项目不是 Superpowers 的 fork，不追求完整翻译或替代上游，也不是面向所有人的通用能力集。上游仓库只作为持续更新的来源；个人修改与上游源码隔离，经过确认后在本机生成稳定发布快照。

## 项目来源与收录范围

- **上游改造 Skill**：从 Superpowers 中逐个选择，保留有价值的方法，完成简体中文化，并按个人工作流调整调用方式和行为。
- **个人原创能力**：从自己的真实需求出发创建；需要运行代码或依赖时直接随所属 Skill 维护。

本仓库不会安装整套 Superpowers Plugin。每个独立 Skill 都单独选择、验证和安装。

## 使用与安装

```bash
npm run skills:list
npm run skill:install -- <skill-name>
```

第一个命令查看本机已发布的 Skill，第二个命令验证并安装指定 Skill。日常使用只安装 `published-skills/` 中的本机稳定快照，不直接使用开发目录。

Skill 默认由用户明确调用。Agent 只有在能说明具体问题、预期收益和主要成本时才可以建议；建议不等于调用。单个 Skill 如有经过授权的例外，以其 `SKILL.md` 和平台配置为准。

如果 Skill 含有 `package.json` 与锁文件，安装命令会从锁文件重建本机运行依赖；`node_modules/` 不进入发布内容。

## 目录结构

```text
my-superpowers/
├── README.md                       # 项目说明和使用入口
├── AGENTS.md                       # Agent 维护本仓库时必须遵守的规则
├── CLAUDE.md -> AGENTS.md          # Claude Code 共用同一套规则
├── package.json                    # 查看、发布、安装和更新上游的命令
├── scripts/skills.mjs              # Skill 列表、发布与安装脚本
├── my-skills/
│   ├── <skill-name>/               # 开发和调试中的个人 Skill
│   └── decisions/
│       └── <skill-name>/           # 对应 Skill 的个人决策记录
├── published-skills/
│   └── <skill-name>/               # 本机生成且被 Git 忽略的稳定运行快照
└── upstream/
    └── superpowers/                # 独立的上游 Git 仓库，已被忽略
```

## 开发与发布

```bash
npm run upstream:update
npm run skill:publish -- <skill-name>
```

- `upstream:update`：以 fast-forward 方式更新 Superpowers 上游仓库。
- `skill:publish`：展示开发版与发布版差异，确认后复制运行文件、更新发布元数据并验证发布结果。

具体维护规则由 [`AGENTS.md`](./AGENTS.md) 约束。以上命令都不会自动安装、提交或推送 Git。

`published-skills/` 不上传。换电脑时只同步 Git 中的源码，然后在新电脑本地执行：

```bash
git pull
npm run skill:publish -- <skill-name>
npm run skill:install -- <skill-name>
```

不同电脑的本机日期版本可能不同；运行内容是否一致以 `.release` 的 `content_sha256` 为准。安装目标由开发版 `.source` 中的 `targets` 重建。

## 已收录的能力

- [`using-superpowers`](./my-skills/using-superpowers/)：自动进行克制的 Skill 检查，只在收益明确时建议，并保留用户对实际调用的决定权。
- [`brainstorming`](./my-skills/brainstorming/)：通过克制的澄清和方案比较，把想法收敛为可执行的设计决策。
- [`media-download`](./my-skills/media-download/)：下载并验证用户指定的单个公开媒体作品；当前生产支持抖音公开视频。

具体行为、调用方式和发布信息请进入对应 Skill 目录查看，不在本页重复维护。
