// 音乐小发现的证据: what the program can say for sure about a piece, before any card is written. Three kinds:
// - arrangement facts (who starts, what repeats or comes back, what overlaps, rests, where it is busier, how it ends);
// - the child's choices and the recordings' measures (high against low), each named by where it came from;
// - the background the page plays and, measured from the two layers as they are heard, where the background is
//   louder than a sound or carries a rest, and whether the child's sounds get softer or louder toward the end
//   (程序听感证据, so points about covering or fading need no model to "hear");
// - the mood the child chose (context for the model's associations; never a point on its own).
// Sounds are numbered tokens in listening order; `names` keeps the child's names on the device. Thresholds live in
// @wanwu-v2/sound-rules/discovery, words in @wanwu-v2/prompts/discovery.
import type { Arrangement } from '@wanwu-v2/contracts/arrangement';
import { soundToken } from '@wanwu-v2/contracts/talk';
import type { SoundToken } from '@wanwu-v2/contracts/talk';
import type { BriefedSound, DiscoveryBackground, Evidence } from '@wanwu-v2/contracts/discovery';
import { DISCOVERY_CORPUS } from '@wanwu-v2/prompts/discovery';
import { DISCOVERY_RULES } from '@wanwu-v2/sound-rules/discovery';
import type { DiscoveryRules } from '@wanwu-v2/sound-rules/discovery';
import { heardSeconds, timedEvents } from '../creation/arrangementTiming.ts';
import { presetMood } from '../creation/moodCopy.ts';

/** Evidence before it is numbered for a brief. */
export type Found = Omit<Evidence, 'id'>;
export type PieceEvidence = {
  found: Found[];
  sounds: BriefedSound[];
  /** `names[i]` is the child's name behind token i+1. */
  names: string[];
  /** Each sound unit's token. */
  tokens: ReadonlyMap<string, SoundToken>;
};

const tenth = (value: number) => Math.round(value * 10) / 10;
const range = (start: number, end: number): [number, number] => [
  tenth(start),
  tenth(Math.max(start, end)),
];

/** Facts counted from the arrangement, the child's choices and the measures. */
export function pieceEvidence(
  arrangement: Arrangement,
  rules: DiscoveryRules = DISCOVERY_RULES,
): PieceEvidence {
  const timed = timedEvents(arrangement);
  const tokens = new Map<string, SoundToken>();
  const names: string[] = [];
  for (const { unit } of timed)
    if (!tokens.has(unit.id)) {
      tokens.set(unit.id, soundToken(names.length));
      names.push(unit.name);
    }
  const found: Found[] = [];
  if (!timed.length) return { found, sounds: [], names, tokens };
  const token = (unitId: string) => tokens.get(unitId)!;
  const units = [...tokens.keys()];
  const placed = (unitId: string) => timed.filter((item) => item.unit.id === unitId);

  if (units.length === 1 && timed.length === 1) {
    const only = timed[0]!;
    found.push({
      kind: 'single',
      source: 'arrangement',
      sounds: [token(only.unit.id)],
      range: range(only.start, only.end),
      values: { sound: token(only.unit.id) },
    });
  } else {
    const first = timed[0]!;
    found.push({
      kind: 'opening',
      source: 'arrangement',
      sounds: [token(first.unit.id)],
      range: range(first.start, first.end),
      values: { first: token(first.unit.id) },
    });
    // The most repeated sound (ties: the one heard first).
    const most = units
      .map((id) => ({ id, items: placed(id) }))
      .reduce((best, entry) => (entry.items.length > best.items.length ? entry : best));
    if (most.items.length >= 2)
      found.push({
        kind: 'repeat',
        source: 'arrangement',
        sounds: [token(most.id)],
        range: range(most.items[0]!.start, most.items.at(-1)!.end),
        values: { sound: token(most.id), times: most.items.length },
      });
    // Comes back: A, then B, then A again (listening order). Not called a form: only that it returns.
    for (let i = 0; i + 2 < timed.length; i++) {
      const [a, b, c] = [timed[i]!, timed[i + 1]!, timed[i + 2]!];
      if (a.unit.id === c.unit.id && a.unit.id !== b.unit.id) {
        found.push({
          kind: 'return',
          source: 'arrangement',
          sounds: [token(a.unit.id), token(b.unit.id)],
          range: range(a.start, c.end),
          values: { a: token(a.unit.id), b: token(b.unit.id) },
        });
        break;
      }
    }
    // Two different sounds at the same time (not called harmony or clash: only that they overlap).
    outer: for (let i = 0; i < timed.length; i++)
      for (let j = i + 1; j < timed.length; j++) {
        const [a, b] = [timed[i]!, timed[j]!];
        if (b.start >= a.end || a.unit.id === b.unit.id) continue;
        found.push({
          kind: 'overlap',
          source: 'arrangement',
          sounds: [token(a.unit.id), token(b.unit.id)],
          range: range(b.start, Math.min(a.end, b.end)),
          values: { a: token(a.unit.id), b: token(b.unit.id) },
        });
        break outer;
      }
    // Long against short (the short one first: it is the one a try changes).
    const byLength = [...timed].sort((a, b) => b.seconds - a.seconds);
    const [longest, shortest] = [byLength[0]!, byLength.at(-1)!];
    if (
      longest.unit.id !== shortest.unit.id &&
      longest.seconds >= shortest.seconds * rules.longShortRatio
    )
      found.push({
        kind: 'long-short',
        source: 'arrangement',
        sounds: [token(shortest.unit.id), token(longest.unit.id)],
        range: null,
        values: {
          long: token(longest.unit.id),
          short: token(shortest.unit.id),
          longSeconds: tenth(longest.seconds),
          shortSeconds: tenth(shortest.seconds),
        },
      });
    // Where more sounds start: the first or second half of the chosen length.
    const middle = arrangement.spanSeconds / 2;
    const early = timed.filter((item) => item.start < middle);
    const late = timed.filter((item) => item.start >= middle);
    if (timed.length >= 3 && Math.abs(early.length - late.length) >= rules.densityDifference) {
      const busier = early.length > late.length ? early : late;
      found.push({
        kind: 'density',
        source: 'arrangement',
        sounds: [...new Set(busier.map((item) => token(item.unit.id)))].slice(0, 4),
        range:
          early.length > late.length ? range(0, middle) : range(middle, arrangement.spanSeconds),
        values: {
          busier: DISCOVERY_CORPUS.halves[early.length > late.length ? 'first' : 'second'],
          early: early.length,
          late: late.length,
        },
      });
    }
    const last = [...timed].sort((a, b) => a.end - b.end).at(-1)!;
    found.push({
      kind: 'ending',
      source: 'arrangement',
      sounds: [token(last.unit.id)],
      range: range(last.start, last.end),
      values: { last: token(last.unit.id) },
    });
  }
  // The longest stretch where none of the child's sounds plays.
  const rest = longestRest(timed);
  if (rest && rest[1] - rest[0] >= rules.restSeconds)
    found.push({
      kind: 'rest',
      source: 'arrangement',
      sounds: [],
      range: range(rest[0], rest[1]),
      values: { seconds: Math.floor(rest[1] - rest[0]) },
    });
  // A sound still going when the piece stops is cut there.
  const cut = timed.find((item) => heardSeconds(item.unit, item.event) - item.seconds > 0.05);
  if (cut)
    found.push({
      kind: 'cut-ending',
      source: 'arrangement',
      sounds: [token(cut.unit.id)],
      range: range(cut.start, cut.end),
      values: { sound: token(cut.unit.id) },
    });
  // High against low: the child's own choices first; else what the recordings measured.
  const byChoice = (pitch: 'high' | 'low') =>
    units.find((id) => timed.find((item) => item.unit.id === id)!.unit.shape.pitch === pitch);
  const byMeasure = (band: 'high' | 'low') =>
    units.find((id) => timed.find((item) => item.unit.id === id)!.unit.analysis?.band === band);
  const pair =
    byChoice('high') && byChoice('low')
      ? { high: byChoice('high')!, low: byChoice('low')!, source: 'choice' as const }
      : byMeasure('high') && byMeasure('low')
        ? { high: byMeasure('high')!, low: byMeasure('low')!, source: 'measure' as const }
        : null;
  if (pair && pair.high !== pair.low)
    found.push({
      kind: 'high-low',
      source: pair.source,
      sounds: [token(pair.high), token(pair.low)],
      range: null,
      values: {
        high: token(pair.high),
        low: token(pair.low),
        by: DISCOVERY_CORPUS.measuredBy[pair.source],
      },
    });
  // The mood the child chose: a choice, not the child's feelings.
  const mood = presetMood(arrangement.mood);
  if (mood)
    found.push({
      kind: 'mood',
      source: 'choice',
      sounds: [],
      range: null,
      values: { mood: DISCOVERY_CORPUS.moods[mood] },
    });
  const sounds: BriefedSound[] = units.map((id) => {
    const items = placed(id);
    const unit = items[0]!.unit;
    return {
      token: token(id),
      times: items.length,
      spans: items.map((item) => range(item.start, item.end)),
      chosen: {
        pitch: unit.shape.pitch ?? null,
        length: unit.shape.duration ?? null,
        loudness: unit.shape.intensity ?? null,
      },
      measured: {
        pitch: unit.analysis?.band ?? null,
        length: unit.analysis?.lengthBand ?? null,
        loudnessDb:
          unit.analysis && !unit.analysis.silent ? Math.round(unit.analysis.loudnessDb) : null,
      },
    };
  });
  return { found, sounds, names, tokens };
}

/** The longest gap between the child's sounds (from the first sound's start to the last sound's end). */
export function longestRest(
  timed: readonly { start: number; end: number }[],
): [number, number] | null {
  if (timed.length < 2) return null;
  let reach = timed[0]!.end;
  let best: [number, number] | null = null;
  for (const item of timed.slice(1)) {
    if (item.start > reach && (!best || item.start - reach > best[1] - best[0]))
      best = [reach, item.start];
    reach = Math.max(reach, item.end);
  }
  return best;
}

/** What plays under the child's sounds, as a piece of evidence (none when the background is off). */
export function backgroundEvidence(background: DiscoveryBackground): Found[] {
  if (background.kind === 'off') return [];
  return [
    {
      kind: 'background',
      source: 'background',
      sounds: [],
      range: null,
      values: {
        what: DISCOVERY_CORPUS.backgroundWhat[background.kind],
        players: background.instruments.length
          ? background.instruments.join('、')
          : DISCOVERY_CORPUS.originalPlayers,
      },
    },
  ];
}

// ----- 程序听感证据: the two layers as they are heard -----
export type HeardLayers = {
  sampleRate: number;
  /** The child's sounds: each placement's shaped clip, its start, and its token. */
  sounds: { token: SoundToken; start: number; samples: Float32Array }[];
  childGain: number;
  /** The background buffer as played (ducking included) and its layer gain; null when no background plays. */
  background: { samples: Float32Array; sampleRate: number; gain: number } | null;
  rests: readonly [number, number][];
};

const FRAME_SECONDS = 0.05;
const toDb = (power: number) => 10 * Math.log10(Math.max(power, 1e-12));
/** Mean power of the frames that really sound (within 30 dB of the loudest), so quiet tails do not lower a sound. */
function soundingPower(samples: Float32Array, sampleRate: number) {
  const frame = Math.max(1, Math.round(sampleRate * FRAME_SECONDS));
  const powers: number[] = [];
  for (let at = 0; at < samples.length; at += frame) {
    let sum = 0;
    const end = Math.min(samples.length, at + frame);
    for (let i = at; i < end; i++) sum += samples[i]! * samples[i]!;
    powers.push(sum / (end - at));
  }
  const loudest = Math.max(0, ...powers);
  const sounding = powers.filter((power) => power >= loudest / 1000);
  return sounding.length ? sounding.reduce((a, b) => a + b, 0) / sounding.length : 0;
}
function windowPower(samples: Float32Array, sampleRate: number, start: number, end: number) {
  const from = Math.max(0, Math.floor(start * sampleRate));
  const to = Math.min(samples.length, Math.ceil(end * sampleRate));
  if (to <= from) return 0;
  let sum = 0;
  for (let i = from; i < to; i++) sum += samples[i]! * samples[i]!;
  return sum / (to - from);
}

/**
 * Whether the child's sounds get softer or louder toward the end (first third against last third, as heard), where the
 * background is louder than a sound (at most two sounds, the most covered first) and where it carries a rest.
 */
export function listeningEvidence(
  layers: HeardLayers,
  rules: DiscoveryRules = DISCOVERY_RULES,
): Found[] {
  const found: Found[] = [];
  const heard = layers.sounds
    .map((sound) => ({
      ...sound,
      db: toDb(soundingPower(sound.samples, layers.sampleRate) * layers.childGain ** 2),
    }))
    .sort((a, b) => a.start - b.start);
  if (heard.length >= 3) {
    const third = Math.max(1, Math.floor(heard.length / 3));
    const mean = (items: typeof heard) =>
      items.reduce((sum, item) => sum + item.db, 0) / items.length;
    const change = mean(heard.slice(-third)) - mean(heard.slice(0, third));
    if (Math.abs(change) >= rules.dynamicsDb) {
      const way = DISCOVERY_CORPUS.directions[change < 0 ? 'softer' : 'louder'];
      found.push({
        kind: 'dynamics',
        source: 'listening',
        sounds: [],
        range: range(heard[0]!.start, heard.at(-1)!.start),
        values: {
          direction: way.word,
          picture: way.picture,
          differenceDb: Math.round(Math.abs(change)),
        },
      });
    }
  }
  const { background } = layers;
  if (!background) return found;
  const worst = new Map<SoundToken, { difference: number; start: number; end: number }>();
  for (const sound of heard) {
    const seconds = sound.samples.length / layers.sampleRate;
    const child = sound.db;
    const under = toDb(
      windowPower(background.samples, background.sampleRate, sound.start, sound.start + seconds) *
        background.gain ** 2,
    );
    const difference = under - child;
    if (
      child - under < rules.maskedMarginDb &&
      difference > (worst.get(sound.token)?.difference ?? -Infinity)
    )
      worst.set(sound.token, { difference, start: sound.start, end: sound.start + seconds });
  }
  for (const [token, item] of [...worst]
    .sort((a, b) => b[1].difference - a[1].difference)
    .slice(0, 2))
    found.push({
      kind: 'masked',
      source: 'listening',
      sounds: [token],
      range: range(item.start, item.end),
      values: { sound: token, backgroundLouderDb: Math.round(item.difference) },
    });
  const carried = layers.rests
    .filter(
      ([start, end]) =>
        end - start >= rules.restSeconds &&
        toDb(
          windowPower(background.samples, background.sampleRate, start, end) * background.gain ** 2,
        ) > rules.audibleDb,
    )
    .sort((a, b) => b[1] - b[0] - (a[1] - a[0]))[0];
  if (carried)
    found.push({
      kind: 'gap-filled',
      source: 'listening',
      sounds: [],
      range: range(carried[0], carried[1]),
      values: { seconds: Math.floor(carried[1] - carried[0]) },
    });
  return found;
}

/** Numbers the evidence for one brief: E1, E2, … in the order found. */
export const numberEvidence = (found: readonly Found[]): Evidence[] =>
  found.map((item, i) => ({ id: `E${i + 1}`, ...item }));
