import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {BackgroundBrief} from '@wanwu-v2/contracts/background';
import {runBackgroundChain} from '../src/shared/background/generator.ts';
import {GuestAiClient,overrideHeader} from '../src/shared/guest-ai/guestAiClient.ts';
import {guestBackgroundGenerator,guestMoodInterpreter,guestTalkPolisher} from '../src/shared/guest-ai/adapters.ts';
import {emptyModelConfig} from '../src/shared/model-config/modelConfig.ts';
import type {ModelConfig} from '../src/shared/model-config/modelConfig.ts';

const token='a'.repeat(43);
const brief:BackgroundBrief={version:'background-request-v1',workId:'work:t',seconds:20,sounding:[{start:1,end:2}],tempo:90,metre:4,mode:'major',mood:'happy',
 arrangement:{density:'medium',repetition:'low',register:'medium'},textbook:null,variation:null,teachingMusic:null,instruments:[],
 rules:{analysis:'analysis-v2',shaping:'shaping-v3',background:'background-v1',mix:'mix-v1'}};
type Seen={path:string;init:RequestInit};
const json=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});

/** A fake server: a handler per "METHOD path"; records every request. */
function server(handlers:Record<string,(init:RequestInit)=>Response>,seen:Seen[]=[]){
 return async(path:string,init:RequestInit)=>{
  seen.push({path,init});
  const handler=handlers[`${init.method} ${path.replace(/[a-f0-9-]{36}$/,':id')}`];
  return handler?handler(init):json(404,{status:'error',reason:'not-found',requestId:'r'});
 };
}
const base={'GET /api/v1/auth/csrf':()=>json(200,{csrfToken:token}),'GET /api/v1/guest/status':()=>json(200,{language:true,music:false})};

test('the override header carries only fully filled kinds, as base64 JSON',()=>{
 assert.equal(overrideHeader(emptyModelConfig()),null);
 const config:ModelConfig={...emptyModelConfig(),language:{baseUrl:'https://api.example.com/v1',model:'中文模型',apiKey:'sk-test-only-123'}};
 const decoded=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(overrideHeader(config)!),char=>char.charCodeAt(0))));
 assert.deepEqual(decoded,{language:config.language});
 assert.equal(overrideHeader({...emptyModelConfig(),music:{baseUrl:'https://m.example.com',model:'m',apiKey:''}}),null);
});

test('status opens kinds; a visitor language model opens language even when the server has none',async()=>{
 let config=emptyModelConfig();
 const client=new GuestAiClient(()=>config,server({...base,'GET /api/v1/guest/status':()=>json(200,{language:false,music:false})}));
 assert.equal(client.open('language'),true,'optimistic until the status arrives');
 await client.loadStatus();
 assert.equal(client.open('language'),false);assert.equal(client.open('music'),false);
 config={...config,language:{baseUrl:'https://api.example.com/v1',model:'m',apiKey:'sk-test-only-123'}};
 assert.equal(client.open('language'),true);
});

test('POSTs carry the CSRF token and the override; a stale token is fetched again once',async()=>{
 const seen:Seen[]=[];let tokens=0,fail=true;
 const config={...emptyModelConfig(),language:{baseUrl:'https://api.example.com/v1',model:'m',apiKey:'sk-test-only-123'}};
 const client=new GuestAiClient(()=>config,server({...base,
  'GET /api/v1/auth/csrf':()=>{tokens++;return json(200,{csrfToken:token});},
  'POST /api/v1/moods/interpret':()=>{if(fail){fail=false;return json(403,{status:'error',reason:'csrf-failed',requestId:'r'});}return json(200,{nearest:'calm',model:'m',promptVersion:'p'});},
 },seen));
 const result=await guestMoodInterpreter(client).interpret('困了',new AbortController().signal);
 assert.deepEqual(result,{nearest:'calm',model:'m',promptVersion:'p'});assert.equal(tokens,2);
 const post=seen.filter(item=>item.init.method==='POST').at(-1)!,headers=post.init.headers as Record<string,string>;
 assert.equal(headers['X-CSRF-Token'],token);assert.ok(headers['X-Wanwu-Model-Config']);assert.equal(post.init.credentials,'same-origin');
 assert.equal(seen.some(item=>item.path.includes('sk-test')),false,'keys never go into a URL');
});

test('talk: the reply goes to the page checks; failures give null so the corpus stays',async()=>{
 const reply={lines:[{kind:'repeat',line:'x'}],tryThis:'y',model:'m',promptVersion:'p'};
 const ok=guestTalkPolisher(new GuestAiClient(emptyModelConfig,server({...base,'POST /api/v1/talk/work':()=>json(200,reply)})));
 assert.deepEqual(await ok.workTalk({} as never,new AbortController().signal),reply);
 const down=guestTalkPolisher(new GuestAiClient(emptyModelConfig,server({...base,'POST /api/v1/talk/work':()=>json(503,{status:'error',reason:'not-open',requestId:'r'})})));
 assert.equal(await down.workTalk({} as never,new AbortController().signal),null);
});

test('AI background: AI notes are polled to a result the chain accepts; closed steps are skipped',async()=>{
 let polls=0;
 const notes=[{at:0,length:1,midi:60,part:'chord',accent:0}];
 const client=new GuestAiClient(emptyModelConfig,server({...base,
  'POST /api/v1/backgrounds':init=>{assert.equal(JSON.parse(init.body as string).step,'notes-ai');return json(202,{jobId:'11111111-2222-3333-4444-555555555555'});},
  'GET /api/v1/backgrounds/:id':()=>++polls<2?json(200,{status:'pending'}):json(200,{status:'ready',source:'notes-ai',notes,model:'m',promptVersion:'p'}),
 }));
 await client.loadStatus();
 const generator=guestBackgroundGenerator(client);
 assert.deepEqual(generator.open,['notes-ai'],'music is closed until the server has a music model');
 const outcome=await runBackgroundChain(generator,brief,new AbortController().signal,{'audio-ai':1000,'notes-ai':5000});
 assert.equal(outcome.status,'ready');assert.equal(polls,2);
});

test('AI background: quota, not-open and lost jobs become the chain reasons',async()=>{
 const make=(start:()=>Response)=>guestBackgroundGenerator(new GuestAiClient(emptyModelConfig,server({...base,'POST /api/v1/backgrounds':start})));
 const signal=new AbortController().signal;
 assert.deepEqual(await make(()=>json(429,{status:'error',reason:'rate-limited',requestId:'r'})).generate(brief,'notes-ai',signal),{status:'unavailable',reason:'quota'});
 assert.deepEqual(await make(()=>json(503,{status:'error',reason:'not-open',requestId:'r'})).generate(brief,'notes-ai',signal),{status:'unavailable',reason:'not-open'});
 assert.deepEqual(await make(()=>json(202,{jobId:'11111111-2222-3333-4444-555555555555'})).generate(brief,'notes-ai',signal),{status:'unavailable',reason:'failed'});
});
