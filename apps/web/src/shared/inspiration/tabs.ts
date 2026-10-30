// Which pages the 课本灵感 dialog has and which it opens on — one rule for every page that opens it without asking for a
// tab: teaching music chosen → 教学音乐; a song chosen → 课本歌曲 (the song is marked there); nothing yet → 帮我找找 when
// there are sounds to compare, otherwise 课本歌曲.
import type {Inspiration} from '@wanwu-v2/contracts/work';

export type InspirationTab='match'|'examples'|'upload';
/** `beat` (万物声场): a chosen song lends only its beat, so there is no 帮我找找; `full` (万物成曲): everything. */
export type InspirationVariant='beat'|'full';

export const inspirationTabs=(variant:InspirationVariant):readonly InspirationTab[]=>variant==='beat'?['examples','upload']:['match','examples','upload'];

export function openingTab(value:Inspiration,hasMatches:boolean):InspirationTab{
 if(value.kind==='teaching-music')return 'upload';
 if(value.kind==='textbook')return 'examples';
 return hasMatches?'match':'examples';
}
