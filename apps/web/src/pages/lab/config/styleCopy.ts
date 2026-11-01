// 风格卡 wording on 系统音乐上传 (/lab/music): the style cards the AI background composer is given. Development only.
import { moodLabels } from '../../../shared/creation/moodCopy.ts';

export const styleCopy = {
  title: '风格卡（AI 背景作曲参考）',
  lead: 'AI 作曲时，程序按作品的心情从这里挑一张交给模型参考，换一首就换一张。改的是 packages/sound-rules/rules/ai-compose.v1.json，改完在后端运行 npm run shared:sync。',
  unavailable: '没有连上本机开发服务器（npm run dev），这里只能看，不能改。',
  id: 'id（小写字母）',
  name: '名字（8 字内）',
  hint: '提示（30 字内）',
  moods: '适合的心情',
  moodNames: { none: '没选心情', ...moodLabels } as Record<string, string>,
  add: '加一张',
  adding: '正在保存…',
  remove: '去掉',
  added: (name: string) => `已加上「${name}」`,
  removed: (id: string) => `已去掉 ${id}`,
  failed: '保存失败',
  count: (n: number) => `共 ${n} 张`,
} as const;
