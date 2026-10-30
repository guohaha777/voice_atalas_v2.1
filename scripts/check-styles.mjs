// Structure check for the web app, run with the build: every @media in CSS names a screen tier from
// apps/web/src/styles/breakpoints.ts (`@media(--short)`), so the tiers stay in one list. Container queries are
// component-level and stay literal. (The 220-line file budget was dropped on 2026-10-30.)
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const src=path.join(root,'apps/web/src');

const tiers=new Set([...(await fs.readFile(path.join(src,'styles/breakpoints.ts'),'utf8')).matchAll(/^\s*'?([\w-]+)'?:'\(/gm)].map(match=>match[1]));
async function walk(dir){const all=[];for(const entry of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())all.push(...await walk(file));else all.push(file);}return all;}

const problems=[];
for(const file of await walk(src)){
 if(!/\.(css|ts|tsx)$/.test(file)||file.includes('.generated.'))continue;
 const text=await fs.readFile(file,'utf8'),rel=path.relative(root,file);
 if(!file.endsWith('.css'))continue;
 for(const match of text.matchAll(/@media\s*([^{]+)\{/g)){
  const query=match[1].trim(),named=/^\(--([\w-]+)\)$/.exec(query);
  if(!named)problems.push(`${rel}: raw media query "${query}" — use a tier from src/styles/breakpoints.ts`);
  else if(!tiers.has(named[1]))problems.push(`${rel}: unknown screen tier --${named[1]}`);
 }
}
if(problems.length){console.error(problems.join('\n'));process.exit(1);}
console.log(`styles: ${tiers.size} screen tiers, every media query names one`);
