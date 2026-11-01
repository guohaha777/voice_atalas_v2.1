import {useState} from 'react';
import {emptyModelConfig,normalizeModelConfig,validateModelConfig} from './modelConfig.ts';
import type {ModelConfig,ModelKind,ProviderConfig} from './modelConfig.ts';

export function useModelConfigForm(initial:ModelConfig,onApply:(config:ModelConfig)=>void){
 const [draft,setDraft]=useState<ModelConfig>(()=>({language:{...initial.language},music:{...initial.music}}));
 const [errors,setErrors]=useState<Partial<Record<ModelKind,string>>>({});
 const [status,setStatus]=useState('');
 const update=(kind:ModelKind,field:keyof ProviderConfig,value:string)=>{
  setDraft(current=>({...current,[kind]:{...current[kind],[field]:value}}));
  setErrors(current=>({...current,[kind]:undefined}));setStatus('');
 };
 const apply=()=>{
  const nextErrors=validateModelConfig(draft);setErrors(nextErrors);
  if(Object.keys(nextErrors).length){setStatus('请检查标出的配置。');return;}
  const config=normalizeModelConfig(draft);setDraft(config);onApply(config);
  setStatus('已应用：填写的模型会代替内置模型。');
 };
 const clear=()=>{const empty=emptyModelConfig();setDraft(empty);setErrors({});onApply(empty);setStatus('本次会话的配置已清空。');};
 return {draft,errors,status,update,apply,clear};
}
