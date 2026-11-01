// The guest AI ports, backed by the server (GuestAiClient). Pages see the same ports as before; whatever the server
// sends is still checked by the page's own parsers, and every failure leaves the local result in place.
import { AI_BACKGROUND_STEPS } from '@wanwu-v2/contracts/background';
import type {
  AiBackgroundStep,
  BackgroundResult,
  BackgroundUnavailable,
} from '@wanwu-v2/contracts/background';
import type { BackgroundGenerator } from '../background/generator.ts';
import type { TeachingMusicService } from '../inspiration/teachingMusic.ts';
import type { TalkPolisher } from '../talk/polisher.ts';
import { DISCOVERY_TIMEOUT_MS } from '../discovery/service.ts';
import type { DiscoveryFailure, DiscoveryService } from '../discovery/service.ts';
import type { MoodInterpreter } from '../ports/moodInterpreter.ts';
import type { GuestAiClient, GuestReply } from './guestAiClient.ts';

/** First look after this long, then every interval: AI notes are quick, AI audio takes a while. */
const POLL = {
  'notes-ai': { first: 600, every: 600 },
  'voice-ai': { first: 600, every: 600 },
  'audio-ai': { first: 3000, every: 2000 },
} as const;

const unavailableReason = (reply: Extract<GuestReply, { ok: false }>): BackgroundUnavailable =>
  reply.reason === 'not-open'
    ? 'not-open'
    : reply.status === 429
      ? 'quota'
      : reply.reason === 'timeout'
        ? 'timeout'
        : 'failed';
/** Waits `ms`, or rejects at once when `signal` aborts. */
const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new Error('aborted'));
      },
      { once: true },
    );
  });

export function guestDiscoveryService(client: GuestAiClient): DiscoveryService {
  const reason = (reply: Extract<GuestReply, { ok: false }>): DiscoveryFailure =>
    reply.status === 0 && reply.reason === 'network'
      ? 'offline'
      : unavailableReason(reply) === 'quota'
        ? 'quota'
        : (unavailableReason(reply) as DiscoveryFailure);
  return {
    get open() {
      return client.open('language');
    },
    get hears() {
      return client.hears();
    },
    async discover(brief, signal) {
      const reply = await client.post(
        '/api/v1/discovery/work',
        brief,
        signal,
        DISCOVERY_TIMEOUT_MS,
      );
      return reply.ok ? { ok: true, value: reply.data } : { ok: false, reason: reason(reply) };
    },
  };
}

export function guestTalkPolisher(client: GuestAiClient): TalkPolisher {
  return {
    get open() {
      return client.open('language');
    },
    async workTalk(brief, signal) {
      const reply = await client.post('/api/v1/talk/work', brief, signal);
      return reply.ok ? reply.data : null;
    },
    async textbookTalk(brief, signal) {
      const reply = await client.post('/api/v1/talk/textbook', brief, signal);
      return reply.ok ? reply.data : null;
    },
  };
}

/** 教学音乐出卡: the audio model hears the excerpt, else the language model reads the numbers (the server decides). */
export function guestTeachingMusicService(client: GuestAiClient): TeachingMusicService {
  return {
    get analyseAvailable() {
      return client.hears() || client.open('language');
    },
    async features(request, signal) {
      const reply = await client.post('/api/v1/textbook/features', request, signal);
      return reply.ok ? reply.data : null;
    },
  };
}

export function guestMoodInterpreter(client: GuestAiClient): MoodInterpreter {
  return {
    get available() {
      return client.open('language');
    },
    async interpret(text, signal) {
      const reply = await client.post('/api/v1/moods/interpret', { text }, signal);
      return reply.ok ? (reply.data as never) : null;
    },
  };
}

export function guestBackgroundGenerator(client: GuestAiClient): BackgroundGenerator {
  return {
    get open() {
      // Music model, voice model (the server's built-in audio model), text model — each only when the server has it.
      return AI_BACKGROUND_STEPS.filter((step) =>
        step === 'audio-ai'
          ? client.open('music')
          : step === 'voice-ai'
            ? client.hears()
            : client.open('language'),
      );
    },
    async generate(brief, step: AiBackgroundStep, signal): Promise<unknown> {
      const started = await client.post('/api/v1/backgrounds', { step, brief }, signal);
      if (!started.ok)
        return {
          status: 'unavailable',
          reason: unavailableReason(started),
        } satisfies BackgroundResult;
      const jobId = (started.data as { jobId?: unknown } | null)?.jobId;
      if (typeof jobId !== 'string' || !/^[a-f0-9-]{36}$/.test(jobId))
        return { status: 'unavailable', reason: 'failed' } satisfies BackgroundResult;
      // runBackgroundChain aborts this at the step's timeout; until then look again now and then.
      await wait(POLL[step].first, signal);
      for (;;) {
        const reply = await client.get(`/api/v1/backgrounds/${jobId}`, signal);
        if (!reply.ok)
          return {
            status: 'unavailable',
            reason: unavailableReason(reply),
          } satisfies BackgroundResult;
        if ((reply.data as { status?: unknown } | null)?.status !== 'pending') return reply.data;
        await wait(POLL[step].every, signal);
      }
    },
  };
}
