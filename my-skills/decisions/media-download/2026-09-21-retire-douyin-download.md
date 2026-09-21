# 退役 douyin-download

## 决定

- 删除旧的 `douyin-download` Skill，不再维护基于固定版本 `jiji262/douyin-downloader` 的包装方案。
- 抖音单作品下载统一由 `media-download` 的抖音 Extractor 和通用下载、验证链路负责。
- 不迁移旧 Skill 的上游 checkout、Python 依赖、安装脚本或失败现场；后续修复只在 `media-download` 内进行。

## 原因

`media-download` 已能从目标作品的 `RENDER_DATA` 生成资源候选，并通过同一浏览器 Context 的 Range 流完成下载、封装与媒体验证。旧 Skill 没有发布或安装状态，继续保留只会形成重复入口和两套维护路径。
