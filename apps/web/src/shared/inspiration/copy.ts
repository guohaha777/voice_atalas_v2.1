import type {Metre,TextbookTrack} from '@wanwu-v2/contracts/textbook';
import type {Inspiration} from '@wanwu-v2/contracts/work';
import {beatName,metreNames as corpusMetreNames} from '@wanwu-v2/prompts/corpus';

/** 二拍子 / 三拍子 / 四拍子 — corpus words, so the guide and the 课本讲解 say the same. */
export const metreNames:Record<Metre,string>=corpusMetreNames();


export const inspirationCopy={
 title:'课本灵感',
 description:'选一首教学音乐，听听它的节奏和你的声音碰在一起。',
 /** 万物声场: a song lends only its beat there. */
 beatDescription:'选一首教学音乐，跟着它的拍子摆你的声音。',
 tabs:{examples:'教学音乐',upload:'上传歌曲'},
 /** A song uploaded on this device, listed under 教学音乐 after the system songs. */
 mine:'我的',
 /** The small bubble beside a song whose card the model helped write. */
 ai:'AI',aiTitle:'这张卡的讲解由 AI 听过音乐后写的',
 example:'示例',
 catalogueNote:'现在是几首示例歌曲，课本曲库还没有开放。',
 use:'用这个',using:'正在用',none:'先不用',done:'好了',
 listen:'听一听',stopListen:'停止',
 /** The second line of a song: its beat and what it is like. */
 feel:(track:TextbookTrack)=>`${beatName(track)} · ${track.childLine}`,
 /** 案例: a textbook song with a built-in recording (听原曲 in its explanation). */
 cases:{tag:'案例',listen:'听原曲'},
 upload:{
  pick:'上传一首歌曲',repick:'重新上传',
  /** After the card: the song joins 教学音乐 only on 加入教学音乐; 再解析一次 makes the card again; 取消 lets it go. */
  confirm:'加入教学音乐',reanalyse:'再解析一次',cancel:'取消',
  already:(name:string)=>`「${name}」已经在教学音乐里了。`,
  hint:'请老师选一段课堂上唱的歌。',
  off:'AI 没接通，卡片由程序听出来。',
  /** While the card is made: reading = decoding and measuring on this device, listening = the AI hears the excerpt. */
  analysing:{reading:'正在读这段音乐…',listening:'AI 正在听这段音乐…'},

  errors:{'not-audio':'这不是音频文件，换一个试试。','too-large':'文件太大了（最大 10MB）。','unreadable':'这段音频读不出来，换一个试试。'},
  /** The precheck found almost no steady pitch: no teaching card. */
  notMusic:'这段听起来像普通声音，不像音乐。可以拿去声音诞生做声音素材。',
 },
 /** 讲解卡 (./ExplainCardView.tsx): who it is for, the row labels, the rhythm bar read aloud. */
 explain:{readers:'讲给谁听',child:'给孩子',teacher:'给老师',childRows:{listen:'听一听',move:'动一动',play:'玩一玩'},teacherRows:{listen:'听',move:'动',play:'玩'},
  bar:(said:string)=>`节奏：${said}`},
 /** One line describing the current choice, for the cards that open the dialog. */
 summary:(value:Inspiration,entries:readonly TextbookTrack[])=>{
  if(value.kind==='textbook'){const entry=entries.find(item=>item.id===value.entryId);return entry?`借了「${entry.title}」的节奏`:'课本节奏';}
  if(value.kind==='teaching-music')return `教学音乐「${value.name}」`;
  return '先不用';
 },
} as const;
