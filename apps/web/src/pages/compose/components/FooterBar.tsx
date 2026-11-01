import { useEffect, useState } from 'react';
import { Glyph, PaperIcon } from '../../../shared/ui/PaperIcon.tsx';
import { composeCopy } from '../config/copy.ts';
import type { Compose } from '../model/useCompose.ts';
import styles from './FooterBar.module.css';
import { TalkProgress } from './TalkProgress.tsx';
import { DISCOVERY_TIMEOUT_MS } from '../../../shared/discovery/service.ts';
import { ui } from '../../../shared/ui/controls.ts';

/**
 * 音乐小发现 on the left — the bulb opens 这首音乐有什么特征: each feature of this piece with the music idea behind it
 * and a question for the class (for non-specialist teachers); 保存这首作品 · 回声场改一改 · 再来一首 on the right, on
 * one centre line.
 */
export function FooterBar({
  compose,
  onSave,
  onBack,
  onAgain,
}: {
  compose: Compose;
  onSave: () => void;
  onBack: () => void;
  onAgain: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [teaching, setTeaching] = useState(false);
  /** Who the panel speaks to: the child (discovery, question, try) or the teacher (idea, evidence, how to lead). */
  const [reader, setReader] = useState<'child' | 'teacher'>('child');
  const { textbook } = compose.talk;
  const { set, asking, failure } = compose.discovery;
  const points = set?.points ?? [];
  const point = points.length ? points[index % points.length]! : null;
  /** The AI bubble after 音乐小发现: the whole set was written by a model and passed the checks. */
  const aiBubble =
    set?.origin === 'ai' ? (
      <em className={styles.aiBubble} title={composeCopy.aiSetTitle}>
        {composeCopy.aiTag}
      </em>
    ) : null;
  /** How many entries the bulb's panel holds: shown on the bulb as a hint to open it. */
  const entries = points.length ? (textbook ? 1 : 0) + points.length : 0;
  const polishing = compose.talk.polishing || asking;
  const progressLabel = asking ? composeCopy.discoveryAsking : composeCopy.polishing;
  const progressMs = asking ? DISCOVERY_TIMEOUT_MS : undefined;
  const failed = failure && failure !== 'not-open' ? composeCopy.discoveryFailed[failure] : null;
  // Esc closes the panel (dialogs handle their own Esc).
  useEffect(() => {
    if (!teaching) return;
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) setTeaching(false);
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [teaching]);
  return (
    <div className={styles.footer}>
      <section className={styles.discovery} aria-labelledby="discovery-title">
        <button
          type="button"
          className={styles.bulb}
          aria-expanded={teaching}
          aria-controls="teach-panel"
          disabled={!points.length}
          aria-label={teaching ? composeCopy.bulbClose : composeCopy.bulbOpen}
          title={teaching ? composeCopy.bulbClose : composeCopy.bulbOpen}
          onClick={() => setTeaching((open) => !open)}
        >
          <PaperIcon name="bulb" tone="yellow" />
          {entries > 0 && !teaching && (
            <span className={styles.bulbCount} aria-hidden="true">
              {entries}
            </span>
          )}
        </button>
        <div className={styles.discoveryText}>
          <h3 id="discovery-title">
            {composeCopy.discoveryTitle}
            {aiBubble}
          </h3>
          <p className={styles.preview} aria-live="polite" title={point?.knowledge}>
            {point ? point.knowledge : composeCopy.notices['need-event']}
          </p>
          <div className={styles.discoveryProgress}>
            <TalkProgress active={polishing} label={progressLabel} timeoutMs={progressMs} />
          </div>
        </div>

        {points.length > 1 && (
          <button
            type="button"
            className={styles.discoveryNext}
            onClick={() => setIndex((value) => value + 1)}
          >
            {composeCopy.discoveryNext}
          </button>
        )}
      </section>
      <div className={styles.footerActions}>
        <div className={styles.saveGroup}>
          <button
            type="button"
            className={`${ui.pill} ${ui.go} ${styles.saveButton}`}
            data-saved={compose.shelved || undefined}
            onClick={onSave}
          >
            <Glyph name={compose.shelved ? 'check' : 'save'} />
            {compose.shelved ? composeCopy.saved : composeCopy.save}
          </button>
          <p className={styles.saveMeta}>
            <button type="button" onClick={onSave}>
              {composeCopy.saveSettings}
              <span aria-hidden="true">▾</span>
            </button>
            <i aria-hidden="true" />
            <span>
              <Glyph name="lock" />
              {composeCopy.saveVisibility}
            </span>
          </p>
        </div>
        <button
          type="button"
          className={`${ui.pill} ${ui.back} ${styles.backButton}`}
          onClick={onBack}
        >
          <Glyph name="back" />
          {composeCopy.back}
        </button>
        <button
          type="button"
          className={`${ui.pill} ${ui.outline} ${styles.againButton}`}
          onClick={onAgain}
        >
          <Glyph name="plus" />
          {composeCopy.again}
        </button>
      </div>
      {teaching && set && (
        <section id="teach-panel" className={styles.teach} aria-labelledby="teach-title">
          <header>
            <h3 id="teach-title">
              <PaperIcon name="bulb" tone="yellow" />
              {composeCopy.teachTitle}
              {aiBubble}
            </h3>
            <div className={styles.readers} role="group" aria-label={composeCopy.readers.label}>
              {(['child', 'teacher'] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={reader === id}
                  onClick={() => setReader(id)}
                >
                  {composeCopy.readers[id]}
                </button>
              ))}
            </div>
            <button type="button" className={styles.teachPlay} onClick={compose.restart}>
              <Glyph name="play" />
              {composeCopy.teachPlay}
            </button>
            <button
              type="button"
              className={styles.teachClose}
              aria-label={composeCopy.bulbClose}
              onClick={() => setTeaching(false)}
            >
              <Glyph name="plus" />
            </button>
          </header>
          <p className={styles.teachLead}>{composeCopy.teachLead}</p>
          {asking && compose.discovery.hears && (
            <p className={styles.teachLead}>{composeCopy.discoveryAudioNote}</p>
          )}
          {failed && (
            <p className={styles.teachLead} aria-live="polite">
              {failed}
            </p>
          )}
          <TalkProgress active={polishing} label={progressLabel} timeoutMs={progressMs} />
          {/* Only this list scrolls (wheel, touch, or arrow keys once focused); the title row above stays in place. */}
          <ol tabIndex={0} aria-label={composeCopy.teachTitle}>
            {/* 课本讲解 first when a textbook song is chosen: feature → this shape → what happened → one thing to try. */}
            {textbook && (
              <li className={styles.talk}>
                <b>{composeCopy.talkTitle}</b>
                {(['feature', 'meeting', 'task'] as const).map((part) => (
                  <p key={part}>
                    <em>{composeCopy.talkParts[part]}</em>
                    {textbook[part]}
                  </p>
                ))}
              </li>
            )}
            {/* Each point: the music-making idea in this piece, then for the child how it shows, a question and one try;
        for the teacher the idea in plain words, the program's evidence, how to lead it and what to listen for. */}
            {points.map((item, i) => (
              <li key={`${item.point}-${i}`}>
                <b>{item.knowledge}</b>
                {reader === 'child' ? (
                  <>
                    <p>
                      <em>{composeCopy.pointFind}</em>
                      {item.discovery}
                    </p>
                    <p>
                      <em>{composeCopy.pointWhere}</em>
                      {item.where || item.teacher.how}
                    </p>
                    <p>
                      <em>{composeCopy.pointTry}</em>
                      {item.try}
                    </p>
                    <p className={styles.teachAsk}>
                      <em>{composeCopy.pointAsk}</em>
                      {item.ask}
                    </p>
                  </>
                ) : (
                  <>
                    <p>
                      <em>{composeCopy.pointConcept}</em>
                      {item.teacher.concept}
                    </p>
                    <p>
                      <em>{composeCopy.pointFind}</em>
                      {item.discovery}
                    </p>
                    <p>
                      <em>{composeCopy.pointWhere}</em>
                      {item.where || item.teacher.how}
                    </p>
                    <p>
                      <em>{composeCopy.pointAsk}</em>
                      {item.ask}
                    </p>
                    <p>
                      <em>{composeCopy.pointTry}</em>
                      {item.try}
                    </p>
                    {item.basis.length > 0 && (
                      <p>
                        <em>{composeCopy.pointBasis}</em>
                        {item.basis.join('；')}
                      </p>
                    )}
                    <p>
                      <em>{composeCopy.pointListen}</em>
                      {item.teacher.listen}
                    </p>
                    <p className={styles.teachAsk}>
                      <em>{composeCopy.pointHow}</em>
                      {item.teacher.how}
                    </p>
                  </>
                )}
              </li>
            ))}
            {/* One short summary of the piece's features, after every point. */}
            {set.summary.child && (
              <li className={styles.summary}>
                <b>{reader === 'child' ? composeCopy.summaryChild : composeCopy.summaryTeacher}</b>
                <p>{reader === 'child' ? set.summary.child : set.summary.teacher}</p>
              </li>
            )}
          </ol>
        </section>
      )}
    </div>
  );
}
