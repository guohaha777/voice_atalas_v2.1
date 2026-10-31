// The 课本灵感 switch, one for both pages (on this device): on = the chosen song is used — its beat in 万物声场 and its
// background in 万物成曲; off = the song stays chosen but neither page uses it. Choosing a song turns it on, letting the
// song go turns it off. Off by default; storage that fails keeps it off.
const KEY='wanwu-textbook-switch';

export const textbookSwitch={
 get():boolean{try{return localStorage.getItem(KEY)==='on';}catch{return false;}},
 set(on:boolean){try{localStorage.setItem(KEY,on?'on':'off');}catch{/* kept for this visit only */}},
};
