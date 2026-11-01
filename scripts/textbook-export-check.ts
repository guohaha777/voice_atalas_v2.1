// Verify the actual shared offline renderer using a synthetic child recording and a saved uploaded-song layer.
import {chromium} from 'playwright';
import {createServer} from 'vite';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),out=resolve(process.argv[2]);await mkdir(out,{recursive:true});
const melody=JSON.parse(await readFile(resolve(process.argv[3]),'utf8'));
const server=await createServer({configFile:false,root,server:{host:'127.0.0.1',port:0},plugins:[{name:'export-check',configureServer(s){s.middlewares.use('/__export',(_q,r)=>r.end('<!doctype html><title>Export check</title>'));}}]});
await server.listen();const address=server.httpServer!.address();if(!address||typeof address==='string')throw new Error('no-server');
const browser=await chromium.launch({headless:true,chromiumSandbox:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${address.port}/__export`);
 const result=await page.evaluate(async({melody,root})=>{
  const load=(path:string)=>import(/* @vite-ignore */ `/@fs${root}${path}`);
  const [{renderWork},{analyseSamples},{resolveComposeBackground},{textbookTracks},{RULE_VERSIONS},{pcm16Wave,pcmMetrics}]=await Promise.all([
   load('packages/audio-engine/src/render.ts'),
   load('packages/sound-rules/src/analysis.ts'),
   load('apps/web/src/shared/background/composeBackground.ts'),load('apps/web/src/shared/inspiration/textbookTracks.ts'),
   load('packages/sound-rules/src/rules.ts'),
   load('packages/audio-engine/src/pcm.ts')]);
  const ctx=new OfflineAudioContext(1,96000,48000),buffer=ctx.createBuffer(1,96000,48000),samples=buffer.getChannelData(0);
  for(let i=0;i<samples.length;i++)samples[i]=.15*Math.sin(2*Math.PI*1100*i/48000)*Math.min(1,i/2400,(samples.length-i)/2400);
  const original=samples.slice(),analysis=analyseSamples([samples],48000);
  const arrangement={version:'arrangement-v1',id:'work:export-test',units:[{version:'sound-v1',id:'unit:one',sourceId:'source:one',name:'合成测试声',maker:null,markerIndex:0,shape:{},input:'manual',createdAt:'2026-11-01T00:00:00.000Z',analysis}],
   events:[{id:'event:one',unitId:'unit:one',at:.1,row:0,clip:{startMs:0,endMs:2000}}],rows:3,spanSeconds:20,mood:{kind:'preset',id:'calm'},origin:'child',updatedAt:'2026-11-01T00:00:00.000Z'};
  const track={...textbookTracks[0],id:'teaching:export',melody};
  const settings={background:{enabled:true,instruments:[],volume:.5},inspiration:{kind:'teaching-music',musicId:track.id,name:'测试教学音乐',durationMs:30000}};
  const resolved=resolveComposeBackground(arrangement as any,settings.inspiration as any,[track]);
  if(!resolved.snapshot?.references.length)throw new Error('missing-source-melody');
  const input={arrangement,settings,textbook:null,rules:RULE_VERSIONS,textbookBackground:resolved.snapshot};
  const rendered=await renderWork(input as any,async()=>buffer);
  if(samples.some((n,i)=>n!==original[i]))throw new Error('original-changed');
  const rejected=[];
  for(const bad of [{...input,settings:{...settings,inspiration:{kind:'none'}}},
   {...input,textbookBackground:{...resolved.snapshot,music:{...resolved.snapshot.music,seconds:19}}}]){
   try{await renderWork(bad as any,async()=>buffer);throw new Error('invalid-render-accepted');}catch(e){rejected.push(String(e));}
  }
  if(rejected.some(e=>e.includes('invalid-render-accepted')))throw new Error('invalid-render-accepted');
  const channels=Array.from({length:rendered.numberOfChannels},(_,i)=>rendered.getChannelData(i)),bytes=pcm16Wave(channels,rendered.sampleRate);
  let b='';for(let i=0;i<bytes.length;i+=0x8000)b+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
  return {wave:btoa(b),metrics:pcmMetrics(channels),seconds:rendered.duration,notes:resolved.snapshot.music.notes.length,sourceReferences:resolved.snapshot.references.length,rejected};
 },{melody,root});
 if(result.seconds!==20||result.metrics.peak<=0||result.metrics.peak>=1)throw new Error('invalid-export-pcm');
 await writeFile(resolve(out,'offline-export.wav'),Buffer.from(result.wave,'base64'));
 const {wave:_,...report}=result;await writeFile(resolve(out,'export-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();await server.close();}
