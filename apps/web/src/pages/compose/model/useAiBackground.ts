import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {Arrangement} from '@wanwu-v2/contracts/arrangement';
import type {AiBackgroundStep,BackgroundBrief,BackgroundSource,BackgroundUnavailable,ComposePlan} from '@wanwu-v2/contracts/background';
import type {ComposeSettings} from '@wanwu-v2/contracts/work';
import {composeNotes,programBackground} from '@wanwu-v2/sound-rules/ai-compose';
import type {BackgroundNote} from '@wanwu-v2/sound-rules/background';
import {loadAudio} from '../../../shared/audio/loadAudio.ts';
import {backgroundBrief} from '../../../shared/background/backgroundLayer.ts';
import {backgroundCacheKey} from '../../../shared/background/compositionIdentity.ts';
import {runBackgroundChain} from '../../../shared/background/generator.ts';
import type {BackgroundGenerator,ChainOutcome} from '../../../shared/background/generator.ts';
import type {BackgroundLayer} from '../../../shared/background/useBackgroundLayer.ts';
import {keptCache} from '../../../shared/storage/keptCache.ts';
import {backgroundRenderCache} from './backgroundRenderCache.ts';
import {AI_USED_AT_START,aiStatus,usedSource} from './backgroundChoice.ts';
import type {AiBackgroundState} from './backgroundChoice.ts';

/** Where the AI background stands (规则 14 in ./backgroundChoice.ts). */
export type {AiBackgroundState} from './backgroundChoice.ts';
type Ready=Extract<ChainOutcome,{status:'ready'}>['result'];
/** 降级：程序自编 — what the program composed when no AI step gave a background, and why. */
type ProgramResult={source:'program';plan:ComposePlan;notes:BackgroundNote[];reason:BackgroundUnavailable};
type ProgramMade=ProgramResult&{key:string};
/** The AI step running now and how long the page waits for it (the progress bar). */
export type AiProgress={step:AiBackgroundStep;timeoutMs:number;startedAt:number};

const AUDIO_TIMEOUT_MS=20_000;

/** One AI background per piece (its sounds and mood), kept on this device: asked again only by 换一首. */
const made=keptCache<Ready|ProgramResult>('ai-background');

/**
 * 万物成曲's AI background, on top of the local layer: made once when the page opens (unless this piece already has
 * one) and again only with 换一首 — never because the instruments or the song changed (规则 3: it follows the child's
 * piece only); what was made for a piece is kept (also across reloads). The chain tries the AI music model, the AI voice
 * model and the AI text model; when none gives one, the program composes alone and plays in the same place (降级). Each
 * 换一首 tells the composer what the last one chose, so the next one differs.
 */
export function useAiBackground(
 arrangement:Arrangement|null,
 settings:ComposeSettings,
 layer:BackgroundLayer,
 generator:BackgroundGenerator,
){
 const [revision,setMade]=useState(0);
 const [asking,setAsking]=useState<
  |{key:string;status:'working'}
  |{key:string;status:'unavailable';reason:BackgroundUnavailable}
  |null>(null);
 const [progress,setProgress]=useState<AiProgress|null>(null);
 const [program,setProgram]=useState<ProgramMade|null>(null);
 // 规则 15: the AI background is the default whenever this piece has one (made on opening the page, or kept from before).
 const [using,setUsing]=useState(AI_USED_AT_START);
 const instruments=settings.background.instruments;
 const brief=useMemo(
  ()=>arrangement&&arrangement.events.length?backgroundBrief(arrangement,instruments):null,
  [arrangement,instruments]);
 // Sources, excerpts, timing, choices and mood identify the music; volume / instruments only change its playback.
 const briefKey=brief?backgroundCacheKey(brief):'';
 const [kept,setKept]=useState(false);
 useEffect(()=>{
  let live=true;
  void made.ready.then(()=>{
   if(live)setKept(true);
  });
  return()=>{
   live=false;
  };
 },[]);
 const stored=briefKey?made.get(briefKey):null;
 const programHere=useMemo(
  ()=>program?.key===briefKey?program:stored?.source==='program'?{...stored,key:briefKey}:null,
  [program,stored,briefKey]);
 // Keep the latest result, including program fallback, when this unchanged arrangement is opened again.
 const result=!programHere&&stored?.source!=='program'?stored:null;
 /** How many backgrounds this piece has had in this visit (the next try's number). */
 const tries=useRef(new Map<string,number>());
 const controller=useRef<AbortController|null>(null);
 // An obsolete composition must not switch the new arrangement back to its result.
 useEffect(()=>{
  setProgress(null);
  return()=>controller.current?.abort();
 },[briefKey]);
 const open=generator.open.length>0;
 const state:AiBackgroundState=aiStatus({
  open,kept,briefKey,made:result,
  asking:asking?.key===briefKey?asking:programHere?{key:briefKey,status:'unavailable',reason:programHere.reason}:null,
 });

 /**
  * AI 做一首 / 换一首: tries the AI steps once for this piece (replacing what was made); when none gives one, the
  * program composes alone. `done` says which it was.
  */
 const generate=useCallback((done:(outcome:'ai'|'program')=>void)=>{
  if(!brief||(asking?.key===briefKey&&asking.status==='working'))return;
  const ask=new AbortController();
  const key=briefKey;
  const attempt=tries.current.get(key)??(result||programHere?1:0);
  tries.current.set(key,attempt+1);
  // The last background's choices, so this one differs.
  const previous=result&&result.source!=='audio-ai'?result.plan:programHere?.plan??null;
  const request:BackgroundBrief={...brief,attempt,previous};
  controller.current=ask;
  setAsking({key,status:'working'});
  const finish=(outcome:ChainOutcome)=>{
   if(ask.signal.aborted)return;
   setProgress(null);
   if(outcome.status==='ready'){
    made.set(key,outcome.result);
    setProgram(null);
    setAsking(null);
    setUsing(true);
    setMade(count=>count+1);
    done('ai');
    return;
   }
   // 降级：程序自编, in the AI's place, with the reason the AI did not make one.
   const composed=programBackground(request);
   const fallback:ProgramResult={source:'program',plan:composed.plan,notes:composed.notes,reason:outcome.reason};
   made.set(key,fallback);
   setProgram({...fallback,key});
   setAsking({key,status:'unavailable',reason:outcome.reason});
   setUsing(true);
   setMade(count=>count+1);
   done('program');
  };
  if(!open){
   finish({status:'unavailable',reason:'not-open'});
   return;
  }
  void runBackgroundChain(generator,request,ask.signal,undefined,(step,timeoutMs)=>{
   if(!ask.signal.aborted)setProgress({step,timeoutMs,startedAt:Date.now()});
  }).then(finish);
 },[open,brief,briefKey,asking,generator,result,programHere]);

 const renders=useMemo(()=>backgroundRenderCache<object>(),[]);
 /** The actual AI / program note plan, also used to decide whether an instrument can join. */
 const notePlan=(piece:Arrangement)=>{
  const playing=using?result??programHere:null;
  if(!playing||!brief||'audioUrl' in playing)return null;
  return {...layer.plan(piece),...composeNotes(brief,playing.plan),mode:playing.plan.mode,notes:playing.notes};
 };
 /** The background in the AI's place for this piece (AI or 程序自编), or null to play the local one. */
 const buffer=(piece:Arrangement):Promise<AudioBuffer>|null=>{
  const playing=using?result??programHere:null;
  if(!playing||!brief)return null;
  // Generated audio has fixed instrumentation; composed notes use the currently selected voices.
  const renderKey='audioUrl' in playing?'audio':JSON.stringify({key:layer.key,parts:layer.parts,voices:layer.voices});
  return renders.get(playing,renderKey,()=>
   'audioUrl' in playing
    ?loadAudio(playing.audioUrl,{timeoutMs:AUDIO_TIMEOUT_MS})
    :layer.render(notePlan(piece)!,piece));
 };
 const source:BackgroundSource=usedSource(using,result,!!programHere);
 /** The prompt version behind the background playing now (null when no model made it), kept with a saved piece. */
 const prompt=using&&result?result.promptVersion:null;
 return {
  state,
  key:briefKey,
  notePlan,
  fixedAudio:using&&result?.source==='audio-ai',
  renderKey:`${briefKey}|${source}|${revision}`,
  using:using&&(!!result||!!programHere),
  source,
  prompt,
  /** The step running now, while one runs. */
  progress,
  /** Why the program composed alone (null when the AI made it, or nothing was made yet). */
  fallbackReason:result?null:programHere?.reason??null,
  buffer,
  generate,
  /** Whether what this device kept has been read (before that the page does not know whether to make one). */
  kept,
  /** Back to the local background (a song was chosen: one or the other). */
  useLocal:()=>setUsing(false),
  /** The background in the AI's place again when this piece has one (the song was let go); otherwise the local one. */
  preferAi:()=>setUsing(true),
  /** Switch between the background in the AI's place (when there is one) and the local one. */
  toggle:()=>{
   if(result||programHere)setUsing(current=>!current);
  },
 };
}
