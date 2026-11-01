import {useEffect,useMemo,useRef,useState} from 'react';
import type {CSSProperties} from 'react';
import {inspirationCopy} from '../../../shared/inspiration/copy.ts';
import type {InspirationTab} from '../../../shared/inspiration/InspirationDialog.tsx';
import {Glyph,PaperIcon} from '../../../shared/ui/PaperIcon.tsx';
import type {PaperIconName,PaperTone} from '../../../shared/ui/PaperIcon.tsx';
import {composeCopy} from '../config/copy.ts';
import {minSpan} from '../../../shared/creation/arrangementTiming.ts';
import {spanChoices} from '../model/scoreLayout.ts';
import type {Compose} from '../model/useCompose.ts';
import styles from './SideCards.module.css';

/** Card icon: a solid paper cut-out in a palette colour (no backing shape), as on 声音诞生. */
const Badge=({icon,tone}:{icon:PaperIconName;tone:PaperTone})=>
 <span className={styles.badge}><PaperIcon name={icon} tone={tone}/></span>;

/** 想听多久？ The same 20 / 30 / 45 s as the field. A last sound may run a little past the length (mix rules `ending`);
 *  that is room for the piece, not a length of its own, so the card does not show it. Under the lengths: the
 *  background volume (规则 22), for whatever background plays — the song's, AI or plain. */
export function SpanCard({compose}:{compose:Compose}){
 const arrangement=compose.state.arrangement;
 const {background}=compose.state.settings;
 const choices=useMemo(()=>arrangement?spanChoices(arrangement):[],[arrangement]);
 const needed=useMemo(()=>arrangement?minSpan(arrangement):0,[arrangement]);
 return <section className={styles.card} aria-labelledby="span-title">
  <h3 id="span-title" className={styles.cardTitle}>
   <Badge icon="clock" tone="sky"/>
   {composeCopy.spanTitle}
  </h3>
  <div className={styles.spanOptions} role="radiogroup" aria-labelledby="span-title">
   {choices.map(({seconds})=>{
    // Shorter than the longest sound: greyed, still tappable so the squirrel can say which sound needs more room.
    const short=seconds<needed;
    return <button
     key={seconds}
     type="button"
     role="radio"
     aria-checked={arrangement?.spanSeconds===seconds}
     aria-disabled={short||undefined}
     className={styles.spanOption}
     onClick={()=>compose.setSpan(seconds)}>
     <b>{composeCopy.seconds(String(seconds))}</b>
     <small>{short?composeCopy.spanTooShort:composeCopy.spanOptions[seconds]}</small>
    </button>;
   })}
  </div>
  <label className={styles.volume}>
   <Glyph name="volume"/>
   <span className={styles.srOnly}>{composeCopy.volumeLabel}</span>
   <input
    type="range"
    min={0}
    max={1}
    step={.05}
    value={background.volume}
    disabled={!background.enabled}
    style={{'--fill':`${background.volume*100}%`} as CSSProperties}
    onChange={event=>compose.setBackgroundVolume(Number(event.target.value))}/>
  </label>
 </section>;
}

/**
 * 课本灵感 (optional, also offered in 万物声场): lends rhythm and feel to the background only. The switch is the one
 * 万物声场 has (there: the song's beat); the chosen song plays while it is on, and AI or song is one or the other.
 */
export function InspirationCard({compose,onOpen}:{compose:Compose;onOpen:(tab:InspirationTab)=>void}){
 const {inspiration,background}=compose.state.settings;
 /** The chosen song's name (a textbook song's title, or the teaching music's own name); null when none is chosen. */
 const songName=inspiration.kind==='textbook'
  ?compose.entries.find(item=>item.id===inspiration.entryId)?.title??null
  :inspiration.kind==='teaching-music'
   ?inspiration.name
   :null;
 // The song's name, then why it is not what plays (AI, switch off, card still being made, background off) if so.
 const lead=inspiration.kind==='none'
  ?composeCopy.inspirationLead
  :inspirationCopy.summary(inspiration,compose.entries)+'。'+(compose.usingAi
   ?composeCopy.inspirationAiPlays
   :!compose.songSwitch
    ?composeCopy.inspirationSwitchOff
    :inspiration.kind==='teaching-music'&&!compose.entry
     ?composeCopy.inspirationTeachingWait
     :background.enabled
      ?''
      :composeCopy.inspirationBackgroundOff);
 // Turning the switch on with no song chosen opens 课本灵感 to choose one.
 const toggle=()=>{
  if(!compose.setSongSwitch(!compose.songSwitch))onOpen('examples');
 };
 // One or the other: while the song is not what plays (AI background, or the switch off), the card is greyed.
 return <section
  className={`${styles.card} ${styles.fit}`}
  aria-labelledby="inspiration-title"
  data-dimmed={!compose.songPlays||undefined}>
  <h3 id="inspiration-title" className={styles.cardTitle}>
   <Badge icon="book" tone="pink"/>
   {composeCopy.inspirationTitle}
   <small>{composeCopy.inspirationOptional}</small>
  </h3>
  <p className={styles.cardLead}>{lead}</p>
  <div className={styles.songRow}>
   {/* Shows the chosen song (or that none is chosen yet); a tap opens 课本灵感 to choose or change it. */}
   <button
    type="button"
    className={styles.songPick}
    aria-label={songName?`${composeCopy.inspirationSong(songName)}，${composeCopy.inspirationChange}`:composeCopy.inspirationPick}
    onClick={()=>onOpen('examples')}>
    {songName?composeCopy.inspirationSong(songName):composeCopy.inspirationNoSong}
   </button>
   <button
    type="button"
    role="switch"
    aria-checked={compose.songSwitch}
    aria-label={composeCopy.inspirationToggle}
    className={styles.switch}
    onClick={toggle}>
    <span>{compose.songSwitch?composeCopy.backgroundOn:composeCopy.backgroundOff}</span>
    <i/>
   </button>
  </div>
 </section>;
}

/**
 * 背景音乐: its own layer under the child's sounds — on / off, who plays it (any instruments, or none = as generated),
 * and an AI chip once an AI background is ready (the volume is under 想听多久). Only controls here: the squirrel says
 * what each one did. The song or this card, one or the other: while the song plays the switch shows 关 (规则 23).
 */
/** What the AI chip's bubble says: the step at work, which scheme plays, or why the program composed alone. */
function aiSchemeText(compose:Compose){
 const {ai,aiProgress,aiFallback,aiSource,usingAi}=compose;
 if(ai.status==='working')
  return aiProgress?composeCopy.aiProgress(composeCopy.aiSteps[aiProgress.step]):composeCopy.aiMaking;
 if(ai.status==='unavailable'||aiFallback){
  const reason=composeCopy.aiReasons[ai.status==='unavailable'?ai.reason:aiFallback??'failed'];
  return composeCopy.aiProgram(reason)+(ai.status==='unavailable'&&ai.reason==='quota'?'':composeCopy.aiRetry);
 }
 if(ai.status==='ready'){
  if(!usingAi)return composeCopy.aiSwitchOn;
  return (aiSource in composeCopy.aiScheme?composeCopy.aiScheme[aiSource as keyof typeof composeCopy.aiScheme]:'')+composeCopy.aiSwitchOff;
 }
 return composeCopy.aiIdle;
}

/** While the AI composes: which model is at work, and a bar that runs over the time the page waits for it. */
function AiProgressBar({compose}:{compose:Compose}){
 const progress=compose.aiProgress;
 if(compose.ai.status!=='working'||!progress)return null;
 const label=composeCopy.aiProgress(composeCopy.aiSteps[progress.step]);
 return <div className={styles.aiProgress} role="progressbar" aria-label={label}>
  <span>{label}</span>
  {/* A new step starts the bar again; it fills over the step's waiting time. */}
  <i key={`${progress.step}|${progress.startedAt}`} style={{'--ai-wait':`${progress.timeoutMs}ms`} as CSSProperties}/>
 </div>;
}

export function BackgroundCard({compose}:{compose:Compose}){
 const {background}=compose.state.settings;
 const chosen=new Set(compose.chosen.map(item=>item.id));
 const working=compose.ai.status==='working';
 const failed=compose.ai.status==='unavailable';
 // When composing ends (AI or the program), the bubble shows for a moment which scheme now plays.
 const [tipShown,setTipShown]=useState(false);
 const wasWorking=useRef(working);
 useEffect(()=>{
  const ended=wasWorking.current&&!working;
  wasWorking.current=working;
  if(!ended)return;
  setTipShown(true);
  const timer=setTimeout(()=>setTipShown(false),4000);
  return()=>clearTimeout(timer);
 },[working]);
 /** One or the other: while a song's background plays, this card (the AI background) is greyed; the AI chip switches. */
 const songPlays=compose.songPlays;
 return <section
  className={styles.card}
  aria-labelledby="background-title"
  data-off={!background.enabled||undefined}
  data-song={songPlays||undefined}>
  <div className={styles.cardTop}>
   <h3 id="background-title" className={styles.cardTitle}><Badge icon="note" tone="lime"/>{composeCopy.backgroundTitle}
    {/* AI or the song's / first background, one or the other: the AI chip keeps its colour even while the card is greyed
        (it can always be tapped); a tap switches to AI (making one for this piece if there is none yet), or back. 换一首
        shows only while AI plays. */}
    {/* Grey, and named 程序, when no AI made this piece's background (the program's plays); the bubble says which scheme plays —
        on hover, keyboard focus, and for a moment after composing ends (phones have no hover). */}
    {compose.ai.status!=='closed'&&<span className={styles.tipWrap}>
     <button
      type="button"
      className={styles.sourceTag}
      aria-pressed={compose.usingAi&&!failed}
      data-failed={failed||undefined}
      disabled={working||!compose.state.arrangement?.events.length}
      aria-label={failed?composeCopy.aiProgramLabel:composeCopy.aiLabel(compose.usingAi)}
      aria-describedby="ai-scheme"
      onClick={compose.tapAi}>
      {working?composeCopy.aiMaking:failed?composeCopy.aiProgramTag:composeCopy.aiTag}
     </button>
     <span id="ai-scheme" role="tooltip" className={styles.aiTip} data-show={tipShown||undefined}>{aiSchemeText(compose)}</span>
    </span>}
    {/* 换一首 while an AI background plays; when the program's plays, tapping the grey chip asks again instead. */}
    {compose.usingAi&&!working&&!failed&&<button type="button" className={styles.sourceTag} onClick={compose.makeAi}>
     {composeCopy.aiMake}
    </button>}
   </h3>
   <button
    type="button"
    role="switch"
    aria-checked={compose.backgroundSwitch}
    aria-label={composeCopy.backgroundToggle}
    className={styles.switch}
    onClick={compose.tapBackgroundSwitch}>
    <span>{compose.backgroundSwitch?composeCopy.backgroundOn:composeCopy.backgroundOff}</span>
    <i/>
   </button>
  </div>
  <AiProgressBar compose={compose}/>
  <div className={styles.trackRow} role="group" aria-label={composeCopy.instrumentsLabel}>
   {compose.instruments.map(item=><button
    key={item.id}
    type="button"
    aria-pressed={chosen.has(item.id)}
    onClick={()=>compose.toggleInstrument(item.id)}>
    {chosen.has(item.id)&&<Glyph name="check"/>}
    {item.name}
   </button>)}
   {/* Instruments planned for later: one quiet chip; tapping it lets the squirrel say they are not open yet. */}
   {compose.comingInstruments.length>0&&<button
    type="button"
    className={styles.coming}
    aria-label={composeCopy.instrumentComing(compose.comingInstruments.join('、'))}
    onClick={compose.showComing}>
    <Glyph name="plus"/>
    {composeCopy.instrumentMore}
   </button>}
  </div>
 </section>;
}
