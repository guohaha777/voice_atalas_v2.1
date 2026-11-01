# 课本旋律转录模型来源

- 官方代码/模型：Spotify Basic Pitch，https://github.com/spotify/basic-pitch-ts
- 固定依赖：`@spotify/basic-pitch@1.0.1`；锁定文件为根目录 package-lock.json。
- 许可：Apache-2.0，原文在依赖包 LICENSE；生产构建复制至 `licenses/spotify-basic-pitch.txt`。
- 权重：依赖包 `model/model.json`、`model/group1-shard1of1.bin`。通过 Vite 资源打包，从本站加载；不从公共 CDN 拉取模型，不把歌曲录音发给 Spotify。
- 执行：TensorFlow.js，由 Basic Pitch 的依赖提供，延迟加载；输入 22,050 Hz 单声道、至多30秒分析片段。
- 参数与候选声部选择：`packages/music-features/rules/melody.v1.json`、`src/melody.ts`。
- 原曲录音仍沿用现有本机内置教学音乐来源/排除规则，不将其放入 Git 提交。本次未执行任何提交或部署。
- 模型输出是自动转录估计，不是人工校验乐谱；复杂混音可能混入伴奏或漏音。质量门槛未达标则回到特征路径并明确显示。
