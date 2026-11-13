import {pixelText} from './games.js';
export const TEST_PATTERNS=['GRID & LEVELS','BEAM & FOCUS','MOTION & DECAY'];
export function drawCalibration(ctx,time,pattern=0,touch=false){
 ctx.fillStyle='#000';ctx.fillRect(0,0,256,192);
 pixelText(ctx,'DISPLAY TEST',128,10,2,.85,'center');
 pixelText(ctx,TEST_PATTERNS[pattern],128,25,1,.5,'center');
 const fill=(x,y,w,h,v)=>{ctx.fillStyle=`rgb(${v},${v},${v})`;ctx.fillRect(Math.round(x),Math.round(y),w,h);};
 if(pattern===0){
  for(let x=16;x<=240;x+=16)fill(x,39,1,105,42);
  for(let y=39;y<=144;y+=15)fill(16,y,225,1,42);
  ctx.beginPath();ctx.arc(128,91,45,0,Math.PI*2);ctx.strokeStyle='#aaa';ctx.lineWidth=1;ctx.stroke();
  for(let i=0;i<12;i++)fill(17+i*19,151,17,14,Math.round(i*255/11));
 }else if(pattern===1){
  for(let i=0;i<6;i++){const x=19+i*38;for(let y=44;y<93;y+=2+i)fill(x,y,29,1,190);for(let p=0;p<29;p+=2+i)fill(x+p,108,1,42,190);}
  pixelText(ctx,'1  2  3  4  5  6 PIXEL PITCH',128,159,1,.4,'center');
 }else{
  for(let i=0;i<4;i++){const y=49+i*27,x=15+(time*(18+i*24))%221;fill(16,y+10,224,1,25);fill(x,y,2,20,235);pixelText(ctx,String(18+i*24)+' PX/S',20,y-7,1,.35);}
 }
 pixelText(ctx,touch?'BUTTON NEXT TEST / ESC BACK':'SPACE NEXT TEST / ESC BACK',128,179,1,.45,'center');
}
