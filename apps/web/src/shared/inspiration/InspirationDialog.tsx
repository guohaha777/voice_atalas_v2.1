import {useEffect,useMemo,useRef,useState} from 'react';
import {metreNames as corpusMetreNames,rhythmWords,songFeature} from '@wanwu-v2/prompts/corpus';
import type {TextbookTrack} from '@wanwu-v2/contracts/textbook';
import type {Inspiration} from '@wanwu-v2/contracts/work';
import {audioSupported} from '../audio/audioContext';
import {SequencePlayer} from '../audio/SequencePlayer';
import {Glyph} from '../ui/PaperIcon';
import {WorkSheet,sheetStyles} from '../ui/WorkSheet';
import {inspirationCopy as copy} from './copy';
import {renderRhythmPreview} from './rhythmPreview';
import {INSPIRATION_TABS,openingTab} from './tabs';
import type {InspirationTab,InspirationVariant} from './tabs';
import {useBuiltInTeaching} from './builtInTeaching';
import type {BuiltInTeaching} from './builtInTeaching';
import {CARD_BUDGET_MS} from './teachingCard';
import type {TeachingCard} from './teachingCard';
import {teachingMusic} from './teachingMusic';
import type {LocalTeachingMusic,PickResult,TeachingItem} from './teachingMusic';
import styles from './InspirationDialog.module.css';

export type {InspirationTab,InspirationVariant} from './tabs';

/**
 * One thing sounds at a time in the dialog: a song's preview (rendered in the browser: its background, or only its beat
 * in 万物声场) or the picked teaching music (a local file). Tapping what plays stops it; switching tabs or closing the
 * dialog stops everything.
 */
function useListening(variant:InspirationVariant){
 const [playing,setPlaying]=useState<string|null>(null);
 const player=useMemo(()=>new SequencePlayer(key=>setPlaying(current=>key??(current?.startsWith('music:')?current:null))),[]);
 const audio=useRef<HTMLAudioElement|null>(null);
 const previews=useRef(new Map<string,Promise<AudioBuffer>>());
 const stop=()=>{player.stop();audio.current?.pause();setPlaying(null);};
 useEffect(()=>()=>{player.stop();audio.current?.pause();},[player]);
 const entry=async(item:TextbookTrack)=>{
  const key=`entry:${item.id}`;
  if(playing===key)return stop();
  stop();if(!audioSupported())return;
  let render=previews.current.get(item.id);
  if(!render){render=renderRhythmPreview(item,variant);previews.current.set(item.id,render);}
  setPlaying(key);
  try{await player.playOne(key,await render);}catch{setPlaying(null);}
 };
 const music=(item:LocalTeachingMusic)=>{
  const key=`music:${item.id}`;
  if(playing===key)return stop();
  stop();
  const element=audio.current??new Audio();audio.current=element;
  element.onended=()=>setPlaying(null);element.src=item.url;
  setPlaying(key);void element.play().catch(()=>setPlaying(null));
 };
 return {playing,entry,music,stop};
}

type Listening=ReturnType<typeof useListening>;

/**
 * One song: tap the row to hear it (again to stop) — the tap also opens its explanation (its beat, rhythm and feel, from
 * the song's card — no model call), and for a 案例 (a built-in recording of the song) 听原曲; 用这个 chooses it.
 */
function SongRow({entry,recording,value,listening,onChange,onClose}:{entry:TextbookTrack;recording?:BuiltInTeaching;value:Inspiration;listening:Listening;onChange:(next:Inspiration)=>void;onClose:()=>void}){
 const [open,setOpen]=useState(false);
 const using=value.kind==='textbook'&&value.entryId===entry.id;
 const sounding=listening.playing===`entry:${entry.id}`,original=recording&&{id:`case:${entry.id}`,name:entry.title,durationMs:0,bytes:0,url:recording.url};
 const playingOriginal=!!original&&listening.playing===`music:${original.id}`;
 return <li data-using={using||undefined}>
  <button type="button" className={styles.entryPlay} aria-pressed={sounding} aria-expanded={open} aria-label={`${sounding?copy.stopListen:copy.listen}「${entry.title}」`}
   onClick={()=>{setOpen(true);void listening.entry(entry);}}>
   <span className={styles.playDot}><Glyph name={sounding?'stop':'play'}/></span>
   <span className={styles.entryText}><b>{entry.title}{!entry.source&&<em>{copy.example}</em>}{recording&&<em>{copy.cases.tag}</em>}</b><small>{copy.feel(entry)}</small></span>
  </button>
  <button type="button" className={styles.use} aria-pressed={using} onClick={()=>{onChange({kind:'textbook',entryId:entry.id});onClose();}}>{using?copy.using:copy.use}</button>
  {open&&<div className={styles.caseBody}>
   <div className={styles.teachingCard}><p>{songFeature(entry)}</p></div>
   {original&&<button type="button" className={styles.caseListen} aria-pressed={playingOriginal} onClick={()=>listening.music(original)}><Glyph name={playingOriginal?'stop':'play'}/>{playingOriginal?copy.stopListen:copy.cases.listen}</button>}
  </div>}
 </li>;
}

/**
 * 课本灵感: pick a textbook song, or upload teaching music. One dialog for both pages: in 万物声场 (`beat`) a song lends
 * only its beat, so 听一听 plays the beat; in 万物成曲 (`full`) its background. Teaching music stays on this device and
 * gets a feature card within about 15 s (./teachingCard.ts); with it, the page borrows the music like a song.
 */
export function InspirationDialog({value,entries,variant='full',initialTab,teachingOpen=false,teachingItems=[],onAnalyse=()=>{},onChange,onClose}:{value:Inspiration;entries:readonly TextbookTrack[];
 variant?:InspirationVariant;
 /** Teaching music on this device with its cards, and how a card is made (the page's port). */
 teachingItems?:readonly TeachingItem[];onAnalyse?:(musicId:string)=>void;
 /** A tab the page asks for; otherwise the shared opening rule (./tabs.ts). */
 initialTab?:InspirationTab;
 /** Whether teaching music can be analysed (the server is connected); until then the tab says it is not open. */
 teachingOpen?:boolean;onChange:(next:Inspiration)=>void;onClose:()=>void}){
 const [tab,setTab]=useState<InspirationTab>(initialTab??openingTab(value));
 const listening=useListening(variant);
 const builtIns=useBuiltInTeaching();
 return <WorkSheet title={copy.title} description={variant==='beat'?copy.beatDescription:copy.description} className={styles.songSheet} onClose={onClose}>
  <div className={styles.tabs} role="tablist" data-count={INSPIRATION_TABS.length}>
   {INSPIRATION_TABS.map(id=><button key={id} type="button" role="tab" aria-selected={tab===id} onClick={()=>{listening.stop();setTab(id);}}>
    <Glyph name={id==='examples'?'book':'upload'}/>{copy.tabs[id]}
   </button>)}
  </div>
  <div className={styles.panel} role="tabpanel">
   {tab==='examples'?<>
    <p className={styles.note}><Glyph name="lock"/>{copy.catalogueNote}</p>
    <ul className={styles.entries}>{entries.map(entry=><SongRow key={entry.id} entry={entry} recording={builtIns.find(item=>item.name===entry.title)} value={value} listening={listening} onChange={onChange} onClose={onClose}/>)}</ul>
   </>:<TeachingMusicPanel value={value} open={teachingOpen} items={teachingItems} onAnalyse={onAnalyse} onChange={onChange}/>}
  </div>
  <div className={sheetStyles.actions}>
   <button type="button" className={sheetStyles.secondary} onClick={()=>{onChange({kind:'none'});onClose();}}>{copy.none}</button>
   <button type="button" className={sheetStyles.primary} onClick={onClose}>{copy.done}</button>
  </div>
 </WorkSheet>;
}

/** A teaching-music card: its beat and rhythm, the line for children, the note for teachers, and who made it. */
function CardView({card}:{card:TeachingCard}){
 const {track}=card;
 return <div className={styles.teachingCard}>
  <b>{copy.upload.card(corpusMetreNames()[track.meter],rhythmWords(track.rhythmCell))}</b>
  <p>{track.childLine}</p>
  {card.teacherNote&&<p className={styles.teacherNote}><small>{copy.upload.noteLabel}</small>{card.teacherNote}</p>}
  <small className={styles.madeBy}>{copy.upload.madeBy[card.madeBy]}{card.partly&&`（${copy.upload.partly}）`}</small>
 </div>;
}

/** 教学音乐: only the upload area — pick a file, then its card (being made, made, or why it could not be read). */
function TeachingMusicPanel({value,open,items,onAnalyse,onChange}:{value:Inspiration;open:boolean;items:readonly TeachingItem[];onAnalyse:(musicId:string)=>void;onChange:(next:Inspiration)=>void}){
 const [pickedId,setPickedId]=useState<string|null>(value.kind==='teaching-music'?value.musicId:null);
 const [error,setError]=useState<Exclude<PickResult['status'],'picked'>|null>(null);
 const input=useRef<HTMLInputElement>(null);
 const item=items.find(entry=>entry.id===pickedId)??null;
 // A piece without its card (just picked, or closed before it was done) gets one now.
 useEffect(()=>{if(item&&!item.card&&!item.analysing&&!item.failed)onAnalyse(item.id);},[item,onAnalyse]);
 const picked=(result:PickResult)=>{
  if(result.status!=='picked'){setError(result.status);return;}
  setError(null);setPickedId(result.music.id);
  onChange({kind:'teaching-music',musicId:result.music.id,name:result.music.name,durationMs:result.music.durationMs});
 };
 const pick=async(file:File|undefined)=>{
  if(!file)return;
  picked(await teachingMusic.pick(file));
 };
 return <div className={styles.upload}>
  <input ref={input} type="file" accept="audio/*" hidden onChange={event=>{void pick(event.target.files?.[0]);event.target.value='';}}/>
  {!item&&<p className={styles.hint}>{copy.upload.hint}</p>}
  {item?.analysing&&<div className={styles.analysing} role="status">
   <span>{copy.upload.analysing[item.analysing]}</span>
   <span className={styles.analysingTrack} aria-hidden="true"><i style={{animationDuration:`${CARD_BUDGET_MS}ms`}}/></span>
  </div>}
  {item?.card&&<CardView card={item.card}/>}
  {item?.failed&&<p className={styles.error} role="alert">{copy.upload.errors.unreadable}</p>}
  <button type="button" className={styles.pick} onClick={()=>input.current?.click()}><Glyph name="upload"/>{item?copy.upload.repick:copy.upload.pick}</button>
  {error&&<p className={styles.error} role="alert">{copy.upload.errors[error]}</p>}
  {!open&&<p className={styles.note}><Glyph name="lock"/>{copy.upload.off}</p>}
 </div>;
}
