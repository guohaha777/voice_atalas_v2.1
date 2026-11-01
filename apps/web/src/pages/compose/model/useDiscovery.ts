import { useEffect, useMemo, useRef, useState } from 'react';
import type { Arrangement } from '@wanwu-v2/contracts/arrangement';
import {
  DISCOVERY_BRIEF_VERSION,
  isDiscoveryBrief,
  isAudioObservation,
} from '@wanwu-v2/contracts/discovery';
import type { DiscoveryBackground, DiscoveryBrief } from '@wanwu-v2/contracts/discovery';
import { acceptDiscoverySet, candidatePoints, DISCOVERY_CORPUS } from '@wanwu-v2/prompts/discovery';
import { DISCOVERY_RULES } from '@wanwu-v2/sound-rules/discovery';
import { arrangementIdentity } from '../../../shared/background/compositionIdentity.ts';
import { pieceSeconds, timedEvents } from '../../../shared/creation/arrangementTiming.ts';
import { presetMood } from '../../../shared/creation/moodCopy.ts';
import { keepSet, shownSet } from '../../../shared/discovery/sets.ts';
import type { KeptSet } from '../../../shared/discovery/sets.ts';
import {
  backgroundEvidence,
  listeningEvidence,
  longestRest,
  numberEvidence,
  pieceEvidence,
} from '../../../shared/discovery/evidence.ts';
import type { Found } from '../../../shared/discovery/evidence.ts';
import { DISCOVERY_TIMEOUT_MS } from '../../../shared/discovery/service.ts';
import type { DiscoveryFailure, DiscoveryService } from '../../../shared/discovery/service.ts';
import { keptCache } from '../../../shared/storage/keptCache.ts';
import { discoveryActions } from './discoveryActions.ts';

/** One AI set per piece as it sounds (its identity), kept on this device: asked again only when the music changes. */
const made = keptCache<KeptSet>('ai-discovery');
/** Measuring the layers waits this long after the last change of instruments or volume. */
const LISTEN_DELAY_MS = 400;

/** The two layers as playback would play them (usePiecePlayback.layers). */
type Layers = () => Promise<{
  sounds: { unitId: string; start: number; buffer: AudioBuffer }[];
  background: { buffer: AudioBuffer; gain: number } | null;
} | null>;

/**
 * Local teaching entries appear immediately. After editing settles, one analysis round is bound to
 * the actual arrangement, background content, instrumentation, gain and analysis version.
 * Every stage belongs to that identity; changing it cancels the round and discards late replies.
 */
export function useDiscovery({
  arrangement,
  background,
  content,
  backgroundMusic,
  busy,
  instrumentChoice,
  instrumentOptions,
  layers,
  audio,
  service,
}: {
  arrangement: Arrangement | null;
  background: DiscoveryBackground;
  /** What the background plays, by content (AI result, song, plain); not who plays it or how loud. */
  content: string;
  backgroundMusic?: DiscoveryBrief['backgroundMusic'];
  busy: boolean;
  instrumentChoice: boolean;
  instrumentOptions?: string[];
  layers: Layers;
  audio?: () => Promise<string | undefined>;
  service: DiscoveryService;
}) {
  const piece = useMemo(
    () => (arrangement?.events.length ? pieceEvidence(arrangement) : null),
    [arrangement],
  );
  const identity = useMemo(
    () =>
      arrangement && piece
        ? JSON.stringify({
            piece: arrangementIdentity(arrangement),
            mood: presetMood(arrangement.mood),
            seconds: pieceSeconds(arrangement),
            background: background.kind === 'off' ? 'off' : content,
            playback: background,
            backgroundMusic,
            versions: [DISCOVERY_BRIEF_VERSION, DISCOVERY_RULES.version, DISCOVERY_CORPUS.version],
          })
        : '',
    [arrangement, piece, JSON.stringify(background), content, JSON.stringify(backgroundMusic)],
  );
  const actions = useMemo(
    () =>
      arrangement && piece
        ? discoveryActions(arrangement, piece.tokens, {
            background: background.kind !== 'off',
            instrumentChoice,
            instrumentOptions,
          })
        : [],
    [arrangement, piece, background.kind, instrumentChoice, JSON.stringify(instrumentOptions)],
  );
  const backgroundKey = JSON.stringify(background);
  const found = useMemo(() => backgroundEvidence(background), [backgroundKey]);

  // ----- 程序听感证据: measured again after instruments / volume settle -----
  const heardKey = `${identity}|${backgroundKey}`;
  const [heard, setHeard] = useState<{ key: string; found: Found[] } | null>(null);
  useEffect(() => {
    if (!identity || !arrangement || !piece) return;
    let live = true;
    const timer = setTimeout(() => {
      void layers().then(
        (result) => {
          if (!live) return;
          const sampleRate = result?.sounds[0]?.buffer.sampleRate ?? 44_100;
          const rest = longestRest(timedEvents(arrangement));
          setHeard({
            key: heardKey,
            found: result
              ? listeningEvidence({
                  sampleRate,
                  sounds: result.sounds
                    .map((sound) => ({
                      token: piece.tokens.get(sound.unitId)!,
                      start: sound.start,
                      samples: sound.buffer.getChannelData(0),
                    }))
                    .filter((sound) => sound.token),
                  // Both layers pass the same master gain; only the background layer's own gain differs.
                  childGain: 1,
                  background: result.background
                    ? {
                        samples: result.background.buffer.getChannelData(0),
                        sampleRate: result.background.buffer.sampleRate,
                        gain: result.background.gain,
                      }
                    : null,
                  rests: rest ? [rest] : [],
                })
              : [],
          });
        },
        () => {
          if (live) setHeard({ key: heardKey, found: [] });
        },
      );
    }, LISTEN_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // Measured per arrangement and background as heard (`heardKey`); `layers` reads the latest of both.
  }, [heardKey]);
  const measured = heard?.key === heardKey;
  const evidence = useMemo(
    () => numberEvidence([...(piece?.found ?? []), ...found, ...(measured ? heard!.found : [])]),
    [piece, found, measured, heard],
  );

  // ----- AI cards: once per identity, after the music and the measures settle -----
  const [, setRevision] = useState(0);
  const [kept, setKept] = useState(false);
  const [asking, setAsking] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ identity: string; reason: DiscoveryFailure } | null>(
    null,
  );
  const asked = useRef(new Set<string>());
  useEffect(() => {
    let live = true;
    void made.ready.then(() => {
      if (live) setKept(true);
    });
    return () => {
      live = false;
    };
  }, []);
  const latest = useRef({ evidence, actions, piece, background, arrangement });
  latest.current = { evidence, actions, piece, background, arrangement };
  /** The round on its way, and for which identity. */
  const running = useRef<{ identity: string; controller: AbortController } | null>(null);
  // A changed piece (or leaving the page) drops the round asked for the old one: its reply would not be shown anyway,
  // and the old piece may be asked again if it comes back.
  useEffect(
    () => () => {
      const round = running.current;
      if (round?.identity !== identity) return;
      running.current = null;
      round.controller.abort();
      asked.current.delete(identity);
      setAsking(null);
    },
    [identity],
  );
  useEffect(() => {
    if (
      !identity ||
      !kept ||
      busy ||
      !measured ||
      !service.open ||
      made.get(identity) ||
      asked.current.has(identity)
    )
      return;
    const timer = setTimeout(() => {
      const now = latest.current;
      const points = candidatePoints(now.evidence, now.actions);
      if (!now.piece || !now.arrangement || !points.length) return;
      asked.current.add(identity);
      const brief: DiscoveryBrief = {
        version: DISCOVERY_BRIEF_VERSION,
        mode: 'data',
        seconds: pieceSeconds(now.arrangement),
        mood: presetMood(now.arrangement.mood),
        background: now.background,
        backgroundMusic,
        sounds: now.piece.sounds,
        evidence: now.evidence,
        actions: now.actions,
        points,
      };
      // The server would refuse a brief outside the contract: the local set stays, nothing is sent.
      if (!isDiscoveryBrief(brief)) {
        setFailure({ identity, reason: 'failed' });
        return;
      }
      const controller = new AbortController();
      const round = { identity, controller };
      running.current = round;
      const gaveUp = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
      setAsking(identity);
      setFailure(null);
      void (async () => {
        if (service.hears && audio) {
          try {
            brief.audio = await audio();
            if (brief.audio) brief.mode = 'audio';
          } catch {
            /* Rendering failed: still generate from program evidence. */
          }
        }
        if (controller.signal.aborted) return { ok: false as const, reason: 'timeout' as const };
        return service.discover(brief, controller.signal);
      })()
        .catch(() => ({ ok: false as const, reason: 'failed' as const }))
        .then((answer) => {
          clearTimeout(gaveUp);
          // Dropped because the piece changed: nothing to show or say.
          if (running.current !== round) return;
          running.current = null;
          setAsking(null);
          // Recheck complete entries independently with the same rules as the server.
          const value = answer.ok
            ? (answer.value as {
                set?: unknown;
                promptVersion?: unknown;
                rejected?: unknown;
              } | null)
            : null;
          const observed = answer.ok ? (answer.value as { observations?: unknown }) : null;
          brief.mode = 'data';
          if (observed?.observations && Array.isArray(observed.observations)) {
            brief.observations = observed.observations
              .filter(isAudioObservation)
              .filter((item) => item.range[1] <= brief.seconds);
            if (brief.observations.length) brief.mode = 'audio';
          }
          const accepted = value ? acceptDiscoverySet(value.set, brief) : null;
          if (accepted?.set) {
            made.set(
              identity,
              keepSet(
                accepted.set,
                brief,
                typeof value?.promptVersion === 'string' ? value.promptVersion : null,
                accepted.notes.length > 0 || Number(value?.rejected) > 0,
              ),
            );
            setRevision((count) => count + 1);
            return;
          }
          setFailure({
            identity,
            reason: controller.signal.aborted ? 'timeout' : answer.ok ? 'failed' : answer.reason,
          });
        });
    }, DISCOVERY_RULES.requestDelaySeconds * 1000);
    // Identity cleanup also cancels rounds whose instruments or effective volume changed.
    return () => clearTimeout(timer);
  }, [identity, kept, busy, measured, service.open]);

  const ai = identity && !busy ? (made.get(identity) ?? null) : null;
  const set = useMemo(
    () => (piece ? shownSet(ai, evidence, actions, piece.names) : null),
    [piece, ai, evidence, actions],
  );
  return {
    set,
    hears: !!service.hears,
    /** An AI round is on its way for this piece (the progress bar shows; the local set stays meanwhile). */
    asking: !!identity && asking === identity,
    /** Why this piece has no AI set, when an AI round was asked and gave none. */
    failure: failure?.identity === identity ? failure.reason : null,
  };
}
