import {useEffect,useMemo,useRef,useState} from 'react';
import type {ReactNode} from 'react';
import type {TextbookTrack} from '@wanwu-v2/contracts/textbook';
import type {Inspiration} from '@wanwu-v2/contracts/work';
import {trackWithMelody} from './melody/library.ts';
import {audioSupported} from '../audio/audioContext.ts';
import {SequencePlayer} from '../audio/SequencePlayer.ts';
import {Glyph} from '../ui/PaperIcon.tsx';
import {WorkSheet} from '../ui/WorkSheet.tsx';
import {inspirationCopy as copy} from './copy.ts';
import {renderRhythmPreview} from './rhythmPreview.ts';
import {originalWithBeat} from './originalBeat.ts';
import {MIX_RULES} from '@wanwu-v2/sound-rules/rules';
import {INSPIRATION_TABS,openingTab} from './tabs.ts';
import type {InspirationTab,InspirationVariant} from './tabs.ts';
import {useBuiltInTeaching} from './builtInTeaching.ts';
import {ExplainCardView} from './ExplainCardView.tsx';
import {CARD_BUDGET_MS,cardSources,madeByAi,trackSources} from './teachingCard.ts';
import type {TeachingCard} from './teachingCard.ts';
import {teachingMusic} from './teachingMusic.ts';
import type {PickResult,TeachingItem} from './teachingMusic.ts';
import styles from './InspirationDialog.module.css';

export type {InspirationTab,InspirationVariant} from './tabs.ts';

/**
 * One thing sounds at a time in the dialog: a song's preview (rendered in the browser: its background, or only its beat
 * in 万物声场), or a recording with its beat (听原曲, ./originalBeat.ts: a 案例's, or a song uploaded on this device).
 * Tapping what plays stops it; switching tabs or closing the dialog stops everything.
 */
function useListening(variant:InspirationVariant){
 const [playing,setPlaying]=useState<string|null>(null);
 const player=useMemo(()=>new SequencePlayer(key=>setPlaying(key)),[]);
 const previews=useRef(new Map<string,Promise<AudioBuffer>>());
 // A tap while a recording is still loading wins: the load that finishes later does not start.
 const asked=useRef(0);
 const stop=()=>{
  asked.current++;
  player.stop();
  setPlaying(null);
 };
 useEffect(()=>()=>player.stop(),[player]);
 const entry=async(item:TextbookTrack)=>{
  const key=`entry:${item.id}`;
  if(playing===key)return stop();
  stop();
  if(!audioSupported())return;
  let render=previews.current.get(item.id);
  if(!render){
   render=(variant==='full'?trackWithMelody(item).catch(()=>item):Promise.resolve(item))
    .then(track=>renderRhythmPreview(track,variant));
   previews.current.set(item.id,render);
  }
  setPlaying(key);
  try{
   await player.playOne(key,await render);
  }catch{
   setPlaying(null);
  }
 };
 /** 听原曲: the recording and its beat on one clock (the first tap loads and measures it, well under a second). */
 const original=async(item:TextbookTrack,url:string)=>{
  const key=`original:${item.id}`;
  if(playing===key)return stop();
  stop();
  if(!audioSupported())return;
  const ask=asked.current;
  setPlaying(key);
  try{
   const made=await originalWithBeat(item,url);
   if(asked.current!==ask)return;
   await player.play(
    key,
    [{at:0,buffer:made.original},{at:made.beatAt,buffer:made.beat,layer:'beat'}],
    MIX_RULES.childGain,
    {layers:{beat:made.beatGain},limiter:MIX_RULES.limiter});
  }catch{
   if(asked.current===ask)setPlaying(null);
  }
 };
 return {playing,entry,original,stop};
}

type Listening=ReturnType<typeof useListening>;

/**
 * One row of 教学音乐 (and the upload waiting in 上传歌曲): the play button plays the song's beat or background preview
 * (again to stop); tapping the rest of the row opens or closes its explanation — only one is open at a time — where
 * 听原曲 plays the recording with its beat. 用这个 chooses it.
 */
function SongRowView({track,url,tags,open,onToggle,listening,using,onUse,children}:{
 track:TextbookTrack;
 url:string|null;
 tags:ReactNode;
 open:boolean;
 onToggle:()=>void;
 listening:Listening;
 using?:boolean;
 onUse?:()=>void;
 children:ReactNode;
}){
 const sounding=listening.playing===`entry:${track.id}`;
 const playingOriginal=!!url&&listening.playing===`original:${track.id}`;
 // The explanation is open: get 听原曲 ready (the recording is loaded and measured once).
 useEffect(()=>{
  if(open&&url&&audioSupported())void originalWithBeat(track,url).catch(()=>{});
 },[open,url,track]);
 return <li data-using={using||undefined}>
  <div className={styles.entryPlay}>
   <button
    type="button"
    className={styles.playDot}
    aria-pressed={sounding}
    aria-label={`${sounding?copy.stopListen:copy.listen}「${track.title}」`}
    onClick={()=>void listening.entry(track)}>
    <Glyph name={sounding?'stop':'play'}/>
   </button>
   <button type="button" className={styles.entryOpen} aria-expanded={open} onClick={onToggle}>
    <span className={styles.entryText}>
     <b>{track.title}{tags}</b>
     <small>{copy.feel(track)}</small>
    </span>
   </button>
  </div>
  {onUse&&<button type="button" className={styles.use} aria-pressed={using} onClick={onUse}>
   {using?copy.using:copy.use}
  </button>}
  {open&&<div className={styles.caseBody}>
   {children}
   {url&&<button
    type="button"
    className={styles.caseListen}
    aria-pressed={playingOriginal}
    onClick={()=>void listening.original(track,url)}>
    <Glyph name={playingOriginal?'stop':'play'}/>
    {playingOriginal?copy.stopListen:copy.cases.listen}
   </button>}
  </div>}
 </li>;
}

/** Which row of 教学音乐 is open (one at a time; tapping it again closes it). */
type Opened={open:string|null;toggle:(id:string)=>void};

/**
 * 课本灵感: 教学音乐 lists the system songs and then the songs added from this device; 上传歌曲 uploads one, shows its card
 * and waits for 加入教学音乐. One dialog for both pages: in 万物声场 (`beat`) a song lends only its beat, so the play
 * button plays the beat; in 万物成曲 (`full`) its background. Uploads stay on this device and get a feature card within
 * about 15 s (./teachingCard.ts); with it, the page borrows the music like a song.
 */
export function InspirationDialog({
 value,
 entries,
 variant='full',
 initialTab,
 teachingOpen=false,
 teachingItems=[],
 onAnalyse=()=>{},
 onChange,
 onClose,
}:{
 value:Inspiration;
 entries:readonly TextbookTrack[];
 variant?:InspirationVariant;
 /** Teaching music on this device with its cards, and how a card is made (the page's port). */
 teachingItems?:readonly TeachingItem[];
 onAnalyse?:(musicId:string)=>void;
 /** A tab the page asks for; otherwise the shared opening rule (./tabs.ts). */
 initialTab?:InspirationTab;
 /** Whether teaching music can be analysed (the server is connected); until then the tab says it is not open. */
 teachingOpen?:boolean;
 onChange:(next:Inspiration)=>void;
 onClose:()=>void;
}){
 const [tab,setTab]=useState<InspirationTab>(initialTab??openingTab(teachingItems.some(item=>!item.confirmed)));
 const [open,setOpen]=useState<string|null>(null);
 const opened:Opened={open,toggle:id=>setOpen(current=>current===id?null:id)};
 const listening=useListening(variant);
 const builtIns=useBuiltInTeaching();
 const mine=teachingItems.filter(item=>item.confirmed&&item.card);
 /**
  * The chosen row is the one in use (正在用): tapping it again lets it go (the dialog stays open); 用这个 chooses and
  * closes.
  */
 const choose=(using:boolean,next:Inspiration)=>{
  if(using){
   onChange({kind:'none'});
   return;
  }
  onChange(next);
  onClose();
 };
 return <WorkSheet
  title={copy.title}
  description={variant==='beat'?copy.beatDescription:copy.description}
  className={styles.songSheet}
  onClose={onClose}>
  <div className={styles.tabs} role="tablist" data-count={INSPIRATION_TABS.length}>
   {INSPIRATION_TABS.map(id=><button
    key={id}
    type="button"
    role="tab"
    aria-selected={tab===id}
    onClick={()=>{
     listening.stop();
     setTab(id);
    }}>
    <Glyph name={id==='examples'?'book':'upload'}/>{copy.tabs[id]}
   </button>)}
  </div>
  <div className={styles.panel} role="tabpanel">
   {tab==='examples'?<>
    <p className={styles.note}><Glyph name="lock"/>{copy.catalogueNote}</p>
    <ul className={styles.entries}>
     {entries.map(entry=>{
      const recording=builtIns.find(item=>item.name===entry.title);
      return <SongRowView
       key={entry.id}
       track={entry}
       url={recording?.url??null}
       tags={<>{!entry.source&&<em>{copy.example}</em>}{recording&&<em>{copy.cases.tag}</em>}</>}
       open={opened.open===entry.id}
       onToggle={()=>opened.toggle(entry.id)}
       listening={listening}
       using={value.kind==='textbook'&&value.entryId===entry.id}
       onUse={()=>choose(value.kind==='textbook'&&value.entryId===entry.id,{kind:'textbook',entryId:entry.id})}>
       <ExplainCardView track={entry} reply={null} sources={trackSources(entry)}/>
      </SongRowView>;
     })}
     {mine.map(item=><SongRowView
      key={item.id}
      track={item.card!.track}
      url={item.url}
      tags={<MineTags card={item.card!}/>}
      open={opened.open===item.id}
      onToggle={()=>opened.toggle(item.id)}
      listening={listening}
      using={value.kind==='teaching-music'&&value.musicId===item.id}
      onUse={()=>choose(
       value.kind==='teaching-music'&&value.musicId===item.id,
       {kind:'teaching-music',musicId:item.id,name:item.name,durationMs:item.durationMs})}>
      <ExplainCardView track={item.card!.track} reply={item.card!.explain??null} sources={cardSources(item.card!)}/>
     </SongRowView>)}
    </ul>
   </>:<TeachingMusicPanel
    open={teachingOpen}
    items={teachingItems}
    listening={listening}
    onAnalyse={onAnalyse}
    onAdded={id=>{
     listening.stop();
     setOpen(id);
     setTab('examples');
    }}/>}
  </div>
 </WorkSheet>;
}

/** An upload's card: the explanation card. */
function CardView({card}:{card:TeachingCard}){
 return <ExplainCardView track={card.track} reply={card.explain??null} sources={cardSources(card)}/>;
}

/**
 * Beside an upload's name: 我的, and a small AI bubble when the model wrote part of its card (nothing when the program
 * did).
 */
function MineTags({card}:{card:TeachingCard}){
 return <>
  <em>{copy.mine}</em>
  {madeByAi(card)&&<em className={styles.ai} title={copy.aiTitle}>{copy.ai}</em>}
 </>;
}

/**
 * 上传歌曲: pick a file; while its card is made, the progress; then the song as a row like 教学音乐's (play, open, 听原曲)
 * with its card, and 加入教学音乐 / 再解析一次 / 重新上传 / 取消. Only 加入教学音乐 puts it in the list.
 */
function TeachingMusicPanel({open,items,listening,onAnalyse,onAdded}:{
 open:boolean;
 items:readonly TeachingItem[];
 listening:Listening;
 onAnalyse:(musicId:string)=>void;
 onAdded:(id:string)=>void;
}){
 const [error,setError]=useState<Exclude<PickResult['status'],'picked'|'already'>|null>(null);
 const [already,setAlready]=useState<string|null>(null);
 const [cardOpen,setCardOpen]=useState(true);
 const input=useRef<HTMLInputElement>(null);
 const item=items.find(entry=>!entry.confirmed)??null;
 // A piece without its card (just picked, made again, or closed before it was done) gets one now.
 useEffect(()=>{
  if(item&&!item.card&&!item.analysing&&!item.failed)onAnalyse(item.id);
 },[item,onAnalyse]);
 const pick=async(file:File|undefined)=>{
  if(!file)return;
  listening.stop();
  const result=await teachingMusic.pick(file);
  setAlready(result.status==='already'?result.music.name:null);
  setError(result.status==='picked'||result.status==='already'?null:result.status);
  setCardOpen(true);
 };
 return <div className={styles.upload}>
  <input
   ref={input}
   type="file"
   accept="audio/*"
   hidden
   onChange={event=>{
    void pick(event.target.files?.[0]);
    event.target.value='';
   }}/>
  {!item&&<p className={styles.hint}>{already?copy.upload.already(already):copy.upload.hint}</p>}
  {item?.analysing&&<div className={styles.analysing} data-stage={item.analysing} role="status">
   <span>{copy.upload.analysing[item.analysing]}</span>
   <span className={styles.analysingTrack} aria-hidden="true">
    <i style={{animationDuration:`${CARD_BUDGET_MS}ms`}}/>
   </span>
  </div>}
  {item?.card&&<ul className={styles.entries}>
   <SongRowView
    track={item.card.track}
    url={item.url}
    tags={<MineTags card={item.card}/>}
    open={cardOpen}
    onToggle={()=>setCardOpen(current=>!current)}
    listening={listening}>
    <CardView card={item.card}/>
   </SongRowView>
  </ul>}
  {item?.failed&&<p className={styles.error} role="alert">
   {item.failed==='not-music'?copy.upload.notMusic:copy.upload.errors.unreadable}
  </p>}
  {item?<div className={styles.uploadActions}>
   {item.card&&<button
    type="button"
    className={styles.use}
    onClick={()=>{
     teachingMusic.confirm(item.id);
     onAdded(item.id);
    }}>
    {copy.upload.confirm}
   </button>}
   {(item.card||item.failed==='unreadable')&&<button
    type="button"
    className={styles.pick}
    onClick={()=>{
     listening.stop();
     teachingMusic.reanalyse(item.id);
    }}>
    {copy.upload.reanalyse}
   </button>}
   <button type="button" className={styles.pick} onClick={()=>input.current?.click()}>
    <Glyph name="upload"/>
    {copy.upload.repick}
   </button>
   <button
    type="button"
    className={styles.pick}
    onClick={()=>{
     listening.stop();
     teachingMusic.remove(item.id);
    }}>
    {copy.upload.cancel}
   </button>
  </div>
  :<button type="button" className={styles.pick} onClick={()=>input.current?.click()}>
   <Glyph name="upload"/>
   {copy.upload.pick}
  </button>}
  {error&&<p className={styles.error} role="alert">{copy.upload.errors[error]}</p>}
  {!open&&<p className={styles.note}><Glyph name="lock"/>{copy.upload.off}</p>}
 </div>;
}
