export type ProviderConfig={baseUrl:string;model:string;apiKey:string};
export type ModelConfig={language:ProviderConfig;music:ProviderConfig};
export type ModelKind=keyof ModelConfig;
export const emptyModelConfig=():ModelConfig=>({
 language:{baseUrl:'',model:'',apiKey:''},music:{baseUrl:'',model:'',apiKey:''},
});

/**
 * A visitor's own model settings, kept in memory only (visitorModels.ts). A filled kind replaces the built-in model for
 * that kind: the guest AI client sends it with each request and our server calls the service (shared/guest-ai/). The server
 * accepts only public https addresses and a key, so the same rules are checked here first.
 */
export function validateModelConfig(config:ModelConfig):Partial<Record<ModelKind,string>>{
 const errors:Partial<Record<ModelKind,string>>={};
 for(const kind of ['language','music'] as const){
  const provider=config[kind];
  if(!provider.baseUrl.trim()&&!provider.model.trim()&&!provider.apiKey.trim())continue;
  if(!provider.baseUrl.trim()){errors[kind]='请填写服务地址。';continue;}
  try{
   const url=new URL(provider.baseUrl.trim());
   if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash){errors[kind]='请填写 HTTPS 服务地址，不要在地址中附带密钥。';continue;}
  }catch{errors[kind]='请填写完整的服务地址，例如 https://api.example.com/v1。';continue;}
  if(!provider.model.trim()){errors[kind]='请填写模型名称或 ID。';continue;}
  if(!/^[\x21-\x7e]{8,300}$/.test(provider.apiKey.trim()))errors[kind]='请填写 API Key（8 位以上，不含空格）。';
 }
 return errors;
}

export function normalizeModelConfig(config:ModelConfig):ModelConfig{
 const normalize=(provider:ProviderConfig):ProviderConfig=>({baseUrl:provider.baseUrl.trim(),model:provider.model.trim(),apiKey:provider.apiKey.trim()});
 return {language:normalize(config.language),music:normalize(config.music)};
}

/** A kind is used only when all three fields are filled. */
export const providerFilled=(provider:ProviderConfig)=>!!(provider.baseUrl&&provider.model&&provider.apiKey);
