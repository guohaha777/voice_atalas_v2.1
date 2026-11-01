// What the squirrel says on 万物成曲: one short line (at most 36 characters, two lines in the bubble) that says what just
// happened and what to try next. Hand-written, not generated; checked for length and words by tests/talk.test.ts.


export const guideLines={
 loading:'等我一下，曲谱马上就好～',
 example:'这是示例摆放的曲谱，先听听；回声场自己摆一首，再来保存吧。',
 empty:'声场里还没有声音，回声场摆几个吧。',
 idle:'点「播放」，看竖线走到哪个声音，它就会亮起来～',
 playing:'听，竖线走到哪里，哪个声音就在唱～',
 paused:'停在这里啦，再点「播放」接着听。',
 ended:'听完啦！可以换个长度、开关背景再听一遍。',
 span:(seconds:number)=>`变成 ${seconds} 秒啦，声音的先后都没变。`,
 spanBlocked:(name:string,seconds:number,span:number)=>`「${name}」要响 ${seconds} 秒，至少要 ${span} 秒才放得下。`,
 inspirationNone:'先不用课本，背景跟着心情走。',
 /** Teaching music before its card is made (then it is spoken of like a song). */
 inspirationMusic:'正在听老师的这段音乐，听完背景就跟着它走。',
 /** Choosing a song: it arrived and the background follows it. */
 inspirationSong:(title:string)=>`「${title}」来啦！背景跟着它的节奏走。`,
 // The background card holds only controls: the squirrel says what was chosen.
 backgroundOn:(what:string)=>`背景开啦：${what}。`,
 backgroundOff:'背景关啦，现在只听自己的声音。',
 volume:(level:'soft'|'medium'|'loud')=>({soft:'背景轻轻的，你的声音更清楚啦。',medium:'背景音量刚刚好，你的声音和背景都听得见。',loud:'背景大声一点，更热闹啦；你的声音还在最前面。'})[level],
 instruments:(who:string)=>`${who}。再点一下就请它下来。`,
 instrumentsNone:'不选乐器，背景用原来柔柔的声音。',
 instrumentsComing:(names:string)=>`${names}还在路上，暂时不能选。`,
 // One AI background is made when the page opens (换一首 makes another); the AI chip switches back to the song's / the
 // first one: one or the other.
 aiOn:'换上了 AI 做的背景，不喜欢再点一下换回来。',
 aiOff:'换回原来的背景啦。',
 aiMaking:'AI 正在做一段背景，做好就换上。',
 aiFailed:'AI 这次没做成，先放程序按你的声音编的背景，可以再点一次。',
 saved:'放进作品书架啦！去书架听一听吧。',
};
