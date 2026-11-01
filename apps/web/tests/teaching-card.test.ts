// 教学音乐出卡: the WAV excerpt, the request, the card from a reply or from the program alone, built-in recordings, and
// how a card becomes what both pages borrow.
import test from 'node:test';
import assert from 'node:assert/strict';
import {isTextbookTrack} from '@wanwu-v2/contracts/textbook';
import type {Arrangement} from '@wanwu-v2/contracts/arrangement';
import type {Measurement} from '@wanwu-v2/music-features';
import {pickMood} from '@wanwu-v2/music-features';
import {isTextbookFeaturesBrief} from '@wanwu-v2/prompts/tasks';
import {beatName,pulseLine,teachingLine} from '@wanwu-v2/prompts/corpus';
import {BACKGROUND_RULES} from '@wanwu-v2/sound-rules/rules';
import {hasBeat,songBeat} from '../src/shared/inspiration/beat.ts';
import {CARD_BUDGET_MS,NotMusicError,cardFrom,excerptWav,featuresBrief,makeTeachingCard,monoOf,pulseOf} from '../src/shared/inspiration/teachingCard.ts';
import {builtInEntries} from '../src/shared/inspiration/builtInTeaching.ts';
import {backgroundBrief,backgroundInput,inspirationTrack} from '../src/shared/background/backgroundLayer.ts';
import {INSPIRATION_TABS} from '../src/shared/inspiration/tabs.ts';

const m:Measurement={version:'music-features-v2',seconds:120,musical:true,features:{rhythm:'steady',texture:'accompanied',drums:false},path:'accompanied',traits:{steady:.84,tonal:.58,solo:.29,drums:.24},steady:true,strongBeat:true,tempoBpm:136,meter:3,meterConfidence:.72,downbeatSeconds:.14,onsetsPerBeat:1.4,onsetDensity:'medium',
 centroidHz:2100,brightness:'mid',mode:'major',tonic:5,keyConfidence:.8,pitchRange:{low:58,high:82},repetition:'low',
 candidates:[{cell:[1,1,1],bars:25},{cell:[.75,.25,1,1],bars:10}]};
const music={id:'teaching:1',name:'法国号'};
const reply={rhythmCell:[.75,.25,1,1],meter:3,tempoBpm:136,mood:'lively',childLine:'像法国号走路，一摇一晃',teacherNote:'第一下稍长，第二下很短，后两下一样长。',checked:'accepted',source:'audio',model:'qwen3.8-omni-flash'};

test('the excerpt is a small WAV: RIFF header, 11 kHz mono 16-bit, the chosen seconds only',()=>{
 const rate=44100,samples=new Float32Array(rate*40).map((_,i)=>Math.sin(i/20)*.3);
 const base64=excerptWav(samples,rate,10,40),bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0)),view=new DataView(bytes.buffer);
 assert.ok(base64.startsWith('UklGR'),'the server sends it as wav');
 assert.equal(String.fromCharCode(...bytes.subarray(8,12)),'WAVE');
 assert.equal(view.getUint16(22,true),1);
 assert.equal(view.getUint32(24,true),11025);
 assert.equal(view.getUint16(34,true),16);
 assert.equal(view.getUint32(40,true),30*11025*2);
 assert.ok(base64.length<1_200_000,`fits the server limit (${base64.length})`);
 assert.deepEqual(monoOf({numberOfChannels:2,length:2,getChannelData:c=>new Float32Array(c?[1,1]:[0,-1])}),new Float32Array([.5,0]));
});

test('the request is the file name, the numbers and the candidates — a brief the server accepts',()=>{
 const brief=featuresBrief('  法国号  ',m,30);
 assert.ok(isTextbookFeaturesBrief(brief));
 assert.equal(brief.title,'法国号');
 assert.deepEqual(brief.fallbackCell,[.75,.25,1,1]);
 assert.equal(featuresBrief('',m,30).title,'教学音乐');
});

test('a checked reply makes the card; anything else gives the program\'s card, and the card says who made it',()=>{
 const ai=cardFrom(music,m,reply);
 assert.ok(isTextbookTrack(ai.track));
 assert.deepEqual([ai.madeBy,ai.partly,ai.track.rhythmCell,ai.track.meter,ai.track.childLine,ai.track.extraction.words],['audio',false,[.75,.25,1,1],3,'像法国号走路，一摇一晃','ai']);
 assert.equal(ai.teacherNote,reply.teacherNote);
 assert.equal(ai.track.id,music.id);
 assert.equal(ai.track.source,null);
 assert.equal(ai.track.tonic,5);
 assert.deepEqual([cardFrom(music,m,{...reply,checked:'partly',source:'language'}).madeBy,cardFrom(music,m,{...reply,checked:'partly'}).partly],['language',true]);
 for(const answer of [null,'不知道',{...reply,meter:5},{...reply,mood:'sleepy'},{...reply,source:'other'}]){
  const program=cardFrom(music,m,answer);
  assert.ok(isTextbookTrack(program.track));
  assert.deepEqual([program.madeBy,program.teacherNote,program.track.rhythmCell,program.track.mood,program.track.childLine,program.track.extraction.words],
   ['program',null,[.75,.25,1,1],pickMood(m),teachingLine(3),'code'],JSON.stringify(answer));
 }
 // A reply without a child line keeps the corpus line (and says the words are the program's).
 const noLine=cardFrom(music,m,{...reply,childLine:null});
 assert.deepEqual([noLine.track.childLine,noLine.track.extraction.words,noLine.madeBy],[teachingLine(3),'code','audio']);
});

test('the whole card: decoded and measured here, asked within the budget; no server, a slow one or a broken file each end honestly',async()=>{
 // 40 s of plucks at 96 BPM, louder every second beat.
 const rate=22050,beat=60/96,data=new Float32Array(rate*40);
 for(let b=0;b*beat<39;b++){
  const start=Math.round(b*beat*rate);
  for(let i=0;i<rate*.2;i++)data[start+i]=data[start+i]!+(b%2?.5:1)*Math.exp(-i/rate*20)*Math.sin(2*Math.PI*523*i/rate);
 }
 const decode=async()=>({sampleRate:rate,numberOfChannels:1,length:data.length,duration:40,getChannelData:()=>data}) as unknown as AudioBuffer;
 const stages:string[]=[];
 let asked:{brief:unknown;audio:string}|null=null;
 const card=await makeTeachingCard(music,new ArrayBuffer(8),decode,async request=>{
  asked=request;
  return {...reply,meter:2,rhythmCell:[.5,.5,1],tempoBpm:96};
 },stage=>stages.push(stage));
 assert.deepEqual(stages,['reading','listening']);
 assert.ok(asked&&isTextbookFeaturesBrief((asked as {brief:unknown}).brief));
 assert.ok((asked as unknown as {audio:string}).audio.startsWith('UklGR'));
 assert.deepEqual([card.madeBy,card.track.meter,card.track.tempoBpm],['audio',2,96]);
 const offline=await makeTeachingCard(music,new ArrayBuffer(8),decode,null);
 assert.equal(offline.madeBy,'program');
 assert.ok(Math.abs(offline.track.tempoBpm-96)<=3);
 // The request is cut off at what is left of the budget: the program's card, not a wait.
 let clock=0;
 const slow=await makeTeachingCard(music,new ArrayBuffer(8),decode,(_request,signal)=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')))),()=>{},()=>clock+=CARD_BUDGET_MS/2);
 assert.equal(slow.madeBy,'program');
 await assert.rejects(makeTeachingCard(music,new ArrayBuffer(8),async()=>{throw new Error('decode');},null));
});

test('built-in recordings: only names and files in the folder, nothing without a manifest',()=>{
 assert.deepEqual(builtInEntries({items:[{name:'小鸟在唱歌',file:'小鸟在唱歌.mp3'},{name:'x',file:'../secret.mp3'},{name:'',file:'a.mp3'},{name:'y',file:'a.exe'}]},'/b/'),
  [{name:'小鸟在唱歌',url:`/b/${encodeURIComponent('小鸟在唱歌.mp3')}`}]);
 assert.deepEqual(builtInEntries(null),[]);
 assert.deepEqual(builtInEntries({items:'no'}),[]);
});

test('with its card, teaching music is borrowed like a song; without it, nothing yet; 万物声场\'s dialog has two tabs',()=>{
 const card=cardFrom(music,m,reply).track,inspiration={kind:'teaching-music',musicId:music.id,name:'法国号',durationMs:110_000} as const;
 assert.equal(inspirationTrack(inspiration,[card]),card);
 assert.equal(inspirationTrack(inspiration,[]),null);
 const work={id:'w1',version:'arrangement-v2',origin:'child',spanSeconds:30,rows:3,mood:null,
  units:[{id:'u1',name:'鸟鸣',markerIndex:0,sourceId:'s1',input:'example-preset',shape:{},analysis:null}],
  events:[{id:'e1',unitId:'u1',at:.1,row:0,clip:{startMs:0,endMs:2000}}],createdAt:'2026-10-30T00:00:00.000Z',updatedAt:'2026-10-30T00:00:00.000Z'} as unknown as Arrangement;
 // The plain background borrows it like a song; the AI background never takes a song (成曲规则 3).
 assert.equal(backgroundInput(work,inspiration,[card]).textbook?.meter,3);
 assert.equal(backgroundInput(work,inspiration,[]).textbook,null);
 assert.ok(!JSON.stringify(backgroundBrief(work,[])).includes('法国号'));
 assert.equal(INSPIRATION_TABS.length,2);
});

test('the program\'s mood and line: quick major songs are lively, slow minor ones sad; the line follows the metre',()=>{
 assert.deepEqual([pickMood({mode:'major',tempoBpm:120}),pickMood({mode:'major',tempoBpm:80}),pickMood({mode:'minor',tempoBpm:70}),pickMood({mode:'minor',tempoBpm:96}),pickMood({mode:'dorian',tempoBpm:96})],
  ['lively','happy','sad','calm','curious']);
 assert.notEqual(teachingLine(2),teachingLine(3));
});
test('听原曲: the beat starts on the recording\'s first strong beat, a whole number of bars from the one measured',async()=>{
 const {firstStrongBeat}=await import('../src/shared/inspiration/originalBeat.ts');
 // 小鸟在唱歌 (96, two beats, measured 1.229 s): a bar is 1.25 s, so the first strong beat is the measured one.
 assert.ok(Math.abs(firstStrongBeat(1.229,{tempoBpm:96,meter:2})-1.229)<1e-9);
 // Measured later in the song: back by whole bars to the first one in the recording.
 assert.ok(Math.abs(firstStrongBeat(61.229,{tempoBpm:96,meter:2})-1.229)<1e-9);
 assert.ok(Math.abs(firstStrongBeat(2.1,{tempoBpm:120,meter:4})-.1)<1e-9);
 assert.ok(Math.abs(firstStrongBeat(.139,{tempoBpm:136,meter:3})-.139)<1e-9);
});

test('how the card may use its beat: free rhythm has none, a single line an even one, non-music gets no card',async()=>{
 const free={...m,steady:false,strongBeat:false,features:{...m.features,rhythm:'free'},path:'free'} as Measurement;
 const solo={...m,strongBeat:false,features:{...m.features,texture:'solo'},path:'solo'} as Measurement;
 assert.deepEqual([pulseOf(m),pulseOf(solo),pulseOf(free)],[undefined,'even','none']);
 const loose=cardFrom(music,free,null).track,even=cardFrom(music,solo,reply).track;
 assert.ok(isTextbookTrack(loose)&&isTextbookTrack(even));
 assert.deepEqual([loose.pulse,loose.childLine,even.pulse,cardFrom(music,m,reply).track.pulse],['none',pulseLine('none'),'even',undefined]);
 assert.equal(isTextbookTrack({...loose,pulse:'sometimes'}),false);
 assert.deepEqual([beatName(loose),beatName(even),beatName({meter:3})],['自由节奏','拍子均匀','三拍子']);
 // 万物声场: no ticks for free rhythm, every tick the light one when the strong beats are not sure.
 assert.deepEqual([songBeat(loose,10).notes.length,hasBeat(loose),hasBeat(even)],[0,false,true]);
 assert.ok(songBeat(even,10).notes.every(note=>note.accent===BACKGROUND_RULES.beat.weak));
 assert.ok(songBeat(cardFrom(music,m,reply).track,10).notes.some(note=>note.accent===BACKGROUND_RULES.beat.strong));
 // 万物成曲: a free-rhythm song does not lead the background (and is not sent as an unknown piece either).
 const inspiration={kind:'teaching-music',musicId:music.id,name:'山歌',durationMs:60_000} as const;
 const work={id:'w1',version:'arrangement-v2',origin:'child',spanSeconds:30,rows:3,mood:null,
  units:[{id:'u1',name:'鸟鸣',markerIndex:0,sourceId:'s1',input:'example-preset',shape:{},analysis:null}],
  events:[{id:'e1',unitId:'u1',at:.1,row:0,clip:{startMs:0,endMs:2000}}],createdAt:'2026-10-30T00:00:00.000Z',updatedAt:'2026-10-30T00:00:00.000Z'} as unknown as Arrangement;
 assert.equal(backgroundInput(work,inspiration,[loose]).textbook,null);
 // A free-rhythm recording is not asked about (the model's task is a beat and a bar rhythm); non-music gets no card.
 const decode=(data:Float32Array)=>async()=>({sampleRate:22050,numberOfChannels:1,length:data.length,duration:data.length/22050,getChannelData:()=>data}) as unknown as AudioBuffer;
 let seed=3;
 const noise=()=>{
  seed=(seed*16807)%2147483647;
  return seed/2147483647*2-1;
 };
 const hiss=new Float32Array(22050*20).map(()=>.3*noise());
 let asked=false;
 await assert.rejects(makeTeachingCard(music,new ArrayBuffer(8),decode(hiss),async()=>{
  asked=true;
  return null;
 }),NotMusicError);
 assert.equal(asked,false);
});
