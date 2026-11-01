// 风格卡's local store, for the dev server only (`vite`, never a build): the internal page /lab/music adds and removes
// the style cards the AI background composer is given (packages/sound-rules/rules/ai-compose.v1.json, `styles`).
// Only the `styles` block of that file is rewritten, one card per line as it is written by hand; every other rule stays
// byte for byte. A card is checked before saving: a new id, a short name and hint, moods the rule file knows, and every
// mood keeps at least one card. The shared packages are then copied to the backend with `npm run shared:sync`.
import {readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import type {IncomingMessage,ServerResponse} from 'node:http';
import type {Plugin} from 'vite';

const RULES=resolve(dirname(fileURLToPath(import.meta.url)),'../../../packages/sound-rules/rules/ai-compose.v1.json');
const ROUTE='/__lab/styles';
const STYLES_START='"styles": [';

export type StyleCard={id:string;name:string;moods:string[];hint:string};
type Rules={moods:Record<string,unknown>;styles:StyleCard[]};

const read=async()=>JSON.parse(await readFile(RULES,'utf8')) as Rules;

/** What is wrong with a new card (empty = fine). */
function problems(card:Record<string,unknown>,rules:Rules){
 const out:string[]=[];
 const moods=Object.keys(rules.moods);
 if(typeof card.id!=='string'||!/^[a-z][a-z0-9-]{1,23}$/.test(card.id))out.push('id 用 2–24 个小写字母、数字或横线，字母开头');
 else if(rules.styles.some(style=>style.id===card.id))out.push(`id「${card.id}」已经有了`);
 if(typeof card.name!=='string'||!card.name.trim()||[...card.name.trim()].length>8)out.push('名字 1–8 个字');
 if(typeof card.hint!=='string'||!card.hint.trim()||[...card.hint.trim()].length>30)out.push('提示 1–30 个字');
 if([card.name,card.hint].some(text=>typeof text==='string'&&/["\\]/.test(text)))out.push('名字和提示里不要用英文引号或反斜杠');
 if(!Array.isArray(card.moods)||!card.moods.length||!card.moods.every(mood=>moods.includes(mood as string)))
  out.push(`适合的心情至少选一个（${moods.join(' / ')}）`);
 return out;
}

/** The `styles` block written back in the file's own style: one card per line. */
async function writeStyles(styles:StyleCard[]){
 const text=await readFile(RULES,'utf8');
 const start=text.indexOf(STYLES_START);
 const end=text.lastIndexOf(']');
 if(start<0||end<start)throw new Error('styles block not found');
 const lines=styles.map(style=>`  ${JSON.stringify(style).replace(/":/g,'": ').replace(/,"/g,', "')}`);
 await writeFile(RULES,`${text.slice(0,start)}${STYLES_START}\n${lines.join(',\n')}\n ${text.slice(end)}`);
}

async function body(req:IncomingMessage){
 const chunks:Buffer[]=[];
 for await(const chunk of req)chunks.push(chunk as Buffer);
 return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string,unknown>;
}
const send=(res:ServerResponse,status:number,value:unknown)=>{
 res.statusCode=status;
 res.setHeader('content-type','application/json; charset=utf-8');
 res.end(JSON.stringify(value));
};

async function handle(req:IncomingMessage,res:ServerResponse){
 const rest=new URL(req.url??'',`http://${req.headers.host??'localhost'}`).pathname.slice(ROUTE.length);
 const rules=await read();
 if(req.method==='GET'&&(rest===''||rest==='/'))return send(res,200,{moods:Object.keys(rules.moods),styles:rules.styles});
 // A new card, at the end of the list.
 if(req.method==='POST'&&(rest===''||rest==='/')){
  const input=await body(req);
  const found=problems(input,rules);
  if(found.length)return send(res,400,{error:'bad-card',problems:found});
  const card:StyleCard={
   id:input.id as string,
   name:(input.name as string).trim(),
   moods:Object.keys(rules.moods).filter(mood=>(input.moods as string[]).includes(mood)),
   hint:(input.hint as string).trim(),
  };
  await writeStyles([...rules.styles,card]);
  return send(res,200,card);
 }
 // Taking a card away, unless a mood would be left with none.
 if(req.method==='DELETE'&&rest.startsWith('/')){
  const id=decodeURIComponent(rest.slice(1));
  const left=rules.styles.filter(style=>style.id!==id);
  if(left.length===rules.styles.length)return send(res,404,{error:'not-found'});
  const orphan=Object.keys(rules.moods).filter(mood=>!left.some(style=>style.moods.includes(mood)));
  if(orphan.length)return send(res,400,{error:'last-card',problems:[`去掉后这些心情就没有风格卡了：${orphan.join(' / ')}`]});
  await writeStyles(left);
  return send(res,200,{removed:id});
 }
 return send(res,404,{error:'not-found'});
}

/** The dev server's /__lab/styles routes (`apply: 'serve'`: a build never has them). */
export function labStyleStore():Plugin{
 return {
  name:'wanwu-lab-style-store',
  apply:'serve',
  configureServer(server){
   server.middlewares.use((req,res,next)=>{
    if(!req.url?.startsWith(ROUTE))return next();
    handle(req,res).catch(()=>send(res,500,{error:'failed'}));
   });
  },
 };
}
