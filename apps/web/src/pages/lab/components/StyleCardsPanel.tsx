import { styleCopy as copy } from '../config/styleCopy.ts';
import { useStyleCards } from '../model/useStyleCards.ts';
import styles from '../MusicLabPage.module.css';

/** The store names moods by id; the page says them in words. */
const inWords = (text: string) =>
  text.replace(/\b[a-z]+\b/g, (word) => copy.moodNames[word] ?? word);

/** 风格卡 on 系统音乐上传: the cards the AI background composer may be given, and adding or taking one away. */
export function StyleCardsPanel() {
  const cards = useStyleCards();
  const { draft } = cards;
  return (
    <section className={`${styles.panel} ${styles.wide}`}>
      <h2>
        {copy.title} <small className={styles.muted}>{copy.count(cards.styles.length)}</small>
      </h2>
      <p className={styles.muted}>{copy.lead}</p>
      {!cards.available && <p className={styles.note}>{copy.unavailable}</p>}
      <table className={styles.fields}>
        <tbody>
          {cards.styles.map((card) => (
            <tr key={card.id}>
              <th>{card.name}</th>
              <td className={styles.muted}>{card.id}</td>
              <td>{card.hint}</td>
              <td className={styles.muted}>
                {card.moods.map((mood) => copy.moodNames[mood] ?? mood).join('、')}
              </td>
              <td>
                <button
                  type="button"
                  className={styles.linkButton}
                  disabled={!cards.available || cards.busy}
                  onClick={() => cards.remove(card.id, copy.removed)}
                >
                  {copy.remove}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className={styles.row}>
        <label>
          {copy.id}
          <input
            value={draft.id}
            maxLength={24}
            onChange={(event) => cards.edit({ id: event.target.value })}
          />
        </label>
        <label>
          {copy.name}
          <input
            value={draft.name}
            maxLength={8}
            onChange={(event) => cards.edit({ name: event.target.value })}
          />
        </label>
        <label>
          {copy.hint}
          <input
            value={draft.hint}
            maxLength={30}
            onChange={(event) => cards.edit({ hint: event.target.value })}
          />
        </label>
      </div>
      <div className={styles.row} role="group" aria-label={copy.moods}>
        <b className={styles.muted}>{copy.moods}</b>
        {cards.moods.map((mood) => (
          <label key={mood}>
            <input
              type="checkbox"
              checked={draft.moods.includes(mood)}
              onChange={() => cards.toggleMood(mood)}
            />
            {copy.moodNames[mood] ?? mood}
          </label>
        ))}
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primary}
          disabled={!cards.available || cards.busy}
          onClick={() => void cards.add(copy.added)}
        >
          {cards.busy ? copy.adding : copy.add}
        </button>
        {cards.message && (
          <span className={cards.message.ok ? styles.good : styles.bad}>
            {inWords(cards.message.text) || copy.failed}
          </span>
        )}
      </div>
    </section>
  );
}
