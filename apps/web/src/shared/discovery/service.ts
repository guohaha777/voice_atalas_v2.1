// Discovery service port: current mix and anonymous program evidence in; checked teaching entries out.
import {DISCOVERY_RULES} from '@wanwu-v2/sound-rules/discovery';
import type {DiscoveryBrief} from '@wanwu-v2/contracts/discovery';

export type DiscoveryFailure='not-open'|'offline'|'quota'|'timeout'|'failed';
export type DiscoveryAnswer={ok:true;value:unknown}|{ok:false;reason:DiscoveryFailure};
export type DiscoveryService={
 /** Whether AI cards can be asked for now; false while no model is connected. */
 readonly open:boolean;
 readonly hears?:boolean;
 discover(brief:DiscoveryBrief,signal:AbortSignal):Promise<DiscoveryAnswer>;
};

export const offlineDiscoveryService:DiscoveryService={open:false,async discover(){return {ok:false,reason:'not-open'};}};

/** The whole wait for one round of AI cards (the server's model call and one repair share it). */
export const DISCOVERY_TIMEOUT_MS=DISCOVERY_RULES.analysis.pageMs;
