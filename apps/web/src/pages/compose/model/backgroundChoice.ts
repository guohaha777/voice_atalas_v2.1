// 万物成曲 · 背景放谁（课本歌 / AI 背景 / 普通背景）：所有规则集中在这一个文件，全是纯函数。
// useCompose 和 useAiBackground 只按这里的结果去做（开关、AI 让开 / 回来、要不要做 AI、讲解要不要问）。
// 每条规则一段，编号和《成曲规则清单》、tests/compose-background-choice.test.ts 一一对应。
// 这里照搬 2026-10-31 的行为，没有改任何规则（包括可能不对的）；要改规则先改清单，再改这里和对应测试。
//
// 用到的几样状态：
// - 课本开关 songSwitch：和万物声场共用的那个开关（shared/inspiration/textbookSwitch.ts，存本机）。
// - 选中的歌 inspiration：作品设置里的课本灵感（none = 没选；textbook = 课本歌；teaching-music = 教学音乐）。
// - AI 背景：这首作品有没有做好的 AI 背景（ready），以及现在用不用它（aiUsing）。
import type {BackgroundSource,BackgroundUnavailable} from '@wanwu-v2/contracts/background';
import type {ComposeSettings,Inspiration} from '@wanwu-v2/contracts/work';

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

// ----- 规则 3：AI 背景按选中的歌做 -----
/** 做 AI 背景用的是作品设置里选中的歌——课本开关关着也一样（不看规则 2）。 */
export const aiBriefSettings=(settings:ComposeSettings):ComposeSettings=>settings;

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
 * 一步要做的事：`song` = 把课本开关设成开 / 关（不写 = 不动）；`ai`：`local` = AI 让开（放普通背景），
 * `prefer-ai` = 有 AI 背景就用回 AI，`toggle` = AI / 普通来回换，`make` = 去做一首 AI 背景；`talk: 'ensure'` =
 * 讲解还没有 AI 措辞就问一次。
 */
export type Move={song?:boolean;ai?:'local'|'prefer-ai'|'toggle'|'make';talk?:'ensure'};
/** 放课本歌：开关打开，AI 让开。 */
const PLAY_SONG:Move={song:true,ai:'local'};
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
/** 做成了：AI 背景占上（useAiBackground 自己转成「用 AI」），课本开关关上；没做成：都不动。 */
export const aiMade=(ok:boolean):Move=>ok?{song:false}:{};

// ----- 规则 12：打开页面（只一次，作品和本机缓存都读到以后） -----
/**
 * 课本歌在用：放课本歌，什么都不问模型。背景关着：什么都不做。否则：这首作品还没有 AI 背景就做一首；已经有了
 * （本机记着的）就只补一次讲解。
 */
export function openPage({inUse,backgroundEnabled,aiStatus}:{
 inUse:boolean;
 backgroundEnabled:boolean;
 aiStatus:AiBackgroundState['status'];
}):Move{
 if(inUse)return {ai:'local'};
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
 * `closed` = 没接 AI，或者本机记着的还没读完；`working` = 这首作品正在做；`ready` = 这首作品有做好的；
 * `unavailable` = 这首作品上次没做成；`idle` = 还没做过。
 */
export type AiBackgroundState=
 |{status:'closed'}
 |{status:'idle'}
 |{status:'working'}
 |{status:'ready';source:Exclude<BackgroundSource,'local-rules'>}
 |{status:'unavailable';reason:BackgroundUnavailable};
/** `asking`：最近一次去做 AI（`key` 是哪首作品）；`made`：这首作品做好的 AI 背景（没有就是 null）。 */
export function aiStatus({open,kept,asking,briefKey,made}:{
 open:boolean;
 kept:boolean;
 asking:{key:string;status:'working'}|{key:string;status:'unavailable';reason:BackgroundUnavailable}|null;
 briefKey:string;
 made:{source:Exclude<BackgroundSource,'local-rules'>}|null;
}):AiBackgroundState{
 if(!open||!kept)return {status:'closed'};
 if(asking?.key===briefKey&&asking.status==='working')return {status:'working'};
 if(made)return {status:'ready',source:made.source};
 if(asking?.key===briefKey&&asking.status==='unavailable')return {status:'unavailable',reason:asking.reason};
 return {status:'idle'};
}

// ----- 规则 15：AI 背景默认在用 -----
/** 一打开页面就当作「用 AI」：这首作品一有 AI 背景（刚做好或本机记着的）就放它，除非规则 12 让它让开。 */
export const AI_USED_AT_START=true;

// ----- 规则 16：现在放的背景来源 -----
/** 用着 AI 且有做好的：AI 的来源（audio-ai / notes-ai）；否则是本地规则（local-rules）。存书架时记的就是它。 */
export const usedSource=(using:boolean,made:{source:Exclude<BackgroundSource,'local-rules'>}|null):BackgroundSource=>
 using&&made?made.source:'local-rules';
