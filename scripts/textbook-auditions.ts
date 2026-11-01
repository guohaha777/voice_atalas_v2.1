// Stage A reproducible offline audition. No model requests, credentials, or user recordings.
// node --experimental-strip-types scripts/textbook-auditions.ts <output-directory>
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createServer} from 'vite';
import {chromium} from 'playwright';
import {textbookTracks} from '../apps/web/src/shared/inspiration/textbookTracks.ts';
import type {TextbookComposeInput,TextbookSound} from '../packages/contracts/src/textbookCompose.ts';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=process.argv[2];if(!output)throw new Error('output-directory required');
const out=resolve(output);await mkdir(out,{recursive:true});
const sound=(start:number,end:number,n=1,extra:Partial<TextbookSound>={}):TextbookSound=>({
 eventId:`e:${n}:${start}`,n,start,end,pitch:'high',length:'short',contour:'rising',intensity:'medium',pattern:'once',kind:'one',brightness:'bright',
 sources:{pitch:'child',length:'child',contour:'child',intensity:'child',pattern:'child',kind:'measurement',brightness:'measurement'},...extra});
const enrichedTracks=await Promise.all(textbookTracks.map(async track=>{
 if(!process.argv[3])return track;
 const melody=JSON.parse(await readFile(resolve(process.argv[3],`${track.title}.json`),'utf8'));
 return {...track,melody};
}));
const shapes=[
 {id:'sparse',label:'稀疏短声',sounds:[sound(.5,1),sound(6,6.5),sound(12,12.5)]},
 {id:'overlap',label:'密集重叠',sounds:[sound(0,8),sound(3,12,2),sound(7,15,3),sound(13,17,4)]},
 {id:'texture',label:'跨小节长声音',sounds:[sound(.5,7,1,{kind:'texture',length:'long',pattern:'fade-in'}),sound(12,17,2,{kind:'texture',length:'long',pattern:'fade-in'})]},
];
const cases:{id:string;label:string;input:TextbookComposeInput;drum:boolean}[]=[];
for(const [i,textbook] of enrichedTracks.entries())for(const shape of shapes)cases.push({
 id:`song${i+1}-${shape.id}`,label:`${textbook.title} · ${shape.label}`,drum:true,
 input:{version:'textbook-compose-v1',seconds:20,mood:null,textbook,sounds:shape.sounds},
});
cases.push({...cases[3]!,id:'horn-sad',label:'法国号 · 悲伤心情优先',input:{...cases[3]!.input,mood:'sad'}});
cases.push({...cases[0]!,id:'birds-no-drum',label:'小鸟在唱歌 · 无鼓拍感',drum:false});
for(const [id,sounds] of [['dense-a',[sound(0,12),sound(4,18,2)]],['dense-b',[sound(0,14),sound(2,18,2)]]] as const)cases.push({
 id,label:`小鸟在唱歌 · 同为密集的编排 ${id.endsWith('a')?'A':'B'}`,drum:true,
 input:{version:'textbook-compose-v1',seconds:20,mood:null,textbook:enrichedTracks[0]!,sounds:[...sounds]},
});
const server=await createServer({configFile:false,root,server:{host:'127.0.0.1',port:0,strictPort:false},
 plugins:[{name:'offline-audition-page',configureServer(server){
  server.middlewares.use('/__audition',(_req,res)=>{res.statusCode=200;res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Textbook offline audition</title>');});
 }}]});
await server.listen();
let browser;
const reports:unknown[]=[];
try{
 const address=server.httpServer!.address();if(!address||typeof address==='string')throw new Error('no-server');
 const chrome=process.env.WANWU_CHROMIUM_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
 browser=await chromium.launch({headless:true,chromiumSandbox:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${address.port}/__audition`);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 for(const c of cases){
  const result=await page.evaluate(async({input,drum,root})=>{
   const load=(path:string)=>import(/* @vite-ignore */ `/@fs${root}${path}`);
   const {composeTextbook}=await load('packages/sound-rules/src/textbookCompose.ts');
   const {backgroundPlan}=await load('packages/sound-rules/src/background.ts');
   const {renderArrangedBackground}=await load('packages/audio-engine/src/orchestration.ts');
   const {LOCAL_INSTRUMENTS}=await load('packages/audio-engine/src/instruments.ts');
   const {pcm16Wave,pcmMetrics}=await load('packages/audio-engine/src/pcm.ts');
   const {MIX_RULES}=await load('packages/sound-rules/src/rules.ts');
   const generated=composeTextbook(input);if(generated.status!=='ready')throw new Error(generated.reason);
   const old=backgroundPlan({seconds:input.seconds,mood:input.mood,textbook:input.textbook,seed:'audition-shared',sounding:input.sounds});
   const players=drum?LOCAL_INSTRUMENTS.filter((p:{recipe:string})=>p.recipe==='pulse'):[];
   const files=[];
   for(const [name,plan] of [['old',old],['new',generated.music]]){
    const rendered=await renderArrangedBackground(plan,players,input.sounds),rate=rendered.sampleRate;
    const ctx=new OfflineAudioContext(1,rendered.length,rate);
    const bg=ctx.createBufferSource();bg.buffer=rendered;const gain=ctx.createGain();gain.gain.value=.6*MIX_RULES.composeBackgroundMaxGain;
    const limiter=ctx.createDynamicsCompressor();
    limiter.threshold.value=MIX_RULES.limiter.thresholdDb;limiter.knee.value=MIX_RULES.limiter.kneeDb;
    limiter.ratio.value=MIX_RULES.limiter.ratio;limiter.attack.value=MIX_RULES.limiter.attackSeconds;limiter.release.value=MIX_RULES.limiter.releaseSeconds;
    bg.connect(gain).connect(limiter);limiter.connect(ctx.destination);bg.start();
    for(const s of input.sounds){
     const osc=ctx.createOscillator(),env=ctx.createGain();const duration=s.end-s.start;
     const hz=s.pitch==='high'?1100:s.pitch==='low'?180:440;
     osc.frequency.setValueAtTime(hz,s.start);osc.frequency.linearRampToValueAtTime(s.contour==='rising'?hz*1.2:s.contour==='falling'?hz*.8:hz,s.end);
     const peak=s.intensity==='soft'?.08:s.intensity==='loud'?.22:.14;
     env.gain.setValueAtTime(0,s.start);env.gain.linearRampToValueAtTime(peak*MIX_RULES.childGain,s.start+Math.min(.06,duration/3));
     env.gain.setValueAtTime(peak*MIX_RULES.childGain,s.end-Math.min(.1,duration/3));env.gain.linearRampToValueAtTime(0,s.end);
     osc.connect(env).connect(limiter);osc.start(s.start);osc.stop(s.end);
    }
    const mixed=await ctx.startRendering(),samples=mixed.getChannelData(0),bytes=pcm16Wave([samples],rate);
    let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
    files.push({name,base64:btoa(binary),metrics:pcmMetrics([samples]),notes:plan.notes.length});
   }
   return {files,generated};
  },{input:c.input,drum:c.drum,root});
  for(const f of result.files){await writeFile(resolve(out,`${c.id}-${f.name}.wav`),Buffer.from(f.base64,'base64'));if(!Number.isFinite(f.metrics.peak)||f.metrics.peak<=0||f.metrics.peak>=1)throw new Error('invalid-audition-pcm');}
  const report={id:c.id,label:c.label,input:c.input,drum:c.drum,result:result.generated,
   files:result.files.map(({base64:_,...f})=>({...f,path:`${c.id}-${f.name}.wav`}))};
  reports.push(report);await writeFile(resolve(out,`${c.id}.json`),JSON.stringify(report,null,2)+'\n');
  console.log(`${c.id}: ${result.files.map(f=>`${f.name} ${f.notes} notes, peak ${f.metrics.peak.toFixed(3)}`).join(' / ')}`);
 }
 if(errors.length)throw new Error(errors.join('\n'));
 await writeFile(resolve(out,'report.json'),JSON.stringify({stage:process.argv[3]?'complete-with-melody':'A',synthetic:true,browser:browser.version(),reports},null,2)+'\n');
 const escape=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
 const sourceReview=process.argv[3]&&existsSync(resolve(out,'birds-original.wav'))
  ?`<section><h2>先核对自动提取的旋律</h2><p>左侧是录音片段，右侧是自动提取后单独合成的旋律。它是候选主旋律，可能存在伴奏混入或漏音；下方成曲会引用其中片段并响应孩子编排。</p>${[['birds','小鸟在唱歌'],['horn','法国号']].map(([id,title])=>`<h3>${title}</h3><div class="pair"><div>原曲片段<audio controls preload="metadata" src="${id}-original.wav"></audio></div><div>自动提取的旋律<audio controls preload="metadata" src="${id}-extracted.wav"></audio></div></div>`).join('')}</section>`:'';
 await writeFile(resolve(out,'index.html'),`<!doctype html><html lang="zh"><meta charset="utf-8"><title>课本音乐创作 · 验收试听</title><style>body{font:16px system-ui;max-width:1000px;margin:32px auto;padding:16px;background:#faf8f2;color:#24372f}section{padding:20px;border-bottom:1px solid #ccc}.pair{display:flex;gap:32px;flex-wrap:wrap}audio{display:block;margin:8px 0}p{line-height:1.6}</style><h1>课本音乐 · 新旧对照试听</h1><p>新版已接成曲页。新版旋律使用现有原曲录音自动提取的音符片段，孩子声音使用同一批合成音以检查排列响应。原曲录音不直接混入作品。两版统一背景音量 60%、同配器和混音限幅。自动提取可能有误，需试听验收。</p>${sourceReview}${cases.map(c=>`<section><h2>${escape(c.label)}</h2><p>${c.input.textbook.tempoBpm} BPM · ${c.input.textbook.meter} 拍 · 孩子心情：${c.input.mood??'未选'} · ${c.drum?'原始声部＋小鼓':'原始声部，无鼓'}<br>声音时间：${c.input.sounds.map(s=>`${s.start}–${s.end}秒`).join('，')}</p><div class="pair"><div>旧算法<audio controls preload="metadata" src="${c.id}-old.wav"></audio></div><div>新版：原曲旋律参与<audio controls preload="metadata" src="${c.id}-new.wav"></audio></div></div></section>`).join('')}<p>结构、参数和音频指标见 report.json。音乐质量仍待人工试听确认。</p></html>`);
 await page.goto(pathToFileURL(resolve(out,'index.html')).href);
 if(await page.locator('audio').count()!==cases.length*2+(sourceReview?4:0))throw new Error('audition-player-count');
 await page.waitForFunction(()=>[...document.querySelectorAll('audio')].every(a=>a.readyState>=1&&Number.isFinite(a.duration)&&a.duration>0));
 await page.screenshot({path:resolve(out,'preview.png'),fullPage:true});
 console.log(`Written: ${out}`);
}finally{await browser?.close();await server.close();}
