// 系统音乐上传 wording. A tool for the music role in development only (saving needs the dev server).
import type {AnswerField} from '@wanwu-v2/music-features';
import type {MeasurePath} from '@wanwu-v2/sound-rules/rules';
import type {TextbookMode} from '@wanwu-v2/contracts/textbook';

export const KEY_NAMES=['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'] as const;

export const musicCopy={
 title:'系统音乐上传',
 subtitle:'只在本机开发环境出现，不对外。上传一首音乐，程序当场测一遍；下面的音乐特征都是选填，填了就作为标准答案，和程序测的对比。',
 readme:'系统歌曲存到 apps/web/public/builtin-teaching/（随这个网站发布）；测试集存到 music-eval/test/（不发布，也不能拿来调参）。答案和评估报告都在 music-eval/。这两个文件夹都不进 GitHub。',
 toRules:'去调音台',toPrompts:'去提示词台',
 unavailable:'没有连上本机开发服务器（npm run dev），这里只能看，不能保存。',
 upload:'选一首音乐',file:'文件',name:'名字',set:'放进',sets:{system:'系统歌曲',test:'测试集'},
 measuring:'正在测…',unreadable:'这段音频读不出来。',
 measured:'程序测的',answer:'标准答案（选填）',notFilled:'不填',
 fields:{musical:'是不是音乐',rhythm:'节奏',texture:'织体',drums:'打击乐',voice:'人声',tempoBpm:'速度（每分钟拍数）',meter:'拍号',
  downbeatSeconds:'第一个强拍（秒）',tonic:'主音',mode:'调式',rhythmCell:'节奏型（拍数，空格隔开）'} satisfies Record<AnswerField|'voice',string>,
 values:{musical:{true:'是',false:'不是'},rhythm:{steady:'稳定',free:'自由'},texture:{solo:'单旋律',accompanied:'有伴奏'},
  drums:{true:'有',false:'没有'},voice:{true:'有',false:'没有'},mode:{major:'大调',minor:'小调',pentatonic:'五声',dorian:'多利亚'} satisfies Record<TextbookMode,string>},
 voiceNote:'程序不测，留给会听音频的模型',
 paths:{free:'不测速度（自由节奏 / 不是音乐）',drums:'跟鼓点',accompanied:'跟低音（有伴奏）',solo:'跟起音、不标强拍（单旋律）'} satisfies Record<MeasurePath,string>,
 path:'选中的测法',
 notes:{double:'测成快一倍',half:'测成慢一半',relative:'测成关系调',offbeat:'强拍差一拍'},
 listen:'听原曲 + 拍子',stop:'停止',listenNote:'拍子用标准答案里填的速度、拍号和第一个强拍；没填的用程序测的。',
 save:'保存',saveAnswers:'保存答案',saved:'已保存',saving:'正在保存…',failed:'保存失败',
 list:'已上传',empty:'还没有上传过。',open:'打开',answered:(count:number)=>count?`填了 ${count} 项答案`:'没填答案',
 /** One saved recording after 全部重测: its path, and how many filled answers the program got right. */
 result:(path:string,right:number,judged:number)=>judged?`${path} · 对 ${right} / ${judged}`:path,
 evaluate:'全部重测并对比',evaluating:'正在重测…',saveReport:'存评估报告',reportSaved:(file:string)=>`已存到 ${file}`,
 summary:'对比结果',byPath:'按测法',judged:(right:number,judged:number)=>`${right} / ${judged}`,noAnswers:'还没有填标准答案，没法对比。',
};
