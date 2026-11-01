// 音乐小发现 (discovery-v1): evidence, the program's candidates, local sets, whole-set acceptance (an AI set is used
// whole or not at all), what the panel shows, the page's actions and the server prompt.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DISCOVERY_BRIEF_VERSION,
  EVIDENCE_KINDS,
  isDiscoveryBrief,
} from '@wanwu-v2/contracts/discovery';
import type { DiscoveryBrief, DiscoverySet, Evidence } from '@wanwu-v2/contracts/discovery';
import type { SoundToken } from '@wanwu-v2/contracts/talk';
import {
  EVIDENCE_VALUES,
  acceptDiscoverySet,
  candidatePoints,
  localSet,
} from '@wanwu-v2/prompts/discovery';
import {
  SYSTEM_PROMPT,
  buildDiscovery,
  buildDiscoveryRepair,
  readDiscovery,
} from '@wanwu-v2/prompts/tasks';
import { DISCOVERY_RULES } from '@wanwu-v2/sound-rules/discovery';
import { exampleArrangement } from '../src/shared/creation/exampleWork.ts';
import { keepSet, shownSet } from '../src/shared/discovery/sets.ts';
import {
  backgroundEvidence,
  listeningEvidence,
  numberEvidence,
  pieceEvidence,
} from '../src/shared/discovery/evidence.ts';
import type { Found } from '../src/shared/discovery/evidence.ts';
import { discoveryActions } from '../src/pages/compose/model/discoveryActions.ts';

const arrangement = {
  ...exampleArrangement('work:discovery', new Date('2026-11-01')),
  mood: { kind: 'preset' as const, id: 'calm' as const },
};
const piece = pieceEvidence(arrangement);
const background = { kind: 'ai' as const, instruments: ['风琴'], level: 'medium' as const };
const masked: Found = {
  kind: 'masked',
  source: 'listening',
  sounds: ['声音1' as SoundToken],
  range: [1, 4],
  values: { sound: '声音1', backgroundLouderDb: 8 },
};
const evidence = numberEvidence([...piece.found, ...backgroundEvidence(background), masked]);
const actions = discoveryActions(arrangement, piece.tokens, {
  background: true,
  instrumentChoice: true,
});
const points = candidatePoints(evidence, actions);
const brief = (change: Partial<DiscoveryBrief> = {}): DiscoveryBrief => ({
  version: DISCOVERY_BRIEF_VERSION,
  mode: 'data',
  seconds: 30,
  mood: 'calm',
  background,
  sounds: piece.sounds,
  evidence,
  actions,
  points,
  ...change,
});
const token = (n: number) => `声音${n}` as SoundToken;
/** A good set, as a model would send it: the local one is written with the same rules. */
const good = (): DiscoverySet => structuredClone(localSet(points, evidence, actions));

test('evidence is counted from the piece with numbered sounds; the mood is context, never a point', () => {
  assert.ok(piece.found.some((item) => item.kind === 'opening'));
  assert.ok(piece.found.some((item) => item.kind === 'mood' && item.values.mood === '平静'));
  const sent = JSON.stringify(brief());
  for (const name of piece.names) assert.ok(!sent.includes(name), `${name} is not sent`);
  assert.ok(isDiscoveryBrief(brief()));
  assert.equal(
    isDiscoveryBrief({ ...brief(), mode: 'audio' }),
    true,
    'audio and data modes share program evidence',
  );
  assert.equal(
    isDiscoveryBrief(brief({ points: [{ id: 'P1', evidence: ['E99'], action: 'replay' }] })),
    false,
    'candidates stand on the brief',
  );
  assert.ok(points.length >= 2 && points.length <= DISCOVERY_RULES.candidates);
  const kinds = points.map((point) => evidence.find((item) => item.id === point.evidence[0])!.kind);
  assert.equal(new Set(kinds).size, kinds.length, 'one candidate per kind');
  assert.ok(!kinds.includes('mood'));
  const weights = kinds.map((kind) => DISCOVERY_RULES.weights[kind]);
  assert.deepEqual(
    weights,
    [...weights].sort((a, b) => b - a),
    'the most telling first',
  );
});

test('the program measures the layers: covered sounds, a carried rest, and sounds that fade', () => {
  const rate = 1000;
  const tone = (seconds: number, level: number) =>
    Float32Array.from({ length: seconds * rate }, (_, i) => level * Math.sin(i));
  const layers = {
    sampleRate: rate,
    childGain: 1,
    rests: [[3, 7]] as [number, number][],
    sounds: [
      { token: token(1), start: 0, samples: tone(2, 0.05) },
      { token: token(2), start: 8, samples: tone(1, 0.9) },
    ],
    background: { samples: tone(10, 0.3), sampleRate: rate, gain: 1 },
  };
  const found = listeningEvidence(layers);
  assert.deepEqual(found.find((item) => item.kind === 'masked')?.sounds, [token(1)]);
  assert.deepEqual(found.find((item) => item.kind === 'gap-filled')?.values, { seconds: 4 });
  assert.ok(isDiscoveryBrief(brief({ evidence: numberEvidence([...piece.found, ...found]) })));
  const fading = listeningEvidence({
    ...layers,
    background: null,
    rests: [],
    sounds: [0.8, 0.6, 0.4, 0.2, 0.05].map((level, i) => ({
      token: token(1),
      start: i * 2,
      samples: tone(1, level),
    })),
  });
  assert.equal(
    fading.find((item) => item.kind === 'dynamics')?.values.direction,
    '后面这组总体更轻',
    'group means do not establish continuous fading',
  );
  assert.deepEqual(
    listeningEvidence({ ...layers, background: null, sounds: layers.sounds.slice(0, 2) }),
    [],
  );
});

test('every kind that can be told has a local point that passes the same checks as an AI set', () => {
  const values = (kind: Evidence['kind']) =>
    Object.fromEntries(
      EVIDENCE_VALUES[kind].map((key) => [
        key,
        [
          'times',
          'seconds',
          'early',
          'late',
          'longSeconds',
          'shortSeconds',
          'backgroundLouderDb',
          'differenceDb',
        ].includes(key)
          ? 3
          : ['high', 'low', 'sound', 'first', 'a', 'b', 'long', 'short', 'last'].includes(key)
            ? token(1)
            : '前半段',
      ]),
    );
  for (const kind of EVIDENCE_KINDS.filter((kind) => DISCOVERY_RULES.weights[kind] > 0)) {
    const other: Evidence['kind'] = kind === 'repeat' ? 'opening' : 'repeat';
    const found = numberEvidence(
      ([kind, other] as Evidence['kind'][]).map((item) => ({
        kind: item,
        source: 'arrangement' as const,
        sounds: [token(1)],
        range: [1, 4] as [number, number],
        values: values(item),
      })),
    );
    const candidates = candidatePoints(found, actions);
    assert.equal(candidates.length, 2, kind);
    const local = localSet(candidates, found, actions);
    assert.deepEqual(
      acceptDiscoverySet(local, brief({ evidence: found, points: candidates })).notes,
      [],
      kind,
    );
  }
  // With only 从头再听 on the page, every point still has its try.
  assert.ok(
    candidatePoints(evidence, [
      { id: 'replay', kind: 'replay', target: null, label: '从头再听一遍' },
    ]).every((point) => point.action === 'replay'),
  );
});

test('complete entries pass independently; models may select an angle and action without a candidate', () => {
  const set = good();
  set.points[0]!.point = 'free-angle';
  assert.equal(acceptDiscoverySet(set, brief()).set?.points.length, set.points.length);
  const second = set.points[1]!.knowledge;
  set.points[0]!.evidence = ['E99'];
  const partial = acceptDiscoverySet(set, brief());
  assert.ok(partial.notes.some((note) => note.includes('不存在的证据')));
  assert.ok(partial.set?.points.some((point) => point.knowledge === second));
  assert.ok(!partial.set?.points.some((point) => point.point === 'free-angle'));
  const broken = good();
  for (const point of broken.points) point.action = 'invented-operation';
  assert.equal(acceptDiscoverySet(broken, brief()).set, null);
  const missing = good();
  for (const point of missing.points) point.where = undefined;
  assert.equal(acceptDiscoverySet(missing, brief()).set, null, 'listen location is required');
});

test('tidying that changes no fact: evidence numbers come out of the words; a teacher may be told when', () => {
  const set = good();
  set.points[0]!.teacher.how = '请孩子再听一遍（E1、E2）。';
  set.points[0]!.teacher.concept = '基于 E1 的重叠事实，声音变厚了。';
  const [start] = piece.sounds[0]!.spans[0]!;
  set.summary.teacher = `「声音1」在第 ${Math.floor(start)} 秒附近出现，可以围绕主次带孩子听。`;
  const checked = acceptDiscoverySet(set, brief());
  assert.equal(checked.status, 'accepted', checked.notes.join('；'));
  assert.equal(checked.set!.points[0]!.teacher.how, '请孩子再听一遍。');
  assert.equal(checked.set!.points[0]!.teacher.concept, '基于重叠事实，声音变厚了。');
});

test('the panel shows the AI set while its evidence holds, else the whole local set', () => {
  const ai = good();
  ai.points[0]!.knowledge = 'AI 写的知识点';
  const kept = keepSet(ai, brief(), 'music-discovery-prompt-v1');
  const shown = shownSet(kept, evidence, actions, piece.names)!;
  assert.equal(shown.origin, 'ai');
  assert.equal(shown.points[0]!.knowledge, 'AI 写的知识点');
  assert.ok(
    shown.points.every((point) => point.basis.length > 0),
    'every point has its evidence line',
  );
  assert.ok(!/声音\d/.test(JSON.stringify(shown)), 'names put back');
  // Volume turned down: the background no longer covers 声音1 — the whole set gives way.
  const quieter = numberEvidence([...piece.found, ...backgroundEvidence(background)]);
  const after = shownSet(kept, quieter, actions, piece.names)!;
  assert.equal(after.origin, 'local');
  assert.ok(after.summary.child.length > 0 && after.summary.teacher.length > 0);
  // A set that names who plays the background follows them.
  const organ = good();
  organ.summary.child = '风琴在下面轻轻陪着呀～';
  const keptOrgan = keepSet(organ, brief(), null);
  const bells = numberEvidence([
    ...piece.found,
    ...backgroundEvidence({ ...background, instruments: ['木琴'] }),
    masked,
  ]);
  assert.equal(shownSet(keptOrgan, evidence, actions, piece.names)!.origin, 'ai');
  assert.equal(shownSet(keptOrgan, bells, actions, piece.names)!.origin, 'local');
  // One that cites the background but does not name who plays it stays when the instruments change.
  const quiet = good();
  quiet.points[0]!.evidence.push(evidence.find((item) => item.kind === 'background')!.id);
  assert.equal(
    shownSet(keepSet(quiet, brief(), null), bells, actions, piece.names)!.origin,
    'local',
    'changed background facts invalidate old text',
  );
  assert.equal(shownSet(null, [], actions, piece.names), null, 'nothing to tell');
});

test('the page offers only what it can do now', () => {
  const kinds = (list: typeof actions) => list.map((action) => action.kind);
  assert.ok(kinds(actions).includes('replay'));
  const off = discoveryActions(arrangement, piece.tokens, {
    background: false,
    instrumentChoice: true,
  });
  assert.ok(
    !kinds(off).some((kind) => kind === 'volume' || kind === 'background' || kind === 'instrument'),
    'background off',
  );
  assert.ok(
    !kinds(
      discoveryActions(arrangement, piece.tokens, { background: true, instrumentChoice: false }),
    ).includes('instrument'),
  );
  for (const action of actions.filter((item) => item.kind === 'remove')) {
    const unitId = [...piece.tokens].find(([, value]) => value === action.target)![0];
    assert.ok(
      arrangement.events.filter((event) => event.unitId === unitId).length >= 2,
      '拿走一次 only for a repeated sound',
    );
  }
});

test('independent text prompt has full evidence and operations, not ranked candidates or raw audio', () => {
  const built = buildDiscovery({ ...brief(), audio: 'secret-audio' });
  assert.notEqual(built.system, SYSTEM_PROMPT.lines.join('\n'));
  assert.ok(built.system!.includes('音乐作用'));
  assert.ok(built.system!.includes('关键词'));
  for (const item of evidence) assert.ok(built.prompt.includes(item.id));
  assert.ok(!built.prompt.includes('secret-audio'));
  assert.ok(!built.prompt.includes('"points":[' + JSON.stringify(points[0])));
  for (const name of piece.names) assert.ok(!built.prompt.includes(name));
  assert.ok(buildDiscoveryRepair(brief(), '{}', ['第 1 点 太长']).prompt.includes('第 1 点 太长'));
  assert.equal(
    readDiscovery('```json\n' + JSON.stringify(good()) + '\n```', brief()).acceptance.status,
    'accepted',
  );
  assert.equal(readDiscovery('不是 JSON', brief()).acceptance.status, 'rejected');
});

test('audio observations need valid provenance and ranges, and can support distinct background angles', () => {
  const observations = [
    {
      id: 'O1',
      range: [1, 4] as [number, number],
      layer: 'background' as const,
      observation: '短旋律重复',
      basis: '这段同一短句再次出现',
      keywords: ['重复'],
    },
    {
      id: 'O2',
      range: [8, 12] as [number, number],
      layer: 'background' as const,
      observation: '持续低音',
      basis: '低音延续到后一个声音出现',
      keywords: ['持续'],
    },
  ];
  const request = brief({ mode: 'audio', observations });
  assert.ok(isDiscoveryBrief(request));
  assert.equal(
    isDiscoveryBrief({ ...request, observations: [{ ...observations[0], basis: '' }] }),
    false,
  );
  const set = good();
  set.points = set.points.slice(0, 2);
  set.points.forEach((point, i) => {
    point.evidence = [observations[i]!.id];
    point.action = 'replay';
    point.point = 'new-' + i;
    point.discovery = '背景的小旋律继续着，让前后的声音连在一起。';
    point.teacher.concept = '这段背景让前后的声音有连续感。';
  });
  assert.equal(acceptDiscoverySet(set, request).set?.points.length, 2);
  const cached = keepSet(acceptDiscoverySet(set, request).set!, request, null);
  assert.ok(cached.basis.every((lines) => lines.some((line) => line.includes('声音模型观察'))));
  assert.ok(!JSON.stringify(cached).includes('audio"'));
});

test('a deliberately simple discovery stays one entry; only partial failures need local alternatives', () => {
  const single = good();
  single.points = single.points.slice(0, 1);
  const kept = keepSet(single, brief(), null);
  assert.equal(shownSet(kept, evidence, actions, piece.names)!.points.length, 1);
  const partial = keepSet(single, brief(), null, true);
  const mixed = shownSet(partial, evidence, actions, piece.names)!;
  assert.equal(mixed.points.length, 2);
  assert.deepEqual(
    mixed.points.map((point) => point.origin),
    ['ai', 'local'],
  );
});

test('clear source assumptions and unperformed experiments are rejected without discarding neighbours', () => {
  for (const discovery of ['孩子发出的声音像水滴', '关掉背景之后声音更突出']) {
    const set = good();
    const id = set.points[0]!.point;
    set.points[0]!.discovery = discovery;
    const result = acceptDiscoverySet(set, brief());
    assert.ok(result.set?.points.length);
    assert.ok(!result.set?.points.some((point) => point.point === id));
  }
});
