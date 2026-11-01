import test from 'node:test';
import assert from 'node:assert/strict';
import {ARRANGEMENT_CONTRACT_VERSION,DEFAULT_ROWS,DEFAULT_SPAN_SECONDS} from '@wanwu-v2/contracts/arrangement';
import type {Arrangement,PlacedEvent} from '@wanwu-v2/contracts/arrangement';
import {SOUND_CONTRACT_VERSION} from '@wanwu-v2/contracts/sound';
import type {SoundUnitDraft} from '@wanwu-v2/contracts/sound';
import {DEFAULT_COMPOSE_SETTINGS,MAX_INSTRUMENTS,WORK_CONTRACT_VERSION,cleanWorkTitle,isValidInspiration,parseComposeSettings,parseSavedWork} from '@wanwu-v2/contracts/work';
import {pieceSeconds,planPlayback,withSpan} from '../src/shared/creation/arrangementTiming.ts';
import {WorkSession} from '../src/shared/creation/workSession.ts';
import {WorkShelf} from '../src/shared/creation/workShelf.ts';
import {clockText,scoreLayout,scorePosition,secondsAt,soundingAt,spanChoices} from '../src/pages/compose/model/scoreLayout.ts';
import {composeReducer,initialCompose,isShelved,shelfEntry} from '../src/pages/compose/model/composeState.ts';
import type {ComposeState} from '../src/pages/compose/model/composeState.ts';
import {findDiscoveries} from '../src/shared/talk/discoveries.ts';
import {backgroundPlan} from '@wanwu-v2/sound-rules/background';
import {MIX_RULES,RULE_VERSIONS} from '@wanwu-v2/sound-rules/rules';
import {isBackgroundBrief,parseBackgroundResult} from '@wanwu-v2/contracts/background';
import {backgroundBrief,backgroundInput} from '../src/shared/background/backgroundLayer.ts';
import {programPlan} from '@wanwu-v2/sound-rules/ai-compose';
import {offlineBackgroundGenerator,runBackgroundChain} from '../src/shared/background/generator.ts';
import type {BackgroundGenerator} from '../src/shared/background/generator.ts';
import {exampleTracks} from './fixtures/exampleTracks.ts';
import {rhythmWords,songFeature,textbookTalk} from '../src/shared/inspiration/talk.ts';
import {isTextbookTrack} from '@wanwu-v2/contracts/textbook';
import {parseRoute,routeHref} from '../src/app/router.ts';
import {BACKGROUND_RULES} from '@wanwu-v2/sound-rules/rules';
import {PREVIEW_MAX_SECONDS,previewBeat,previewPlan} from '../src/shared/inspiration/rhythmPreview.ts';
import {textbookTracks} from '../src/shared/inspiration/textbookTracks.ts';

const now=new Date('2026-10-23T08:00:00.000Z');
const rendering={background:'local-rules' as const,prompt:null,rules:{...RULE_VERSIONS}};
const once={pitch:'mid',duration:'short',contour:'flat',intensity:'soft',pattern:'once'} as const;
const unit=(id:string,markerIndex:number,name=id):SoundUnitDraft=>({version:SOUND_CONTRACT_VERSION,id,sourceId:`recording:${id}`,name,maker:null,markerIndex,
 shape:{...once},input:'manual',createdAt:now.toISOString()});
/** Pattern once + pitch mid: heard length = excerpt length. */
const ev=(id:string,at:number,row:number,seconds:number,unitId='u1'):PlacedEvent=>({id,unitId,at,row,clip:{startMs:0,endMs:Math.round(seconds*1000)}});
const work=(over:Partial<Arrangement>={}):Arrangement=>({version:ARRANGEMENT_CONTRACT_VERSION,id:'work:1',units:[unit('u1',0,'蛙鸣'),unit('u2',1,'滴水')],
 events:[ev('a',0,0,3),ev('b',.5,1,2,'u2'),ev('c',.8,2,3)],rows:DEFAULT_ROWS,spanSeconds:DEFAULT_SPAN_SECONDS,mood:null,origin:'child',updatedAt:now.toISOString(),...over});
const loaded=(arrangement:Arrangement):ComposeState=>composeReducer(initialCompose,{type:'loaded',arrangement,settings:DEFAULT_COMPOSE_SETTINGS,shelved:null});

test('the score is derived from the field arrangement: same order, start times, rows and repeats as playback',()=>{
 const arrangement=work(),layout=scoreLayout(arrangement),plan=planPlayback(arrangement);
 assert.deepEqual(layout.items.map(item=>item.eventId),plan.map(item=>item.eventId));
 assert.deepEqual(layout.items.map(item=>item.start),plan.map(item=>item.startSeconds));
 assert.deepEqual(layout.items.map(item=>item.row),[0,1,2],'rows come from the field (layout only)');
 assert.equal(layout.items.filter(item=>item.unit.id==='u1').length,2,'repeats stay repeats, with one identity');
 assert.deepEqual(layout.legend.map(item=>item.markerIndex),[0,1]);
 assert.equal(layout.totalSeconds,30);
 assert.equal(layout.spanMark,null);
 assert.deepEqual(layout.ticks.map(tick=>tick.seconds),[0,10,20,30]);
});

test('a last sound may run a little past the chosen length: the piece grows by at most the overrun, marked',()=>{
 const arrangement=work({events:[ev('a',.9,0,6)]});
 assert.equal(MIX_RULES.ending.overrunSeconds,5);
 assert.equal(pieceSeconds(arrangement),33);
 const layout=scoreLayout(arrangement);
 assert.equal(layout.totalSeconds,33);
 assert.equal(layout.spanMark,30/33);
 assert.deepEqual(spanChoices(arrangement).map(choice=>[choice.seconds,choice.real]),[[20,24],[30,33],[45,46.5]]);
});

test('what would sound past the overrun is cut — only what is heard; the clip stays as placed',()=>{
 const arrangement=work({events:[ev('a',.9,0,12)]});
 assert.equal(pieceSeconds(arrangement),35,'30 s + 5 s at most');
 const [item]=scoreLayout(arrangement).items;
 assert.equal(item!.seconds,8);
 assert.equal(item!.end,35);
 assert.deepEqual(spanChoices(arrangement).map(choice=>[choice.seconds,choice.real]),[[20,25],[30,35],[45,50]]);
 assert.equal(arrangement.events[0]!.clip.endMs,12000,'the child\'s excerpt is not changed');
 assert.equal(backgroundInput(arrangement,{kind:'none'},[]).seconds,35,'the background is as long as the piece');
});

test('playhead, progress bar and highlights share one time: positions invert, sounding follows start/end',()=>{
 const layout=scoreLayout(work()),box={left:100,width:1000};
 for(const seconds of [0,7.5,15,30]){
  const left=parseFloat(scorePosition(seconds/layout.totalSeconds))/100*box.width+box.left;
  assert.ok(Math.abs(secondsAt(box,left,layout.totalSeconds)-seconds)<1e-9);
 }
 assert.deepEqual([...soundingAt(layout.items,1)],['a']);
 assert.deepEqual([...soundingAt(layout.items,3)],[],'an end is exclusive');
 assert.deepEqual([...soundingAt(layout.items,16)],['b']);
 assert.equal(clockText(15.9),'00:15');
 assert.equal(clockText(75),'01:15');
});

test('switching length in 万物成曲 is the field’s switch: every sound keeps its position, only rows re-tidy',()=>{
 const crowded=work({events:[ev('a',0,0,8),ev('b',.3,0,2,'u2')],spanSeconds:45});
 const state=composeReducer(loaded({...crowded,origin:'example'}),{type:'span',spanSeconds:20,now});
 const next=state.arrangement!;
 assert.equal(next.spanSeconds,20);
 assert.equal(next.origin,'child');
 assert.deepEqual(next.events.map(event=>event.at),[0,.3]);
 assert.deepEqual(next,{...withSpan(crowded,20),origin:'child',updatedAt:now.toISOString()});
 assert.notEqual(next.events[0]!.row,next.events[1]!.row,'a longer tail moves the later sound to a free row');
});

test('background and textbook inspiration never touch the child’s sounds or placement',()=>{
 let state=loaded(work());
 const before=state.arrangement;
 state=composeReducer(state,{type:'background-enabled',enabled:false});
 state=composeReducer(state,{type:'background-volume',volume:1.4});
 state=composeReducer(state,{type:'instrument',id:'inst:local:xylophone'});
 state=composeReducer(state,{type:'inspiration',inspiration:{kind:'textbook',entryId:'tb:mock:march'}});
 assert.equal(state.arrangement,before);
 assert.deepEqual(state.settings,{background:{enabled:true,instruments:['inst:local:xylophone'],volume:1},inspiration:{kind:'textbook',entryId:'tb:mock:march'}});
 assert.ok(parseComposeSettings(state.settings));
 assert.equal(parseComposeSettings({...state.settings,background:{...state.settings.background,volume:2}}),null);
});

test('saving puts an exact snapshot on the shelf; any later change shows as not saved',()=>{
 let state=loaded(work());
 assert.equal(shelfEntry(state,'   ',now,rendering),null);
 const entry=shelfEntry(state,'  青蛙  下雨歌 ',now,rendering)!;
 assert.equal(entry.title,'青蛙 下雨歌');
 assert.equal(entry.visibility,'private');
 assert.equal(entry.arrangement,state.arrangement);
 assert.ok(parseSavedWork(entry));
 assert.equal(parseSavedWork({...entry,visibility:'everyone'}),null);
 assert.equal(parseSavedWork({...entry,id:'other'}),null,'the work id is the arrangement id');
 assert.deepEqual(entry.rendering,rendering,'it records the background kept and every rule version');
 assert.equal(parseSavedWork({...entry,rendering:{...rendering,background:'magic'}}),null);
 assert.equal(parseSavedWork({...entry,rendering:{background:'local-rules',prompt:null,rules:{...RULE_VERSIONS,mix:''}}}),null);
 assert.equal(parseSavedWork({...entry,rendering:{...rendering,background:'notes-ai'}}),null,'an AI background names its prompt version');
 assert.ok(parseSavedWork({...entry,rendering:{...rendering,background:'notes-ai',prompt:'background-notes-prompt-v1'}}));
 assert.equal(parseSavedWork({...entry,rendering:{...rendering,prompt:'background-notes-prompt-v1'}}),null,'the local background has no prompt');
 assert.equal(cleanWorkTitle('一二三四五六七八九十一二三四五六七'),'一二三四五六七八九十一二三四五六');
 state=composeReducer(state,{type:'saved',work:entry});
 assert.equal(isShelved(state),true);
 assert.equal(isShelved(composeReducer(state,{type:'background-enabled',enabled:false})),false);
 assert.equal(isShelved(composeReducer(state,{type:'span',spanSeconds:45,now:new Date('2026-10-23T09:00:00.000Z')})),false);
});

test('the shelf keeps this visit’s works newest first and replaces a re-saved one; the session reopens and resets',()=>{
 const shelf=new WorkShelf(),first=shelfEntry(loaded(work()),'一',now,rendering)!,second=shelfEntry(loaded(work({id:'work:2'})),'二',now,rendering)!;
 assert.equal(shelf.put(first),true);
 assert.equal(shelf.put(second),true);
 assert.deepEqual(shelf.list().map(item=>item.title),['二','一']);
 shelf.put({...first,title:'一改'});
 assert.deepEqual(shelf.list().map(item=>item.title),['一改','二']);
 assert.equal(shelf.put({...first,title:''}),false);
 const session=new WorkSession();
 session.open({...second,settings:{...DEFAULT_COMPOSE_SETTINGS,inspiration:{kind:'textbook',entryId:'tb:mock:train'}}});
 assert.equal(session.current()!.id,'work:2');
 assert.equal(session.settings().inspiration.kind,'textbook');
 assert.equal(session.saveSettings({...DEFAULT_COMPOSE_SETTINGS,background:{enabled:true,instruments:[''],volume:.5}}),false);
 session.reset();
 assert.equal(session.current(),null);
 assert.deepEqual(session.settings(),DEFAULT_COMPOSE_SETTINGS);
});

test('音乐小发现 states only facts counted from the arrangement',()=>{
 const found=findDiscoveries(work({events:[ev('a',0,0,3),ev('b',.05,1,2,'u2'),ev('c',.8,2,3)]}));
 assert.deepEqual(found[0],{kind:'opening',first:'蛙鸣',next:'滴水'});
 assert.ok(found.some(item=>item.kind==='repeat'&&item.times===2));
 assert.ok(found.some(item=>item.kind==='echo'&&item.a==='蛙鸣'&&item.b==='滴水'),'A → B → A is call and answer');
 assert.ok(found.some(item=>item.kind==='together'&&item.a==='蛙鸣'&&item.b==='滴水'));
 assert.ok(found.some(item=>item.kind==='rest'&&item.seconds===20));
 assert.deepEqual(found.at(-1),{kind:'ending',name:'蛙鸣',same:true},'starts and ends with the same sound');
 const longShort=findDiscoveries(work({events:[ev('a',0,0,8),ev('b',.5,0,1,'u2')]}));
 assert.ok(longShort.some(item=>item.kind==='long-short'&&item.long==='蛙鸣'&&item.short==='滴水'));
 assert.ok(!longShort.some(item=>item.kind==='echo'));
 assert.deepEqual(findDiscoveries(work({events:[ev('a',.2,0,1)]})),[{kind:'single',name:'蛙鸣'}]);
 assert.deepEqual(findDiscoveries(work({events:[]})),[]);
});

test('the local background is made from the work: its length, when its sounds play, its mood and the chosen song',()=>{
 const piece=work({events:[ev('a',0,0,4),ev('b',.5,0,3)],mood:{kind:'custom',text:'像打雷',nearest:'angry'}});
 const input=backgroundInput(piece,{kind:'none'},exampleTracks);
 assert.equal(input.seconds,pieceSeconds(piece));
 assert.deepEqual(input.sounding.map(({start,end})=>({start,end})),[{start:0,end:4},{start:15,end:18}],'the same times the score and the playback use');
 assert.deepEqual(input.sounding.map(({pitch,contour,intensity})=>({pitch,contour,intensity})),[{pitch:'mid',contour:'flat',intensity:'soft'},{pitch:'mid',contour:'flat',intensity:'soft'}],'and how each sound sounds, for the melody\'s answer');
 assert.equal(input.mood,'angry','a custom mood uses the nearest preset');
 assert.equal(input.seed,piece.id);
 const borrowed=backgroundInput(piece,{kind:'textbook',entryId:'tb:mock:lullaby'},exampleTracks);
 assert.equal(borrowed.textbook?.id,'tb:mock:lullaby');
 const plan=backgroundPlan(borrowed);
 assert.deepEqual([plan.tempo,plan.metre,plan.colour],[66,3,'angry'],'the song lends its rhythm, the child\'s mood the colour');
 assert.equal(backgroundInput(piece,{kind:'teaching-music',musicId:'m',name:'歌',durationMs:1000},exampleTracks).textbook,null,'teaching music is not analysed yet');
});

test('textbook example cards are valid templates',()=>{
 assert.ok(exampleTracks.length>=6&&exampleTracks.every(isTextbookTrack));
 assert.ok(exampleTracks.every(track=>track.source===null&&track.extraction.numbers==='example'),'examples say they are examples');
});

test('万物成曲 refuses a length too short for the longest sound',()=>{
 const state=loaded(work({events:[ev('a',0,0,25)]}));
 assert.equal(state.arrangement!.spanSeconds,30);
 const refused=composeReducer(state,{type:'span',spanSeconds:20,now});
 assert.equal(refused.arrangement,state.arrangement);
 assert.equal(refused.lastAction,'span-blocked');
 assert.equal(composeReducer(state,{type:'span',spanSeconds:45,now}).arrangement!.spanSeconds,45);
});

test('课本: a chosen song is played as it is; the plain background and the talk follow it (the AI background does not)',()=>{
 let state=loaded(work({events:[ev('a',0,0,4),ev('b',.5,0,3)]}));
 state=composeReducer(state,{type:'inspiration',inspiration:{kind:'textbook',entryId:'tb:mock:lullaby'}});
 assert.deepEqual(state.settings.inspiration,{kind:'textbook',entryId:'tb:mock:lullaby'});
 assert.ok(parseComposeSettings(state.settings));
 assert.ok(isValidInspiration({kind:'textbook',entryId:'x',variation:'lower'}),'a variation kept by an older version is ignored');
 const input=backgroundInput(state.arrangement!,state.settings.inspiration,exampleTracks);
 assert.equal(input.textbook?.id,'tb:mock:lullaby');
 assert.ok(!('textbook' in backgroundBrief(state.arrangement!,[])!),'the AI brief carries no song');
 const track=exampleTracks.find(item=>item.id==='tb:mock:lullaby')!;
 assert.equal(rhythmWords([2,1]),'嗒— 嗒');
 assert.equal(rhythmWords([.5,.5,1]),'嘀 嘀 嗒');
 assert.equal(songFeature(track),'「摇篮曲」是三拍子，节奏是「嗒— 嗒」，像摇篮轻轻晃。');
 const talk=textbookTalk(track,{kind:'together',example:0},'蛙鸣');
 assert.deepEqual(Object.keys(talk),['feature','meeting','task']);
 assert.match(talk.meeting,/「蛙鸣」正好落在拍子上/);
});

test('the shelf can rename a work and take one off; empty names are refused',()=>{
 const shelf=new WorkShelf(),first=shelfEntry(loaded(work()),'一',now,rendering)!,second=shelfEntry(loaded(work({id:'work:2'})),'二',now,rendering)!;
 shelf.put(first);
 shelf.put(second);
 assert.equal(shelf.rename('work:1','   '),null);
 const renamed=shelf.rename('work:1','  下雨的歌  ')!;
 assert.equal(renamed.title,'下雨的歌');
 assert.equal(renamed.savedAt,first.savedAt);
 assert.deepEqual(shelf.list().map(item=>item.title),['二','下雨的歌'],'its place stays');
 assert.equal(shelf.remove('work:2'),true);
 assert.equal(shelf.remove('work:2'),false);
 assert.deepEqual(shelf.list().map(item=>item.id),['work:1']);
});

test('the AI background request is an anonymous brief: each placed sound with its number, time and features; no song',()=>{
 const piece=work({events:[ev('a',0,0,4),ev('b',.5,0,3,'u2'),ev('c',.8,0,2)],mood:{kind:'preset',id:'sad'}});
 piece.units=piece.units.map(item=>item.id==='u1'?{...item,shape:{...item.shape,pitch:'high',contour:'rising',intensity:'loud'}}:item);
 assert.equal(backgroundBrief(work({events:[]}),[]),null,'nothing placed: nothing to ask');
 const brief=backgroundBrief(piece,['inst:local:organ'])!;
 assert.ok(isBackgroundBrief(brief));
 assert.equal(brief.mood,'sad');
 assert.deepEqual(brief.sounds.map(({n,start,end})=>[n,start,end]),[[1,0,4],[2,15,18],[1,24,26]],'the same sound keeps its number');
 assert.deepEqual([brief.sounds[0]!.pitch,brief.sounds[0]!.contour,brief.sounds[0]!.intensity],['high','rising','loud'],'the child\'s choices');
 assert.deepEqual([brief.sounds[1]!.contour,brief.sounds[1]!.intensity],['flat','soft']);
 assert.deepEqual([brief.attempt,brief.previous],[0,null]);
 assert.deepEqual(brief.rules,RULE_VERSIONS);
 const text=JSON.stringify(brief);
 for(const secret of ['蛙鸣','滴水','recording:','摇篮曲','u1','u2'])assert.ok(!text.includes(secret),`no ${secret} in the brief`);
 assert.equal(isBackgroundBrief({...brief,sounds:[]}),false,'at least one sound');
 assert.equal(isBackgroundBrief({...brief,attempt:-1}),false);
 assert.equal(isBackgroundBrief({...brief,textbook:null,sounds:[{...brief.sounds[0],pitch:'loud'}]}),false,'features from the five cards only');
});

test('the AI background chain: closed sends nothing; music, voice, text model in order, each with a timeout; bad results are refused',async()=>{
 const brief=backgroundBrief(work({events:[ev('a',0,0,4)]}),[])!;
 const never=new AbortController().signal;
 assert.deepEqual(await runBackgroundChain(offlineBackgroundGenerator,brief,never),{status:'unavailable',reason:'not-open'});
 const asked:string[]=[];
 const notes=[{at:0,length:2,midi:60,part:'chord',accent:0}];
 const plan=programPlan(brief);
 const fake=(answers:Record<string,unknown|'hang'>):BackgroundGenerator=>({open:['audio-ai','voice-ai','notes-ai'],
  generate:(_,step)=>{
   asked.push(step);
   const answer=answers[step];
   return answer==='hang'?new Promise(()=>{}):Promise.resolve(answer);
  }});
 const started:string[]=[];
 const ready=await runBackgroundChain(fake({'audio-ai':{status:'unavailable',reason:'quota'},'voice-ai':{status:'unavailable',reason:'failed'},
  'notes-ai':{status:'ready',source:'notes-ai',notes,plan,model:'qwen',promptVersion:'p1'}}),brief,never,undefined,step=>started.push(step));
 assert.equal(ready.status,'ready');
 assert.deepEqual(asked,['audio-ai','voice-ai','notes-ai'],'music model, then voice model, then text model');
 assert.deepEqual(started,asked,'each step is announced for the progress bar');
 assert.equal((await runBackgroundChain(fake({'audio-ai':{status:'unavailable',reason:'quota'},'voice-ai':{status:'ready',source:'voice-ai',notes,model:'omni',promptVersion:'p1'}}),brief,never)).status,
  'unavailable','composed notes need their plan');
 const slow=await runBackgroundChain(fake({'audio-ai':'hang','voice-ai':'hang','notes-ai':'hang'}),brief,never,{'audio-ai':20,'voice-ai':20,'notes-ai':20});
 assert.deepEqual(slow,{status:'unavailable',reason:'timeout'},'too slow: keep the local background');
 const tooLong=await runBackgroundChain(fake({'audio-ai':{status:'ready',source:'audio-ai',audioUrl:'https://x/a.mp3',durationMs:99_000,model:'fun',promptVersion:'p'},'voice-ai':'hang','notes-ai':{status:'ready',source:'notes-ai',notes:[{...notes[0],length:99}],plan,model:'q',promptVersion:'p'}}),brief,never,{'audio-ai':50,'voice-ai':20,'notes-ai':50});
 assert.deepEqual(tooLong,{status:'unavailable',reason:'failed'},'a background longer than the piece is refused');
 assert.equal(parseBackgroundResult({status:'ready',source:'audio-ai',audioUrl:'http://x/a.mp3',durationMs:1000,model:'f',promptVersion:'p'},30),null,'https only');
});

test('routes /compose and /works',()=>{
 assert.deepEqual(parseRoute('/compose'),{page:'compose'});
 assert.deepEqual(parseRoute('/works/'),{page:'works'});
 assert.equal(routeHref({page:'compose'}),'/compose');
 assert.equal(routeHref({page:'works'}),'/works');
 assert.equal(WORK_CONTRACT_VERSION,'work-v1');
});

test('instruments: tap to add, tap again to remove, none = the original background; only the switch silences it',()=>{
 let state=loaded(work());
 assert.deepEqual(state.settings.background,{enabled:true,instruments:[],volume:.5},'starts with the background as generated, switched on');
 const tap=(id:string)=>{state=composeReducer(state,{type:'instrument',id});};
 tap('inst:local:drum');
 tap('inst:local:xylophone');
 assert.deepEqual(state.settings.background.instruments,['inst:local:drum','inst:local:xylophone']);
 tap('inst:local:drum');
 tap('inst:local:xylophone');
 assert.deepEqual(state.settings.background.instruments,[]);
 assert.equal(state.settings.background.enabled,true,'taking every instrument away does not switch the background off');
 state=composeReducer(state,{type:'background-enabled',enabled:false});
 tap('inst:local:organ');
 assert.equal(state.settings.background.enabled,true,'adding an instrument turns the layer on');
 for(let i=0;i<MAX_INSTRUMENTS+2;i++)tap(`inst:more:${i}`);
 assert.equal(state.settings.background.instruments.length,MAX_INSTRUMENTS);
 assert.ok(parseComposeSettings(state.settings));
 assert.equal(parseComposeSettings({...state.settings,background:{...state.settings.background,instruments:['a','a']}}),null);
 assert.equal(parseComposeSettings({...state.settings,background:{...state.settings.background,instruments:null}}),null);
});

test('课本灵感: example rhythm or teaching music; chosen in 万物声场 it stays with the work for 万物成曲',()=>{
 assert.ok(isValidInspiration({kind:'teaching-music',musicId:'teaching:1',name:'春雨',durationMs:90_000}));
 assert.equal(isValidInspiration({kind:'teaching-music',musicId:'teaching:1',name:'',durationMs:90_000}),false);
 assert.equal(isValidInspiration({kind:'textbook',entryId:''}),false);
 const session=new WorkSession(),inspiration={kind:'teaching-music',musicId:'teaching:1',name:'春雨',durationMs:90_000} as const;
 assert.equal(session.saveSettings({...session.settings(),inspiration}),true);
 session.addUnit(unit('u9',0),null,now);
 assert.deepEqual(session.settings().inspiration,inspiration,'making a sound keeps the inspiration');
 session.reset();
 assert.deepEqual(session.settings().inspiration,{kind:'none'});
});

test('textbook preview: the song\'s own background (its rhythm and key) in whole bars, the drum playing its rhythm',()=>{
 const bird=textbookTracks[0]!,horn=textbookTracks[1]!;
 const plan=previewPlan(bird),beat=60/bird.tempoBpm;
 assert.ok(plan.seconds<=PREVIEW_MAX_SECONDS+1e-9&&plan.seconds>=2*beat*bird.meter);
 assert.ok(Math.abs(plan.seconds/(beat*bird.meter)-Math.round(plan.seconds/(beat*bird.meter)))<1e-9,'whole bars');
 const drums=plan.notes.filter(note=>note.part==='rhythm'&&note.at<plan.cadenceAt-1e-9).map(note=>Math.round(note.at/beat*4)/4%bird.meter);
 assert.deepEqual([...new Set(drums)].sort(),[0,.5,1,1.5,1.75],'its rhythm cell: notes at 0, ½, 1, 1½ and 1¾ of every bar');
 assert.notEqual(((previewPlan(horn).tonic%12)+12)%12,((plan.tonic%12)+12)%12,'two songs, two keys');
});

test('万物声场\'s preview is only the beat: the same bars, every beat of the song\'s tempo, strong on each bar\'s first, no pitched notes',()=>{
 for(const track of textbookTracks){
  const beat=previewBeat(track),full=previewPlan(track),step=60/track.tempoBpm;
  assert.equal(beat.seconds,full.seconds);
  assert.ok(beat.notes.every(note=>note.part==='rhythm'),'only the drum');
  assert.ok(beat.notes.every((note,i)=>Math.abs(note.at-i*step)<1e-9),'on every beat, nothing in between');
  assert.ok(beat.notes.every((note,i)=>(i%track.meter===0)===(note.accent===BACKGROUND_RULES.beat.strong)),'strong on the first beat of each bar');
 }
});

test('the squirrel has something to say after every card control: no textbook, the volume, each shape',()=>{
 let state=loaded(work());
 state=composeReducer(state,{type:'inspiration',inspiration:{kind:'none'}});
 assert.equal(state.lastAction,'inspiration-none');
 state=composeReducer(state,{type:'background-volume',volume:.2});
 assert.equal(state.lastAction,'background-volume');
 assert.equal(state.settings.background.volume,.2);
 assert.equal(composeReducer(state,{type:'background-volume',volume:.2}),state,'the same volume changes nothing');
});

