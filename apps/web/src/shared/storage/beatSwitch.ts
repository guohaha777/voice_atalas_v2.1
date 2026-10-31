// 万物声场's beat switch (beside 课本灵感): its own setting on this device, apart from 万物成曲's 背景 switch, so turning
// the beat off while arranging never silences the background in 万物成曲. Off by default (the child turns it on after
// picking a song); storage that fails keeps it off.
const KEY='wanwu-field-beat';

export const beatSwitch={
 get():boolean{try{return localStorage.getItem(KEY)==='on';}catch{return false;}},
 set(on:boolean){try{localStorage.setItem(KEY,on?'on':'off');}catch{/* kept for this visit only */}},
};
