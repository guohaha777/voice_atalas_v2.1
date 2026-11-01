import {useMemo} from 'react';
import type {CSSProperties} from 'react';
import {inspirationCopy} from '../../../shared/inspiration/copy';
import type {InspirationTab} from '../../../shared/inspiration/InspirationDialog';
import {Glyph,PaperIcon} from '../../../shared/ui/PaperIcon';
import type {PaperIconName,PaperTone} from '../../../shared/ui/PaperIcon';
import {composeCopy} from '../config/copy';
import {minSpan} from '../../../shared/creation/arrangementTiming';
import {spanChoices} from '../model/scoreLayout';
import type {Compose} from '../model/useCompose';
import styles from './SideCards.module.css';

/** Card icon: a solid paper cut-out in a palette colour (no backing shape), as on 声音诞生. */
const Badge=({icon,tone}:{icon:PaperIconName;tone:PaperTone})=>
 <span className={styles.badge}><PaperIcon name={icon} tone={tone}/></span>;

/** 想听多久？ The same 20 / 30 / 45 s as the field. A last sound may run a little past the length (mix rules `ending`);
 *  that is room for the piece, not a length of its own, so the card does not show it. */
export function SpanCard({compose}:{compose:Compose}){
 const arrangement=compose.state.arrangement;
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
 </section>;
}

/**
 * 课本灵感 (optional, also offered in 万物声场): lends rhythm and feel to the background only. The switch is the one
 * 万物声场 has (there: the song's beat); the chosen song plays while it is on, and AI or song is one or the other.
 */
export function InspirationCard({compose,onOpen}:{compose:Compose;onOpen:(tab:InspirationTab)=>void}){
 const {inspiration,background}=compose.state.settings;
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
   <button type="button" className={styles.songPick} onClick={()=>onOpen('examples')}>
    {inspiration.kind==='none'?composeCopy.inspirationPick:composeCopy.inspirationChange}
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
 * how loud, and an AI chip once an AI background is ready. Only controls here: the squirrel says what each one did.
 */
export function BackgroundCard({compose}:{compose:Compose}){
 const {background}=compose.state.settings;
 const chosen=new Set(compose.chosen.map(item=>item.id));
 const working=compose.ai.status==='working';
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
    {compose.ai.status!=='closed'&&<button
     type="button"
     className={styles.sourceTag}
     aria-pressed={compose.usingAi}
     disabled={working||!compose.state.arrangement?.events.length}
     aria-label={composeCopy.aiLabel(compose.usingAi)}
     onClick={compose.tapAi}>
     {working?composeCopy.aiMaking:composeCopy.aiTag}
    </button>}
    {compose.usingAi&&!working&&<button type="button" className={styles.sourceTag} onClick={compose.makeAi}>
     {composeCopy.aiMake}
    </button>}
   </h3>
   <button
    type="button"
    role="switch"
    aria-checked={background.enabled}
    aria-label={composeCopy.backgroundToggle}
    className={styles.switch}
    onClick={()=>compose.setBackgroundEnabled(!background.enabled)}>
    <span>{background.enabled?composeCopy.backgroundOn:composeCopy.backgroundOff}</span>
    <i/>
   </button>
  </div>
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
