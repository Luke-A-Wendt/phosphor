import {pixelText} from './games.js';

export const CONTROLS_DESCRIPTION='Keyboard controls. Move with the arrow keys or W A S D. Action: Enter, E, Space, or numpad Enter. Back: Escape or Q. Escape or Q returns to Settings.';

// A compact binding map: the two direction clusters retain their familiar
// keyboard arrangement; wide keys below show the interchangeable action keys.
export const CONTROL_KEYS=[
 {code:'Escape',label:'ESC',group:'back',x:24,y:50,w:26,h:17},
 {code:'KeyQ',label:'Q',group:'back',x:60,y:54,w:18,h:18},
 {code:'KeyW',label:'W',group:'move',x:82,y:54,w:18,h:18},
 {code:'KeyE',label:'E',group:'action',x:104,y:54,w:18,h:18},
 {code:'KeyA',label:'A',group:'move',x:65,y:77,w:18,h:18},
 {code:'KeyS',label:'S',group:'move',x:87,y:77,w:18,h:18},
 {code:'KeyD',label:'D',group:'move',x:109,y:77,w:18,h:18},
 {code:'ArrowUp',label:'UP',group:'move',x:188,y:54,w:18,h:18,arrow:'up'},
 {code:'ArrowLeft',label:'LEFT',group:'move',x:166,y:77,w:18,h:18,arrow:'left'},
 {code:'ArrowDown',label:'DOWN',group:'move',x:188,y:77,w:18,h:18,arrow:'down'},
 {code:'ArrowRight',label:'RIGHT',group:'move',x:210,y:77,w:18,h:18,arrow:'right'},
 {code:'Space',label:'SPACE',group:'action',x:60,y:104,w:67,h:17},
 {code:'Enter',label:'ENTER',group:'action',x:135,y:104,w:40,h:17},
 {code:'NumpadEnter',label:'NUM ENTER',group:'action',x:183,y:104,w:45,h:17}
];
const gray=value=>{const n=Math.round(value*255);return `rgb(${n},${n},${n})`;};
const rect=(ctx,x,y,w,h,light)=>{ctx.fillStyle=gray(light);ctx.fillRect(x,y,w,h);};
function frame(ctx,x,y,w,h,light){
 rect(ctx,x+1,y,w-2,1,light);rect(ctx,x+1,y+h-1,w-2,1,light);
 rect(ctx,x,y+1,1,h-2,light);rect(ctx,x+w-1,y+1,1,h-2,light);
}
function arrow(ctx,direction,x,y,light){
 // Seven-pixel arrow glyphs avoid relying on Unicode support in the bitmap font.
 const up=['0001000','0011100','0111110','1101011','0001000','0001000','0001000'];
 up.forEach((row,yy)=>[...row].forEach((value,xx)=>{
  if(value!=='1')return;
  const [px,py]=direction==='down'?[6-xx,6-yy]:direction==='left'?[yy,6-xx]:direction==='right'?[6-yy,xx]:[xx,yy];
  rect(ctx,x+px,y+py,1,1,light);
 }));
}
function keycap(ctx,key,pressed){
 const {x,y,w,h}=key,offset=pressed?1:0;
 rect(ctx,x+1,y+h,w-2,1,pressed?.08:.24);
 rect(ctx,x+1,y+1,w-2,h-2,pressed?.18:.025);
 frame(ctx,x,y+offset,w,h-offset,pressed?.94:.31);
 if(!pressed)rect(ctx,x+2,y+2,w-4,1,.09);
 if(key.arrow)arrow(ctx,key.arrow,x+Math.floor((w-7)/2),y+5+offset,pressed?1:.78);
 else{
  const scale=key.label.length===1?2:1;
  pixelText(ctx,key.label,x+w/2,y+Math.floor((h-5*scale)/2)+offset,scale,pressed?1:.77,'center');
 }
}

export function drawControls(ctx,heldCodes=new Set()){
 rect(ctx,0,0,256,192,0);
 pixelText(ctx,'CONTROLS',128,14,2,.92,'center');
 rect(ctx,18,29,220,1,.2);
 pixelText(ctx,'KEYBOARD MAP',128,35,1,.42,'center');
 frame(ctx,18,44,220,85,.13);
 pixelText(ctx,'OR',146,74,1,.32,'center');
 for(const key of CONTROL_KEYS)keycap(ctx,key,heldCodes.has(key.code));

 pixelText(ctx,'MOVE',24,139,1,.72);pixelText(ctx,'W A S D / ARROWS',62,139,1,.53);
 pixelText(ctx,'ACTION',24,151,1,.72);pixelText(ctx,'ENTER / E / SPACE / NUM ENTER',62,151,1,.53);
 pixelText(ctx,'BACK',24,163,1,.72);pixelText(ctx,'ESC / Q',62,163,1,.53);
 rect(ctx,18,175,220,1,.2);
 pixelText(ctx,'ESC / Q BACK TO SETTINGS',128,181,1,.52,'center');
}
