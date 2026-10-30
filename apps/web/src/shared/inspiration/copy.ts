import type {Metre,TextbookTrack} from '@wanwu-v2/contracts/textbook';
import type {Inspiration} from '@wanwu-v2/contracts/work';
import {metreNames as corpusMetreNames} from '@wanwu-v2/prompts/corpus';

/** 二拍子 / 三拍子 / 四拍子 — corpus words, so the guide and the 课本讲解 say the same. */
export const metreNames:Record<Metre,string>=corpusMetreNames();


export const inspirationCopy={
 title:'课本灵感',
 description:'选一首课本歌曲，听听它的节奏和你的声音碰在一起。',
 /** 万物声场: a song lends only its beat there. */
 beatDescription:'选一首课本歌曲，跟着它的拍子摆你的声音。',
 tabs:{examples:'课本歌曲',upload:'教学音乐'},
 example:'示例',
 catalogueNote:'现在是几首示例歌曲，课本曲库还没有开放。',
 use:'用这个',using:'正在用',none:'先不用',done:'好了',
 listen:'听一听',stopListen:'停止',
 /** The second line of a song: its beat and what it is like. */
 feel:(track:TextbookTrack)=>`${metreNames[track.meter]} · ${track.childLine}`,
 /** 案例: a textbook song with a built-in recording (听原曲 in its explanation). */
 cases:{tag:'案例',listen:'听原曲'},
 upload:{
  pick:'选一段教学音乐',repick:'换一段',
  hint:'请老师选一段课堂上唱的歌。',
  off:'AI 没接通，卡片由程序听出来。',
  /** While the card is made: reading = decoding and measuring on this device, listening = the AI hears the excerpt. */
  analysing:{reading:'正在读这段音乐…',listening:'AI 正在听这段音乐…'},
  card:(metre:string,rhythm:string)=>`${metre} · 节奏「${rhythm}」`,
  noteLabel:'给老师',
  madeBy:{audio:'AI 听过这段音乐',language:'AI 只看了数字，节奏是程序听的',program:'AI 没接通，这张卡是程序听出来的'},
  partly:'有一部分是程序测的',

  errors:{'not-audio':'这不是音频文件，换一个试试。','too-large':'文件太大了（最大 10MB）。','unreadable':'这段音频读不出来，换一个试试。'},
 },
 /** One line describing the current choice, for the cards that open the dialog. */
 summary:(value:Inspiration,entries:readonly TextbookTrack[])=>{
  if(value.kind==='textbook'){const entry=entries.find(item=>item.id===value.entryId);return entry?`借了「${entry.title}」的节奏`:'课本节奏';}
  if(value.kind==='teaching-music')return `教学音乐「${value.name}」`;
  return '先不用';
 },
} as const;
