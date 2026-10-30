// The 课本灵感 dialog's two pages, the same on both pages that open it, and which one it opens on: teaching music chosen →
// 教学音乐; otherwise 课本歌曲.
import type {Inspiration} from '@wanwu-v2/contracts/work';

export type InspirationTab='examples'|'upload';
export const INSPIRATION_TABS:readonly InspirationTab[]=['examples','upload'];
/** `beat` (万物声场): a song lends only its beat, so 听一听 plays the beat; `full` (万物成曲): its background. */
export type InspirationVariant='beat'|'full';

export function openingTab(value:Inspiration):InspirationTab{
 return value.kind==='teaching-music'?'upload':'examples';
}
