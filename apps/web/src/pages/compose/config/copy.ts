import type { SpanSeconds } from '@wanwu-v2/contracts/arrangement';
import type { Visibility } from '@wanwu-v2/contracts/work';
import type { ComposeNoticeKey } from '../model/composeState.ts';
import type { Discovery } from '@wanwu-v2/contracts/talk';

export const composeCopy = {
  title: '看着曲谱，听听自己的小曲子',
  subtitle: '声音按摆放的先后响起，这就是你的小曲子。',
  loading: '正在打开曲谱…',
  // Score
  scoreTitle: '声音曲谱',
  /**
   * A listening prompt above the score instead of a layout note: a question that sends the child's ears somewhere,
   * picked from what this piece actually contains (its first discovery that has a prompt).
   */
  listenPrompt: (items: readonly Discovery[]) => {
    for (const item of items)
      switch (item.kind) {
        case 'echo':
          return `跟着竖线听：「${item.a}」问一句，谁来回答？`;
        case 'repeat':
          return `跟着竖线听：「${item.name}」藏了几次？数一数。`;
        case 'together':
          return `跟着竖线听：哪两个声音在一起唱歌？`;
        case 'rest':
          return '跟着竖线听：哪里突然安静了？安静的时候，你在等谁？';
        case 'long-short':
          return `跟着竖线听：谁的声音拉得最长，谁一下就停了？`;
      }
    return '跟着竖线听：猜一猜，下一个响起来的会是谁？';
  },
  exampleBadge: '示例摆放',
  legendLabel: '曲谱里的声音',
  emptyAction: '回声场摆一摆',
  seconds: (value: string) => `${value}秒`,
  itemLabel: (number: string, name: string, start: string, seconds: string) =>
    `${number} ${name}，第 ${start} 秒响起，响 ${seconds} 秒。点一下从这里听`,
  spanMark: (seconds: number) => `选的 ${seconds} 秒`,
  scoreSeek: '点曲谱空白处，从那里开始听',
  // Transport
  play: '播放',
  pause: '暂停',
  preparing: '准备中',
  restart: '从头听',
  progressLabel: '播放进度',
  progressHint: '拖动圆点可以跳到别处。',
  progressValue: (now: string, total: string) => `${now}，共 ${total}`,
  // Length
  spanTitle: '想听多久？',
  spanOptions: { 20: '短一点', 30: '刚刚好', 45: '长一点' } satisfies Record<SpanSeconds, string>,
  spanTooShort: '放不下',
  spanNote: '和声场的长度是同一个；最多多唱 5 秒，再长就剪掉。',
  // Inspiration
  inspirationTitle: '课本灵感',
  inspirationOptional: '（可跳过）',
  textbookWorking: (progress: number) =>
    `正在提取歌曲旋律${progress > 0 ? ` ${Math.round(progress * 100)}%` : ''}，先保留节拍。`,
  textbookExtracted: '已自动提取旋律，和你的声音一起创作。',
  textbookUnavailable: '这首歌暂不能生成可靠背景，先听你的声音。',
  textbookFallback: '旋律暂未可靠提取，当前只参考节拍和音乐特征。',
  inspirationLead: '让背景跟着课本歌曲的节奏走。',
  /** Choose / change the song (opens 课本灵感), and the 课本 switch shared with 万物声场. */
  inspirationPick: '选课本歌曲',
  inspirationChange: '换课本歌曲',
  // The song button shows the chosen song (or that none is chosen yet); the words above stay as its spoken label.
  inspirationNoSong: '还没选歌哦',
  inspirationSong: (name: string) => `「${name}」`,
  inspirationToggle: '课本开关：打开就用选好的课本歌曲做背景',
  inspirationSwitchOff: '课本开关关着，打开就用它做背景。',
  inspirationAiPlays: '现在播的是 AI 配曲，打开课本开关就换回它。',
  inspirationTeachingWait: '正在听这段音乐，听完背景就跟着它走。',
  inspirationBackgroundOff: '背景关着，打开背景音乐才听得到。',
  // Background
  backgroundTitle: '背景音乐',
  backgroundOn: '开',
  backgroundOff: '关',
  backgroundToggle: '背景音乐开关',
  instrumentsLabel: '选乐器演奏背景（可多选，再点一下取消；不选就是原始背景）',
  instrumentMore: '更多',
  instrumentComing: (names: string) => `更多乐器：${names}，即将开放`,
  volumeLabel: '背景音量',
  /** The AI chip, shown once an AI background is ready. */
  aiTag: 'AI',
  aiLabel: (using: boolean) =>
    using ? '正在听 AI 做的背景，点一下换回原来的' : '换上 AI 做的背景',
  /** The one button that asks the model again (new music and explanation), and its label while it works. */
  aiMake: '换一首',
  aiMaking: 'AI 在做…',
  /** The AI steps, in the order they are tried (progress bar and bubble). */
  aiSteps: { 'audio-ai': 'AI 音乐模型', 'voice-ai': 'AI 语音模型', 'notes-ai': 'AI 文本模型' },
  aiProgress: (step: string) => `${step}正在作曲…`,
  /** The bubble on the AI chip: which scheme the background in the AI's place comes from, or why the program made it. */
  aiScheme: {
    'audio-ai': '这段背景是 AI 音乐模型直接生成的。',
    'voice-ai': '这段背景是 AI 语音模型按你的声音作曲、程序编配的。',
    'notes-ai': '这段背景是 AI 文本模型按你的声音作曲、程序编配的。',
  },
  aiReasons: {
    'not-open': 'AI 还没接上',
    offline: '没有联网，AI 用不了',
    quota: '今天的 AI 次数用完了',
    timeout: 'AI 这次想得太久了',
    failed: 'AI 这次没做成',
  },
  aiProgram: (reason: string) => `${reason}，现在放的是程序按你的声音自编的背景。`,
  aiRetry: '点一下再试一次。',
  aiSwitchOn: '点一下换上 AI 作曲的背景。',
  aiSwitchOff: '点一下换回普通背景。',
  aiIdle: '点一下让 AI 按你的声音作一首背景。',
  /** The chip while no AI made this piece's background: it names what plays instead (the program's own). */
  aiProgramTag: '程序',
  aiProgramLabel: '现在放的是程序自编的背景，点一下让 AI 再试一次',
  // Discovery
  discoveryTitle: '音乐小发现',
  discoveryNext: '换一条',
  bulbOpen: '点小灯泡，看这首音乐有什么特征',
  bulbClose: '收起',
  talkTitle: '课本讲解',
  tryThisTitle: '试一试',
  tryThisLead: '回声场里',
  talkParts: { feature: '特点', meeting: '碰一碰', task: '试一试' },
  teachTitle: '音乐小发现',
  teachLead: '边放边讲，问问孩子听出了什么。',
  polishing: 'AI 正在换个说法…',
  teachIdea: '音乐知识',
  teachAsk: '可以问孩子',
  /** 音乐小发现: the child's side of each point, the teacher's side, and the summaries; who it is for (给孩子 / 给老师). */
  pointFind: '小发现',
  pointWhere: '听哪里',
  pointAsk: '可以问孩子',
  pointTry: '小尝试',
  pointConcept: '音乐知识',
  pointBasis: '依据',
  pointHow: '怎么带',
  pointListen: '改完再听',
  summaryChild: '这首小曲的特征',
  summaryTeacher: '给老师的小结',
  readers: { label: '讲给谁听', child: '给孩子', teacher: '给老师' },
  aiSetTitle: '含 AI 整理的小发现，依据见“给老师”',
  discoveryAsking: 'AI 正在整理小发现…',
  discoveryAudioNote: '会把这首作品的混音交给 AI 听一听，帮助整理发现。',
  /** Why this piece has no AI cards (said once in the panel; the local cards stay). */
  discoveryFailed: {
    quota: '今天的 AI 次数用完啦，先看看这些小发现吧～',
    offline: '网络断开了，先看看这些小发现吧～',
    timeout: 'AI 这次有点慢，先看看这些小发现吧～',
    failed: 'AI 这次没整理好，先看看这些小发现吧～',
  },
  teachPlay: '从头放给大家听',
  moodLabel: '心情',
  // Actions
  save: '保存这首作品',
  saved: '已放进书架',
  saveSettings: '保存与分享设置',
  saveVisibility: '默认仅自己可见',
  back: '回声场改一改',
  again: '再来一首',
  saveDialog: {
    title: '保存这首作品',
    description: '放进作品书架，这次打开期间随时能找到。',
    name: '作品名字',
    defaultTitle: (n: number) => `我的小曲子 ${n}`,
    visibility: '谁能看到',
    visibilities: {
      private: '仅自己',
      class: '班级',
      school: '学校',
      region: '地区',
      public: '公开',
    } satisfies Record<Visibility, string>,
    visibilityOff: '需要账号，未开放',
    sessionOnly: '保存在这台设备的浏览器里，换设备或清除浏览器数据就没了。',
    share: '分享链接',
    shareOff: '未开放',
    cancel: '先不存',
    submit: '放进作品书架',
    update: '更新书架里的这首',
  },
  goShelf: '去作品书架看看',
  againDialog: {
    title: '再来一首？',
    description: '这首还没有放进作品书架，开始新的一首后就找不回来了。',
    saveFirst: '先保存这首',
    discard: '不保存，再来一首',
  },
  notices: {
    'need-event': '声场里还没有声音，先回声场摆一摆吧。',
    'example-save': '这是示例摆放。回声场自己摆一摆，再来保存吧。',
    'share-off': '请先用受邀老师账号登录，正式保存并试听确认后，才可发布免登录作品链接。',
    'save-failed': '没能放进书架，再试一次吧。',
    'save-wait': '正在提取歌曲旋律，准备好后再保存吧。',
    'load-failed': '网络有点慢，声音没加载出来，再点一次试试。',
    'no-audio': '这个浏览器不能播放声音。',
    'missing-audio': '这首里有的录音找不到了，可能清除过浏览器数据。',
    'background-failed': '背景音乐没能准备好，先只播放你的声音。',
  } satisfies Record<ComposeNoticeKey, string>,
} as const;
