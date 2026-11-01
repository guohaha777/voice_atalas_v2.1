import {useId,useState} from 'react';
import {Dialog} from '../ui/Dialog.tsx';
import {useModelConfigForm} from './useModelConfigForm.ts';
import type {ModelConfig,ModelKind} from './modelConfig.ts';
import styles from './ModelConfigDialog.module.css';

const providers=[
 {kind:'language',title:'大语言模型',hint:'用于心情理解、讲解润色和 AI 音符背景；需兼容 OpenAI 接口'},
 {kind:'music',title:'音乐模型',hint:'用于 AI 音频背景（暂未开放）'},
] as const;

export function ModelConfigDialog({config,onApply,onClose}:{
 config:ModelConfig;
 onApply:(config:ModelConfig)=>void;
 onClose:()=>void;
}){
 const form=useModelConfigForm(config,onApply);
 const id=useId();
 const [revealed,setRevealed]=useState<Partial<Record<ModelKind,boolean>>>({});
 return <Dialog
  title="模型 API 输入"
  description="大语言模型和音乐模型可以分别配置，也可以只填写一种。"
  className={styles.dialog}
  onClose={onClose}>
  <p className={styles.notice}>填了哪一类，就用你的模型代替本站内置的。配置只留在当前页面，刷新后清空；Key 只随请求交给本站服务器转发，不保存。</p>
  <form
   noValidate
   onSubmit={event=>{
    event.preventDefault();
    form.apply();
   }}>
   <div className={styles.providers}>
    {providers.map(({kind,title,hint})=><fieldset
     key={kind}
     className={styles.provider}
     aria-describedby={form.errors[kind]?`${id}-${kind}-error`:undefined}>
     <legend>{title}</legend>
     <p className={styles.hint}>{hint}</p>
     <label htmlFor={`${id}-${kind}-url`}>服务地址</label>
     <input
      id={`${id}-${kind}-url`}
      type="url"
      inputMode="url"
      autoComplete="off"
      spellCheck={false}
      placeholder="https://api.example.com/v1"
      value={form.draft[kind].baseUrl}
      onChange={event=>form.update(kind,'baseUrl',event.target.value)}/>
     <label htmlFor={`${id}-${kind}-model`}>模型名称 / ID</label>
     <input
      id={`${id}-${kind}-model`}
      type="text"
      autoComplete="off"
      spellCheck={false}
      placeholder="填写服务商提供的模型名称"
      value={form.draft[kind].model}
      onChange={event=>form.update(kind,'model',event.target.value)}/>
     <label htmlFor={`${id}-${kind}-key`}>API Key</label>
     <div className={styles.keyField}>
      <input
       id={`${id}-${kind}-key`}
       type={revealed[kind]?'text':'password'}
       autoComplete="off"
       spellCheck={false}
       placeholder="输入 API Key"
       value={form.draft[kind].apiKey}
       onChange={event=>form.update(kind,'apiKey',event.target.value)}/>
      <button
       type="button"
       aria-controls={`${id}-${kind}-key`}
       aria-label={`${revealed[kind]?'隐藏':'显示'}${title}密钥`}
       aria-pressed={!!revealed[kind]}
       onClick={()=>setRevealed(current=>({...current,[kind]:!current[kind]}))}>
       {revealed[kind]?'隐藏':'显示'}
      </button>
     </div>
     {form.errors[kind]&&<p id={`${id}-${kind}-error`} className={styles.error} role="alert">{form.errors[kind]}</p>}
    </fieldset>)}
   </div>
   <p className={styles.status} role="status" aria-live="polite">{form.status}</p>
   <div className={styles.actions}>
    <button type="button" className={styles.clear} onClick={form.clear}>清空配置</button>
    <button type="submit" className={styles.apply}>应用到本次会话</button>
   </div>
  </form>
 </Dialog>;
}
