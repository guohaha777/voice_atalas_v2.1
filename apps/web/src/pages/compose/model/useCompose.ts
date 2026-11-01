import {useCallback,useEffect,useMemo,useReducer,useRef,useState} from 'react';
import type {Arrangement,SpanSeconds} from '@wanwu-v2/contracts/arrangement';
import type {Inspiration} from '@wanwu-v2/contracts/work';
import {timedEvents,spanHolds} from '../../../shared/creation/arrangementTiming.ts';
import type {InspirationCatalog} from '../../../shared/inspiration/catalog.ts';
import type {TeachingMusicService} from '../../../shared/inspiration/teachingMusic.ts';
import {useInspirationCatalog} from '../../../shared/inspiration/useInspirationCatalog.ts';
import type {Instrument} from '../../../shared/background/instruments.ts';
import type {BackgroundLibrary} from '../../../shared/background/library.ts';
import {useBackgroundLayer} from '../../../shared/background/useBackgroundLayer.ts';
import type {BackgroundGenerator} from '../../../shared/background/generator.ts';
import {RULE_VERSIONS} from '@wanwu-v2/sound-rules/rules';
import {instrumentUnavailable} from './instrumentAvailability.ts';
import {guideLines} from '../config/guideLines.ts';
import {useAiBackground} from './useAiBackground.ts';
import {textbookSwitch} from '../../../shared/inspiration/textbookSwitch.ts';
import {services} from '../../../app/services.ts';
import type {TalkPolisher} from '../../../shared/talk/polisher.ts';
import type {ComposeRepository} from '../../../shared/ports/composeRepository.ts';
import {composeReducer,initialCompose,isShelved,shelfEntry} from './composeState.ts';
import type {ComposeNoticeKey} from './composeState.ts';
import {scoreLayout} from './scoreLayout.ts';
import {usePiecePlayback} from './usePiecePlayback.ts';
import {useTalk} from './useTalk.ts';
import * as choice from './backgroundChoice.ts';
import type {Move} from './backgroundChoice.ts';

/**
 * 万物成曲: listen to the work as a piece, set its length, inspiration and background, then put it on the shelf.
 * The playback clock lives in usePiecePlayback and the background layer (shared with 万物声场) in useBackgroundLayer.
 */
export function useCompose(
 repository:ComposeRepository=services.composeRepository,
 backgrounds:BackgroundLibrary=services.backgroundLibrary,
 inspirations:InspirationCatalog=services.inspirationCatalog,
 generator:BackgroundGenerator=services.backgroundGenerator,
 polisher:TalkPolisher=services.talkPolisher,
 teaching:TeachingMusicService=services.teachingMusic,
){
 const [state,dispatch]=useReducer(composeReducer,initialCompose);
 const [shelfCount,setShelfCount]=useState(0);
 const [instruments,setInstruments]=useState<readonly Instrument[]>([]);
 const [hoveredInstrument,setHoveredInstrument]=useState<string|null>(null);
 const [comingInstruments,setComing]=useState<readonly string[]>([]);
 /** The 课本灵感 switch, shared with 万物声场 (there it plays the song's beat): on = the chosen song's background plays. */
 const [songSwitch,setSwitchState]=useState(textbookSwitch.get);
 const switchSong=(on:boolean)=>{
  setSwitchState(on);
  textbookSwitch.set(on);
 };
 const latest=useRef(state);
 latest.current=state;
 const notify=useCallback(
  (key:ComposeNoticeKey,tone:'info'|'error'='error')=>dispatch({type:'notice',notice:{tone,key}}),
  []);

 useEffect(()=>{
  let live=true;
  void Promise.all([repository.load(),backgrounds.list()]).then(([current,library])=>{
   if(!live)return;
   setInstruments(library.instruments);
   setComing(library.coming);
   setShelfCount(current.shelfCount);
   dispatch({type:'loaded',arrangement:current.arrangement,settings:current.settings,shelved:current.shelved});
  });
  return()=>{
   live=false;
  };
 },[repository,backgrounds]);

 // Length changes go back to the same work 万物声场 edits; an untouched example is not stored.
 useEffect(()=>{
  const arrangement=state.arrangement;
  if(arrangement?.origin==='child')void repository.saveArrangement(arrangement);
 },[state.arrangement,repository]);
 useEffect(()=>{
  if(latest.current.arrangement)void repository.saveSettings(state.settings);
 },[state.settings,repository]);

 // ----- derived: score, background, talk -----
 const layout=useMemo(()=>state.arrangement?scoreLayout(state.arrangement):null,[state.arrangement]);
 // 课本灵感: the same songs as 万物声场 (shared/inspiration).
 const {entries,tracks,teachingItems,analyseTeaching,teachingOpen}=useInspirationCatalog(inspirations,teaching);
 // 背景放谁: every rule is in ./backgroundChoice.ts (numbered as in 成曲规则清单); this hook only carries them out.
 /** 规则 1–2: the chosen song is used only while the 课本 switch is on; what is heard (and kept) follows that. */
 const songOn=choice.songInUse(songSwitch,state.settings.inspiration);
 const heard=useMemo(()=>choice.heardSettings(state.settings,songOn),[songOn,state.settings]);
 // Teaching music is borrowed like a song once its card is made.
 const music=useBackgroundLayer(heard,instruments,tracks,true);
 /** What the background is made of right now (mood colour, borrowed rhythm), for the card. */
 const backgroundPlan=useMemo(()=>state.arrangement?music.plan(state.arrangement):null,
 // The plan only changes with the arrangement and what the background borrows.
 [state.arrangement,music.key]);
 /** 音乐小发现 and 课本讲解: corpus sentences at once, an AI rewording only where it passes the checks. */
 const talk=useTalk(state.arrangement,music.track,heard.inspiration,backgroundPlan,polisher);
 /** 规则 3: the AI background, made from the chosen song (switch on or not). */
 // 规则 3: the AI background follows the child's piece only, never the song.
 const ai=useAiBackground(state.arrangement,choice.aiBriefSettings(state.settings),music,generator);
 /** 规则 5: song or AI, one or the other. */
 const songPlays=choice.songPlays(songOn,ai.using);
 const instrumentPlan=useMemo(
  ()=>state.arrangement?(ai.using?ai.notePlan(state.arrangement):backgroundPlan):null,
  [state.arrangement,ai.using,ai.renderKey,backgroundPlan]);
 const soundingSpans=useMemo(()=>state.arrangement?timedEvents(state.arrangement):[],[state.arrangement]);
 const unavailableInstruments=useMemo(()=>new Map(instruments.map(item=>[
  item.id,instrumentUnavailable(instrumentPlan,ai.fixedAudio,music.chosen,item,soundingSpans),
 ])),[instruments,instrumentPlan,ai.fixedAudio,music.chosen,soundingSpans]);
 const unavailable=hoveredInstrument?unavailableInstruments.get(hoveredInstrument):null;
 const instrumentHint=hoveredInstrument==='coming'
  ?guideLines.instrumentsComing(comingInstruments.join('、'))
  :unavailable?guideLines.instrumentUnavailable[unavailable]:null;

 const played={
  // 规则 22: the volume slider (under 想听多久) sets the whole layer — song, AI or plain — up to 成曲's own maximum.
  gain:choice.backgroundGain(state.settings.background),
  key:`${music.key}|${ai.renderKey}`,
  // 规则 4: the AI background while it is used, else the local one.
  buffer:(arrangement:Arrangement)=>choice.playedBackground(ai.using)==='ai'
   ?ai.buffer(arrangement)??music.buffer(arrangement)
   :music.buffer(arrangement),
 };
 const playback=usePiecePlayback(latest,notify,played,layout);

 // ----- settings -----
 /** A new length restarts the piece; a length too short for the longest sound is only explained (playback goes on). */
 const setSpan=(spanSeconds:SpanSeconds)=>{
  const work=latest.current.arrangement;
  if(work&&spanHolds(work,spanSeconds))playback.reset();
  dispatch({type:'span',spanSeconds,now:new Date()});
 };
 /** Carries out one step of the rules: the 课本 switch and the background layer first, then the AI background, then the talk. */
 const apply=(move:Move)=>{
  if(move.song!==undefined)switchSong(move.song);
  if(move.background!==undefined&&move.background!==latest.current.settings.background.enabled)
   dispatch({type:'background-enabled',enabled:move.background});
  if(move.ai==='local')ai.useLocal();
  else if(move.ai==='prefer-ai')ai.preferAi();
  else if(move.ai==='toggle')ai.toggle();
  else if(move.ai==='make')makeAi(false);
  if(move.talk==='ensure')talk.ensure();
 };
 /** Whether a song is chosen right now (read at the moment of the tap). */
 const chosen=()=>latest.current.settings.inspiration.kind!=='none';
 /** 规则 7: choosing or letting go of a song in 课本灵感. */
 const setInspiration=(next:Inspiration)=>{
  apply(choice.chooseInspiration(next));
  dispatch({type:'inspiration',inspiration:next});
 };
 /** 规则 8: closing 课本灵感. */
 const applyChosenSong=()=>{
  apply(choice.closeInspiration(chosen(),songPlays));
 };
 /** 规则 9: the 课本 switch; false asks the page to open 课本灵感 (no song chosen yet). */
 const setSongSwitch=(on:boolean)=>{
  const move=choice.tapSongSwitch(on,chosen());
  if(move==='pick-song')return false;
  apply(move);
  dispatch({type:'said',lastAction:on?'inspiration':'inspiration-none'});
  return true;
 };
 /** 换一首: new AI music and a new explanation with it — the only way, besides opening the page, a model is asked. */
 const makeAi=(renewTalk:boolean)=>{
  dispatch({type:'said',lastAction:'ai-making'});
  // The explanation changes only with music an AI really made. Whatever plays in the AI's place (the AI's, or the
  // program's when no AI made one) takes the song's place: the 课本 switch goes off.
  ai.generate(outcome=>{
   dispatch({type:'said',lastAction:outcome==='ai'?'ai-background':'ai-failed'});
   // 规则 11.
   apply(choice.aiMade(outcome));
   if(outcome==='ai'){
    if(renewTalk)talk.renew();
    else talk.ensure();
   }
  });
 };
 // 规则 12: each composition opens once its data and device cache are ready.
 const opened=useRef<string|null>(null);
 useEffect(()=>{
  if(opened.current===ai.key||!state.arrangement?.events.length||!ai.kept)return;
  opened.current=ai.key;
  apply(choice.openPage({
   inUse:songOn,
   backgroundEnabled:state.settings.background.enabled,
   aiStatus:ai.state.status,
  }));
 // Each changed composition gets its own result; an unchanged composition reuses what was kept.
 },[ai.key,ai.kept]);

 // ----- shelf and sharing -----
 /** Whether this piece can go on the shelf; says why not (empty, or the untouched example). */
 const canSave=()=>{
  const arrangement=latest.current.arrangement;
  if(!arrangement?.events.length){
   notify('need-event','info');
   return false;
  }
  if(arrangement.origin==='example'){
   notify('example-save','info');
   return false;
  }
  return true;
 };
 const saveWork=async(title:string)=>{
  const current=latest.current;
  if(!canSave())return false;
  // What is kept is what is heard: a song with the 课本 switch off is not part of it, and composed notes (AI 作曲 /
  // 程序自编) go with the piece so the shelf plays the same music.
  const composed=heard.background.enabled&&choice.playedBackground(ai.using)==='ai'?ai.composed():null;
  const work=shelfEntry(
   {...current,settings:heard},
   title,
   new Date(),
   {background:ai.source,prompt:ai.prompt,rules:{...RULE_VERSIONS},...(composed?{composed}:{})});
  if(!work)return false;
  const result=await repository.saveWork(work);
  if(result.status==='failed'){
   notify('save-failed');
   return false;
  }
  if(!current.shelved)setShelfCount(count=>count+1);
  dispatch({type:'saved',work});
  return true;
 };
 const share=async()=>{
  const result=await repository.share(latest.current.arrangement?.id??'');
  if(result.status==='unavailable')notify('share-off','info');
 };
 const startNew=async()=>{
  playback.pause();
  try{
   await repository.startNew();
   return true;
  }catch{
   notify('save-failed');
   return false;
  }
 };

 return {
  state,
  layout,
  instruments,
  comingInstruments,
  unavailableInstruments,
  instrumentHint,
  hoverInstrument:setHoveredInstrument,
  chosen:music.chosen,
  parts:music.parts,
  entries,
  entry:music.track,
  teachingOpen,
  teachingItems,
  analyseTeaching,
  backgroundPlan,
  playing:playback.playing,
  preparing:playback.preparing,
  ended:playback.ended,
  /** The one playback time (seconds) the playhead, progress bar and highlights read. */
  now:playback.now,
  total:playback.total,
  sounding:playback.sounding,
  // On the shelf only if the background kept is the one saved, too.
  shelved:choice.onShelf(isShelved({...state,settings:heard}),state.shelved?.rendering.background,ai.source),
  shelfCount,
  ai:ai.state,
  aiSource:ai.source,
  /** The AI step running now (progress bar), and why the program composed alone when it did. */
  aiProgress:ai.progress,
  aiFallback:ai.fallbackReason,
  usingAi:ai.using,
  /** The 课本 switch (shared with 万物声场), and whether the chosen song's background is what plays now. */
  songSwitch:choice.shownSongSwitch(songSwitch,ai.using),
  songPlays,
  setSongSwitch,
  applyChosenSong,
  togglePlay:playback.togglePlay,
  restart:playback.restart,
  playFrom:playback.playFrom,
  scrubTo:playback.scrubTo,
  endScrub:playback.endScrub,
  setSpan,
  setInspiration,
  talk,
  /** 规则 23: the 背景音乐 switch as shown (off while the song plays). */
  backgroundSwitch:choice.shownBackgroundSwitch(state.settings.background.enabled,songPlays),
  /** 规则 24: tapping the 背景音乐 switch (making an AI background when there is none); the squirrel says what happened. */
  tapBackgroundSwitch:()=>{
   const shown=choice.shownBackgroundSwitch(latest.current.settings.background.enabled,songPlays);
   const move=choice.tapBackgroundSwitch(shown,ai.state.status);
   apply(move);
   // While one is being made, the squirrel says so (makeAi already did); otherwise whether the background is on.
   if(move.ai==='make')return;
   dispatch({type:'said',lastAction:move.background?'background-on':'background-off'});
  },
  setBackgroundVolume:(volume:number)=>dispatch({type:'background-volume',volume}),
  toggleInstrument:(id:string)=>{
   const selected=latest.current.settings.background.instruments.includes(id);
   if(!selected&&unavailableInstruments.get(id)){
    setHoveredInstrument(id);
    return;
   }
   setHoveredInstrument(null);
   dispatch({type:'instrument',id});
  },
  showComing:()=>dispatch({type:'said',lastAction:'instrument-coming'}),
  /** 规则 10: the AI chip (making one first when this piece has none; the squirrel then says how it went). */
  tapAi:()=>{
   const move=choice.tapAi(ai.state.status==='ready',ai.using,chosen());
   apply(move);
   if(move.ai==='make')return;
   dispatch({type:'said',lastAction:'ai-background'});
  },
  /** 换一首: new AI music and its explanation; the squirrel says how it went. */
  makeAi:()=>makeAi(true),
  canSave,
  saveWork,
  share,
  startNew,
  clearNotice:()=>dispatch({type:'notice',notice:null}),
 };
}
export type Compose=ReturnType<typeof useCompose>;
