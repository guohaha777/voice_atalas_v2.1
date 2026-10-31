// What the frog says on 万物声场: one short line (at most 36 characters, two lines in the bubble) that says what just
// happened and what to try next. Hand-written, not generated; checked for length and words by tests/talk.test.ts.
export const guideLines={
 loading:'等我一下，声场马上就好～',
 playing:'听，声音一个接一个响起来～',
 /** 试听 on a card: what the child made this sound into in 声音诞生 (its five choices), or that it is the original. */
 unitHeard:(name:string,words:string)=>words?`听，「${name}」${words}～`:`听，这是「${name}」原来的声音～`,
 unitSelected:(name:string)=>`把「${name}」拖进声场，和别的声音组合试试吧！`,
 eventSelected:'点它就能再听一次；按住可以拖到别处。换一行只是错开，声音不变。',
 moved:'挪好啦！左右换的是先后，上下只是错开，声音不变。',
 cleared:'清空啦！从左边点一个声音，重新摆一首吧。',
 placed:'放好啦！点它就能听，「剪一剪」能选一段。',
 copied:'复制好啦！新的就在后面，按住可以拖到想要的地方。',
 removed:'拿走啦。想放回来，就再点左边的声音。',
 rowAdded:'多了一行！挤在一起的声音可以错开摆，声音不会变。',
 clipped:'剪好啦！它现在只响你选的那一段，原来的录音还在。',
 span:(seconds:number)=>`声场变成 ${seconds} 秒啦，声音的先后都没变。`,
 spanFitted:(name:string,seconds:number,span:number)=>`「${name}」要响 ${seconds} 秒，声场自动换成 ${span} 秒啦。`,
 spanBlocked:(name:string,seconds:number,span:number)=>`「${name}」要响 ${seconds} 秒，声场至少要 ${span} 秒才放得下。`,
 // 课本灵感 and the mood: the frog says what they do here. The field plays only a chosen song's beat; the full background
 // (chords, key, the song's rhythm, the mood's colour) is heard in 万物成曲.
 beatOn:(title:string,metre:string)=>`拍子开啦：跟着「${title}」的${metre}摆吧。`,
 beatNoSong:'先在课本灵感里选一首歌，才有拍子哦。',
 beatOff:'拍子关啦，现在只听自己的声音。',
 inspirationSong:(title:string,metre:string)=>`跟着「${title}」的${metre}摆吧！完整的音乐到万物成曲去听。`,
 /** A free-rhythm song (散板, 山歌): it has no beat to play. */
 freeSong:(title:string)=>`「${title}」没有固定的拍子，跟着感觉摆吧。`,
 /** Teaching music before its card is made (then it is spoken of like a song). */
 inspirationMusic:'正在听老师的这段音乐，听完就有拍子啦。',
 inspirationNone:'先不用课本，声场里只听你自己的声音。',
 /** A song chosen while the switch is off. */
 inspirationSongQuiet:(title:string)=>`选好「${title}」啦，打开旁边的小喇叭就有拍子。`,
 mood:(mood:string)=>`心情是「${mood}」，到万物成曲听背景跟着它变。`,
 moodNone:'先不选心情也可以，到万物成曲再听背景。',
 example:'这是一个示例摆放，先听一听，也可以清空了自己摆。',
 empty:'先在左边点一个声音，再点声场里的空白处放下。',
 idle:'摆好了就点「听听这段声音」，听听看～',
};
