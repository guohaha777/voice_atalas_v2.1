// Display accepted AI entries with complete local alternatives when needed. Cache only text and evidence, never audio.
import type {DiscoveryAction,DiscoveryBrief,DiscoverySet,Evidence,PointText,SetOrigin} from '@wanwu-v2/contracts/discovery';
import {angleOf,basisLines,candidatePoints,localSet,DISCOVERY_CORPUS,observationBasisLines} from '@wanwu-v2/prompts/discovery';
import {restoreNames} from '@wanwu-v2/prompts/accept';

/** Cited evidence by content; `values` only for evidence whose words the set repeats (who plays the background). */
type Cited=Pick<Evidence,'kind'|'sounds'>&{values?:Evidence['values']};
/** An AI set as kept on the device: the set, the evidence it cited (by content), and each point's evidence lines. */
export type KeptSet={set:DiscoverySet;cited:Cited[];basis:string[][];promptVersion:string|null;fillMissing?:boolean};
export type ShownPoint=PointText&{basis:string[];origin:SetOrigin};
export type ShownSet={origin:SetOrigin;points:ShownPoint[];summary:{child:string;teacher:string}};

/** Whether `item` (now) still holds what was cited: the same angle, and the same words when the set repeated them. */
const same=(item:Evidence,cited:Cited)=>angleOf(item)===angleOf(cited)
 &&(!cited.values||JSON.stringify(item.values)===JSON.stringify(cited.values));

/** Cache the accepted text and its program evidence; listening observations stay in the basis lines. */
export function keepSet(set:DiscoverySet,brief:DiscoveryBrief,promptVersion:string|null,fillMissing=false):KeptSet{
 const ids=new Set(set.points.flatMap(point=>point.evidence));
 const words=JSON.stringify(set);
 const background=brief.evidence.find(item=>item.kind==='background');
 const named=!!background&&[...brief.background.instruments,String(background.values.players)].some(name=>words.includes(name));
 if(background&&named)ids.add(background.id);
 return {
  set,
  cited:brief.evidence.filter(item=>ids.has(item.id))
   .map(({kind,sounds,values})=>({kind,sounds,values})),
  basis:set.points.map(point=>[
   ...point.evidence.flatMap(id=>{
    const item=brief.evidence.find(entry=>entry.id===id);
    return item?basisLines([id],brief.evidence).map(line=>`${DISCOVERY_CORPUS.sources[item.source]}：${line}`):[];
   }),
   ...observationBasisLines(point.evidence,brief),
  ]),
  promptVersion,
  fillMissing,
 };
}

/** Whether every piece of evidence an AI set cited is still true of the piece as it sounds now. */
export const stillTrue=(kept:KeptSet,evidence:readonly Evidence[])=>
 kept.cited.every(cited=>evidence.some(item=>same(item,cited)));

const withNames=(text:string,names:readonly string[])=>restoreNames(text,names);
function show(set:DiscoverySet,basis:readonly string[][],origin:SetOrigin,names:readonly string[]):ShownSet{
 return {
  origin,
  points:set.points.map((point,i)=>({
   ...point,
   origin,
   where:withNames(point.where??'',names),
   knowledge:withNames(point.knowledge,names),
   discovery:withNames(point.discovery,names),
   ask:withNames(point.ask,names),
   try:withNames(point.try,names),
   teacher:{
    concept:withNames(point.teacher.concept,names),
    how:withNames(point.teacher.how,names),
    listen:withNames(point.teacher.listen,names),
   },
   basis:(basis[i]??[]).map(line=>withNames(line,names)),
  })),
  summary:{child:withNames(set.summary.child,names),teacher:withNames(set.summary.teacher,names)},
 };
}

/** The panel's set: the AI set while its evidence holds, else the local one; null when there is nothing to tell. */
export function shownSet(
 ai:KeptSet|null,
 evidence:readonly Evidence[],
 actions:readonly DiscoveryAction[],
 names:readonly string[],
):ShownSet|null{
 if(ai&&stillTrue(ai,evidence)){
  const shown=show(ai.set,ai.basis,'ai',names);
  // Fill missing slots with complete local entries on other evidence, never fragments of an AI entry.
  const used=new Set(ai.set.points.flatMap(point=>point.evidence));
  const alternatives=candidatePoints(evidence.filter(item=>!used.has(item.id)),actions);
  const missing=ai.fillMissing?Math.max(0,2-shown.points.length):0;
  if(missing&&alternatives.length){
   const local=localSet(alternatives.slice(0,missing),evidence,actions);
   shown.points.push(...show(local,local.points.map(point=>basisLines(point.evidence,evidence)),'local',names).points);
  }
  return shown;
 }
 const points=candidatePoints(evidence,actions);
 if(!points.length)return null;
 const set=localSet(points,evidence,actions);
 return show(set,set.points.map(point=>basisLines(point.evidence,evidence)),'local',names);
}
