// 系统音乐上传's local store, for the dev server only (`vite`, never a build): the internal page /lab/music saves here.
// - 系统歌曲 (set `system`): the recording goes beside the page in public/builtin-teaching/ and into its manifest.json,
//   so every visitor of this build hears it (the folder is kept out of GitHub, .git/info/exclude).
// - 测试集 (set `test`): the recording goes to music-eval/test/ at the repo root, never served to visitors.
// The answers a professional fills in (all optional) and every evaluation report live in music-eval/ (also kept out of
// GitHub). A recording is never overwritten: a name already taken gets a number.
import {existsSync} from 'node:fs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {basename,dirname,extname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import type {IncomingMessage,ServerResponse} from 'node:http';
import type {Plugin} from 'vite';

const web=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const repo=resolve(web,'../..');
const SYSTEM_DIR=resolve(web,'public/builtin-teaching');
const EVAL_DIR=resolve(repo,'music-eval');
const TEST_DIR=resolve(EVAL_DIR,'test');
const ANSWERS=resolve(EVAL_DIR,'answers.json');
const MANIFEST=resolve(SYSTEM_DIR,'manifest.json');
const REPORTS=resolve(EVAL_DIR,'reports');
const MAX_BYTES=20*1024*1024;
const AUDIO=/\.(mp3|m4a|wav|ogg)$/i;
const ROUTE='/__lab/music';

type Set='system'|'test';
export type LabRecord={
 id:string;
 name:string;
 set:Set;
 file:string;
 answers:Record<string,unknown>;
 savedAt:string;
};
type AnswersFile={version:'music-eval-v1';items:LabRecord[]};
type Manifest={note?:string;items:{name:string;file:string}[]};

/** The file's JSON, or `empty` when it is missing or unreadable. */
async function json<T>(file:string,empty:T):Promise<T>{
 try{
  return JSON.parse(await readFile(file,'utf8')) as T;
 }catch{
  return empty;
 }
}
const save=async(file:string,value:unknown)=>{
 await mkdir(dirname(file),{recursive:true});
 await writeFile(file,JSON.stringify(value,null,1)+'\n');
};
const dirOf=(set:Set)=>set==='system'?SYSTEM_DIR:TEST_DIR;
/** A display name: not empty, at most 40 characters, no slashes. */
const nameOk=(name:unknown):name is string=>typeof name==='string'
 &&!!name.trim()
 &&name.length<=40
 &&!/[\\/]/.test(name);

/** Every system song in the manifest has a record (empty answers until someone fills them). */
async function records(){
 const answers=await json<AnswersFile>(ANSWERS,{version:'music-eval-v1',items:[]});
 const manifest=await json<Manifest>(MANIFEST,{items:[]});
 let added=false;
 for(const item of manifest.items??[])if(!answers.items.some(r=>r.set==='system'&&r.file===item.file)){
  answers.items.push({
   id:`system:${item.file}`,
   name:item.name,
   set:'system',
   file:item.file,
   answers:{},
   savedAt:new Date().toISOString(),
  });
  added=true;
 }
 if(added)await save(ANSWERS,answers);
 return answers;
}

/** A free file name in the set's folder: the upload's own name, with a number when it is taken. */
function freeName(set:Set,wanted:string){
 const ext=extname(wanted).toLowerCase();
 const stem=basename(wanted,extname(wanted)).replace(/[\\/:*?"<>|]/g,'').slice(0,40)||'music';
 for(let n=1;;n++){
  const file=n===1?`${stem}${ext}`:`${stem}-${n}${ext}`;
  if(!existsSync(resolve(dirOf(set),file)))return file;
 }
}

async function body(req:IncomingMessage){
 const chunks:Buffer[]=[];
 let size=0;
 // Base64 makes the body about a third larger than the file.
 for await(const chunk of req){
  size+=(chunk as Buffer).length;
  if(size>MAX_BYTES*1.4)throw new Error('too-large');
  chunks.push(chunk as Buffer);
 }
 return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string,unknown>;
}
const send=(res:ServerResponse,status:number,value:unknown)=>{
 res.statusCode=status;
 res.setHeader('content-type','application/json; charset=utf-8');
 res.end(JSON.stringify(value));
};

async function handle(req:IncomingMessage,res:ServerResponse){
 const url=new URL(req.url??'',`http://${req.headers.host??'localhost'}`),
  rest=url.pathname.slice(ROUTE.length);
 if(req.method==='GET'&&(rest===''||rest==='/'))return send(res,200,await records());
 // The recording itself, by record id (test-set recordings are not under public/).
 if(req.method==='GET'&&rest.startsWith('/audio/')){
  const id=decodeURIComponent(rest.slice('/audio/'.length));
  const record=(await records()).items.find(r=>r.id===id);
  if(!record)return send(res,404,{error:'not-found'});
  const bytes=await readFile(resolve(dirOf(record.set),basename(record.file)));
  res.statusCode=200;
  res.setHeader('content-type','application/octet-stream');
  return res.end(bytes);
 }
 // A new recording: saved under a free name, listed (system songs also in the manifest), with its answers.
 if(req.method==='POST'&&(rest===''||rest==='/')){
  const input=await body(req);
  const set=input.set;
  const fileName=input.fileName;
  const audio=input.audio;
  if((set!=='system'&&set!=='test')
   ||!nameOk(input.name)
   ||typeof fileName!=='string'
   ||!AUDIO.test(fileName)
   ||typeof audio!=='string')return send(res,400,{error:'bad-request'});
  const bytes=Buffer.from(audio,'base64');
  if(!bytes.length||bytes.length>MAX_BYTES)return send(res,400,{error:'too-large'});
  const file=freeName(set,fileName);
  const name=input.name.trim();
  await mkdir(dirOf(set),{recursive:true});
  await writeFile(resolve(dirOf(set),file),bytes,{flag:'wx'});
  if(set==='system'){
   const manifest=await json<Manifest>(MANIFEST,{items:[]});
   manifest.items=[...manifest.items??[],{name,file}];
   await save(MANIFEST,manifest);
  }
  const answers=await records();
  const id=`${set}:${file}`;
  const record:LabRecord={
   id,
   name,
   set,
   file,
   answers:(input.answers&&typeof input.answers==='object'?input.answers:{}) as Record<string,unknown>,
   savedAt:new Date().toISOString(),
  };
  answers.items=[...answers.items.filter(r=>r.id!==id),record];
  await save(ANSWERS,answers);
  return send(res,200,record);
 }
 // Answers only: the recording stays as it was.
 if(req.method==='PUT'&&rest.startsWith('/answers/')){
  const id=decodeURIComponent(rest.slice('/answers/'.length));
  const input=await body(req);
  const answers=await records();
  const record=answers.items.find(r=>r.id===id);
  if(!record||!input.answers||typeof input.answers!=='object')return send(res,400,{error:'bad-request'});
  record.answers=input.answers as Record<string,unknown>;
  record.savedAt=new Date().toISOString();
  await save(ANSWERS,answers);
  return send(res,200,record);
 }
 if(req.method==='POST'&&rest==='/report'){
  const input=await body(req);
  const file=resolve(REPORTS,`${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
  await save(file,input);
  return send(res,200,{file:file.slice(repo.length+1)});
 }
 return send(res,404,{error:'not-found'});
}

/** The dev server's /__lab/music routes (`apply: 'serve'`: a build never has them). */
export function labMusicStore():Plugin{
 return {
  name:'wanwu-lab-music-store',
  apply:'serve',
  configureServer(server){
   server.middlewares.use((req,res,next)=>{
    if(!req.url?.startsWith(ROUTE))return next();
    handle(req,res).catch(()=>send(res,500,{error:'failed'}));
   });
  },
 };
}
