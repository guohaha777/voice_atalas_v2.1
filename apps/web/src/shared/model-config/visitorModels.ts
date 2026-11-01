// The visitor's 「API 输入」 settings for this page session, read by the guest AI client when it sends a request.
// Memory only: never written to browser storage, a URL or a log; a refresh clears it.
import { emptyModelConfig } from './modelConfig.ts';
import type { ModelConfig } from './modelConfig.ts';

let current: ModelConfig = emptyModelConfig();
export const visitorModels = {
  get: (): ModelConfig => current,
  set: (config: ModelConfig) => {
    current = config;
  },
};
