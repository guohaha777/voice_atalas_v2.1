import {TALK_TIMEOUT_MS} from '../../../shared/talk/polisher';
import {composeCopy} from '../config/copy';
import styles from './TalkProgress.module.css';

/**
 * While the AI rewording of 音乐小发现 / 课本讲解 is on its way: a thin bar that fills over the longest wait. The corpus
 * lines stay readable meanwhile and are replaced line by line only when the reply passes the checks.
 */
export function TalkProgress({active}:{active:boolean}){
 if(!active)return null;
 // A div, not a p: the discovery card styles every p as a clamped text line.
 return <div className={styles.progress} role="status">
  <span className={styles.label}>{composeCopy.polishing}</span>
  <span className={styles.track} aria-hidden="true"><i style={{animationDuration:`${TALK_TIMEOUT_MS}ms`}}/></span>
 </div>;
}
