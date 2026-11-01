// 游客 AI client: same-origin calls to the server's guest AI module (/api/v1/guest/status, /moods/interpret, /talk/*,
// /backgrounds). No account is needed: the server's anonymous session gives a CSRF token (GET /auth/csrf), which every
// POST carries. A visitor's own 「API 输入」 settings ride along in one header, per request, only for kinds fully filled.
// Separate from the account client on purpose: AI requests never queue behind (or hold up) login and saving.
import {parseApiFailure} from '@wanwu-v2/contracts/api';
import {providerFilled} from '../model-config/modelConfig.ts';
import type {ModelConfig,ModelKind} from '../model-config/modelConfig.ts';

/** What the server has built in: language model, music model, and a model that hears audio (teaching-music cards). */
export type GuestStatus={language:boolean;music:boolean;audio:boolean};
export type GuestReply={ok:true;data:unknown}|{ok:false;status:number;reason:string};
type Fetcher=(input:string,init:RequestInit)=>Promise<Response>;

/** Longest any single guest request may take; callers abort sooner (talk 6 s, AI notes 8 s). */
const REQUEST_TIMEOUT_MS=15_000;

/** The header value for the kinds the visitor filled, or null to use the built-in models. */
export function overrideHeader(config:ModelConfig):string|null{
 const own:Partial<Record<ModelKind,ModelConfig[ModelKind]>>={};
 for(const kind of ['language','music'] as const)if(providerFilled(config[kind]))own[kind]={...config[kind]};
 if(!Object.keys(own).length)return null;
 const bytes=new TextEncoder().encode(JSON.stringify(own));
 let binary='';
 for(const byte of bytes)binary+=String.fromCharCode(byte);
 return btoa(binary);
}

export class GuestAiClient{
 private status:GuestStatus|null=null;
 private pendingStatus:Promise<GuestStatus>|null=null;
 private csrf:string|null=null;
 private pendingCsrf:Promise<string|null>|null=null;
 private readonly fetcher:Fetcher;
 private readonly models:()=>ModelConfig;
 constructor(models:()=>ModelConfig,fetcher:Fetcher=(input,init)=>fetch(input,init)){
  this.models=models;
  this.fetcher=fetcher;
 }

 /**
  * Whether a kind can be asked for now: the visitor filled it, or the server has a built-in model for it. Until the
  * status has arrived the language kind counts as open (the server answers not-open if it is not); music needs the
  * server's adapter, so a visitor's own music model alone does not open it.
  */
 open(kind:ModelKind){
  if(kind==='language'&&providerFilled(this.models().language))return true;
  return this.status?this.status[kind]:kind==='language';
 }
 /** Whether the server can hear a teaching-music excerpt (its built-in audio model); unknown until the status arrives. */
 hears(){
  return this.status?.audio===true;
 }
 loadStatus():Promise<GuestStatus>{
  if(this.status)return Promise.resolve(this.status);
  this.pendingStatus??=this.send('GET','/api/v1/guest/status').then(reply=>{
   const data=reply.ok?reply.data as Record<string,unknown>:null;
   const status={language:data?.language===true,music:data?.music===true,audio:data?.audio===true};
   if(reply.ok)this.status=status;
   return status;
  }).finally(()=>{
   this.pendingStatus=null;
  });
  return this.pendingStatus;
 }

 get(path:string,signal?:AbortSignal){
  return this.send('GET',path,undefined,signal);
 }
 /**
  * POST with the session's CSRF token; a stale token (after login or logout) is fetched again once. `timeoutMs` is for
  * the one caller whose server round may run past the usual cap (音乐小发现: model call + one repair, under 20 s).
  */
 async post(path:string,body:unknown,signal?:AbortSignal,timeoutMs=REQUEST_TIMEOUT_MS):Promise<GuestReply>{
  for(let attempt=0;attempt<2;attempt++){
   const token=await this.token(signal);
   if(!token)return {ok:false,status:0,reason:'network'};
   const reply=await this.send('POST',path,body,signal,token,timeoutMs);
   if(reply.ok||reply.reason!=='csrf-failed')return reply;
   this.csrf=null;
  }
  return {ok:false,status:403,reason:'csrf-failed'};
 }

 private token(signal?:AbortSignal):Promise<string|null>{
  if(this.csrf)return Promise.resolve(this.csrf);
  this.pendingCsrf??=this.send('GET','/api/v1/auth/csrf',undefined,signal).then(reply=>{
   const token=reply.ok?(reply.data as {csrfToken?:unknown}|null)?.csrfToken:null;
   this.csrf=typeof token==='string'&&/^[A-Za-z0-9_-]{43}$/.test(token)?token:null;
   return this.csrf;
  }).finally(()=>{
   this.pendingCsrf=null;
  });
  return this.pendingCsrf;
 }

 /** One request, at most REQUEST_TIMEOUT_MS; the visitor's own models go along in a header (POST only). */
 private async send(
  method:'GET'|'POST',
  path:string,
  body?:unknown,
  signal?:AbortSignal,
  csrf?:string,
  timeoutMs=REQUEST_TIMEOUT_MS,
 ):Promise<GuestReply>{
  const abort=new AbortController();
  const stop=()=>abort.abort();
  const timer=setTimeout(stop,timeoutMs);
  signal?.addEventListener('abort',stop,{once:true});
  try{
   const own=method==='POST'?overrideHeader(this.models()):null;
   const response=await this.fetcher(path,{
    method,
    credentials:'same-origin',
    cache:'no-store',
    redirect:'error',
    signal:abort.signal,
    headers:{
     Accept:'application/json',
     ...(csrf?{'X-CSRF-Token':csrf}:{}),
     ...(own?{'X-Wanwu-Model-Config':own}:{}),
     ...(body===undefined?{}:{'Content-Type':'application/json'}),
    },
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
   });
   let data:unknown=null;
   try{
    data=await response.json();
   }catch{/* the status decides */}
   if(response.ok)return {ok:true,data};
   return {ok:false,status:response.status,reason:parseApiFailure(data)?.reason??'bad-response'};
  }catch{
   // Our own timeout, not the caller's cancel.
   return {ok:false,status:0,reason:abort.signal.aborted&&!signal?.aborted?'timeout':'network'};
  }
  finally{
   clearTimeout(timer);
   signal?.removeEventListener('abort',stop);
  }
 }
}
