# 课本音乐创作 · 当前实现

2026-11-01。本机完成，待用户试听验收；未提交、推送或部署。设计及试听过程稿留在仓库外的 `万物声谱_视觉过程稿/`。

## 音乐数据与执行路径

```text
原曲录音 → 本地 Basic Pitch 音符转录 → 连续声部选择/乐句分组/质量门槛 → TextbookTrack.melody
                                                                          ↓
孩子实际发声时间、重叠、五维特征与来源、心情 → 歌曲拍网画像 → 课本程序方案 → 原曲片段引用/变奏
                                                                          ↓
                                                        同一最终音符/配器 → 播放、音乐小发现、保存、离线成品
```

缓存编号不决定作曲。音乐变量来自歌曲特征、转录音符与乐句、孩子的实际时间和声音特征。没有随机数作为课本编曲差异来源；同一输入可复现，行号/显示名字不改变音乐。同时发声的行号不构成先后。

原曲速度与拍子保持；有孩子心情时优先兼容的调式/和声。引用具体原曲片段，记录来源乐句、音符序号与移八度/调式适配/逆行/片段截取。孩子密集段减少活动，并可在较不拥挤的拍点放轻的原曲片段；有空隙时优先放完整可容纳乐句，不压缩拍速硬塞。真实重叠进一步影响力度；同一粗密度档并不意味着强行使用同一结果。

## 模块与参数

| 职责 | 文件 |
| --- | --- |
| 旋律契约/有界校验 | `packages/contracts/src/textbookMelody.ts` |
| 创作输入、特征来源、完整保存层 | `packages/contracts/src/textbookCompose.ts` |
| 神经转录与声部选择阈值 | `packages/music-features/rules/melody.v1.json` |
| 候选主声部选择、时间/音高与乐句 | `packages/music-features/src/melody.ts` |
| 本地模型延迟加载、音频 SHA-256 缓存 | `apps/web/src/shared/inspiration/melody/transcribe.ts` |
| 内置录音获取/共享提取 | `apps/web/src/shared/inspiration/melody/library.ts` |
| 新上传、旧卡补旋律、卡片持久化 | `shared/inspiration/teachingCard.ts`、`teachingMusic.ts`、`useInspirationCatalog.ts` |
| 实际排列转换及选择来源 | `shared/background/textbookInput.ts` |
| 歌曲小节画像与规则 | `packages/sound-rules/src/textbookPortrait.ts`、`rules/textbook-compose.v1.json` |
| 基础方案与音符 | `packages/sound-rules/src/textbookCompose.ts` |
| 原曲片段引用与变换 | `packages/sound-rules/src/textbookMelodyArrange.ts` |
| 当前层/已保存层唯一解析入口 | `shared/background/composeBackground.ts`、`useBackgroundLayer.ts` |
| 页面接线与互斥 | `pages/compose/model/useCompose.ts`、`backgroundChoice.ts` |
| 保存契约/云端传递 | `contracts/work.ts`、`cloud.ts`；cloudWorkspace、cloudTypes；后端 Works |
| 书架/离线渲染 | `useShelfPlayer.ts`、`audio-engine/src/render.ts`；后端 `jobs/renderInput.ts` |

## 模型和 system prompt 的实际分工

- 音符转录：固定的 `@spotify/basic-pitch@1.0.1` 神经模型，在本地 TensorFlow.js 执行，没有自然语言 system prompt。权重由依赖包随应用打包，延迟加载，不依赖公共 CDN。
- 课本编曲：程序按音乐数据执行约束与片段变换。本次没有启用自由生成音符的课本 LLM；不把未调用的作曲 prompt 标成已实现。设计稿中的可选课本 LLM 草稿仍仅为后续扩展。
- 原有声音/文本模型：上传特征卡继续使用 `textbook-features.v1.json`（内容版本 v4），只分析节拍、特征与讲解，不猜逐音旋律。
- 音乐小发现：继续用现有完整混音听音/文本链路，读本次实际背景音符、配器与精确增益。模型创作意图不能当声音事实。
- 自由 AI 背景仍不读取课本；选课本会取消尚未结束的自由 AI 请求，旧完成回调不能关闭最新课本选择。

## 降级和边界

- 转录使用至多30秒音频片段；参数位于 melody.v1.json。采样/模型推理、音符选择与质量都有独立来源，不能把模型分数当成逐音正确率。
- 弱候选、没有可用乐句、模型失败：保留节拍及其他音乐特征，课本卡明确显示未可靠提取。没有伪造原曲旋律。
- `pulse:none` 或节拍可信度不足：不声称跟原曲同步；无法生成可靠层时只播放孩子声音，不能假装已保存课本背景。
- 现有 `pulse:even` 保留均匀脉冲，不宣称已确认原曲强拍。
- 上传特征卡仍有原有可选的30秒声音模型请求；新增的旋律转录本身不外传录音。转录阶段使用不定进度条，不伪装固定完成百分比。
- 改歌/离开页面后，异步旧转录可进入内容缓存，但不能覆盖当前选择；失败不永久占用成功缓存。
- 同名同大小而实际字节不同的上传，不再误复用旧卡；去重与缓存依据音频 SHA-256。
- 音色明暗滤波、专业人工谱审、复杂变拍/自由速度尚不在本次能力内。原始录音从不覆盖。

## 保存一致性

`Rendering.textbook` 保存完整 `TextbookSnapshot`：原曲特征/自动旋律及来源、作品内容 token、心情、最终音符、节拍框架、淡入淡出、避让包络和引用变换。书架/重开/离线渲染直接读快照，不再重新猜背景。旧作品无快照时沿用旧路径，不批量重写。

账号正式保存的有界 `WorkContent.rendering` 经过契约验证进入工作快照，并由 worker 传入同一个离线渲染器；新增两首已有课本卡的后端独立目录项。上传教学音乐有完整快照时可离线渲染，不再无条件 `not-open`。草稿仍只编辑排列与设置；后台核验更新声音资料后，前端拒绝用旧排列快照假报保存成功，要求按最新数据再保存。

本次未运行真实账号/数据库/云存储整条链，未部署或迁移生产环境；其代码经类型、单元测试与共享渲染器验证，不等于已验证线上服务。

## 复现与验收材料

```sh
npm test
npm run build
npx tsc -p apps/web --noEmit
# 独立浏览器，现有内置歌曲录音需要在本机 builtin-teaching 中：
node --experimental-strip-types scripts/textbook-transcription-check.ts /absolute/path/to/transcriptions
node --experimental-strip-types scripts/textbook-source-auditions.ts /absolute/path/to/auditions /absolute/path/to/transcriptions
node --experimental-strip-types scripts/textbook-auditions.ts /absolute/path/to/auditions /absolute/path/to/transcriptions
node --experimental-strip-types scripts/textbook-browser-check.ts http://127.0.0.1:5295 /absolute/path/to/browser-report
node --experimental-strip-types scripts/textbook-export-check.ts /absolute/path/to/auditions /absolute/path/to/transcriptions/小鸟在唱歌.json
```

浏览器检查使用独立存储和内置示例：内置歌自动转录、成曲播放、正常保存、重开、书架播放、真实录音上传/提取/选用/保存，以及375/700/701/900/901/1440宽度。原有布局保留，只修正窄桌面提示气泡溢出，并补齐课本卡状态文字。

离线导出使用合成孩子录音，验证实际 `renderWork` 可输出完整20秒 WAV、不会修改输入采样，并拒绝错配歌曲身份/越界快照。试听页提供原曲片段/提取旋律，以及10组新旧成曲对照（含之前相同的两份密集编排）。自动结构与 PCM 指标通过不证明旋律逐音准确，最终听感由用户验收。
