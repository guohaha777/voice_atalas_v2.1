// 万物成曲 · 背景放谁：src/pages/compose/model/backgroundChoice.ts 的每条规则一个测试（编号同《成曲规则清单》）。
// 这些测试记下的是 2026-10-31 的行为，不代表规则都对；改规则时先改清单，再改规则文件和这里。
// 10-31 用户纠正：放课本歌时背景层打开（规则 7–10、12 的期望多了 background:true），新增规则 22–24。
import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_COMPOSE_SETTINGS} from '@wanwu-v2/contracts/work';
import type {ComposeSettings,Inspiration} from '@wanwu-v2/contracts/work';
import {MIX_RULES} from '@wanwu-v2/sound-rules/mix';
import * as choice from '../src/pages/compose/model/backgroundChoice.ts';

const SONG:Inspiration={kind:'textbook',entryId:'tb:ry1:u2:birds-singing'};
const MUSIC:Inspiration={kind:'teaching-music',musicId:'teaching:1',name:'我的歌',durationMs:60_000};
const NONE:Inspiration={kind:'none'};
const withSong:ComposeSettings={...DEFAULT_COMPOSE_SETTINGS,inspiration:SONG};

test('规则 1 课本歌在用：开关开着并且选了歌（课本歌或教学音乐）',()=>{
 assert.equal(choice.songInUse(true,SONG),true);
 assert.equal(choice.songInUse(true,MUSIC),true);
 assert.equal(choice.songInUse(false,SONG),false,'开关关着：选着歌也不用');
 assert.equal(choice.songInUse(true,NONE),false,'没选歌：开关开着也不用');
});

test('规则 2 听到的设置：课本歌不在用时当作没选歌，其他设置不变',()=>{
 assert.equal(choice.heardSettings(withSong,true),withSong);
 const heard=choice.heardSettings(withSong,false);
 assert.deepEqual(heard.inspiration,{kind:'none'});
 assert.equal(heard.background,withSong.background);
});

test('规则 3 AI 背景按选中的歌做：开关关着也用作品设置里的歌',()=>{
 assert.equal(choice.aiBriefSettings(withSong),withSong);
});

test('规则 4 放哪个背景：AI 在用放 AI，否则放普通背景',()=>{
 assert.equal(choice.playedBackground(true),'ai');
 assert.equal(choice.playedBackground(false),'local');
});

test('规则 5 课本歌在放：课本歌在用并且 AI 不在用（二选一）',()=>{
 assert.equal(choice.songPlays(true,false),true);
 assert.equal(choice.songPlays(true,true),false);
 assert.equal(choice.songPlays(false,false),false);
});

test('规则 6 页面上的课本开关：AI 在用时显示为关',()=>{
 assert.equal(choice.shownSongSwitch(true,false),true);
 assert.equal(choice.shownSongSwitch(true,true),false);
 assert.equal(choice.shownSongSwitch(false,false),false);
});

test('规则 7 选歌：放这首歌（开关开、AI 让开）；取消选择：开关关、有 AI 就用回 AI',()=>{
 assert.deepEqual(choice.chooseInspiration(SONG),{song:true,background:true,ai:'local'});
 assert.deepEqual(choice.chooseInspiration(MUSIC),{song:true,background:true,ai:'local'});
 assert.deepEqual(choice.chooseInspiration(NONE),{song:false,ai:'prefer-ai'});
});

test('规则 8 关上课本对话框：选着歌但没在放，就放它；否则不动',()=>{
 assert.deepEqual(choice.closeInspiration(true,false),{song:true,background:true,ai:'local'});
 assert.deepEqual(choice.closeInspiration(true,true),{});
 assert.deepEqual(choice.closeInspiration(false,false),{});
});

test('规则 9 点课本开关：没选歌时打开 = 去选歌；打开 = 放课本歌；关上 = 有 AI 就放 AI',()=>{
 assert.equal(choice.tapSongSwitch(true,false),'pick-song');
 assert.deepEqual(choice.tapSongSwitch(true,true),{song:true,background:true,ai:'local'});
 assert.deepEqual(choice.tapSongSwitch(false,true),{song:false,ai:'prefer-ai'});
 assert.deepEqual(choice.tapSongSwitch(false,false),{song:false,ai:'prefer-ai'});
});

test('规则 10 点 AI 标签：没有就做一首；在用 AI 时回到课本歌或普通背景；没在用就换成 AI 并关开关',()=>{
 assert.deepEqual(choice.tapAi(false,false,true),{ai:'make'});
 assert.deepEqual(choice.tapAi(false,true,false),{ai:'make'});
 assert.deepEqual(choice.tapAi(true,true,true),{song:true,background:true,ai:'local'});
 assert.deepEqual(choice.tapAi(true,true,false),{ai:'toggle'});
 assert.deepEqual(choice.tapAi(true,false,true),{song:false,ai:'toggle'});
 assert.deepEqual(choice.tapAi(true,false,false),{song:false,ai:'toggle'});
});

test('规则 11 AI 背景做好了：课本开关关上；没做成：不动',()=>{
 assert.deepEqual(choice.aiMade(true),{song:false});
 assert.deepEqual(choice.aiMade(false),{});
});

test('规则 12 打开页面：课本歌在用就放它；背景关着不动；没有 AI 就做一首；已有就只补讲解',()=>{
 assert.deepEqual(choice.openPage({inUse:true,backgroundEnabled:true,aiStatus:'idle'}),{background:true,ai:'local'});
 assert.deepEqual(choice.openPage({inUse:true,backgroundEnabled:false,aiStatus:'ready'}),{background:true,ai:'local'});
 assert.deepEqual(choice.openPage({inUse:false,backgroundEnabled:false,aiStatus:'idle'}),{});
 assert.deepEqual(choice.openPage({inUse:false,backgroundEnabled:true,aiStatus:'idle'}),{ai:'make'});
 assert.deepEqual(choice.openPage({inUse:false,backgroundEnabled:true,aiStatus:'ready'}),{talk:'ensure'});
 assert.deepEqual(choice.openPage({inUse:false,backgroundEnabled:true,aiStatus:'closed'}),{});
 assert.deepEqual(choice.openPage({inUse:false,backgroundEnabled:true,aiStatus:'unavailable'}),{});
});

test('规则 13 已在书架：和书架那份一样，并且背景来源也一样',()=>{
 assert.equal(choice.onShelf(true,'notes-ai','notes-ai'),true);
 assert.equal(choice.onShelf(true,'local-rules','notes-ai'),false,'存的是普通背景，现在放的是 AI');
 assert.equal(choice.onShelf(false,'local-rules','local-rules'),false);
 assert.equal(choice.onShelf(true,undefined,'local-rules'),false);
});

test('规则 14 AI 背景的状态：没接 / 没读完缓存 → closed；正在做 → working；有 → ready；没做成 → unavailable；否则 idle',()=>{
 const base={open:true,kept:true,asking:null,briefKey:'k',made:null};
 assert.deepEqual(choice.aiStatus({...base,open:false}),{status:'closed'});
 assert.deepEqual(choice.aiStatus({...base,kept:false}),{status:'closed'});
 assert.deepEqual(choice.aiStatus(base),{status:'idle'});
 assert.deepEqual(choice.aiStatus({...base,asking:{key:'k',status:'working'}}),{status:'working'});
 assert.deepEqual(choice.aiStatus({...base,asking:{key:'other',status:'working'}}),{status:'idle'},'别的作品在做不算');
 assert.deepEqual(choice.aiStatus({...base,made:{source:'notes-ai'}}),{status:'ready',source:'notes-ai'});
 assert.deepEqual(
  choice.aiStatus({...base,asking:{key:'k',status:'working'},made:{source:'notes-ai'}}),
  {status:'working'},
  '换一首正在做：先显示正在做');
 assert.deepEqual(
  choice.aiStatus({...base,asking:{key:'k',status:'unavailable',reason:'timeout'}}),
  {status:'unavailable',reason:'timeout'});
});

test('规则 15 AI 背景默认在用',()=>{
 assert.equal(choice.AI_USED_AT_START,true);
});

test('规则 16 现在放的背景来源：用着 AI 且有做好的才是 AI 的来源，否则 local-rules',()=>{
 assert.equal(choice.usedSource(true,{source:'audio-ai'}),'audio-ai');
 assert.equal(choice.usedSource(false,{source:'audio-ai'}),'local-rules');
 assert.equal(choice.usedSource(true,null),'local-rules');
});

test('规则 22 背景音量：音量条管整层背景，拉满是成曲自己的上限，比声场的上限高；背景层关着就没声音',()=>{
 assert.equal(choice.backgroundGain({enabled:true,volume:1}),MIX_RULES.composeBackgroundMaxGain);
 assert.equal(choice.backgroundGain({enabled:true,volume:.5}),.5*MIX_RULES.composeBackgroundMaxGain);
 assert.equal(choice.backgroundGain({enabled:false,volume:1}),0);
 assert.ok(MIX_RULES.composeBackgroundMaxGain>MIX_RULES.backgroundMaxGain,'成曲拉满比声场响');
});

test('规则 23 背景音乐开关：课本歌在放时显示为关，其余跟背景层',()=>{
 assert.equal(choice.shownBackgroundSwitch(true,false),true);
 assert.equal(choice.shownBackgroundSwitch(true,true),false,'课本歌在放：显示关');
 assert.equal(choice.shownBackgroundSwitch(false,false),false);
});

test('规则 24 点背景音乐开关：显示开 = 关掉背景层；显示关 = 打开背景层、课本开关关上、换成 AI（没有就马上做一首）',()=>{
 assert.deepEqual(choice.tapBackgroundSwitch(true,'ready'),{background:false});
 assert.deepEqual(choice.tapBackgroundSwitch(false,'ready'),{song:false,ai:'prefer-ai',background:true});
 assert.deepEqual(choice.tapBackgroundSwitch(false,'working'),{song:false,ai:'prefer-ai',background:true},'正在做：做好就放');
 assert.deepEqual(choice.tapBackgroundSwitch(false,'idle'),{song:false,ai:'make',background:true},'从课本歌进来、还没有 AI：马上做');
 assert.deepEqual(choice.tapBackgroundSwitch(false,'unavailable'),{song:false,ai:'make',background:true},'上次没做成：再做一次');
 assert.deepEqual(choice.tapBackgroundSwitch(false,'closed'),{song:false,ai:'prefer-ai',background:true},'没接 AI：放普通背景');
});
