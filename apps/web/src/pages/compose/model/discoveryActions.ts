// What a child can do right now for a card's small try (音乐小发现): the panel never asks for a button that is not
// there. 从头再听 always; per sound (the first few, in listening order) 挪一挪 / 换成别的声音 / 再放一次, and 拿走一次
// when it is placed more than once; 留一点空 with two or more sounds; with the background on, 调音量 / 关背景, and 换乐器
// when some instrument can join (the same availability rule the instrument buttons use). Labels are corpus words.
import {ARRANGEMENT_MAX_EVENTS} from '@wanwu-v2/contracts/arrangement';
import type {Arrangement} from '@wanwu-v2/contracts/arrangement';
import type {DiscoveryAction,DiscoveryActionKind} from '@wanwu-v2/contracts/discovery';
import type {SoundToken} from '@wanwu-v2/contracts/talk';
import {actionLabel} from '@wanwu-v2/prompts/discovery';

/** Sounds that get their own actions (the brief stays small; later sounds still have 从头再听 and the layer actions). */
const SOUNDS_WITH_ACTIONS=16;

export function discoveryActions(
 arrangement:Arrangement,
 tokens:ReadonlyMap<string,SoundToken>,
 {background,instrumentChoice,instrumentOptions=[]}:{background:boolean;instrumentChoice:boolean;instrumentOptions?:string[]},
):DiscoveryAction[]{
 const actions:DiscoveryAction[]=[];
 const add=(kind:DiscoveryActionKind,target:SoundToken|null=null)=>actions.push({
  id:target?`${kind}-${target.replace('声音','')}`:kind,
  kind,
  target,
  label:actionLabel({kind,target}),
 });
 add('replay');
 if(!arrangement.events.length)return actions;
 for(const [unitId,token] of [...tokens].slice(0,SOUNDS_WITH_ACTIONS)){
  const times=arrangement.events.filter(event=>event.unitId===unitId).length;
  add('move',token);
  if(tokens.size>1){
   add('swap',token);
   actions.at(-1)!.options=[...tokens.values()].filter(item=>item!==token);
  }
  if(arrangement.events.length<ARRANGEMENT_MAX_EVENTS)add('add',token);
  if(times>=2)add('remove',token);
 }
 if(arrangement.events.length>=2)add('gap');
 if(background){
  add('volume');
  add('background');
  if(instrumentChoice){
   add('instrument');
   actions.at(-1)!.options=instrumentOptions;
  }
 }
 return actions;
}
