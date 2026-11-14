import {pixelText} from './games.js';
export const GAME_HINTS={
 tetris:'LEFT RIGHT MOVE / UP ROTATE / ENTER DROP',
 pong:'UP DOWN MOVE / ENTER SERVE',
 breakout:'LEFT RIGHT MOVE / ENTER LAUNCH',
 asteroids:'LEFT RIGHT TURN / UP THRUST / ENTER FIRE',
 invaders:'LEFT RIGHT MOVE / ENTER FIRE',
 snake:'DIRECTIONS STEER / HOLD ENTER BOOST',
 lander:'LEFT RIGHT TILT / ENTER THRUST',
 tanks:'LEFT RIGHT AIM / UP DOWN POWER / ENTER FIRE',
 settings:'ADJUST THE LIGHT AND GLASS'
};
export function drawRoot(ctx,items,index,touch=false){
 ctx.fillStyle='#000';ctx.fillRect(0,0,256,192);
 pixelText(ctx,'PHOSPHOR',128,13,3,.94,'center');
 ctx.fillStyle='#292929';ctx.fillRect(53,34,150,1);
 items.forEach((item,i)=>{
  const y=43+i*12,selected=i===index;
  if(selected){ctx.fillStyle='#101010';ctx.fillRect(52,y-3,152,11);pixelText(ctx,'>',57,y,1,.9);pixelText(ctx,'<',196,y,1,.9);}
  pixelText(ctx,item.name,128,y,1,selected?.98:.43,'center');
 });
 pixelText(ctx,GAME_HINTS[items[index].id]||'',128,155,1,.32,'center');
 ctx.fillStyle='#202020';ctx.fillRect(53,165,150,1);
 pixelText(ctx,'UP DOWN SELECT / ENTER PLAY',128,171,1,.42,'center');
 pixelText(ctx,'ESC BACK',128,181,1,.42,'center');
}
export function drawLaunch(ctx,touch=false){
 ctx.fillStyle='#000';ctx.fillRect(0,0,256,192);
 // Same bitmap font, pixel scale and excitation as the root PHOSPHOR title.
 pixelText(ctx,touch?'TAP HERE':'CLICK HERE',128,87,3,.94,'center');
}
