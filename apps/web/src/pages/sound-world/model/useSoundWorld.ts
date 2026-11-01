import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { Arrangement, SourceClip, SpanSeconds } from '@wanwu-v2/contracts/arrangement';
import { DEFAULT_COMPOSE_SETTINGS } from '@wanwu-v2/contracts/work';
import type { ComposeSettings, Inspiration } from '@wanwu-v2/contracts/work';
import { inspirationTrack } from '../../../shared/background/backgroundLayer.ts';
import type { InspirationCatalog } from '../../../shared/inspiration/catalog.ts';
import type { TeachingMusicService } from '../../../shared/inspiration/teachingMusic.ts';
import { useInspirationCatalog } from '../../../shared/inspiration/useInspirationCatalog.ts';
import type { SoundUnitDraft } from '@wanwu-v2/contracts/sound';
import { newId } from '../../../shared/creation/ids.ts';
import { services } from '../../../app/services.ts';
import type {
  LibraryScope,
  SoundWorldRepository,
} from '../../../shared/ports/soundWorldRepository.ts';
import type { MoodInterpreter } from '../../../shared/ports/moodInterpreter.ts';
import {
  eventOf,
  initialSoundWorld,
  nudge,
  placedClip,
  rowEndSpot,
  soundWorldReducer,
  spanHolds,
  unitOf,
} from './soundWorldState.ts';
import type { NoticeKey } from './soundWorldState.ts';
import { textbookSwitch } from '../../../shared/inspiration/textbookSwitch.ts';
import { useBeatLayer } from './useBeatLayer.ts';
import { useFieldSound } from './useFieldSound.ts';
import { useMood } from './useMood.ts';

export type FinishResult = { status: 'unavailable' } | { status: 'opened' };
/** A spot in the field in business coordinates (never pixels). Only `at` affects what is heard. */
export type FieldSpot = { at: number; row: number };

/**
 * 万物声场: place the work's sounds along time, edit their excerpts, pick a mood and a textbook song, then go on to
 * 万物成曲. What the field sounds like lives in useFieldSound (with only the chosen song's beat from useBeatLayer — the
 * full background is 万物成曲's) and the mood in useMood; this hook owns the arrangement and the shared settings.
 */
export function useSoundWorld(
  onFinish: (arrangement: Arrangement) => FinishResult,
  repository: SoundWorldRepository = services.soundWorldRepository,
  moods: MoodInterpreter = services.moodInterpreter,
  inspirations: InspirationCatalog = services.inspirationCatalog,
  teaching: TeachingMusicService = services.teachingMusic,
) {
  const [state, dispatch] = useReducer(soundWorldReducer, initialSoundWorld);
  const latest = useRef(state);
  latest.current = state;
  const notify = useCallback(
    (key: NoticeKey, tone: 'info' | 'error' = 'error') =>
      dispatch({ type: 'notice', notice: { tone, key } }),
    [],
  );
  // 课本灵感 is kept with the work for 万物成曲 (the same settings); it never moves a sound.
  const [settings, setSettingsState] = useState<ComposeSettings>(DEFAULT_COMPOSE_SETTINGS);
  // The switch beside 课本灵感 is the one 万物成曲 reads too (on this device): here it plays the chosen song's beat.
  const [beatOn, setBeatOn] = useState(textbookSwitch.get);
  // 课本灵感: the same songs as 万物成曲 (shared/inspiration); here a song lends only its beat.
  const { entries, tracks, teachingItems, analyseTeaching, teachingOpen } = useInspirationCatalog(
    inspirations,
    teaching,
  );
  // Teaching music lends its beat too, once its card is made.
  const beat = useBeatLayer(inspirationTrack(settings.inspiration, tracks), beatOn);
  const sound = useFieldSound(latest, dispatch, notify, beat);
  const mood = useMood(moods, dispatch, notify);
  const { stopAll, playOne, clipSound, player } = sound;

  useEffect(() => {
    let live = true;
    void repository.load().then((arrangement) => {
      if (live) dispatch({ type: 'loaded', arrangement });
    });
    void repository.loadSettings().then((current) => {
      if (live) setSettingsState(current);
    });
    return () => {
      live = false;
    };
  }, [repository]);
  const saveSettings = (next: ComposeSettings) => {
    setSettingsState(next);
    void repository.saveSettings(next);
  };
  const switchTo = (on: boolean) => {
    setBeatOn(on);
    textbookSwitch.set(on);
  };
  /**
   * A new song changes the beat (or takes it away): a running full playback stops (like any edit). Choosing a song
   * turns the 课本 switch on; letting it go turns it off.
   */
  const setInspiration = (next: Inspiration) => {
    stopAll();
    switchTo(next.kind !== 'none');
    saveSettings({ ...settings, inspiration: next });
    dispatch({ type: 'said', lastAction: 'inspiration' });
  };
  /** Closing 课本灵感 with a song chosen: the chosen song is the one in use, so the switch goes on. */
  const applyChosenSong = () => {
    if (settings.inspiration.kind !== 'none' && !beatOn) {
      stopAll();
      switchTo(true);
    }
  };
  /** The 课本 switch beside 课本灵感 (shared with 万物成曲): the song's beat here, the song's background there. */
  const setBackgroundEnabled = (enabled: boolean) => {
    stopAll();
    switchTo(enabled);
    dispatch({ type: 'said', lastAction: enabled ? 'background-on' : 'background-off' });
    // Opening an empty textbook selection asks the page to show the song picker.
    return enabled && settings.inspiration.kind === 'none';
  };

  // The child's arrangement is kept through the repository on every change; an untouched example is not stored.
  useEffect(() => {
    const arrangement = state.arrangement;
    if (arrangement?.origin === 'child') void repository.save(arrangement);
  }, [state.arrangement, repository]);

  // ----- placement -----
  const placeUnit = (unitId: string, spot: FieldSpot) => {
    const unit = unitOf(latest.current.arrangement, unitId);
    if (!unit) return;
    stopAll();
    const eventId = newId('event');
    // It starts as the whole sound without the silence around it.
    const clip = placedClip(
      unit.analysis ?? sound.bank.analysisNow(unit.sourceId),
      sound.durations[unit.sourceId] ?? null,
    );
    dispatch({ type: 'place', unitId, eventId, at: spot.at, row: spot.row, clip, now: new Date() });
    // Feedback when a sound lands: exactly the excerpt it will play.
    void playOne(`event:${eventId}`, () => clipSound(unit, clip), { toggle: false });
  };
  /** Moving never changes a sound, so it stays quiet. */
  const moveEvent = (eventId: string, spot: FieldSpot & { exact?: boolean }) => {
    if (!eventOf(latest.current.arrangement, eventId)) return;
    stopAll();
    dispatch({
      type: 'move',
      eventId,
      at: spot.at,
      row: spot.row,
      exact: spot.exact,
      now: new Date(),
    });
  };
  /** 点空白处: place the picked sound there. With a placed sound selected, empty space just lets go of it. */
  const tapField = (spot: FieldSpot) => {
    const selection = latest.current.selection;
    if (selection?.kind === 'unit') placeUnit(selection.unitId, spot);
    else if (selection?.kind === 'event') dispatch({ type: 'deselect' });
    else notify('pick-first', 'info');
  };
  /** 点这个声音就能播放: tapping a placed sound selects it and plays the part it uses (tap again while playing to stop). */
  const tapEvent = (eventId: string) => {
    dispatch({ type: 'select-event', eventId });
    sound.previewEvent(eventId);
  };
  /** Row buttons (keyboard and big-target alternative): append to the row, or move the occurrence to that row. */
  const tapRow = (row: number) => {
    const { selection, arrangement } = latest.current;
    if (!arrangement) return;
    if (selection?.kind === 'unit')
      placeUnit(selection.unitId, { row, at: rowEndSpot(arrangement, row) });
    else if (selection?.kind === 'event') {
      const event = eventOf(arrangement, selection.eventId);
      if (event) moveEvent(event.id, { row, at: event.at, exact: true });
    } else notify('pick-first', 'info');
  };
  /** 复制: the same sound and part again, right after the original; it can then be dragged anywhere. */
  const copy = (eventId: string) => {
    if (!eventOf(latest.current.arrangement, eventId)) return;
    stopAll();
    dispatch({ type: 'copy', eventId, newId: newId('event'), now: new Date() });
  };
  const remove = (eventId: string) => {
    if (player.activeKey() === `event:${eventId}`) player.stop();
    stopAll();
    dispatch({ type: 'remove', eventId, now: new Date() });
  };
  const keyMove = (eventId: string, key: string) => {
    const work = latest.current.arrangement;
    const event = eventOf(work, eventId);
    if (!work || !event) return false;
    const next = nudge(event, key, work.rows);
    if (next) moveEvent(eventId, next);
    return !!next;
  };
  const setClip = (eventId: string, clip: SourceClip) => {
    stopAll();
    dispatch({ type: 'clip', eventId, clip, now: new Date() });
  };

  const finish = async () => {
    const work = latest.current.arrangement;
    if (!work) return;
    if (!work.events.length) return notify('need-event', 'info');
    stopAll();
    // The arrangement already lives in the repository (this visit); 万物成曲 opens once it is accepted.
    if (onFinish(work).status === 'unavailable') dispatch({ type: 'blocked' });
  };

  const span = state.arrangement?.spanSeconds ?? 30;
  return {
    state,
    playing: sound.playing,
    preparing: sound.preparing,
    sounding: sound.sounding,
    durations: sound.durations,
    elapsed: sound.elapsed,
    /** 0–1 along the field while the whole field plays, else null. Same clock as the audio. */
    playhead: sound.playing === 'all' ? Math.min(1, sound.elapsed / span) : null,
    selectUnit: (unitId: string) => dispatch({ type: 'select-unit', unitId }),
    selectEvent: (eventId: string) => dispatch({ type: 'select-event', eventId }),
    deselect: () => dispatch({ type: 'deselect' }),
    tapField,
    tapEvent,
    tapRow,
    placeUnit,
    moveEvent,
    copy,
    remove,
    keyMove,
    setClip,
    // A length too short for the longest sound is only explained, so it does not stop what is playing.
    setSpan: (spanSeconds: SpanSeconds) => {
      const work = latest.current.arrangement;
      if (work && spanHolds(work, spanSeconds)) stopAll();
      dispatch({ type: 'span', spanSeconds, now: new Date() });
    },
    addRow: () => dispatch({ type: 'add-row', now: new Date() }),
    removeRow: () => dispatch({ type: 'remove-row', now: new Date() }),
    previewUnit: sound.previewUnit,
    previewEvent: sound.previewEvent,
    previewClip: sound.previewClip,
    previewSource: sound.previewSource,
    stopSound: sound.stopSound,
    playAll: sound.playAll,
    finish,
    loadSource: (sourceId: string) => sound.bank.source(sourceId),
    // The mood colours 万物成曲's background; the field (only the song's beat) sounds the same, so playback goes on.
    setMood: mood.setMood,
    customMood: mood.customMood,
    interpreting: mood.interpreting,
    moodModelAvailable: mood.moodModelAvailable,
    pickMood: mood.pickMood,
    addUnit: (unit: SoundUnitDraft) => {
      stopAll();
      dispatch({ type: 'add-unit', unit, now: new Date() });
    },
    clearEvents: () => {
      stopAll();
      dispatch({ type: 'clear-events', now: new Date() });
    },
    scope: (scope: LibraryScope) => repository.scope(scope),
    inspiration: settings.inspiration,
    inspirationEntries: entries,
    setInspiration,
    applyChosenSong,
    teachingOpen,
    teachingItems,
    analyseTeaching,
    backgroundEnabled: beatOn,
    setBackgroundEnabled,
    /** The chosen song (its beat plays while the switch is on), or null. */
    beatTrack: beat.track,
    beatOn: beat.enabled,
  };
}
export type SoundWorld = ReturnType<typeof useSoundWorld>;
