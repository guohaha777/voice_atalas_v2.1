// 万物成曲 · 背景放谁（课本歌 / AI 背景 / 普通背景）：所有规则集中在这一个文件，全是纯函数。
// useCompose 和 useAiBackground 只按这里的结果去做（开关、AI 让开 / 回来、要不要做 AI、讲解要不要问）。
// 每条规则一段，编号和《成曲规则清单》、tests/compose-background-choice.test.ts 一一对应。
// 2026-10-31 整理时照搬当时的行为；之后按用户的纠正改（改规则先改清单，再改这里和对应测试）。
// 10-31 用户纠正：音量条移到「想听多久」下面、对课本歌和 AI 都管用、拉满更响（规则 22）；课本和背景音乐两张卡
// 二选一，放课本歌时背景音乐卡的开关也显示关（规则 23、24），放课本歌会把背景层打开（PLAY_SONG、规则 12）。
// 11-01 用户纠正：AI 背景只按孩子的作品和心情做，不用课本歌（规则 3）；AI 都没做成时程序自编，也占 AI 的位置
// （规则 11、14、16）。
//
// 用到的几样状态：
// - 课本开关 songSwitch：和万物声场共用的那个开关（shared/inspiration/textbookSwitch.ts，存本机）。
// - 选中的歌 inspiration：作品设置里的课本灵感（none = 没选；textbook = 课本歌；teaching-music = 教学音乐）。
// - AI 背景：这首作品有没有做好的 AI 背景（ready），以及现在用不用它（aiUsing）。
import type {BackgroundSource,BackgroundUnavailable} from '@wanwu-v2/contracts/background';
import type {BackgroundLayer,ComposeSettings,Inspiration} from '@wanwu-v2/contracts/work';
import {MIX_RULES} from '@wanwu-v2/sound-rules/mix';

/** 没选歌（课本歌不在用时，背景当作没选歌）。 */
export const NO_SONG:Inspiration={kind:'none'};

// ----- 规则 1：课本歌在用 -----
/** 课本开关开着，并且选了一首歌（课本歌或教学音乐）。 */
export const songInUse=(songSwitch:boolean,inspiration:Inspiration)=>songSwitch&&inspiration.kind!=='none';

// ----- 规则 2：听到的设置 -----
/**
 * 普通背景、讲解、存书架都按「听到的设置」：课本歌在用就是作品设置本身；不在用就当作没选歌（选过的歌还记着，
 * 只是这次不用）。
 */
export const heardSettings=(settings:ComposeSettings,inUse:boolean):ComposeSettings=>inUse
 ?settings
 :{...settings,inspiration:NO_SONG};

// ----- 规则 3：AI 背景不用课本歌 -----
/** 做 AI 背景只看孩子的作品（每个声音的特征、疏密）和心情：当作没选歌，选不选歌、开关开不开都一样。 */
export const aiBriefSettings=(settings:ComposeSettings):ComposeSettings=>({...settings,inspiration:NO_SONG});

// ----- 规则 4：放哪个背景 -----
/** AI 背景在用就放 AI 背景；否则放普通背景（课本歌在用时，普通背景跟着课本歌的节奏和感觉）。 */
export const playedBackground=(aiUsing:boolean):'ai'|'local'=>aiUsing?'ai':'local';

// ----- 规则 5：课本歌在放 -----
/** 二选一：课本歌在用、而且 AI 背景不在用，才算课本歌在放（课本卡不变灰）。 */
export const songPlays=(inUse:boolean,aiUsing:boolean)=>inUse&&!aiUsing;

// ----- 规则 6：页面上的课本开关 -----
/** AI 背景在用时，课本开关显示为关（真正存着的开关不变）。 */
export const shownSongSwitch=(songSwitch:boolean,aiUsing:boolean)=>songSwitch&&!aiUsing;

// ----- 动作：每个动作之后开关和 AI 怎么变 -----
/**
 * 一步要做的事：`song` = 把课本开关设成开 / 关（不写 = 不动）；`background` = 把背景层设成开 / 关（不写 = 不动；
 * 课本歌也从这一层放，关着就什么背景都没有）；`ai`：`local` = AI 让开（放普通背景），`prefer-ai` = 有 AI 背景就
 * 用回 AI，`toggle` = AI / 普通来回换，`make` = 去做一首 AI 背景；`talk: 'ensure'` = 讲解还没有 AI 措辞就问一次。
 */
export type Move={song?:boolean;background?:boolean;ai?:'local'|'prefer-ai'|'toggle'|'make';talk?:'ensure'};
/** 放课本歌：开关打开，背景层打开（歌从这一层放），AI 让开。 */
const PLAY_SONG:Move={song:true,background:true,ai:'local'};
/** 不放课本歌：开关关上，有 AI 背景就用回 AI。 */
const DROP_SONG:Move={song:false,ai:'prefer-ai'};

// ----- 规则 7：在课本对话框里选歌 / 取消选择 -----
/** 选了一首歌：马上放这首歌的背景；取消选择：开关关上，有 AI 背景就放 AI。 */
export const chooseInspiration=(next:Inspiration):Move=>next.kind!=='none'?PLAY_SONG:DROP_SONG;

// ----- 规则 8：关上课本对话框 -----
/** 关对话框时选着歌、但课本歌没在放：选中的就是「正在用」，放它。 */
export const closeInspiration=(chosen:boolean,playingSong:boolean):Move=>chosen&&!playingSong?PLAY_SONG:{};

// ----- 规则 9：点课本开关 -----
/** 打开时还没选歌：不动，让页面打开课本对话框（`pick-song`）；打开：放课本歌；关上：有 AI 就放 AI。 */
export function tapSongSwitch(on:boolean,chosen:boolean):Move|'pick-song'{
 if(on&&!chosen)return 'pick-song';
 return on?PLAY_SONG:DROP_SONG;
}

// ----- 规则 10：点 AI 标签 -----
/**
 * 还没有做好的 AI 背景：去做一首。正在用 AI：选着歌就回到课本歌，没选歌就换回普通背景。没在用 AI：开关关上，
 * 换成 AI。
 */
export function tapAi(aiReady:boolean,aiUsing:boolean,chosen:boolean):Move{
 if(!aiReady)return {ai:'make'};
 if(aiUsing)return chosen?PLAY_SONG:{ai:'toggle'};
 return {song:false,ai:'toggle'};
}

// ----- 规则 11：AI 背景做好了（打开页面、点 AI、换一首都走这里） -----
/**
 * AI 做成了，或者 AI 都没做成、程序自编了一首（降级）：这首背景占上（useAiBackground 自己转成「用 AI」），课本开关
 * 关上。`outcome` 说是哪一种；小松鼠和讲解按它说话，开关两种都一样。
 */
export const aiMade=(outcome:'ai'|'program'):Move=>{
 void outcome;
 return {song:false};
};

// ----- 规则 12：打开页面（只一次，作品和本机缓存都读到以后） -----
/**
 * 课本歌在用：放课本歌（背景层打开），什么都不问模型。背景关着：什么都不做。否则：这首作品还没有 AI 背景就做
 * 一首；已经有了（本机记着的）就只补一次讲解。
 */
export function openPage({inUse,backgroundEnabled,aiStatus}:{
 inUse:boolean;
 backgroundEnabled:boolean;
 aiStatus:AiBackgroundState['status'];
}):Move{
 if(inUse)return {background:true,ai:'local'};
 if(!backgroundEnabled)return {};
 if(aiStatus==='idle')return {ai:'make'};
 if(aiStatus==='ready')return {talk:'ensure'};
 return {};
}

// ----- 规则 13：已在书架上 -----
/** 和书架上那份一样（作品版本、听到的设置都一样），并且存的背景来源和现在放的一样，才算「已在书架」。 */
export const onShelf=(sameAsShelved:boolean,shelvedSource:BackgroundSource|undefined,source:BackgroundSource)=>
 sameAsShelved&&shelvedSource===source;

// ----- 规则 14：AI 背景的状态 -----
/**
 * `closed` = 本机记着的还没读完；`working` = 这首作品正在做；`ready` = 这首作品有 AI 做好的；`unavailable` = 这首
 * 作品上次 AI 没做成（程序自编的在放）；`idle` = 还没做过。没接 AI 也是 `idle`：去做时直接程序自编，原因记 not-open。
 */
export type AiSource=Exclude<BackgroundSource,'local-rules'|'program'>;
export type AiBackgroundState=
 |{status:'closed'}
 |{status:'idle'}
 |{status:'working'}
 |{status:'ready';source:AiSource}
 |{status:'unavailable';reason:BackgroundUnavailable};
/** `asking`：最近一次去做 AI（`key` 是哪首作品）；`made`：这首作品做好的 AI 背景（没有就是 null）。 */
export function aiStatus({open,kept,asking,briefKey,made}:{
 open:boolean;
 kept:boolean;
 asking:{key:string;status:'working'}|{key:string;status:'unavailable';reason:BackgroundUnavailable}|null;
 briefKey:string;
 made:{source:AiSource}|null;
}):AiBackgroundState{
 void open;
 if(!kept)return {status:'closed'};
 if(asking?.key===briefKey&&asking.status==='working')return {status:'working'};
 if(made)return {status:'ready',source:made.source};
 if(asking?.key===briefKey&&asking.status==='unavailable')return {status:'unavailable',reason:asking.reason};
 return {status:'idle'};
}

// ----- 规则 15：AI 背景默认在用 -----
/** 一打开页面就当作「用 AI」：这首作品一有 AI 背景（刚做好或本机记着的）就放它，除非规则 12 让它让开。 */
export const AI_USED_AT_START=true;

// ----- 规则 16：现在放的背景来源 -----
/**
 * 用着 AI 位置时：有 AI 做好的就是它的来源（audio-ai / voice-ai / notes-ai）；AI 没做成、程序自编了就是 program；
 * 否则是普通背景（local-rules）。存书架时记的就是它。
 */
export const usedSource=(using:boolean,made:{source:AiSource}|null,programMade=false):BackgroundSource=>
 !using?'local-rules':made?made.source:programMade?'program':'local-rules';

// ----- 规则 22：背景音量 -----
/**
 * 成曲的音量条（在「想听多久」下面）管放出来的整层背景——课本歌的、AI 的、普通的都一样；拉满是
 * `composeBackgroundMaxGain`（比万物声场用的 `backgroundMaxGain` 响）。背景层关着就没有声音。
 */
export const backgroundGain=(background:Pick<BackgroundLayer,'enabled'|'volume'>,maxGain=MIX_RULES.composeBackgroundMaxGain)=>
 background.enabled?background.volume*maxGain:0;

// ----- 规则 23：页面上的背景音乐开关 -----
/** 二选一：课本歌在放时，背景音乐卡（AI / 普通背景）的开关显示为关，卡片变灰（背景层其实开着，歌从这一层放）。 */
export const shownBackgroundSwitch=(enabled:boolean,playingSong:boolean)=>enabled&&!playingSong;

// ----- 规则 24：点背景音乐开关 -----
/**
 * 显示为开：关上背景层（什么背景都不放）。显示为关：打开背景层，课本开关关上，换成 AI 背景——这首作品（按选中的
 * 歌）还没有 AI 背景、或上次没做成，就马上去做一首（不用再点 AI 标签）；有了或正在做，就用它；没接 AI 就放普通背景。
 */
export function tapBackgroundSwitch(shownOn:boolean,aiStatus:AiBackgroundState['status']):Move{
 if(shownOn)return {background:false};
 const make=aiStatus==='idle'||aiStatus==='unavailable';
 return {...DROP_SONG,background:true,...(make?{ai:'make' as const}:{})};
}
