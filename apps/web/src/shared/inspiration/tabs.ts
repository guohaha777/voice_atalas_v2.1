// The 课本灵感 dialog's two pages, 教学音乐 (examples: system songs + songs added from this device) and 上传歌曲 (upload),
// the same on both pages that open it, and which one it opens on: 上传歌曲 while an upload waits for 加入教学音乐;
// otherwise 教学音乐.

export type InspirationTab = 'examples' | 'upload';
export const INSPIRATION_TABS: readonly InspirationTab[] = ['examples', 'upload'];
/** `beat` (万物声场): a song lends only its beat, so 听一听 plays the beat; `full` (万物成曲): its background. */
export type InspirationVariant = 'beat' | 'full';

export function openingTab(uploadWaiting: boolean): InspirationTab {
  return uploadWaiting ? 'upload' : 'examples';
}
